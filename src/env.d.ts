/// <reference types="astro/client" />

// Secrets not in wrangler.jsonc vars
declare interface Env {
  ADMIN_PASSWORD: string;
}
