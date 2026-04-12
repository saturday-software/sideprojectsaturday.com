/// <reference types="astro/client" />

// Secrets not in wrangler.jsonc vars
declare namespace Cloudflare {
  interface Env {
    ADMIN_PASSWORD: string;
    SHARE_SEED: string;
  }
}
