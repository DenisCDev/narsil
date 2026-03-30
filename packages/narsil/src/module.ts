/**
 * Narsil Module System
 *
 * Replaces the v1 model registry with a declarative module config.
 * Modules define a Drizzle schema + CRUD config + permissions + hooks + custom routes.
 */

import type { ModuleConfig, ModuleRouter, NexusContext, RouteDefinition } from "./types.js";

/**
 * Define a module configuration.
 * Type-safe helper that returns the config as-is (for inference).
 */
export function defineModule<TSchema, TRoutes extends Record<string, RouteDefinition> = Record<string, never>>(
  config: ModuleConfig<TSchema, TRoutes>,
): ModuleConfig<TSchema, TRoutes> {
  return config;
}

/**
 * Create a ModuleRouter instance for defining custom routes.
 */
export function createModuleRouter(): ModuleRouter {
  return {
    get<TOutput>(
      path: string,
      handler: (ctx: NexusContext) => Promise<TOutput>,
    ): RouteDefinition<"GET", string, void, TOutput> {
      return { method: "GET" as const, path, handler: handler as any };
    },
    post<TInput, TOutput>(
      path: string,
      handler: (ctx: NexusContext & { input: TInput }) => Promise<TOutput>,
    ): RouteDefinition<"POST", string, TInput, TOutput> {
      return { method: "POST" as const, path, handler: handler as any };
    },
    patch<TInput, TOutput>(
      path: string,
      handler: (ctx: NexusContext & { input: TInput }) => Promise<TOutput>,
    ): RouteDefinition<"PATCH", string, TInput, TOutput> {
      return { method: "PATCH" as const, path, handler: handler as any };
    },
    delete<TOutput>(
      path: string,
      handler: (ctx: NexusContext) => Promise<TOutput>,
    ): RouteDefinition<"DELETE", string, void, TOutput> {
      return { method: "DELETE" as const, path, handler: handler as any };
    },
  };
}
