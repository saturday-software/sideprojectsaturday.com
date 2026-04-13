import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import {
  submitSubscription,
  waitForSentEmail,
  visitPage,
} from "./src/e2e/commands.js";

export default defineConfig({
  test: {
    include: ["src/e2e/**/*.test.ts"],
    testTimeout: 60_000,
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions: {
          executablePath:
            process.env.CHROMIUM_PATH ??
            "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
          args: [
            "--no-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--no-proxy-server",
          ],
        },
      }),
      headless: true,
      instances: [{ browser: "chromium" }],
      commands: {
        submitSubscription,
        waitForSentEmail,
        visitPage,
      },
    },
    globalSetup: "./src/e2e/global-setup.ts",
  },
});
