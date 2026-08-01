import { describe, expect, test, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { sendBroadcast } from "./broadcast";
import type { sendEmail } from "./send";
import type { MailboxDO } from "@/do/MailboxDO";

type SendFn = typeof sendEmail;

const SCHEMA =
  "CREATE TABLE IF NOT EXISTS subscribers (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, status TEXT NOT NULL DEFAULT 'pending', is_participant INTEGER NOT NULL DEFAULT 0, verification_token TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), verified_at TEXT, strikes INTEGER NOT NULL DEFAULT 0)";

const TEMPLATE = { subject: "Hello", html: "<p>hi</p>", text: "hi" };

function broadcastEnv() {
  return {
    EMAIL: {} as SendEmail,
    MAILBOX_DO: {} as DurableObjectNamespace<MailboxDO>,
    FROM_EMAIL: "hello@sideprojectsaturday.com",
    SITE_URL: "https://sideprojectsaturday.com",
    DB: env.DB,
    CACHE: env.CACHE,
  };
}

async function addVerified(email: string, strikes = 0) {
  await env.DB.prepare(
    "INSERT INTO subscribers (email, status, strikes) VALUES (?, 'verified', ?)",
  )
    .bind(email, strikes)
    .run();
}

async function statusOf(email: string) {
  return env.DB.prepare("SELECT status, strikes FROM subscribers WHERE email = ?")
    .bind(email)
    .first<{ status: string; strikes: number }>();
}

beforeEach(async () => {
  await env.DB.exec("DROP TABLE IF EXISTS subscribers");
  await env.DB.exec(SCHEMA);
  const keys = await env.CACHE.list();
  await Promise.all(keys.keys.map((k) => env.CACHE.delete(k.name)));
});

describe("sendBroadcast", () => {
  test("reports the recipient count and leaves nobody disabled on success", async () => {
    await addVerified("a@x.com");
    await addVerified("b@x.com");
    const send = vi.fn<SendFn>().mockResolvedValue(undefined);

    const result = await sendBroadcast({
      env: broadcastEnv(),
      recipients: [{ email: "a@x.com" }, { email: "b@x.com" }],
      template: TEMPLATE,
      send,
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ recipients: 2, disabled: [] });
  });

  test("clears strikes for recipients whose individual send succeeds", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await addVerified("a@x.com", 2);
    const send = vi
      .fn<SendFn>()
      .mockRejectedValueOnce(new Error("batch")) // the batch itself
      .mockResolvedValueOnce(undefined) // a, individually
      .mockResolvedValueOnce(undefined); // b, individually
    await addVerified("b@x.com");

    const result = await sendBroadcast({
      env: broadcastEnv(),
      recipients: [{ email: "a@x.com" }, { email: "b@x.com" }],
      template: TEMPLATE,
      send,
    });

    expect(result.disabled).toEqual([]);
    expect((await statusOf("a@x.com"))?.strikes).toBe(0);
    errSpy.mockRestore();
  });

  test("disables a recipient on its third strike and invalidates cached lists", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await addVerified("bad@x.com", 2);
    await addVerified("good@x.com");
    await env.CACHE.put("subscribers-verified", JSON.stringify(["bad@x.com", "good@x.com"]));
    await env.CACHE.put("subscribers-participants", JSON.stringify([]));
    await env.CACHE.put("subscriber-count", JSON.stringify({ total: 2, verified: 2 }));

    const send = vi
      .fn<SendFn>()
      .mockRejectedValueOnce(new Error("batch")) // the batch itself
      .mockRejectedValueOnce(new Error("bounced")) // bad@, individually
      .mockResolvedValueOnce(undefined); // good@, individually

    const result = await sendBroadcast({
      env: broadcastEnv(),
      recipients: [{ email: "bad@x.com" }, { email: "good@x.com" }],
      template: TEMPLATE,
      send,
    });

    expect(result).toEqual({ recipients: 2, disabled: ["bad@x.com"] });
    expect(await statusOf("bad@x.com")).toMatchObject({ status: "disabled", strikes: 3 });
    expect(await env.CACHE.get("subscribers-verified")).toBeNull();
    expect(await env.CACHE.get("subscribers-participants")).toBeNull();
    expect(await env.CACHE.get("subscriber-count")).toBeNull();

    errSpy.mockRestore();
    logSpy.mockRestore();
  });

  test("keeps cached lists when a failure does not disable anyone", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await addVerified("bad@x.com");
    await env.CACHE.put("subscribers-verified", JSON.stringify(["bad@x.com"]));

    const send = vi.fn<SendFn>().mockRejectedValue(new Error("bounced"));

    const result = await sendBroadcast({
      env: broadcastEnv(),
      recipients: [{ email: "bad@x.com" }],
      template: TEMPLATE,
      send,
    });

    expect(result.disabled).toEqual([]);
    expect(await statusOf("bad@x.com")).toMatchObject({ status: "verified", strikes: 1 });
    expect(await env.CACHE.get("subscribers-verified")).not.toBeNull();
    errSpy.mockRestore();
  });
});
