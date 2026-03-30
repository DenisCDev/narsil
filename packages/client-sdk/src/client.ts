/**
 * Narsil Proxy-Based Client
 *
 * Creates a fully typed API client via Proxy.
 * Types flow from `typeof app` via the inference chain in types.ts.
 *
 * Usage:
 * ```ts
 * import type { AppType } from '../../backend/src/server'
 * const api = createClient<AppType>('http://localhost:3001/api')
 * const users = await api.users.list() // Fully typed!
 * ```
 */

import { type FetcherConfig, nexusFetch } from "./fetcher.js";
import type { ClientType, ListOptions } from "./types.js";

export interface ClientOptions {
  /** Function to get auth token */
  getToken?: () => string | null | Promise<string | null>;
  /** Custom headers */
  headers?: Record<string, string>;
}

/**
 * Create a type-safe API client.
 * Uses Proxy to dynamically route method calls to the correct endpoints.
 */
export function createClient<TApp>(baseUrl: string, options: ClientOptions = {}): ClientType<TApp> {
  const config: FetcherConfig = {
    baseUrl,
    getToken: options.getToken,
    headers: options.headers,
  };

  return new Proxy({} as ClientType<TApp>, {
    get(_target, moduleName: string) {
      return new Proxy(
        {},
        {
          get(_moduleTarget, operation: string) {
            return (...args: unknown[]) => {
              return routeCall(config, moduleName, operation, args);
            };
          },
        },
      );
    },
  });
}

// ─── Route Resolution ────────────────────────────────────────────────

function routeCall(config: FetcherConfig, moduleName: string, operation: string, args: unknown[]): Promise<unknown> {
  switch (operation) {
    case "list": {
      const opts = args[0] as ListOptions | undefined;
      return nexusFetch(config, "GET", `/${moduleName}`, opts);
    }
    case "get": {
      const id = args[0] as string;
      return nexusFetch(config, "GET", `/${moduleName}/${id}`);
    }
    case "create": {
      const data = args[0];
      return nexusFetch(config, "POST", `/${moduleName}`, data);
    }
    case "update": {
      const id = args[0] as string;
      const data = args[1];
      return nexusFetch(config, "PATCH", `/${moduleName}/${id}`, data);
    }
    case "delete": {
      const id = args[0] as string;
      return nexusFetch(config, "DELETE", `/${moduleName}/${id}`);
    }
    default: {
      // Custom route — use POST by default
      const input = args[0];
      return nexusFetch(config, "POST", `/${moduleName}/${operation}`, input);
    }
  }
}
