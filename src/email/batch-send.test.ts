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

    await sendInBatches({
      env: ENV,
      recipients: recipients("a@x.com", "b@x.com", "c@x.com"),
      template: TEMPLATE,
      batchSize: 49,
      send,
    });

    expect(send).toHaveBeenCalledTimes(1);
    const [binding, opts, mailbox] = send.mock.calls[0];
    expect(binding).toBe(ENV.EMAIL);
    expect(mailbox).toBe(ENV.MAILBOX_DO);
    const o = opts as SendOptions;
    expect(o.from).toBe("hello@sideprojectsaturday.com");
    expect(o.replyTo).toBe("hello@sideprojectsaturday.com");
    expect(o.to).toBe("noreply@sideprojectsaturday.com");
    expect(o.bcc).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
    expect(o.cc).toBeUndefined();
    expect(o.subject).toBe("Hello");
    expect(o.html).toBe("<p>hi</p>");
    expect(o.text).toBe("hi");
    expect(o.headers).toEqual({
      "List-Id": "Side Project Saturday <list.sideprojectsaturday.com>",
      "List-Unsubscribe": "<https://sideprojectsaturday.com/unsubscribe>",
      "Precedence": "bulk",
    });
  });

  test("CC mode: puts recipients in cc instead of bcc", async () => {
    const send = vi.fn<SendFn>().mockResolvedValue(undefined);

    await sendInBatches({
      env: ENV,
      recipients: recipients("a@x.com", "b@x.com"),
      template: TEMPLATE,
      send,
      mode: "cc",
    });

    expect(send).toHaveBeenCalledTimes(1);
    const opts = send.mock.calls[0][1] as SendOptions;
    expect(opts.cc).toEqual(["a@x.com", "b@x.com"]);
    expect(opts.bcc).toBeUndefined();
  });

  test("splits recipients into batches of batchSize", async () => {
    const send = vi.fn<SendFn>().mockResolvedValue(undefined);
    const recips = recipients(
      ...Array.from({ length: 7 }, (_, i) => `u${i}@x.com`),
    );

    await sendInBatches({
      env: ENV,
      recipients: recips,
      template: TEMPLATE,
      batchSize: 3,
      send,
    });

    expect(send).toHaveBeenCalledTimes(3);
    // First two batches are multi-recipient (BCC envelope); the last is a
    // single recipient, so it goes via `to:` directly with no BCC.
    expect((send.mock.calls[0][1] as SendOptions).bcc).toEqual([
      "u0@x.com", "u1@x.com", "u2@x.com",
    ]);
    expect((send.mock.calls[1][1] as SendOptions).bcc).toEqual([
      "u3@x.com", "u4@x.com", "u5@x.com",
    ]);
    const last = send.mock.calls[2][1] as SendOptions;
    expect(last.to).toBe("u6@x.com");
    expect(last.bcc).toBeUndefined();
  });

  test("does nothing on empty recipient list", async () => {
    const send = vi.fn<SendFn>().mockResolvedValue(undefined);
    await sendInBatches({
      env: ENV,
      recipients: [],
      template: TEMPLATE,
      batchSize: 49,
      send,
    });
    expect(send).not.toHaveBeenCalled();
  });

  test("on batch failure: halves recursively until isolating per-recipient retries", async () => {
    // 4 recipients, full batch fails. Halve -> [a,b] fails (also halves into
    // single sends a, b — both succeed). Then [c,d] succeeds.
    // Sequence: full(4)=fail, [a,b]=fail, a=ok, b=ok, [c,d]=ok => 5 calls.
    const send = vi
      .fn<SendFn>()
      .mockRejectedValueOnce(new Error("batch1")) // full 4
      .mockRejectedValueOnce(new Error("half-ab")) // [a,b]
      .mockResolvedValueOnce(undefined) // a (single)
      .mockResolvedValueOnce(undefined) // b (single)
      .mockResolvedValueOnce(undefined); // [c,d]

    await sendInBatches({
      env: ENV,
      recipients: recipients("a@x.com", "b@x.com", "c@x.com", "d@x.com"),
      template: TEMPLATE,
      batchSize: 49,
      send,
    });

    expect(send).toHaveBeenCalledTimes(5);

    const calls = send.mock.calls.map((c) => c[1] as SendOptions);
    expect(calls[0].bcc).toEqual(["a@x.com", "b@x.com", "c@x.com", "d@x.com"]);
    expect(calls[1].bcc).toEqual(["a@x.com", "b@x.com"]);
    expect(calls[2].to).toBe("a@x.com");
    expect(calls[2].bcc).toBeUndefined();
    expect(calls[3].to).toBe("b@x.com");
    expect(calls[3].bcc).toBeUndefined();
    expect(calls[4].bcc).toEqual(["c@x.com", "d@x.com"]);
  });

  test("on persistent failure: isolates the single bad recipient", async () => {
    // 3 recipients, batch fails, halve into [a,b] and [c].
    // [a,b] fails, halves into a and b individually.
    // Order: [a,b,c] -> [a,b] -> a -> b -> [c].
    // a fails, b ok, c ok.
    const send = vi
      .fn<SendFn>()
      .mockRejectedValueOnce(new Error("batch")) // [a,b,c]
      .mockRejectedValueOnce(new Error("half")) // [a,b]
      .mockRejectedValueOnce(new Error("Invalid email")) // a (single)
      .mockResolvedValueOnce(undefined) // b (single)
      .mockResolvedValueOnce(undefined); // [c] (single)

    const onRecipientFailure = vi.fn();
    const onRecipientSuccess = vi.fn();

    await sendInBatches({
      env: ENV,
      recipients: recipients("a@x.com", "b@x.com", "c@x.com"),
      template: TEMPLATE,
      batchSize: 49,
      send,
      onRecipientFailure,
      onRecipientSuccess,
    });

    expect(onRecipientFailure).toHaveBeenCalledTimes(1);
    expect(onRecipientFailure).toHaveBeenCalledWith("a@x.com");

    // Both c (via singleton batch [c]) and b succeeded as single sends.
    expect(onRecipientSuccess).toHaveBeenCalledWith("c@x.com");
    expect(onRecipientSuccess).toHaveBeenCalledWith("b@x.com");
  });

  test("does not throw to caller when a batch fails", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const send = vi.fn<SendFn>().mockRejectedValue(new Error("everything fails"));

    await expect(
      sendInBatches({
        env: ENV,
        recipients: recipients("a@x.com", "b@x.com"),
        template: TEMPLATE,
        batchSize: 49,
        send,
      }),
    ).resolves.toBeUndefined();

    errSpy.mockRestore();
  });

  test("a failed batch does not block subsequent batches", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // batchSize=2 => two top-level batches.
    // batch1 [a,b] fails -> halves -> a ok, b ok.
    // batch2 [c,d] ok.
    const send = vi
      .fn<SendFn>()
      .mockRejectedValueOnce(new Error("batch1")) // [a,b]
      .mockResolvedValueOnce(undefined) // a
      .mockResolvedValueOnce(undefined) // b
      .mockResolvedValueOnce(undefined); // [c,d]

    await sendInBatches({
      env: ENV,
      recipients: recipients("a@x.com", "b@x.com", "c@x.com", "d@x.com"),
      template: TEMPLATE,
      batchSize: 2,
      send,
    });

    expect(send).toHaveBeenCalledTimes(4);
    const last = send.mock.calls.at(-1)![1] as SendOptions;
    expect(last.bcc).toEqual(["c@x.com", "d@x.com"]);
    expect(last.to).toBe("noreply@sideprojectsaturday.com");

    errSpy.mockRestore();
  });

  test("logs the failing batch's emails so the offender can be identified", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const send = vi.fn<SendFn>().mockRejectedValue(new Error("Invalid"));

    await sendInBatches({
      env: ENV,
      recipients: recipients("a@x.com", "b@x.com"),
      template: TEMPLATE,
      batchSize: 49,
      send,
    });

    const messages = errSpy.mock.calls.map((args) => String(args[0]));
    const batchLog = messages.find((m) => m.includes("batch failed"));
    expect(batchLog).toBeDefined();
    expect(batchLog!).toContain("a@x.com");
    expect(batchLog!).toContain("b@x.com");

    errSpy.mockRestore();
  });

  test("derives List-Id domain from FROM_EMAIL", async () => {
    const send = vi.fn<SendFn>().mockResolvedValue(undefined);
    // Use 2 recipients so we exercise the multi-recipient path (which is the
    // one that uses the noreply@<domain> envelope).
    await sendInBatches({
      env: { ...ENV, FROM_EMAIL: "noreply@example.org" },
      recipients: recipients("a@x.com", "b@x.com"),
      template: TEMPLATE,
      batchSize: 49,
      send,
    });
    const opts = send.mock.calls[0][1] as SendOptions;
    expect(opts.to).toBe("noreply@example.org");
    expect(opts.headers!["List-Id"]).toBe(
      "Side Project Saturday <list.example.org>",
    );
  });

  test("single-recipient list goes straight to `to:` (no bcc/cc envelope)", async () => {
    const send = vi.fn<SendFn>().mockResolvedValue(undefined);
    const onRecipientSuccess = vi.fn();

    await sendInBatches({
      env: ENV,
      recipients: recipients("solo@x.com"),
      template: TEMPLATE,
      batchSize: 49,
      send,
      onRecipientSuccess,
    });

    expect(send).toHaveBeenCalledTimes(1);
    const opts = send.mock.calls[0][1] as SendOptions;
    expect(opts.to).toBe("solo@x.com");
    expect(opts.bcc).toBeUndefined();
    expect(opts.cc).toBeUndefined();
    expect(onRecipientSuccess).toHaveBeenCalledWith("solo@x.com");
  });
});
