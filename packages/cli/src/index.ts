/**
 * @narsil/cli v2
 *
 * CLI entry point. Dispatches commands.
 */

const commands: Record<string, () => Promise<{ execute: (args: string[]) => Promise<void> }>> = {
  init: () => import("./commands/init.js"),
  dev: () => import("./commands/dev.js"),
  db: () => import("./commands/db.js"),
};

export async function run(args: string[]): Promise<void> {
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  const loader = commands[command];
  if (!loader) {
    console.error(`Unknown command: ${command}`);
    console.error('Run "narsil --help" for usage.');
    process.exit(1);
  }

  const mod = await loader();
  await mod.execute(args.slice(1));
}

function printHelp(): void {
  console.log(`
  Narsil v2 — The fastest backend for Next.js applications

  Usage: npx narsil <command> [options]

  Commands:
    init [--runtime elysia|axum]
                          Scaffold a backend. Default: elysia (Bun, Vercel).
                          axum is the optional Rust/Axum runtime (Fly/VPS).
    dev                   Start the backend (tsx watch, or cargo run for Axum)
    db push               Push schema to database (drizzle-kit; Elysia only)
    db pull               Pull schema from database (drizzle-kit pull)
    db generate           Generate migration files (drizzle-kit generate)
    db migrate            Run pending migrations (drizzle-kit migrate)

  Examples:
    npx narsil init
    npx narsil init --runtime axum
    npx narsil dev
    npx narsil db push
  `);
}
