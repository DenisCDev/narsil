/**
 * NexusFlow Next.js Route Handler
 *
 * Creates a single catch-all route handler that replaces ALL individual
 * API route files. Uses Web Standard Request/Response.
 *
 * @example
 * ```ts
 * // app/api/[...nexusflow]/route.ts
 * import { createNexusHandler } from '@nexusflow/next'
 *
 * const handler = createNexusHandler({
 *   models: [posts, comments, profiles],
 *   createContext: async (req) => {
 *     const supabase = createServerClient(...)
 *     const user = await getUser(supabase)
 *     return { user, db: createSupabaseAdapter(supabase) }
 *   },
 * })
 *
 * export { handler as GET, handler as POST, handler as PATCH, handler as DELETE }
 * ```
 */

import type { ModelDefinition, NexusContext, NexusMiddleware, NexusPlugin } from '@nexusflow/core'
import { createServer } from '@nexusflow/server'

export interface NexusHandlerOptions {
  /** All model definitions */
  models: ModelDefinition[]
  /** Create the request context (auth, db adapter) */
  createContext: (request: Request) => Promise<NexusContext>
  /** Global middleware */
  middleware?: NexusMiddleware[]
  /** Plugins */
  plugins?: NexusPlugin[]
  /** API route prefix (default: '/api') */
  apiPrefix?: string
}

/**
 * Create a Next.js catch-all route handler.
 * One function handles GET, POST, PATCH, DELETE for all models.
 */
export function createNexusHandler(options: NexusHandlerOptions) {
  // Create the server instance once (module-level singleton)
  // This avoids re-creating the router on every request.
  let server: ReturnType<typeof createServer> | null = null

  function getServer() {
    if (!server) {
      server = createServer({
        models: options.models,
        db: null as any, // DB comes from context per-request
        middleware: options.middleware,
        plugins: options.plugins,
        apiPrefix: options.apiPrefix,
      })
    }
    return server
  }

  async function handler(request: Request): Promise<Response> {
    const srv = getServer()
    return srv.handle(request, () => options.createContext(request))
  }

  return handler
}
