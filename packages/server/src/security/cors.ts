/**
 * CORS Middleware
 *
 * Handles Cross-Origin Resource Sharing headers.
 * Extracted from v1 middleware.ts.
 */

export interface CorsConfig {
  /** Allowed origins (default: '*') */
  origin?: string | string[];
  /** Allowed methods */
  methods?: string[];
  /** Allowed headers */
  headers?: string[];
  /** Allow credentials */
  credentials?: boolean;
  /** Preflight cache max age in seconds */
  maxAge?: number;
}

export function cors(config: CorsConfig = {}) {
  const allowOrigin = config.origin ?? "*";
  const allowMethods = (config.methods ?? ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]).join(", ");
  const allowHeaders = (config.headers ?? ["Content-Type", "Authorization"]).join(", ");

  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": Array.isArray(allowOrigin) ? (allowOrigin[0] ?? "*") : allowOrigin,
    "Access-Control-Allow-Methods": allowMethods,
    "Access-Control-Allow-Headers": allowHeaders,
  };

  if (config.credentials) {
    corsHeaders["Access-Control-Allow-Credentials"] = "true";
  }

  if (config.maxAge) {
    corsHeaders["Access-Control-Max-Age"] = String(config.maxAge);
  }

  return {
    name: "cors",
    handler: async ({ ctx, next }: { ctx: any; next: () => Promise<unknown> }) => {
      // Handle dynamic origin matching
      if (Array.isArray(allowOrigin)) {
        const requestOrigin = ctx.headers?.origin;
        if (requestOrigin && allowOrigin.includes(requestOrigin)) {
          corsHeaders["Access-Control-Allow-Origin"] = requestOrigin;
        }
      }

      ctx._corsHeaders = corsHeaders;
      return next();
    },
  };
}
