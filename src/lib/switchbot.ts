/** Send a "press" command to a SwitchBot device. */
export async function switchbotPress(deviceId: string, token: string, secret: string): Promise<void> {
  const result = await switchbotCommand(deviceId, token, secret, {
    command: "press",
    commandType: "command",
    parameter: "default",
  });

  if (result.statusCode !== 100) {
    throw new Error("SwitchBot command failed");
  }
}

async function switchbotCommand(
  deviceId: string,
  token: string,
  secret: string,
  body: Record<string, string>,
): Promise<{ statusCode: number }> {
  const t = String(Date.now());
  const nonce = String(Math.floor(Math.random() * 1_000_000));

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(token + t + nonce));
  const sign = btoa(String.fromCharCode(...new Uint8Array(signature)));

  const res = await fetch(`https://api.switch-bot.com/v1.1/devices/${deviceId}/commands`, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
      sign,
      nonce,
      t,
    },
    body: JSON.stringify(body),
  });

  return res.json() as Promise<{ statusCode: number }>;
}
