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

The site is deployed to Cloudflare Workers via [Wrangler](https://developers.cloudflare.com/workers/wrangler/).

```sh
bun run build
wrangler deploy
```
