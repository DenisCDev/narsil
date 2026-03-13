/**
 * NexusFlow Catch-All Route Handler
 *
 * This ONE file replaces all individual API route files.
 * It handles every endpoint for every model automatically.
 */

import { createNexusHandler } from '@nexusflow/next'
import { createSupabaseAdapter, getUser } from '@nexusflow/db-supabase'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Import all models
import { posts } from '@/models/posts'
import { comments } from '@/models/comments'

const handler = createNexusHandler({
  models: [posts, comments],

  createContext: async (_req) => {
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

    return {
      user,
      db,
      headers: {},
    }
  },
})

export { handler as GET, handler as POST, handler as PATCH, handler as DELETE }
