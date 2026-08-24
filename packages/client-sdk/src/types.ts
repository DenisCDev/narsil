/**
 * Narsil Client SDK Type Inference
 *
 * Derives fully typed client API from the server's `typeof app`.
 * No code generation — pure TypeScript inference via phantom types.
 */

// ─── Infer routes from app type ──────────────────────────────────────

/** Extract the RouteMap from a NexusApp */
export type InferRoutes<TApp> = TApp extends { _routes: infer R } ? R : never;

// ─── Module client type ──────────────────────────────────────────────

/** Infer the $inferSelect type from a Drizzle table */
type InferSelect<TSchema> = TSchema extends { $inferSelect: infer T } ? T : unknown;

/** Infer the $inferInsert type from a Drizzle table */
type InferInsert<TSchema> = TSchema extends { $inferInsert: infer T } ? T : unknown;

/** List query options */
export interface ListOptions {
  limit?: number;
  offset?: number;
  where?: Record<string, unknown>;
  orderBy?: Record<string, "asc" | "desc">;
}

/**
 * Generate the typed client for a single module.
 * Combines auto-CRUD methods (from schema) with custom routes.
 */
export type ModuleClient<TModule> =
  // Auto-CRUD methods (from Drizzle schema)
  (TModule extends { schema: infer S }
    ? {
        list: (opts?: ListOptions) => Promise<InferSelect<S>[]>;
        get: (id: string) => Promise<InferSelect<S>>;
        create: (data: InferInsert<S>) => Promise<InferSelect<S>>;
        update: (id: string, data: Partial<InferInsert<S>>) => Promise<InferSelect<S>>;
        delete: (id: string) => Promise<{ success: boolean }>;
      }
    : Record<string, never>) &
    // Custom routes (from routes() function return type)
    (TModule extends { routes: (...args: any[]) => infer R }
      ? {
          [K in keyof R]: R[K] extends { handler: (...args: any[]) => Promise<infer O> } ? () => Promise<O> : never;
        }
      : Record<string, never>);

/**
 * The full typed client — maps each module name to its ModuleClient.
 */
export type ClientType<TApp> = {
  [K in keyof InferRoutes<TApp>]: ModuleClient<InferRoutes<TApp>[K]>;
};
