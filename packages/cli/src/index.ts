/**
 * @nexusflow/cli
 *
 * CLI entry point. Dispatches commands.
 */

const commands: Record<string, () => Promise<{ execute: (args: string[]) => Promise<void> }>> = {
  init: () => import('./commands/init.js'),
  generate: () => import('./commands/generate.js'),
  connect: () => import('./commands/connect.js'),
  db: () => import('./commands/db.js'),
  dev: () => import('./commands/dev.js'),
}

export async function run(args: string[]): Promise<void> {
  const command = args[0]

  if (!command || command === '--help' || command === '-h') {
    printHelp()
    return
  }

  const loader = commands[command]
  if (!loader) {
    console.error(`Unknown command: ${command}`)
    console.error('Run "nexusflow --help" for usage.')
    process.exit(1)
  }

  const mod = await loader()
  await mod.execute(args.slice(1))
}

function printHelp(): void {
  console.log(`
  NexusFlow CLI — High-performance backend framework for Next.js

  Usage: npx nexusflow <command> [options]

  Commands:
    init                  Initialize NexusFlow in your project
    connect <adapter>     Connect to a database (supabase, postgres, firebase)
    generate              Generate all code from models
    generate models       Generate models from database schema
    generate api          Generate API routes and client SDK
    generate rls          Generate RLS policies (Supabase)
    db push               Apply migrations to database
    db pull               Pull schema from database
    db diff               Show pending migration diff
    dev                   Watch mode — regenerate on model changes

  Examples:
    npx nexusflow init
    npx nexusflow connect supabase
    npx nexusflow generate
    npx nexusflow dev
  `)
}
