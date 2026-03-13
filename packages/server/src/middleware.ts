/**
 * NexusFlow Middleware Pipeline
 *
 * Lightweight middleware runner using function composition.
 * No class instantiation, no complex DI — just functions.
 */

import type { NexusMiddleware, NexusContext } from '@nexusflow/core'

export type MiddlewareHandler = (ctx: {
  ctx: NexusContext
  procedure?: { name: string; type: string; model?: string }
  next: () => Promise<unknown>
}) => Promise<unknown>

/**
 * Compose an array of middleware into a single function.
 * Executes in order, each calling next() to continue.
 */
export function composeMiddleware(
  middlewares: NexusMiddleware[],
  final: (ctx: NexusContext) => Promise<unknown>
): (ctx: NexusContext, procedure?: { name: string; type: string; model?: string }) => Promise<unknown> {
  return async (ctx: NexusContext, procedure?) => {
    let index = 0

    const next = async (): Promise<unknown> => {
      if (index < middlewares.length) {
        const mw = middlewares[index]!
        index++
        return mw.handler({ ctx, procedure, next })
      }
      return final(ctx)
    }

    return next()
  }
}

// ─── Built-in Middleware ─────────────────────────────────────────────

/**
 * CORS middleware.
 */
export function cors(options: {
  origin?: string | string[]
  methods?: string[]
  headers?: string[]
} = {}): NexusMiddleware {
  const allowOrigin = options.origin ?? '*'
  const allowMethods = (options.methods ?? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']).join(', ')
  const allowHeaders = (options.headers ?? ['Content-Type', 'Authorization']).join(', ')

  return {
    name: 'cors',
    handler: async ({ ctx, next }) => {
      // Set CORS headers on context for the response serializer
      ctx._corsHeaders = {
        'Access-Control-Allow-Origin': Array.isArray(allowOrigin) ? allowOrigin[0]! : allowOrigin,
        'Access-Control-Allow-Methods': allowMethods,
        'Access-Control-Allow-Headers': allowHeaders,
      }
      return next()
    },
  }
}

/**
 * Logging middleware — logs request method, path, and duration.
 */
export function logger(): NexusMiddleware {
  return {
    name: 'logger',
    handler: async ({ procedure, next }) => {
      const start = performance.now()
      try {
        const result = await next()
        const duration = (performance.now() - start).toFixed(2)
        console.log(`[NexusFlow] ${procedure?.name ?? 'unknown'} — ${duration}ms`)
        return result
      } catch (error) {
        const duration = (performance.now() - start).toFixed(2)
        console.error(`[NexusFlow] ${procedure?.name ?? 'unknown'} — FAILED — ${duration}ms`)
        throw error
      }
    },
  }
}
