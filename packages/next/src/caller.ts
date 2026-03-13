/**
 * NexusFlow RSC Direct Caller
 *
 * Enables calling server procedures as direct function calls from
 * React Server Components — ZERO HTTP overhead.
 *
 * Instead of:
 *   fetch('/api/posts') → serialize → network → deserialize → response
 *
 * You get:
 *   createCaller() → api.posts.list() → direct function call → data
 *
 * @example
 * ```ts
 * // app/posts/page.tsx (React Server Component)
 * import { createCaller } from '@/nexusflow/caller'
 *
 * export default async function PostsPage() {
 *   const api = await createCaller()
 *   const posts = await api.posts.list({
 *     where: { status: 'published' },
 *     limit: 20,
 *   })
 *   return <PostList posts={posts} />
 * }
 * ```
 */

import type { ModelDefinition, NexusContext } from '@nexusflow/core'
import { createServer, type NexusCaller } from '@nexusflow/server'

export interface CallerConfig {
  /** All model definitions */
  models: ModelDefinition[]
  /** Create the request context (called once per createCaller invocation) */
  createContext: () => Promise<NexusContext>
}

let _callerConfig: CallerConfig | null = null

/**
 * Configure the caller. Call this once in your nexusflow setup.
 */
export function configureNexusCaller(config: CallerConfig): void {
  _callerConfig = config
}

/**
 * Create a type-safe caller for RSC direct invocation.
 * Each call creates a fresh context (reads cookies, creates Supabase client).
 */
export async function createCaller(config?: CallerConfig): Promise<NexusCaller> {
  const cfg = config ?? _callerConfig
  if (!cfg) {
    throw new Error(
      'NexusFlow caller not configured. Call configureNexusCaller() first, ' +
      'or pass config directly to createCaller().'
    )
  }

  const ctx = await cfg.createContext()

  const server = createServer({
    models: cfg.models,
    db: ctx.db,
  })

  return server.createCaller(ctx)
}
