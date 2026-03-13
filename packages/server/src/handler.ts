/**
 * NexusFlow Request Handler
 *
 * Processes incoming requests through the middleware pipeline,
 * matches routes, and returns responses.
 * Uses Web Standard Request/Response for edge compatibility.
 */

import {
  NexusError,
  NexusNotFoundError,
  NexusValidationError,
  checkPermission,
  type NexusContext,
  type NexusMiddleware,
  type ModelDefinition,
  type DatabaseAdapter,
  type NexusPlugin,
} from '@nexusflow/core'

import { NexusRouter, type ModelHandlers, type HttpMethod } from './router.js'
import { composeMiddleware } from './middleware.js'

// ─── Types ──────────────────────────────────────────────────────────

export interface NexusServerOptions {
  models: ModelDefinition[]
  db: DatabaseAdapter
  middleware?: NexusMiddleware[]
  plugins?: NexusPlugin[]
  apiPrefix?: string
}

// ─── CRUD Handler Generator ─────────────────────────────────────────

function createModelHandlers(model: ModelDefinition): ModelHandlers {
  return {
    list: async (ctx) => {
      if (model.permissions?.list) {
        await checkPermission(model.permissions.list, { ctx, model })
      }

      // Parse query params from URL (passed via ctx)
      const where = ctx.body && typeof ctx.body === 'object' && 'where' in ctx.body
        ? (ctx.body as any).where
        : undefined
      const limit = ctx.body && typeof ctx.body === 'object' && 'limit' in ctx.body
        ? (ctx.body as any).limit
        : 50
      const offset = ctx.body && typeof ctx.body === 'object' && 'offset' in ctx.body
        ? (ctx.body as any).offset
        : 0
      const orderBy = ctx.body && typeof ctx.body === 'object' && 'orderBy' in ctx.body
        ? (ctx.body as any).orderBy
        : undefined

      return ctx.db.findMany(model.table, {
        where,
        limit,
        offset,
        orderBy: orderBy ? { column: Object.keys(orderBy)[0]!, asc: Object.values(orderBy)[0] === 'asc' } : undefined,
      })
    },

    get: async (ctx) => {
      const { id } = ctx.params
      if (!id) throw new NexusValidationError('id', 'Required')

      const record = await ctx.db.findOne(model.table, { where: { id } })
      if (!record) throw new NexusNotFoundError(model.name, id)

      if (model.permissions?.get) {
        await checkPermission(model.permissions.get, { ctx, record: record as Record<string, unknown>, model })
      }

      return record
    },

    create: async (ctx) => {
      if (model.permissions?.create) {
        await checkPermission(model.permissions.create, { ctx, model })
      }

      let data = ctx.body as Record<string, unknown>
      if (!data || typeof data !== 'object') {
        throw new NexusValidationError('body', 'Request body is required')
      }

      // Run beforeCreate hook
      if (model.hooks?.beforeCreate) {
        data = await model.hooks.beforeCreate({ data: data as any, ctx }) as any
      }

      const result = await ctx.db.insert(model.table, data)

      // Run afterCreate hook
      if (model.hooks?.afterCreate) {
        await model.hooks.afterCreate({ data: result as any, ctx })
      }

      return result
    },

    update: async (ctx) => {
      const { id } = ctx.params
      if (!id) throw new NexusValidationError('id', 'Required')

      // Check owner permission — need to fetch record first
      if (model.permissions?.update) {
        const existing = await ctx.db.findOne(model.table, { where: { id } })
        if (!existing) throw new NexusNotFoundError(model.name, id)
        await checkPermission(model.permissions.update, { ctx, record: existing as Record<string, unknown>, model })
      }

      let data = ctx.body as Record<string, unknown>
      if (!data || typeof data !== 'object') {
        throw new NexusValidationError('body', 'Request body is required')
      }

      // Run beforeUpdate hook
      if (model.hooks?.beforeUpdate) {
        data = await model.hooks.beforeUpdate({ data: data as any, ctx }) as any
      }

      const result = await ctx.db.update(model.table, { id }, data)

      // Run afterUpdate hook
      if (model.hooks?.afterUpdate) {
        await model.hooks.afterUpdate({ data: result as any, ctx })
      }

      return result
    },

    delete: async (ctx) => {
      const { id } = ctx.params
      if (!id) throw new NexusValidationError('id', 'Required')

      // Check owner permission
      if (model.permissions?.delete) {
        const existing = await ctx.db.findOne(model.table, { where: { id } })
        if (!existing) throw new NexusNotFoundError(model.name, id)
        await checkPermission(model.permissions.delete, { ctx, record: existing as Record<string, unknown>, model })
      }

      // Run beforeDelete hook
      if (model.hooks?.beforeDelete) {
        await model.hooks.beforeDelete({ id, ctx })
      }

      await ctx.db.delete(model.table, { id })

      // Run afterDelete hook
      if (model.hooks?.afterDelete) {
        await model.hooks.afterDelete({ id, ctx })
      }

      return { success: true }
    },
  }
}

// ─── Server Factory ─────────────────────────────────────────────────

export interface NexusServer {
  router: NexusRouter
  handle: (request: Request, contextFactory: () => Promise<NexusContext>) => Promise<Response>
  /** Direct caller for RSC — no HTTP overhead */
  createCaller: (ctx: NexusContext) => NexusCaller
}

export interface NexusCaller {
  [model: string]: {
    list: (opts?: any) => Promise<any>
    get: (opts: { where: { id: string } }) => Promise<any>
    create: (opts: { data: any }) => Promise<any>
    update: (opts: { where: { id: string }; data: any }) => Promise<any>
    delete: (opts: { where: { id: string } }) => Promise<any>
    [procedure: string]: (input?: any) => Promise<any>
  }
}

/**
 * Create a NexusFlow server instance.
 */
export function createServer(options: NexusServerOptions): NexusServer {
  const router = new NexusRouter()
  void (options.apiPrefix ?? '/api')

  // Collect middleware from plugins
  const allMiddleware: NexusMiddleware[] = [
    ...(options.middleware ?? []),
    ...(options.plugins?.flatMap((p) => p.middleware ?? []) ?? []),
  ]

  // Register model routes
  for (const model of options.models) {
    const handlers = createModelHandlers(model)
    router.registerModel(model, handlers)
  }

  // Compose middleware pipeline
  const runMiddleware = composeMiddleware(allMiddleware, async () => undefined)

  // ─── HTTP Handler (Web Standard) ───────────────────────────────

  async function handle(request: Request, contextFactory: () => Promise<NexusContext>): Promise<Response> {
    try {
      const url = new URL(request.url)
      const method = request.method.toUpperCase() as HttpMethod

      // OPTIONS preflight
      if (method === 'OPTIONS' as any) {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        })
      }

      // Match route
      const match = router.match(method, url.pathname)
      if (!match) {
        return Response.json({ error: { code: 'NOT_FOUND', message: `Route not found: ${method} ${url.pathname}` } }, { status: 404 })
      }

      // Build context
      const ctx = await contextFactory()

      // Parse body for mutations
      let body: unknown = undefined
      if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        const contentType = request.headers.get('content-type')
        if (contentType?.includes('application/json')) {
          body = await request.json()
        }
      }

      // Parse query string for GET requests
      if (method === 'GET') {
        const queryParams: Record<string, unknown> = {}
        for (const [key, value] of url.searchParams) {
          // Try to parse JSON values (for where, orderBy objects)
          try {
            queryParams[key] = JSON.parse(value)
          } catch {
            queryParams[key] = value
          }
        }
        if (Object.keys(queryParams).length > 0) {
          body = queryParams
        }
      }

      // Extend context with params and body
      const handlerCtx = Object.assign(ctx, {
        params: match.params,
        body,
      })

      // Run middleware pipeline then handler
      await runMiddleware(ctx, match.route.model ? { name: match.route.operation ?? '', type: match.route.method, model: match.route.model } : undefined)

      const result = await match.route.handler(handlerCtx)

      // Build response
      const corsHeaders = (ctx as any)._corsHeaders ?? {}
      return Response.json(result, {
        status: method === 'POST' ? 201 : 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      })
    } catch (error) {
      if (error instanceof NexusError) {
        return Response.json(error.toJSON(), { status: error.status })
      }
      console.error('[NexusFlow] Unhandled error:', error)
      return Response.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
        { status: 500 }
      )
    }
  }

  // ─── Direct Caller (RSC, zero HTTP overhead) ──────────────────

  function createCaller(ctx: NexusContext): NexusCaller {
    const caller: Record<string, any> = {}

    for (const model of options.models) {
      const handlers = createModelHandlers(model)

      const modelCaller: Record<string, (input?: any) => Promise<any>> = {
        list: async (opts?: any) => {
          const handlerCtx = Object.assign({ ...ctx }, { params: {}, body: opts })
          return handlers.list(handlerCtx)
        },
        get: async (opts: { where: { id: string } }) => {
          const handlerCtx = Object.assign({ ...ctx }, { params: { id: opts.where.id }, body: undefined })
          return handlers.get(handlerCtx)
        },
        create: async (opts: { data: any }) => {
          const handlerCtx = Object.assign({ ...ctx }, { params: {}, body: opts.data })
          return handlers.create(handlerCtx)
        },
        update: async (opts: { where: { id: string }; data: any }) => {
          const handlerCtx = Object.assign({ ...ctx }, { params: { id: opts.where.id }, body: opts.data })
          return handlers.update(handlerCtx)
        },
        delete: async (opts: { where: { id: string } }) => {
          const handlerCtx = Object.assign({ ...ctx }, { params: { id: opts.where.id }, body: undefined })
          return handlers.delete(handlerCtx)
        },
      }

      // Add custom procedures
      if (model.procedures) {
        for (const [name, proc] of Object.entries(model.procedures)) {
          modelCaller[name] = async (input?: any) => {
            return proc.handler({ input, ctx })
          }
        }
      }

      caller[model.name] = modelCaller
    }

    return caller as NexusCaller
  }

  return { router, handle, createCaller }
}
