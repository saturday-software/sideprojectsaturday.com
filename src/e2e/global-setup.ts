import { spawn, execSync, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
import {
  createWriteStream,
  mkdirSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";

let devServer: ChildProcess | undefined;

/** Path where we stream the dev server's combined stdout/stderr. */
export const DEV_LOG_PATH = join(process.cwd(), ".wrangler", "e2e-dev.log");

const LOCK_PATH = join(process.cwd(), ".wrangler", "e2e-server.lock");

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

/** Wait until the port is accepting connections. */
async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Port ${port} not open within ${timeoutMs}ms`);
}

export async function setup() {
  mkdirSync(join(process.cwd(), ".wrangler"), { recursive: true });

  // If the port is already up, nothing to do.
  if (await isPortOpen(4322)) {
    console.log("[e2e] Dev server already running on port 4322");
    return;
  }

  // Another globalSetup invocation may already be starting the server.
  // Use a lock file to let only the first process spawn it; others just wait.
  if (existsSync(LOCK_PATH)) {
    console.log("[e2e] Another process is starting the dev server, waiting...");
    await waitForPort(4322, 60_000);
    console.log("[e2e] Dev server ready (started by another process)");
    return;
  }
  writeFileSync(LOCK_PATH, String(process.pid));

  // Apply database schema to the local D1 database
  console.log("[e2e] Applying D1 schema...");
  execSync("npx wrangler d1 execute sps --local --file=src/db/schema.sql", {
    cwd: process.cwd(),
    stdio: "pipe",
  });

  console.log("[e2e] Starting dev server...");

  // Stream dev server output to a log file so commands can read it later
  const logStream = createWriteStream(DEV_LOG_PATH);

  await new Promise<void>((resolve, reject) => {
    devServer = spawn(
      "node",
      ["./node_modules/.bin/astro", "dev", "--port", "4322"],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
        cwd: process.cwd(),
      },
    );

    const timeout = setTimeout(() => {
      reject(new Error("Dev server failed to start within 60s"));
    }, 60_000);

    let resolved = false;
    const onData = (data: Buffer) => {
      logStream.write(data);
      const text = data.toString();
      if (!resolved && text.includes("localhost:4322")) {
        resolved = true;
        clearTimeout(timeout);
        console.log("[e2e] Dev server ready");
        setTimeout(resolve, 2_000);
      }
    };

    devServer.stdout?.on("data", onData);
    devServer.stderr?.on("data", onData);
    devServer.on("error", (err) => {
      if (!resolved) {
        clearTimeout(timeout);
        reject(err);
      }
    });
    devServer.on("exit", (code) => {
      logStream.end();
      if (!resolved) {
        clearTimeout(timeout);
        reject(new Error(`Dev server exited with code ${code}`));
      }
    });
  });
}

export async function teardown() {
  try {
    const { unlinkSync } = await import("node:fs");
    unlinkSync(LOCK_PATH);
  } catch {}

  if (devServer && !devServer.killed) {
    console.log("[e2e] Stopping dev server...");
    devServer.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      devServer!.on("exit", resolve);
      setTimeout(resolve, 5_000);
    });
  }
}
