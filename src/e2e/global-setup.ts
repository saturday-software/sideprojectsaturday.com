import { spawn, execSync, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";

let devServer: ChildProcess | undefined;

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
  // Apply database schema to the local D1 database
  console.log("[e2e] Applying D1 schema...");
  execSync("npx wrangler d1 execute sps --local --file=src/db/schema.sql", {
    cwd: process.cwd(),
    stdio: "pipe",
  });

  // If the port is already in use, skip starting
  if (await isPortOpen(4322)) {
    console.log("[e2e] Dev server already running on port 4322");
    return;
  }

  console.log("[e2e] Starting dev server...");

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
      if (!resolved) {
        clearTimeout(timeout);
        reject(new Error(`Dev server exited with code ${code}`));
      }
    });
  });
}

export async function teardown() {
  if (devServer && !devServer.killed) {
    console.log("[e2e] Stopping dev server...");
    devServer.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      devServer!.on("exit", resolve);
      setTimeout(resolve, 5_000);
    });
  }
}
