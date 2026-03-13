/**
 * CLI: init command
 *
 * Scaffolds NexusFlow in an existing Next.js project:
 * - Creates nexusflow.config.ts
 * - Creates src/models/ directory
 * - Creates app/api/[...nexusflow]/route.ts
 * - Creates src/nexusflow/caller.ts
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export async function execute(_args: string[]): Promise<void> {
  const cwd = process.cwd()
  console.log('\n  NexusFlow — Initializing...\n')

  // 1. Create config file
  const configPath = join(cwd, 'nexusflow.config.ts')
  if (!existsSync(configPath)) {
    writeFileSync(configPath, CONFIG_TEMPLATE)
    console.log('  Created nexusflow.config.ts')
  } else {
    console.log('  nexusflow.config.ts already exists, skipping')
  }

  // 2. Create models directory
  const modelsDir = join(cwd, 'src', 'models')
  if (!existsSync(modelsDir)) {
    mkdirSync(modelsDir, { recursive: true })
    writeFileSync(join(modelsDir, 'example.ts'), EXAMPLE_MODEL)
    console.log('  Created src/models/example.ts')
  }

  // 3. Create API route handler
  const routeDir = join(cwd, 'src', 'app', 'api', '[...nexusflow]')
  if (!existsSync(routeDir)) {
    mkdirSync(routeDir, { recursive: true })
    writeFileSync(join(routeDir, 'route.ts'), ROUTE_HANDLER_TEMPLATE)
    console.log('  Created src/app/api/[...nexusflow]/route.ts')
  }

  // 4. Create caller for RSC
  const nexusflowDir = join(cwd, 'src', 'nexusflow')
  if (!existsSync(nexusflowDir)) {
    mkdirSync(nexusflowDir, { recursive: true })
    writeFileSync(join(nexusflowDir, 'caller.ts'), CALLER_TEMPLATE)
    console.log('  Created src/nexusflow/caller.ts')
  }

  // 5. Add .nexusflow to gitignore
  const gitignorePath = join(cwd, '.gitignore')
  if (existsSync(gitignorePath)) {
    const content = await import('node:fs').then(fs => fs.readFileSync(gitignorePath, 'utf-8'))
    if (!content.includes('.nexusflow')) {
      writeFileSync(gitignorePath, content + '\n# NexusFlow generated\n.nexusflow/\n')
      console.log('  Updated .gitignore')
    }
  }

  console.log(`
  Done! Next steps:

  1. Configure your database in nexusflow.config.ts
  2. Define models in src/models/
  3. Run: npx nexusflow generate
  4. Start your Next.js dev server
  `)
}

const CONFIG_TEMPLATE = `import { defineConfig } from '@nexusflow/core'

export default defineConfig({
  modelsDir: './src/models',
  outputDir: './.nexusflow/generated',

  database: {
    adapter: 'supabase',
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },

  next: {
    apiPrefix: '/api',
    generateActions: true,
    generateClient: true,
  },

  realtime: {
    enabled: true,
    adapter: 'supabase',
  },
})
`

const EXAMPLE_MODEL = `import { defineModel, field } from '@nexusflow/core'

export const posts = defineModel('posts', {
  fields: {
    id:        field.uuid().primaryKey().default('gen_random_uuid()'),
    title:     field.text().min(1).max(200),
    content:   field.text().optional(),
    status:    field.enum(['draft', 'published', 'archived']).default('draft'),
    authorId:  field.uuid().references('profiles', 'id'),
    createdAt: field.timestamp().default('now()'),
    updatedAt: field.timestamp().default('now()').onUpdate('now()'),
  },

  permissions: {
    list:   'authenticated',
    get:    'authenticated',
    create: 'authenticated',
    update: 'owner',
    delete: 'owner',
  },

  ownerField: 'authorId',
})
`

const ROUTE_HANDLER_TEMPLATE = `import { createNexusHandler } from '@nexusflow/next'
import { createSupabaseAdapter, getUser } from '@nexusflow/db-supabase'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Import your models
import { posts } from '@/models/example'

const handler = createNexusHandler({
  models: [posts],
  createContext: async (req) => {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      }
    )

    const user = await getUser(supabase)
    const db = createSupabaseAdapter(supabase)

    return { user, db, headers: {} }
  },
})

export { handler as GET, handler as POST, handler as PATCH, handler as DELETE }
`

const CALLER_TEMPLATE = `import { createCaller, configureNexusCaller } from '@nexusflow/next'
import { createSupabaseAdapter, getUser } from '@nexusflow/db-supabase'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Import your models
import { posts } from '@/models/example'

configureNexusCaller({
  models: [posts],
  createContext: async () => {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      }
    )

    const user = await getUser(supabase)
    const db = createSupabaseAdapter(supabase)

    return { user, db, headers: {} }
  },
})

export { createCaller }
`
