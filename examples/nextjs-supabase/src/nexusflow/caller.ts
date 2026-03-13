/**
 * NexusFlow RSC Caller
 *
 * Configured once, used in any React Server Component
 * for zero-HTTP data fetching.
 */

import { createCaller, configureNexusCaller } from '@nexusflow/next'
import { createSupabaseAdapter, getUser } from '@nexusflow/db-supabase'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { posts } from '@/models/posts'
import { comments } from '@/models/comments'

configureNexusCaller({
  models: [posts, comments],

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
