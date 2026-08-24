/**
 * Rate Limiting Middleware
 *
 * Uses LRU cache for in-memory rate limiting.
 * Returns 429 Too Many Requests when limit exceeded.
 */

import { LRUCache } from "@narsil/cache";

export interface RateLimitConfig {
  /** Time window in milliseconds (default: 60000 = 1 min) */
  windowMs?: number;
  /** Max requests per window (default: 100) */
  max?: number;
  /** Key extractor (default: client IP) */
  keyExtractor?: (ctx: any) => string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export function rateLimit(config: RateLimitConfig = {}) {
  const windowMs = config.windowMs ?? 60_000;
  const max = config.max ?? 100;
  const keyExtractor = config.keyExtractor ?? ((ctx: any) => ctx.ip ?? "unknown");
  const store = new LRUCache<RateLimitEntry>(10_000);

  return {
    name: "rate-limit",
    handler: async ({ ctx, next }: { ctx: any; next: () => Promise<unknown> }) => {
      const key = keyExtractor(ctx);
      const now = Date.now();
      const existing = store.get(key);

      let entry: RateLimitEntry;
      if (existing && now < existing.resetTime) {
        existing.count++;
        entry = existing;
        store.set(key, entry, Math.ceil((existing.resetTime - now) / 1000));
      } else {
        entry = { count: 1, resetTime: now + windowMs };
        store.set(key, entry, Math.ceil(windowMs / 1000));
      }

      // Set rate limit headers on context for response
      ctx._rateLimitHeaders = {
        "X-RateLimit-Limit": String(max),
        "X-RateLimit-Remaining": String(Math.max(0, max - entry.count)),
        "X-RateLimit-Reset": String(Math.ceil(entry.resetTime / 1000)),
      };

      if (entry.count > max) {
        const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
        ctx._rateLimitHeaders["Retry-After"] = String(retryAfter);
        const err = new Error("Too many requests") as any;
        err.code = "RATE_LIMIT_EXCEEDED";
        err.status = 429;
        err.details = { retryAfter };
        err.toJSON = () => ({ error: { code: err.code, message: err.message, details: err.details } });
        throw err;
      }

      return next();
    },
  };
}
