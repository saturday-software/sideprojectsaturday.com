/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2026-04-11",
        d1Databases: {
          DB: { id: "test-db" },
        },
        kvNamespaces: ["CACHE"],
        email: {
          send_email: [{ name: "EMAIL" }],
        },
      },
    }),
  ],
  resolve: {
    alias: {
      "@/": new URL("./src/", import.meta.url).pathname,
    },
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "src/e2e/**"],
  },
});
