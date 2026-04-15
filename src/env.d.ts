/// <reference types="astro/client" />

// Secrets not in wrangler.jsonc vars
declare namespace Cloudflare {
  interface Env {
    ADMIN_PASSWORD: string;
    SHARE_SEED: string;
    SWITCHBOT_TOKEN: string;
    SWITCHBOT_KEY: string;
    SWITCHBOT_DEVICE_ID: string;
    MAILBOX_DO: DurableObjectNamespace<import("./do/MailboxDO").MailboxDO>;
    UNSUBSCRIBE_SECRET: string;
  }
}
