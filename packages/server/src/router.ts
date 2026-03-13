/**
 * NexusFlow Router
 *
 * Static trie-based router with O(1) lookup for static routes
 * and fast param extraction for dynamic segments.
 * Pre-compiled at build time for zero runtime overhead.
 */

import type { NexusContext, ModelDefinition } from '@nexusflow/core'

// ─── Types ──────────────────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface RouteHandler {
  (ctx: NexusContext & { params: Record<string, string>; body?: unknown }): Promise<unknown>
}

export interface Route {
  method: HttpMethod
  path: string
  handler: RouteHandler
  model?: string
  operation?: string
  middleware?: string[]
}

interface TrieNode {
  children: Map<string, TrieNode>
  paramChild?: { node: TrieNode; paramName: string }
  handlers: Map<HttpMethod, Route>
}

// ─── Router ─────────────────────────────────────────────────────────

export class NexusRouter {
  /** Static routes: "GET:/api/posts" → Route (O(1) lookup) */
  private staticRoutes = new Map<string, Route>()

  /** Trie for dynamic routes (routes with :params) */
  private root: TrieNode = { children: new Map(), handlers: new Map() }

  /** All registered routes (for introspection) */
  private allRoutes: Route[] = []

  /**
   * Register a route.
   */
  add(method: HttpMethod, path: string, handler: RouteHandler, meta?: { model?: string; operation?: string }): void {
    const route: Route = { method, path, handler, model: meta?.model, operation: meta?.operation }
    this.allRoutes.push(route)

    if (!path.includes(':')) {
      // Static route — O(1) Map lookup
      this.staticRoutes.set(`${method}:${path}`, route)
    } else {
      // Dynamic route — trie insertion
      this.insertTrie(method, path, route)
    }
  }

  /**
   * Match a request to a route. Returns handler + extracted params.
   */
  match(method: HttpMethod, path: string): { route: Route; params: Record<string, string> } | null {
    // Fast path: static route O(1) lookup
    const staticKey = `${method}:${path}`
    const staticRoute = this.staticRoutes.get(staticKey)
    if (staticRoute) {
      return { route: staticRoute, params: {} }
    }

    // Slow path: trie traversal for dynamic routes
    return this.matchTrie(method, path)
  }

  /**
   * Register all CRUD routes for a model.
   */
  registerModel(model: ModelDefinition, handlers: ModelHandlers): void {
    const prefix = `/api/${model.table}`

    if (model.api?.list !== false) {
      this.add('GET', prefix, handlers.list, { model: model.name, operation: 'list' })
    }
    if (model.api?.get !== false) {
      this.add('GET', `${prefix}/:id`, handlers.get, { model: model.name, operation: 'get' })
    }
    if (model.api?.create !== false) {
      this.add('POST', prefix, handlers.create, { model: model.name, operation: 'create' })
    }
    if (model.api?.update !== false) {
      this.add('PATCH', `${prefix}/:id`, handlers.update, { model: model.name, operation: 'update' })
    }
    if (model.api?.delete !== false) {
      this.add('DELETE', `${prefix}/:id`, handlers.delete, { model: model.name, operation: 'delete' })
    }

    // Register custom procedures
    if (model.procedures) {
      for (const [name, proc] of Object.entries(model.procedures)) {
        const procMethod = proc.type === 'query' ? 'GET' : 'POST'
        this.add(procMethod, `${prefix}/${name}`, async (ctx) => {
          return proc.handler({ input: ctx.body, ctx })
        }, { model: model.name, operation: name })
      }
    }
  }

  /**
   * Get all registered routes (for debugging/introspection).
   */
  getRoutes(): Route[] {
    return this.allRoutes
  }

  // ─── Trie internals ────────────────────────────────────────────────

  private insertTrie(method: HttpMethod, path: string, route: Route): void {
    const segments = path.split('/').filter(Boolean)
    let node = this.root

    for (const segment of segments) {
      if (segment.startsWith(':')) {
        const paramName = segment.slice(1)
        if (!node.paramChild) {
          node.paramChild = { node: { children: new Map(), handlers: new Map() }, paramName }
        }
        node = node.paramChild.node
      } else {
        if (!node.children.has(segment)) {
          node.children.set(segment, { children: new Map(), handlers: new Map() })
        }
        node = node.children.get(segment)!
      }
    }

    node.handlers.set(method, route)
  }

  private matchTrie(method: HttpMethod, path: string): { route: Route; params: Record<string, string> } | null {
    const segments = path.split('/').filter(Boolean)
    const params: Record<string, string> = {}

    const result = this.matchTrieRecursive(this.root, segments, 0, method, params)
    return result
  }

  private matchTrieRecursive(
    node: TrieNode,
    segments: string[],
    index: number,
    method: HttpMethod,
    params: Record<string, string>
  ): { route: Route; params: Record<string, string> } | null {
    if (index === segments.length) {
      const route = node.handlers.get(method)
      if (route) return { route, params: { ...params } }
      return null
    }

    const segment = segments[index]!

    // Try static child first (more specific)
    const staticChild = node.children.get(segment)
    if (staticChild) {
      const result = this.matchTrieRecursive(staticChild, segments, index + 1, method, params)
      if (result) return result
    }

    // Try param child
    if (node.paramChild) {
      params[node.paramChild.paramName] = segment
      const result = this.matchTrieRecursive(node.paramChild.node, segments, index + 1, method, params)
      if (result) {
        return result
      }
      delete params[node.paramChild.paramName]
    }

    return null
  }
}

// ─── Model Handlers Interface ───────────────────────────────────────

export interface ModelHandlers {
  list: RouteHandler
  get: RouteHandler
  create: RouteHandler
  update: RouteHandler
  delete: RouteHandler
}
