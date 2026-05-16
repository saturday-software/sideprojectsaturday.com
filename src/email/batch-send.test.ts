import { describe, test, expect, vi } from "vitest";
import { sendInBatches } from "./batch-send";
import type { sendEmail } from "./send";
import type { MailboxDO } from "@/do/MailboxDO";

type SendFn = typeof sendEmail;
type SendArgs = Parameters<SendFn>;
type SendOptions = SendArgs[1];

const ENV = {
  EMAIL: {} as SendEmail,
  MAILBOX_DO: {} as DurableObjectNamespace<MailboxDO>,
  FROM_EMAIL: "hello@sideprojectsaturday.com",
  SITE_URL: "https://sideprojectsaturday.com",
};

const TEMPLATE = {
  subject: "Hello",
  html: "<p>hi</p>",
  text: "hi",
};

function recipients(...emails: string[]) {
  return emails.map((email) => ({ email }));
}

describe("sendInBatches", () => {
  test("happy path: single batch with correct envelope, BCC, headers, and body", async () => {
    const send = vi.fn<SendFn>().mockResolvedValue(undefined);

    await sendInBatches(
      ENV,
      recipients("a@x.com", "b@x.com", "c@x.com"),
      TEMPLATE,
      49,
      send,
    );

    expect(send).toHaveBeenCalledTimes(1);
    const [binding, opts, mailbox] = send.mock.calls[0];
    expect(binding).toBe(ENV.EMAIL);
    expect(mailbox).toBe(ENV.MAILBOX_DO);
    const o = opts as SendOptions;
    expect(o.from).toBe("hello@sideprojectsaturday.com");
    expect(o.replyTo).toBe("hello@sideprojectsaturday.com");
    expect(o.to).toBe("noreply@sideprojectsaturday.com");
    expect(o.bcc).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
    expect(o.subject).toBe("Hello");
    expect(o.html).toBe("<p>hi</p>");
    expect(o.text).toBe("hi");
    expect(o.headers).toEqual({
      "List-Id": "Side Project Saturday <list.sideprojectsaturday.com>",
      "List-Unsubscribe": "<https://sideprojectsaturday.com/unsubscribe>",
      "Precedence": "bulk",
    });
  });

  test("splits recipients into batches of batchSize", async () => {
    const send = vi.fn<SendFn>().mockResolvedValue(undefined);
    const recips = recipients(
      ...Array.from({ length: 7 }, (_, i) => `u${i}@x.com`),
    );

    await sendInBatches(ENV, recips, TEMPLATE, 3, send);

    expect(send).toHaveBeenCalledTimes(3);
    const bccs = send.mock.calls.map((c) => (c[1] as SendOptions).bcc);
    expect(bccs).toEqual([
      ["u0@x.com", "u1@x.com", "u2@x.com"],
      ["u3@x.com", "u4@x.com", "u5@x.com"],
      ["u6@x.com"],
    ]);
  });

  test("does nothing on empty recipient list", async () => {
    const send = vi.fn<SendFn>().mockResolvedValue(undefined);
    await sendInBatches(ENV, [], TEMPLATE, 49, send);
    expect(send).not.toHaveBeenCalled();
  });

  test("on batch failure: retries each recipient individually with `to:` instead of bcc", async () => {
    const send = vi
      .fn<SendFn>()
      .mockRejectedValueOnce(new Error("Invalid email address: Invalid input"))
      .mockResolvedValue(undefined);

    await sendInBatches(
      ENV,
      recipients("a@x.com", "b@x.com", "c@x.com"),
      TEMPLATE,
      49,
      send,
    );

    // 1 batch attempt + 3 per-recipient retries
    expect(send).toHaveBeenCalledTimes(4);

    const retryCalls = send.mock.calls.slice(1).map((c) => c[1] as SendOptions);
    expect(retryCalls.map((o) => o.to)).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
    for (const opts of retryCalls) {
      expect(opts.bcc).toBeUndefined();
      expect(opts.subject).toBe("Hello");
      expect(opts.html).toBe("<p>hi</p>");
      expect(opts.text).toBe("hi");
      expect(opts.from).toBe("hello@sideprojectsaturday.com");
      expect(opts.replyTo).toBe("hello@sideprojectsaturday.com");
      expect(opts.headers).toMatchObject({ "Precedence": "bulk" });
    }
  });

  test("per-recipient retry: a single bad recipient is logged and skipped, others succeed", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Batch fails, then per-recipient: a ok, b fails, c ok
    const send = vi
      .fn<SendFn>()
      .mockRejectedValueOnce(new Error("Invalid email address: Invalid input")) // batch
      .mockResolvedValueOnce(undefined) // a
      .mockRejectedValueOnce(new Error("Invalid email address: Invalid input")) // b
      .mockResolvedValueOnce(undefined); // c

    await sendInBatches(
      ENV,
      recipients("a@x.com", "b@x.com", "c@x.com"),
      TEMPLATE,
      49,
      send,
    );

    expect(send).toHaveBeenCalledTimes(4);

    const errorMessages = errSpy.mock.calls.map((args) => String(args[0]));
    expect(errorMessages.some((m) => m.includes("batch failed"))).toBe(true);
    expect(
      errorMessages.some((m) => m.includes('recipient failed email="b@x.com"')),
    ).toBe(true);
    // a and c should NOT appear as failed
    expect(
      errorMessages.some((m) => m.includes('recipient failed email="a@x.com"')),
    ).toBe(false);
    expect(
      errorMessages.some((m) => m.includes('recipient failed email="c@x.com"')),
    ).toBe(false);

    errSpy.mockRestore();
  });

  test("does not throw to caller when a batch fails", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const send = vi
      .fn<SendFn>()
      .mockRejectedValue(new Error("Invalid email address: Invalid input"));

    await expect(
      sendInBatches(
        ENV,
        recipients("a@x.com", "b@x.com"),
        TEMPLATE,
        49,
        send,
      ),
    ).resolves.toBeUndefined();

    errSpy.mockRestore();
  });

  test("a failed batch does not block subsequent batches", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // batch1 fails -> 2 per-recipient retries (both ok); batch2 ok
    const send = vi
      .fn<SendFn>()
      .mockRejectedValueOnce(new Error("Invalid email address: Invalid input")) // batch 1
      .mockResolvedValueOnce(undefined) // retry a
      .mockResolvedValueOnce(undefined) // retry b
      .mockResolvedValueOnce(undefined); // batch 2

    await sendInBatches(
      ENV,
      recipients("a@x.com", "b@x.com", "c@x.com", "d@x.com"),
      TEMPLATE,
      2,
      send,
    );

    expect(send).toHaveBeenCalledTimes(4);
    // Last call is batch 2 with c+d as BCC
    const last = send.mock.calls.at(-1)![1] as SendOptions;
    expect(last.bcc).toEqual(["c@x.com", "d@x.com"]);
    expect(last.to).toBe("noreply@sideprojectsaturday.com");

    errSpy.mockRestore();
  });

  test("logs the failing batch's emails so the offender can be identified", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Batch fails, all per-recipient retries also fail to ensure we keep going
    const send = vi
      .fn<SendFn>()
      .mockRejectedValue(new Error("Invalid email address: Invalid input"));

    await sendInBatches(
      ENV,
      recipients("a@x.com", "b@x.com"),
      TEMPLATE,
      49,
      send,
    );

    const messages = errSpy.mock.calls.map((args) => String(args[0]));
    const batchLog = messages.find((m) => m.includes("batch failed"));
    expect(batchLog).toBeDefined();
    expect(batchLog!).toContain("a@x.com");
    expect(batchLog!).toContain("b@x.com");

    errSpy.mockRestore();
  });

  test("derives List-Id domain from FROM_EMAIL", async () => {
    const send = vi.fn<SendFn>().mockResolvedValue(undefined);
    await sendInBatches(
      { ...ENV, FROM_EMAIL: "noreply@example.org" },
      recipients("a@x.com"),
      TEMPLATE,
      49,
      send,
    );
    const opts = send.mock.calls[0][1] as SendOptions;
    expect(opts.to).toBe("noreply@example.org");
    expect(opts.headers!["List-Id"]).toBe(
      "Side Project Saturday <list.example.org>",
    );
  });
});
