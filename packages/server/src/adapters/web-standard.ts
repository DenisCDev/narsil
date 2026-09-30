/**
 * Web Standard Adapter
 *
 * Parses Web Standard Request into NexusContext fields.
 * Works on Node.js 18+, Bun, Deno, Cloudflare Workers, Vercel Edge.
 */

import { z } from "zod";

const clientAddresses = new WeakMap<Request, string>();
const clientAddressSchema = z.string().ip();

export type ClientIPResolver = (request: Request) => string | undefined;

export function setClientIP(request: Request, address: string | undefined): void {
  const result = clientAddressSchema.safeParse(address);
  if (result.success) clientAddresses.set(request, result.data);
}

export function parseHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

export function getClientIP(request: Request, resolver?: ClientIPResolver): string | undefined {
  // Only the hosting platform can establish which proxy metadata is trustworthy.
  const result = clientAddressSchema.safeParse(resolver ? resolver(request) : clientAddresses.get(request));
  return result.success ? result.data : undefined;
}

export function getAuthToken(request: Request): string | undefined {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7);
  }
  return undefined;
}
