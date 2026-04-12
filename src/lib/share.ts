import { getCurrentSaturday, isSubmissionOpen } from "./dates";

/**
 * Generate a short, human-typeable share code for a given Saturday date.
 * Uses HMAC-SHA256 with a secret seed, truncated to 6 lowercase alphanumeric chars.
 */
export async function generateShareCode(
  seed: string,
  dateKey: string
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(seed),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(dateKey)
  );
  // Take first 4 bytes → 32 bits → base36 gives ~6 chars
  const view = new DataView(sig);
  const num = view.getUint32(0);
  return num.toString(36).padStart(6, "0").slice(0, 6);
}

/**
 * Resolve a share code to a Saturday date key, if valid.
 * Only matches the current Saturday and only while submissions are open.
 */
export async function resolveShareCode(
  seed: string,
  code: string
): Promise<string | null> {
  const saturday = getCurrentSaturday();
  if (!isSubmissionOpen(saturday)) return null;
  const expected = await generateShareCode(seed, saturday);
  if (code !== expected) return null;
  return saturday;
}
