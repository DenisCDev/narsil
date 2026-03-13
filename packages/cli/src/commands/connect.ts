/**
 * CLI: connect command
 *
 * Connects to a database and introspects the schema.
 * Generates model definitions from existing tables.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export async function execute(args: string[]): Promise<void> {
  const adapter = args[0]

  if (!adapter) {
    console.error('  Usage: npx nexusflow connect <adapter>')
    console.error('  Adapters: supabase, postgres, firebase')
    process.exit(1)
  }

  console.log(`\n  NexusFlow — Connecting to ${adapter}...\n`)

  switch (adapter) {
    case 'supabase':
      await connectSupabase()
      break
    case 'postgres':
      console.log('  PostgreSQL adapter coming soon.')
      break
    case 'firebase':
      console.log('  Firebase adapter coming soon.')
      break
    default:
      console.error(`  Unknown adapter: ${adapter}`)
      process.exit(1)
  }
}

async function connectSupabase(): Promise<void> {
  const cwd = process.cwd()

  // Check for environment variables
  const envPath = join(cwd, '.env.local')
  const envExists = existsSync(envPath)

  if (!envExists) {
    console.log('  Warning: .env.local not found.')
    console.log('  Make sure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.\n')
  } else {
    const env = readFileSync(envPath, 'utf-8')
    const hasUrl = env.includes('NEXT_PUBLIC_SUPABASE_URL')
    const hasKey = env.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY')

    if (hasUrl && hasKey) {
      console.log('  Found Supabase credentials in .env.local')
    } else {
      console.log('  Warning: Missing Supabase credentials in .env.local')
      if (!hasUrl) console.log('    - NEXT_PUBLIC_SUPABASE_URL')
      if (!hasKey) console.log('    - NEXT_PUBLIC_SUPABASE_ANON_KEY')
    }
  }

  console.log(`
  To introspect your Supabase schema and generate models:

  1. Ensure your Supabase credentials are in .env.local
  2. Run: npx nexusflow generate models

  This will:
  - Connect to your Supabase project
  - Read all tables from the public schema
  - Generate model definitions in src/models/
  - Generate TypeScript types
  - Generate API endpoints
  `)
}
