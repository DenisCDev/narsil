/**
 * Narsil Middleware Pipeline
 *
 * Lightweight middleware runner using function composition.
 * No class instantiation, no complex DI — just functions.
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface NexusMiddleware {
  name: string;
  handler: (ctx: {
    ctx: any;
    route?: { name: string; type: string; module?: string };
    next: () => Promise<unknown>;
  }) => Promise<unknown>;
}

// ─── Composition ─────────────────────────────────────────────────────

/**
 * Compose an array of middleware into a single function.
 * Executes in order, each calling next() to continue.
 */
export function composeMiddleware(
  middlewares: NexusMiddleware[],
  final: (ctx: any) => Promise<unknown>,
): (ctx: any, route?: { name: string; type: string; module?: string }) => Promise<unknown> {
  return async (ctx: any, route?) => {
    let index = 0;

    const next = async (): Promise<unknown> => {
      if (index < middlewares.length) {
        const mw = middlewares[index]!;
        index++;
        return mw.handler({ ctx, route, next });
      }
      return final(ctx);
    };

    return next();
  };
}

// ─── Built-in Middleware ─────────────────────────────────────────────

/**
 * Logging middleware — logs request method, path, and duration.
 */
export function logger(): NexusMiddleware {
  return {
    name: "logger",
    handler: async ({ route, next }) => {
      const start = performance.now();
      try {
        const result = await next();
        const duration = (performance.now() - start).toFixed(2);
        console.log(`[Narsil] ${route?.module ?? ""}/${route?.name ?? "unknown"} — ${duration}ms`);
        return result;
      } catch (error) {
        const duration = (performance.now() - start).toFixed(2);
        console.error(`[Narsil] ${route?.module ?? ""}/${route?.name ?? "unknown"} — FAILED — ${duration}ms`);
        throw error;
      }
    },
  };
}
