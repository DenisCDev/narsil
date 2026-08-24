/**
 * Body Size Limit Middleware
 *
 * Rejects requests with Content-Length exceeding maxBodySize.
 * Returns 413 Payload Too Large.
 */

export interface SizeLimitConfig {
  /** Max body size in bytes (default: 1MB = 1048576) */
  maxBodySize?: number;
}

export function sizeLimit(config: SizeLimitConfig = {}) {
  const maxSize = config.maxBodySize ?? 1_048_576;

  return {
    name: "size-limit",
    handler: async ({ ctx, next }: { ctx: any; next: () => Promise<unknown> }) => {
      const contentLength = ctx.headers?.["content-length"];
      if (contentLength && Number.parseInt(contentLength) > maxSize) {
        const err = new Error(`Request body too large (max: ${maxSize} bytes)`) as any;
        err.code = "PAYLOAD_TOO_LARGE";
        err.status = 413;
        err.details = { maxSize };
        err.toJSON = () => ({ error: { code: err.code, message: err.message, details: err.details } });
        throw err;
      }
      return next();
    },
  };
}
