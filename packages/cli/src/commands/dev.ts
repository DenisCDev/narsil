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

  const cargoRoots = [join(cwd, "backend"), cwd];
  const cargoRoot = cargoRoots.find((dir) => existsSync(join(dir, "Cargo.toml")));
  if (cargoRoot) {
    // smaug-ignore console-log: CLI tells the user Axum is starting via cargo
    console.log("\n  Narsil Axum — cargo run\n");
    const cargo = spawn("cargo", ["run"], {
      stdio: "inherit",
      shell: true,
      cwd: cargoRoot,
    });
    cargo.on("error", (err) => {
      console.error("  Error starting Axum:", err.message);
      console.error("  Install Rust from https://rustup.rs");
      process.exit(1);
    });
    cargo.on("exit", (code) => {
      process.exit(code ?? 0);
    });
    return;
  }

  // Find the server entry point
  const candidates = [join(cwd, "backend", "src", "server.ts"), join(cwd, "src", "server.ts"), join(cwd, "server.ts")];

  const entry = candidates.find((c) => existsSync(c));
  if (!entry) {
    console.error('  Error: Could not find server.ts or Cargo.toml. Run "npx narsil init" first.');
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
