/**
 * Narsil App Factory
 *
 * Creates a Narsil application instance.
 * Elysia-like API: createApp() → .module() → .start()
 */

import { generateCrudHandlers } from "@narsil/drizzle";
import { generatePrismaHandlers } from "@narsil/prisma";
import { type HttpMethod, NexusRouter, type RouteHandler } from "@narsil/server";
import { getAuthToken, getClientIP, parseHeaders } from "@narsil/server/adapters";
import { composeMiddleware } from "@narsil/server/middleware";
import { rateLimit } from "@narsil/server/security";
import { NexusError, NexusPayloadTooLargeError, NexusValidationError } from "./errors.js";
import { createModuleRouter } from "./module.js";
import type { AppConfig, ModuleConfig, NexusApp, NexusContext, NexusMiddleware, SecurityConfig } from "./types.js";

// ─── Internal App State ──────────────────────────────────────────────

interface AppState {
  config: AppConfig;
  router: NexusRouter;
  middlewares: NexusMiddleware[];
  modules: Map<string, ModuleConfig>;
}

// ─── Default Security ────────────────────────────────────────────────

const DEFAULT_SECURITY: Required<SecurityConfig> = {
  rateLimit: { windowMs: 60_000, max: 100 },
  helmet: true,
  cors: { origin: "*" },
  maxBodySize: 1_048_576, // 1MB
};

// ─── App Factory ─────────────────────────────────────────────────────

export function createApp(config: AppConfig): NexusApp {
  const basePath = config.basePath ?? "/api";
  const security = { ...DEFAULT_SECURITY, ...config.security };

  const state: AppState = {
    config,
    router: new NexusRouter(),
    middlewares: [],
    modules: new Map(),
  };

  if (security.rateLimit !== false) {
    state.middlewares.push(rateLimit(security.rateLimit));
  }

  // Build the app object with chaining
  const app: NexusApp = {
    _routes: {} as any,
    _config: config,

    module(name: string, moduleConfig: ModuleConfig): NexusApp<any> {
      state.modules.set(name, moduleConfig);
      registerModule(state, basePath, name, moduleConfig);
      return app as any;
    },

    use(middleware: NexusMiddleware): NexusApp<any> {
      state.middlewares.push(middleware);
      return app as any;
    },

    async start(port = 3000): Promise<void> {
      const printRoutes = (host: string) => {
        console.log(`\n  Narsil v2 — ${host}${basePath}\n`);
        for (const route of state.router.getRoutes()) {
          console.log(`  ${route.method.padEnd(7)} ${route.path}`);
        }
        console.log();
      };

      if (typeof (globalThis as { Bun?: unknown }).Bun !== "undefined") {
        const { createBunServer } = await import("@narsil/server/adapters/bun");
        createBunServer(app.fetch, port);
        printRoutes(`Bun.serve http://localhost:${port}`);
        return;
      }

      const { createNodeServer } = await import("@narsil/server/adapters/node");
      const server = createNodeServer(app.fetch);
      server.listen(port, () => {
        printRoutes(`Node http://localhost:${port}`);
      });
    },

    async fetch(request: Request): Promise<Response> {
      return handleRequest(state, basePath, request);
    },
  };

  return app;
}

// ─── Module Registration ─────────────────────────────────────────────

function registerModule(state: AppState, basePath: string, name: string, config: ModuleConfig): void {
  const prefix = `${basePath}/${name}`;
  const crud = config.crud ?? {};

  const crudOpts = {
    defaultLimit: typeof crud.list === "object" ? crud.list.defaultLimit : undefined,
    maxLimit: typeof crud.list === "object" ? crud.list.maxLimit : undefined,
  };
  if (!config.prisma && config.schema === undefined) {
    throw new Error(`module "${name}" needs schema (Drizzle) or prisma (model name)`);
  }
  const handlers = config.prisma
    ? generatePrismaHandlers(config.prisma, state.config.db as object, crudOpts)
    : generateCrudHandlers(config.schema, state.config.db, crudOpts);

  // Register CRUD routes
  if (crud.list !== false) {
    state.router.add("GET", prefix, wrapHandler(handlers.list, config, "list"), { module: name, operation: "list" });
  }
  if (crud.get !== false) {
    state.router.add("GET", `${prefix}/:id`, wrapHandler(handlers.get, config, "get"), {
      module: name,
      operation: "get",
    });
  }
  if (crud.create !== false) {
    state.router.add("POST", prefix, wrapHandler(handlers.create, config, "create"), {
      module: name,
      operation: "create",
    });
  }
  if (crud.update !== false) {
    state.router.add("PATCH", `${prefix}/:id`, wrapHandler(handlers.update, config, "update"), {
      module: name,
      operation: "update",
    });
  }
  if (crud.delete !== false) {
    state.router.add("DELETE", `${prefix}/:id`, wrapHandler(handlers.delete, config, "delete"), {
      module: name,
      operation: "delete",
    });
  }

  // Register custom routes
  if (config.routes) {
    const router = createModuleRouter();
    const customRoutes = config.routes(router);
    for (const [routeName, routeDef] of Object.entries(customRoutes)) {
      const routePath = `${prefix}${routeDef.path}`;
      state.router.add(
        routeDef.method as HttpMethod,
        routePath,
        wrapHandler(routeDef.handler as RouteHandler, config, routeName),
        {
          module: name,
          operation: routeName,
        },
      );
    }
  }
}

// ─── Permission + Hook Wrapper ───────────────────────────────────────

function wrapHandler(handler: RouteHandler, config: ModuleConfig, operation: string): RouteHandler {
  return async (ctx: NexusContext): Promise<unknown> => {
    const permission = config.permissions?.[operation];
    if (permission === undefined) {
      const { NexusForbiddenError } = await import("./errors.js");
      throw new NexusForbiddenError();
    }
    if (permission) {
      await checkPermission(permission, ctx);
    }
    if (ctx.user && (config.ownerField || moduleUsesOwner(config))) {
      ctx.ownerId = ctx.user.id;
      ctx.ownerField = config.ownerField ?? "userId";
    }

    // Run before hooks
    if (operation === "create" && config.hooks?.beforeCreate) {
      await config.hooks.beforeCreate({ data: ctx.body, ctx });
    }
    if (operation === "update" && config.hooks?.beforeUpdate) {
      await config.hooks.beforeUpdate({ data: ctx.body, ctx });
    }
    if (operation === "delete" && config.hooks?.beforeDelete) {
      await config.hooks.beforeDelete({ id: ctx.params.id ?? "", ctx });
    }

    // Execute handler
    const result = await handler(ctx);

    // Run after hooks
    if (operation === "create" && config.hooks?.afterCreate) {
      await config.hooks.afterCreate({ data: result, ctx });
    }
    if (operation === "update" && config.hooks?.afterUpdate) {
      await config.hooks.afterUpdate({ data: result, ctx });
    }
    if (operation === "delete" && config.hooks?.afterDelete) {
      await config.hooks.afterDelete({ id: ctx.params.id ?? "", ctx });
    }

    return result;
  };
}

// ─── Permission Check ────────────────────────────────────────────────

async function checkPermission(rule: any, ctx: NexusContext): Promise<void> {
  if (typeof rule === "function") {
    const allowed = await rule(ctx);
    if (!allowed) {
      const { NexusForbiddenError } = await import("./errors.js");
      throw new NexusForbiddenError();
    }
    return;
  }

  const presets = Array.isArray(rule) ? rule : [rule];
  let lastError: unknown;
  for (const preset of presets) {
    try {
      await checkPreset(preset, ctx);
      return;
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError) throw lastError;
}

async function checkPreset(preset: unknown, ctx: NexusContext): Promise<void> {
  switch (preset) {
    case "public":
      return;
    case "authenticated":
      if (!ctx.user) {
        const { NexusAuthError } = await import("./errors.js");
        throw new NexusAuthError();
      }
      return;
    case "admin":
      if (!ctx.user || ctx.user.role !== "admin") {
        const { NexusForbiddenError } = await import("./errors.js");
        throw new NexusForbiddenError();
      }
      return;
    case "owner":
      if (!ctx.user) {
        const { NexusAuthError } = await import("./errors.js");
        throw new NexusAuthError();
      }
      return;
    default: {
      const { NexusForbiddenError } = await import("./errors.js");
      throw new NexusForbiddenError();
    }
  }
}

function usesOwner(rule: unknown): boolean {
  if (rule === "owner") return true;
  return Array.isArray(rule) && rule.includes("owner");
}

function moduleUsesOwner(config: ModuleConfig): boolean {
  return Object.values(config.permissions ?? {}).some((rule) => usesOwner(rule));
}

// ─── Request Handler ─────────────────────────────────────────────────

async function handleRequest(state: AppState, _basePath: string, request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const method = request.method.toUpperCase() as HttpMethod;
    const security = { ...DEFAULT_SECURITY, ...state.config.security };

    const requestOrigin = request.headers.get("origin");

    // CORS preflight
    if (method === ("OPTIONS" as HttpMethod | "OPTIONS") && security.cors !== false) {
      const corsConfig = typeof security.cors === "object" ? security.cors : { origin: "*" };
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(corsConfig, requestOrigin),
      });
    }

    // Match route
    const match = state.router.match(method, url.pathname);
    if (!match) {
      return jsonWithSecurity(
        { error: { code: "NOT_FOUND", message: `Route not found: ${method} ${url.pathname}` } },
        404,
        security,
        requestOrigin,
      );
    }

    // Build context
    const headers = parseHeaders(request);
    const ip = getClientIP(request);

    // Resolve authenticated user
    let user = null;
    if (state.config.auth) {
      const token = getAuthToken(request);
      if (token) {
        user = await state.config.auth(token);
      }
    }

    const ctx: NexusContext = {
      user,
      db: state.config.db,
      headers,
      ip,
      params: match.params,
      body: undefined,
      request,
    };

    // Parse body for mutations — measure actual bytes, not just Content-Length
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      const buf = await request.arrayBuffer();
      if (security.maxBodySize !== false && buf.byteLength > security.maxBodySize) {
        throw new NexusPayloadTooLargeError(security.maxBodySize);
      }
      const contentType = request.headers.get("content-type");
      if (contentType?.includes("application/json") && buf.byteLength > 0) {
        try {
          ctx.body = JSON.parse(new TextDecoder().decode(buf)) as unknown;
        } catch {
          throw new NexusValidationError("body", "invalid json");
        }
      }
    }

    // Parse query string for GET requests
    if (method === "GET") {
      const queryParams: Record<string, unknown> = {};
      for (const [key, value] of url.searchParams) {
        try {
          queryParams[key] = JSON.parse(value);
        } catch {
          queryParams[key] = value;
        }
      }
      if (Object.keys(queryParams).length > 0) {
        ctx.body = queryParams;
      }
    }

    // Run middleware pipeline
    let result: unknown;
    if (state.middlewares.length > 0) {
      const pipeline = composeMiddleware(state.middlewares, async () => {
        result = await match.route.handler(ctx);
        return result;
      });
      await pipeline(ctx, { name: match.route.operation ?? "", type: method, module: match.route.module });
    } else {
      result = await match.route.handler(ctx);
    }

    // Build response headers
    const responseHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const extra = ctx._rateLimitHeaders;
    if (extra && typeof extra === "object") {
      Object.assign(responseHeaders, extra as Record<string, string>);
    }

    // Add CORS headers
    if (security.cors !== false) {
      const corsHeaders = buildCorsHeaders(
        typeof security.cors === "object" ? security.cors : { origin: "*" },
        requestOrigin,
      );
      Object.assign(responseHeaders, corsHeaders);
    }

    // Add security headers (helmet)
    if (security.helmet !== false) {
      Object.assign(responseHeaders, {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "0",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      });
    }

    return new Response(JSON.stringify(result), {
      status: method === "POST" ? 201 : 200,
      headers: responseHeaders,
    });
  } catch (error) {
    const security = { ...DEFAULT_SECURITY, ...state.config.security };
    const requestOrigin = request.headers.get("origin");
    const mapped = mapHttpError(error);
    if (mapped) {
      return jsonWithSecurity(mapped.body, mapped.status, security, requestOrigin);
    }
    console.error("[Narsil] Unhandled error:", error);
    return jsonWithSecurity(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      500,
      security,
      requestOrigin,
    );
  }
}

function jsonWithSecurity(
  body: unknown,
  status: number,
  security: Required<SecurityConfig>,
  requestOrigin: string | null,
): Response {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (security.cors !== false) {
    Object.assign(
      headers,
      buildCorsHeaders(typeof security.cors === "object" ? security.cors : { origin: "*" }, requestOrigin),
    );
  }
  if (security.helmet !== false) {
    Object.assign(headers, {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function mapHttpError(error: unknown): { status: number; body: unknown } | null {
  if (error instanceof NexusError) {
    return { status: error.status, body: error.toJSON() };
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number" &&
    "toJSON" in error &&
    typeof (error as { toJSON: unknown }).toJSON === "function"
  ) {
    const err = error as { status: number; toJSON: () => unknown };
    return { status: err.status, body: err.toJSON() };
  }
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function buildCorsHeaders(
  cors: {
    origin?: string | string[];
    methods?: string[];
    headers?: string[];
    credentials?: boolean;
  },
  requestOrigin?: string | null,
): Record<string, string> {
  let allowOrigin = "*";
  if (Array.isArray(cors.origin)) {
    allowOrigin =
      requestOrigin && cors.origin.includes(requestOrigin) ? requestOrigin : (cors.origin[0] ?? "*");
  } else if (cors.origin) {
    allowOrigin = cors.origin;
  }

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": (cors.methods ?? ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]).join(", "),
    "Access-Control-Allow-Headers": (cors.headers ?? ["Content-Type", "Authorization"]).join(", "),
  };
  if (cors.credentials) {
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}
