/**
 * Helmet Middleware
 *
 * Adds secure HTTP headers to responses.
 * Similar to helmet.js but zero dependencies.
 */

export interface HelmetConfig {
  /** Content Security Policy (default: none) */
  contentSecurityPolicy?: string | false;
  /** X-Frame-Options (default: DENY) */
  frameOptions?: "DENY" | "SAMEORIGIN" | false;
  /** HSTS max-age in seconds (default: 31536000 = 1 year) */
  hstsMaxAge?: number | false;
  /** X-Content-Type-Options nosniff (default: true) */
  noSniff?: boolean;
  /** Referrer-Policy (default: strict-origin-when-cross-origin) */
  referrerPolicy?: string | false;
}

export function helmet(config: HelmetConfig = {}) {
  const headers: Record<string, string> = {};

  // X-Content-Type-Options
  if (config.noSniff !== false) {
    headers["X-Content-Type-Options"] = "nosniff";
  }

  // X-Frame-Options
  if (config.frameOptions !== false) {
    headers["X-Frame-Options"] = config.frameOptions ?? "DENY";
  }

  // Strict-Transport-Security
  if (config.hstsMaxAge !== false) {
    const maxAge = config.hstsMaxAge ?? 31536000;
    headers["Strict-Transport-Security"] = `max-age=${maxAge}; includeSubDomains`;
  }

  // X-XSS-Protection (disabled — modern browsers don't need it, can cause issues)
  headers["X-XSS-Protection"] = "0";

  // Referrer-Policy
  if (config.referrerPolicy !== false) {
    headers["Referrer-Policy"] = config.referrerPolicy ?? "strict-origin-when-cross-origin";
  }

  // Content-Security-Policy
  if (config.contentSecurityPolicy) {
    headers["Content-Security-Policy"] = config.contentSecurityPolicy;
  }

  return {
    name: "helmet",
    handler: async ({ ctx, next }: { ctx: any; next: () => Promise<unknown> }) => {
      ctx._helmetHeaders = headers;
      return next();
    },
  };
}
