import { spawn, execSync, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";

let devServer: ChildProcess | undefined;

/** Path where we stream the dev server's combined stdout/stderr. */
export const DEV_LOG_PATH = join(process.cwd(), ".wrangler", "e2e-dev.log");

/** Check if a port is already listening. */
function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

export async function setup() {
  // If the port is already in use, skip starting (e.g. CI starts the server
  // externally, or a previous globalSetup invocation already started it).
  if (await isPortOpen(4322)) {
    console.log("[e2e] Dev server already running on port 4322");
    return;
  }

  // Apply database schema to the local D1 database
  console.log("[e2e] Applying D1 schema...");
  execSync("npx wrangler d1 execute sps --local --file=src/db/schema.sql", {
    cwd: process.cwd(),
    stdio: "pipe",
  });

  console.log("[e2e] Starting dev server...");

  // Stream dev server output to a log file so commands can read it later
  mkdirSync(join(process.cwd(), ".wrangler"), { recursive: true });
  const logStream = createWriteStream(DEV_LOG_PATH);

  devServer = spawn(
    "node",
    ["./node_modules/.bin/astro", "dev", "--port", "4322"],
    {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
      cwd: process.cwd(),
      detached: true,
    },
  );

  // Pipe output to log file (used by waitForSentEmail to find .eml paths)
  devServer.stdout?.on("data", (data: Buffer) => logStream.write(data));
  devServer.stderr?.on("data", (data: Buffer) => logStream.write(data));

  // Poll the port instead of watching stdout — piped stdout is block-buffered
  // so the "localhost:4322" line can be delayed by 20+ seconds.
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await isPortOpen(4322)) {
      console.log("[e2e] Dev server ready");
      return;
    }
    // Check if the process died
    if (devServer.exitCode !== null) {
      throw new Error(`Dev server exited with code ${devServer.exitCode}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Dev server failed to start within 60s");
}

export async function teardown() {
  if (devServer && !devServer.killed && devServer.pid) {
    console.log("[e2e] Stopping dev server...");
    // Kill the entire process group (astro spawns child processes for vite/wrangler)
    try {
      process.kill(-devServer.pid, "SIGTERM");
    } catch {}
    await new Promise<void>((resolve) => {
      devServer!.on("exit", resolve);
      setTimeout(() => {
        // Force kill if still alive
        try {
          process.kill(-devServer!.pid!, "SIGKILL");
        } catch {}
        resolve();
      }, 3_000);
    });
  }
}
