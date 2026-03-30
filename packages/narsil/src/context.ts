/**
 * Narsil Request Context Builder
 *
 * Creates NexusContext from a Web Standard Request.
 */

import { getAuthToken, getClientIP, parseHeaders } from "@narsil/server/adapters";
import type { NexusContext, NexusUser } from "./types.js";

export type ContextFactory = (request: Request) => Promise<NexusContext> | NexusContext;

export function createContextFactory(
  db: unknown,
  getUser?: (token: string) => Promise<NexusUser | null>,
): ContextFactory {
  return async (request: Request): Promise<NexusContext> => {
    const headers = parseHeaders(request);
    const ip = getClientIP(request);
    const token = getAuthToken(request);

    let user: NexusUser | null = null;
    if (token && getUser) {
      user = await getUser(token);
    }

    return {
      user,
      db,
      headers,
      ip,
      params: {},
      body: undefined,
      request,
    };
  };
}
