/**
 * Narsil Typed Fetcher
 *
 * Lightweight fetch wrapper with:
 * - Automatic JSON parsing
 * - Auth token attachment
 * - Request deduplication
 * - Error normalization
 */

// ─── Config ─────────────────────────────────────────────────────────

export interface FetcherConfig {
  /** Base URL for API requests */
  baseUrl: string;
  /** Function to get the current auth token */
  getToken?: () => string | null | Promise<string | null>;
  /** Custom headers */
  headers?: Record<string, string>;
}

// ─── Request Deduplication ──────────────────────────────────────────

const inflight = new Map<string, Promise<unknown>>();

// ─── Fetcher ────────────────────────────────────────────────────────

export async function nexusFetch<T>(
  config: FetcherConfig,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${config.baseUrl}${path}`;
  const cacheKey = `${method}:${url}:${JSON.stringify(body)}`;

  // Deduplicate GET requests
  if (method === "GET") {
    const existing = inflight.get(cacheKey);
    if (existing) return existing as Promise<T>;
  }

  const promise = (async () => {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...config.headers,
      };

      // Attach auth token
      if (config.getToken) {
        const token = await config.getToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      }

      const init: RequestInit = { method, headers };

      if (body && (method === "POST" || method === "PATCH")) {
        init.body = JSON.stringify(body);
      }

      // For GET with params, encode as query string
      let fetchUrl = url;
      if (body && method === "GET") {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
          params.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
        }
        fetchUrl = `${url}?${params.toString()}`;
      }

      const response = await fetch(fetchUrl, init);

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as any;
        const err = new Error(errorBody?.error?.message ?? `Request failed: ${response.status}`) as any;
        err.code = errorBody?.error?.code ?? "FETCH_ERROR";
        err.status = response.status;
        err.details = errorBody?.error?.details;
        throw err;
      }

      return await response.json();
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  if (method === "GET") {
    inflight.set(cacheKey, promise);
  }

  return promise as Promise<T>;
}
