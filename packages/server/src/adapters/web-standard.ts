/**
 * Web Standard Adapter
 *
 * Parses Web Standard Request into NexusContext fields.
 * Works on Node.js 18+, Bun, Deno, Cloudflare Workers, Vercel Edge.
 */

export function parseHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

export function getClientIP(request: Request): string | undefined {
  // Try standard proxy headers
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim();
  }
  const realIP = request.headers.get("x-real-ip");
  if (realIP) return realIP;
  return undefined;
}

export function getAuthToken(request: Request): string | undefined {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7);
  }
  return undefined;
}
