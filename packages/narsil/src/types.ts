/**
 * Narsil v2 Core Types
 *
 * Type system designed for inference-based client SDK.
 * No code generation — types flow from server to client via `typeof app`.
 */

// ─── HTTP Types ──────────────────────────────────────────────────────

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// ─── Permission Types ────────────────────────────────────────────────

export type PermissionPreset = "public" | "authenticated" | "owner" | "admin";

export type PermissionRule =
  | PermissionPreset
  | PermissionPreset[]
  | ((ctx: NexusContext) => boolean | Promise<boolean>);

// ─── Context ─────────────────────────────────────────────────────────

export interface NexusUser {
  id: string;
  email?: string;
  role?: string;
  [key: string]: unknown;
}

export interface NexusContext {
  /** Authenticated user (null if anonymous) */
  user: NexusUser | null;
  /** Drizzle database instance */
  db: unknown;
  /** Parsed request headers */
  headers: Record<string, string>;
  /** Client IP address */
  ip?: string;
  /** URL params from route (e.g., :id) */
  params: Record<string, string>;
  /** Parsed request body or query params */
  body?: unknown;
  /** Request object */
  request: Request;
  /** Extra properties set by middleware */
  [key: string]: unknown;
}

// ─── Middleware ───────────────────────────────────────────────────────

export interface NexusMiddleware {
  name: string;
  handler: (ctx: {
    ctx: NexusContext;
    route?: { name: string; type: string; module?: string };
    next: () => Promise<unknown>;
  }) => Promise<unknown>;
}

// ─── Route Types ─────────────────────────────────────────────────────

export type RouteHandler = (ctx: NexusContext) => Promise<unknown>;

export interface RouteDefinition<
  TMethod extends HttpMethod = HttpMethod,
  TPath extends string = string,
  TInput = unknown,
  TOutput = unknown,
> {
  method: TMethod;
  path: TPath;
  handler: (ctx: NexusContext & { input: TInput }) => Promise<TOutput>;
  input?: unknown; // Zod schema
}

// ─── Module Types ────────────────────────────────────────────────────

export interface ModuleRouter {
  get<TOutput>(
    path: string,
    handler: (ctx: NexusContext) => Promise<TOutput>,
  ): RouteDefinition<"GET", string, void, TOutput>;
  post<TInput, TOutput>(
    path: string,
    handler: (ctx: NexusContext & { input: TInput }) => Promise<TOutput>,
  ): RouteDefinition<"POST", string, TInput, TOutput>;
  patch<TInput, TOutput>(
    path: string,
    handler: (ctx: NexusContext & { input: TInput }) => Promise<TOutput>,
  ): RouteDefinition<"PATCH", string, TInput, TOutput>;
  delete<TOutput>(
    path: string,
    handler: (ctx: NexusContext) => Promise<TOutput>,
  ): RouteDefinition<"DELETE", string, void, TOutput>;
}

export interface CrudConfig {
  list?: boolean | { defaultLimit?: number; maxLimit?: number };
  get?: boolean;
  create?: boolean | { input?: unknown };
  update?: boolean | { input?: unknown };
  delete?: boolean;
}

export interface HookContext {
  data: unknown;
  ctx: NexusContext;
}

export interface ModuleHooks {
  beforeCreate?: (ctx: HookContext) => Promise<void> | void;
  afterCreate?: (ctx: HookContext) => Promise<void> | void;
  beforeUpdate?: (ctx: HookContext) => Promise<void> | void;
  afterUpdate?: (ctx: HookContext) => Promise<void> | void;
  beforeDelete?: (ctx: { id: string; ctx: NexusContext }) => Promise<void> | void;
  afterDelete?: (ctx: { id: string; ctx: NexusContext }) => Promise<void> | void;
}

export interface ModuleConfig<
  TSchema = unknown,
  TRoutes extends Record<string, RouteDefinition> = Record<string, RouteDefinition>,
> {
  /** Drizzle pgTable schema */
  schema: TSchema;
  /** Auto-CRUD configuration (default: all enabled) */
  crud?: CrudConfig;
  /** Permission rules per operation */
  permissions?: {
    list?: PermissionRule;
    get?: PermissionRule;
    create?: PermissionRule;
    update?: PermissionRule;
    delete?: PermissionRule;
  };
  /** Lifecycle hooks */
  hooks?: ModuleHooks;
  /** Custom routes */
  routes?: (router: ModuleRouter) => TRoutes;
}

// ─── Route Map (phantom type for inference chain) ────────────────────

export type RouteMap = Record<string, ModuleConfig<any, any>>;

// ─── Security Config ─────────────────────────────────────────────────

export interface CorsOptions {
  origin?: string | string[];
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
}

export interface SecurityConfig {
  rateLimit?: { windowMs: number; max: number } | false;
  helmet?: boolean;
  cors?: CorsOptions | false;
  maxBodySize?: number | false;
}

// ─── App Config ──────────────────────────────────────────────────────

export interface AppConfig {
  /** Drizzle database instance */
  db: unknown;
  /** API base path (default: "/api") */
  basePath?: string;
  /** Auth resolver — receives Bearer token, returns user or null */
  auth?: (token: string) => Promise<NexusUser | null> | NexusUser | null;
  /** Security configuration (defaults: all ON) */
  security?: SecurityConfig;
}

// ─── App Interface (with phantom type accumulation) ──────────────────

export interface NexusApp<TRoutes extends RouteMap = Record<string, never>> {
  /** Register a module */
  module<TName extends string, TModule extends ModuleConfig>(
    name: TName,
    config: TModule,
  ): NexusApp<TRoutes & { [K in TName]: TModule }>;

  /** Add middleware */
  use(middleware: NexusMiddleware): NexusApp<TRoutes>;

  /** Start HTTP server */
  start(port?: number): Promise<void>;

  /** Web Standard fetch handler (for Vercel, Cloudflare, etc.) */
  fetch(request: Request): Promise<Response>;

  /** Phantom type carrier for client SDK inference */
  _routes: TRoutes;
  _config: AppConfig;
}
