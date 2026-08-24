/**
 * CLI: db command
 *
 * Wraps drizzle-kit commands with correct paths.
 * Subcommands: push, pull, generate, migrate
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const VALID_SUBCOMMANDS = ["push", "pull", "generate", "migrate"] as const;

export async function execute(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (!subcommand || !VALID_SUBCOMMANDS.includes(subcommand as any)) {
    console.log(`
  Narsil DB — Drizzle Kit wrapper

  Usage: npx narsil db <command>

  Commands:
    push        Push schema changes to database
    pull        Pull schema from existing database
    generate    Generate SQL migration files
    migrate     Run pending migrations
    `);
    return;
  }

  const cwd = process.cwd();

  // Find drizzle config
  const configCandidates = [join(cwd, "backend", "drizzle.config.ts"), join(cwd, "drizzle.config.ts")];
  const configPath = configCandidates.find((c) => existsSync(c));

  const drizzleArgs = ["drizzle-kit", subcommand];
  if (configPath) {
    drizzleArgs.push("--config", configPath);
  }

  console.log(`\n  Narsil — Running: drizzle-kit ${subcommand}\n`);

  const child = spawn("npx", drizzleArgs, {
    stdio: "inherit",
    shell: true,
    cwd,
  });

  child.on("error", (err) => {
    console.error("  Error running drizzle-kit:", err.message);
    console.error("  Make sure drizzle-kit is installed: npm install -D drizzle-kit");
    process.exit(1);
  });

  child.on("exit", (code) => {
    if (code !== 0) process.exit(code ?? 1);
  });
}
