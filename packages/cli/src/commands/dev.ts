/**
 * CLI: dev command
 *
 * Starts the backend server with hot reload via tsx --watch.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export async function execute(_args: string[]): Promise<void> {
  const cwd = process.cwd();

  // Find the server entry point
  const candidates = [join(cwd, "backend", "src", "server.ts"), join(cwd, "src", "server.ts"), join(cwd, "server.ts")];

  const entry = candidates.find((c) => existsSync(c));
  if (!entry) {
    console.error('  Error: Could not find server.ts. Run "npx narsil init" first.');
    process.exit(1);
  }

  console.log("\n  Narsil — Starting dev server...");
  console.log(`  Watching: ${entry}\n`);

  const child = spawn("npx", ["tsx", "--watch", entry], {
    stdio: "inherit",
    shell: true,
    cwd,
  });

  child.on("error", (err) => {
    console.error("  Error starting dev server:", err.message);
    console.error("  Make sure tsx is installed: npm install -D tsx");
    process.exit(1);
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}
