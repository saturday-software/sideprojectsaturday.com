# Side Project Saturday

The website for [sideprojectsaturday.com](https://sideprojectsaturday.com) — a recurring Saturday meetup for working on side projects together.

## Stack

- [Astro](https://astro.build) — site framework
- [Cloudflare Workers](https://developers.cloudflare.com/workers/) — hosting & runtime
- [D1](https://developers.cloudflare.com/d1/) — database
- [R2](https://developers.cloudflare.com/r2/) — image storage
- [Durable Objects](https://developers.cloudflare.com/durable-objects/) — per-event state

## Development

```sh
bun install
bun dev
```

## Deployment

The site deploys with [Alchemy](https://alchemy.run) from [`alchemy.run.ts`](alchemy.run.ts), run by [projects.just-be.dev](https://projects.just-be.dev). Pushing `main` to the `origin` remote deploys prod. Pushing any other branch there deploys a preview. Each deploy runs `astro build`, then uploads `dist/server` as the Worker, unbundled, and `dist/client` as its static assets.

Everything lives in the Saturday Software Cloudflare account (`6de942b9cdb2c3f3d040fdbe3c1975c5`). The stack refuses to run unless `CLOUDFLARE_ACCOUNT_ID` is that account and `CLOUDFLARE_API_TOKEN` is set. It also checks the account its credentials actually resolve to.

**Prod** (`--stage prod`) is the existing `side-project` Worker:

- The Worker was created by wrangler, and Alchemy adopts it. Its Durable Objects (`EventDO`, `MailboxDO`, SQLite) keep their data. Alchemy never deletes it, even on `alchemy destroy`.
- D1 `sps`, the `CACHE` KV namespace and the `sps-images` R2 bucket are bound by id or name. They aren't Alchemy resources, so Alchemy never changes or deletes them.
- Secrets (`ADMIN_PASSWORD`, `UNSUBSCRIBE_SECRET`, `SWITCHBOT_*`) stay Worker secrets. Each deploy binds them as `inherit`, which carries over the live values. Set or rotate one with `wrangler secret put <NAME> --name side-project`. To add a new secret, also add its name to `PROD.secrets` in `alchemy.run.ts`.
- The sideprojectsaturday.com domain is attached outside the stack, and Alchemy leaves it alone.
- D1 migrations are not applied by the deploy. Apply them as before with `wrangler d1 migrations apply sps --remote`.

**Previews** (any other stage) get their own Worker, D1 database (seeded from `src/db/schema.sql`), KV namespaces and R2 bucket. Destroying the preview deletes them. Previews have no cron triggers, no secrets and no `send_email` binding, so they can't email anyone. Admin login, unsubscribe links and the door buzzer don't work in previews.

To check what a deploy would do, run `bunx alchemy plan --stage <stage>` with a Saturday Software API token in `CLOUDFLARE_API_TOKEN`. The plan reads the Alchemy state store in that account, which the first platform deploy creates. Don't use `wrangler deploy`: `wrangler.jsonc` is only for local dev and the Astro build.
