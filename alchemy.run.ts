/**
 * Alchemy v2 stack for sideprojectsaturday.com, deployed by projects.just-be.dev.
 *
 * The platform runs `bun install`, then
 * `bunx alchemy deploy --stage <STAGE> --yes --no-input`, where STAGE is
 * `prod` for main and `b-<slug>-<hash>` for any other branch. The stack
 * returns `{ url }`, which is how the platform learns where a stage serves.
 *
 * - `prod` takes over the live Worker `side-project` and binds the existing
 *   D1 database, KV namespace and R2 bucket by id/name. It never creates,
 *   replaces or deletes any of them (see "Prod" below).
 * - Every other stage is a preview: its own Worker, D1, KV and R2, no cron
 *   triggers, no secrets and no `send_email` binding. A preview can't reach
 *   prod data and can't send email.
 *
 * Local development still uses `astro dev` with `wrangler.jsonc`. The Astro
 * build reads `wrangler.jsonc` too, because it names the custom entry
 * (`src/worker.ts`) that exports the Durable Objects and the `scheduled` and
 * `email` handlers.
 */
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Command from "alchemy/Command";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

/**
 * The Saturday Software Cloudflare account. Everything this stack touches
 * lives here. It must never deploy anywhere else, in particular not into
 * Justin's personal account (6b7fb48e339fba384781d4a041b23a01), which the
 * local `alchemy` OAuth profile points at.
 */
const ACCOUNT_ID = "6de942b9cdb2c3f3d040fdbe3c1975c5";

// ── Hard guard: runs when this module loads, before Alchemy builds anything ──
//
// Alchemy takes credentials from the environment only when both
// CLOUDFLARE_ACCOUNT_ID and an API token (or key) are set. Otherwise it falls
// back to the selected `~/.alchemy` profile, whose account wins over
// CLOUDFLARE_ACCOUNT_ID. So check both: the account id, and that the
// credentials come from the environment, not from a profile.
{
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (accountId !== ACCOUNT_ID) {
    throw new Error(
      `Refusing to run: CLOUDFLARE_ACCOUNT_ID must be ${ACCOUNT_ID} (Saturday Software), got ${accountId ? `"${accountId}"` : "nothing"}.`,
    );
  }
  if (!process.env.CLOUDFLARE_API_TOKEN?.trim() && !process.env.CLOUDFLARE_API_KEY?.trim()) {
    throw new Error(
      "Refusing to run: set CLOUDFLARE_API_TOKEN for the Saturday Software account. " +
        "Without it Alchemy would use the local ~/.alchemy profile, which can point at another account.",
    );
  }
}

const PROJECT_NAME = process.env.PROJECT_NAME?.trim() || "sideprojectsaturday";

/** Where prod serves. The custom domain is attached outside this stack. */
const PROD_URL = "https://sideprojectsaturday.com";

/** Existing prod resources, from `wrangler.jsonc`. */
const PROD = {
  workerName: "side-project",
  d1DatabaseId: "fbd35c52-b517-47b8-9569-c372022d64da",
  kvCacheNamespaceId: "57a569810f7842b59e61b4135e2079e1",
  r2ImagesBucket: "sps-images",
  crons: ["0 13 * * WED", "0 13 * * FRI", "0 16 * * SUN"],
  /**
   * Worker secrets, set with `wrangler secret put`. Alchemy doesn't know
   * their values and a script upload replaces all bindings, so prod binds
   * each one as `inherit`: Cloudflare copies it from the live version.
   */
  secrets: [
    "ADMIN_PASSWORD",
    "SHARE_SEED",
    "UNSUBSCRIBE_SECRET",
    "SWITCHBOT_TOKEN",
    "SWITCHBOT_KEY",
    "SWITCHBOT_DEVICE_ID",
  ],
} as const;

const vars = {
  FROM_EMAIL: "hello@sideprojectsaturday.com",
  EVENT_ADDRESS: "325 Gold St #503",
} as const;

/** Same as `wrangler.jsonc`, so prod runs with the flags it has today. */
const compatibility = {
  date: "2026-04-11",
  // With `bundle: false`, Alchemy uses this list exactly as given.
  flags: ["global_fetch_strictly_public"],
};

/** Same as `wrangler.jsonc`. */
const observability = {
  enabled: true,
  logs: { enabled: true, invocationLogs: true },
  traces: { enabled: false },
};

const state = Layer.unwrap(
  Effect.gen(function* () {
    const dev = yield* Alchemy.ALCHEMY_DEV.pipe(Effect.orDie);
    return dev ? Alchemy.localState() : Cloudflare.state();
  }),
);

export default Alchemy.Stack(
  PROJECT_NAME,
  {
    providers: Cloudflare.providers(),
    state,
  },
  Effect.gen(function* () {
    // Second guard: the account Alchemy actually resolved credentials for.
    const credentials = yield* yield* Cloudflare.CloudflareEnvironment;
    if (credentials.accountId !== ACCOUNT_ID) {
      return yield* Effect.die(
        new Error(
          `Refusing to deploy: Cloudflare credentials resolve to account ${credentials.accountId}, not ${ACCOUNT_ID}.`,
        ),
      );
    }

    const stage = yield* Alchemy.Stage;
    const isProd = stage === "prod";

    // `astro build` → dist/server (the Worker, built from src/worker.ts via
    // wrangler.jsonc's `main`) and dist/client (static assets). Content-hashed:
    // an unchanged tree skips the rebuild.
    const build = yield* Command.Build("AstroBuild", {
      command: "bun run build",
      outdir: "dist",
    });

    // The prebuilt server bundle, uploaded as-is (wrangler's `no_bundle`),
    // with the client build as static assets. `build.hash.output` makes the
    // Worker wait for the build and redeploy whenever its output changes.
    const site = {
      main: "./dist/server/entry.mjs",
      bundle: false,
      rules: [{ globs: ["**/*.js", "**/*.mjs"] }],
      assets: {
        directory: Output.map(build.outdir, (outdir) => `${outdir}/client`),
        hash: build.hash.output,
      },
      compatibility,
      observability,
    };

    if (isProd) {
      const worker = yield* Cloudflare.Worker("Site", {
        ...site,
        name: PROD.workerName,
        env: {
          ...vars,
          SITE_URL: PROD_URL,
          // Same classes and binding names as today: Alchemy matches them to
          // the live SQLite namespaces and keeps their data.
          EVENT_DO: Cloudflare.DurableObject("EventDO"),
          MAILBOX_DO: Cloudflare.DurableObject("MailboxDO"),
          EMAIL: Cloudflare.Email.SendEmail("EMAIL"),
        },
        crons: [...PROD.crons],
        // `domain` and `routes` are left out on purpose: Alchemy then leaves
        // the sideprojectsaturday.com attachment, made outside this stack,
        // alone. `workersDev` defaults to the workers.dev URL plus preview
        // URLs, as in wrangler.jsonc.
      }).pipe(
        // `side-project` was deployed by wrangler, so it carries no Alchemy
        // ownership tags. Take it over instead of failing.
        Alchemy.AdoptPolicy.adopt(true),
        // Never delete the prod Worker: that would delete both Durable
        // Object namespaces and everything stored in them.
        Alchemy.RemovalPolicy.retain(),
      );

      // Prod's data stores are bound by id/name rather than declared as
      // resources, so Alchemy never creates, updates, replaces or deletes
      // them, and `alchemy destroy` can't reach them. This also means the
      // deploy doesn't apply D1 migrations: keep running
      // `wrangler d1 migrations apply sps --remote`.
      yield* worker.bind("ProdData", {
        bindings: [
          { type: "d1", name: "DB", databaseId: PROD.d1DatabaseId },
          { type: "kv_namespace", name: "CACHE", namespaceId: PROD.kvCacheNamespaceId },
          { type: "r2_bucket", name: "IMAGES_BUCKET", bucketName: PROD.r2ImagesBucket },
          // Astro's adapter binds IMAGES (Cloudflare Images) and SESSION (KV,
          // provisioned by wrangler, id unknown here). Inherit SESSION from the
          // live version.
          { type: "images", name: "IMAGES" },
          { type: "inherit", name: "SESSION" },
          // Keep every wrangler-managed secret exactly as it is.
          ...PROD.secrets.map((name) => ({ type: "inherit" as const, name })),
        ],
      });

      return { url: PROD_URL };
    }

    // ── Preview ──
    // Fresh, empty resources per stage, deleted by `alchemy destroy`.
    const db = yield* Cloudflare.D1.Database("Database", {
      // The migrations in ./migrations assume the base schema already exists;
      // schema.sql is the full current schema, so a new database starts from
      // it instead.
      importFiles: ["./src/db/schema.sql"],
    });
    const cache = yield* Cloudflare.KV.Namespace("Cache");
    const session = yield* Cloudflare.KV.Namespace("Session");
    const images = yield* Cloudflare.R2.Bucket("Images", { forceDestroy: true });

    const worker = yield* Cloudflare.Worker("Site", {
      ...site,
      env: {
        ...vars,
        // The preview's own URL, so links in pages point back at it.
        SITE_URL: Cloudflare.Worker.URL,
        DB: db,
        CACHE: cache,
        SESSION: session,
        IMAGES_BUCKET: images,
        EVENT_DO: Cloudflare.DurableObject("EventDO"),
        MAILBOX_DO: Cloudflare.DurableObject("MailboxDO"),
        // No EMAIL binding: a preview can't send email at all. No secrets:
        // admin login, share codes, unsubscribe links and the door buzzer
        // don't work in previews.
      },
      // No cron triggers: the crons email every subscriber.
      crons: [],
    });
    yield* worker.bind("Images", { bindings: [{ type: "images", name: "IMAGES" }] });

    return { url: worker.url };
  }),
);
