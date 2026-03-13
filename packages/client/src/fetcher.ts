/**
 * NexusFlow Typed Fetcher
 *
 * Lightweight fetch wrapper with:
 * - Automatic JSON parsing
 * - Auth token attachment
 * - Request deduplication
 * - Error normalization
 */

import { NexusError } from '@nexusflow/core'

// ─── Config ─────────────────────────────────────────────────────────

export interface FetcherConfig {
  /** Base URL for API requests (e.g., '/api' or 'https://api.example.com') */
  baseUrl: string
  /** Function to get the current auth token */
  getToken?: () => string | null | Promise<string | null>
  /** Custom headers */
  headers?: Record<string, string>
}

let _config: FetcherConfig = { baseUrl: '/api' }

export function configureFetcher(config: FetcherConfig): void {
  _config = config
}

// ─── Request Deduplication ──────────────────────────────────────────

const inflight = new Map<string, Promise<unknown>>()

// ─── Fetcher ────────────────────────────────────────────────────────

export async function nexusFetch<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  opts?: { deduplicate?: boolean }
): Promise<T> {
  const url = `${_config.baseUrl}${path}`
  const cacheKey = `${method}:${url}:${JSON.stringify(body)}`

  // Deduplicate GET requests
  if (method === 'GET' && opts?.deduplicate !== false) {
    const existing = inflight.get(cacheKey)
    if (existing) return existing as Promise<T>
  }

  const promise = (async () => {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ..._config.headers,
      }

      // Attach auth token
      if (_config.getToken) {
        const token = await _config.getToken()
        if (token) headers['Authorization'] = `Bearer ${token}`
      }

      const init: RequestInit = { method, headers }

      if (body && (method === 'POST' || method === 'PATCH')) {
        init.body = JSON.stringify(body)
      }

      // For GET with params, encode as query string
      let fetchUrl = url
      if (body && method === 'GET') {
        const params = new URLSearchParams()
        for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
          params.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value))
        }
        fetchUrl = `${url}?${params.toString()}`
      }

      const response = await fetch(fetchUrl, init)

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}))
        throw new NexusError(
          errorBody?.error?.message ?? `Request failed: ${response.status}`,
          {
            code: errorBody?.error?.code ?? 'FETCH_ERROR',
            status: response.status,
            details: errorBody?.error?.details,
          }
        )
      }

      return await response.json()
    } finally {
      inflight.delete(cacheKey)
    }
  })()

  if (method === 'GET') {
    inflight.set(cacheKey, promise)
  }

  return promise as Promise<T>
}

// ─── Typed API Client Builder ───────────────────────────────────────

/**
 * Create a typed API client for a model.
 * Used by the code generator.
 */
export function createModelClient<T>(modelName: string) {
  const basePath = `/${modelName}`

  return {
    list: (params?: Record<string, unknown>) =>
      nexusFetch<T[]>('GET', basePath, params),

    get: (id: string) =>
      nexusFetch<T>('GET', `${basePath}/${id}`),

    create: (data: Partial<T>) =>
      nexusFetch<T>('POST', basePath, data),

    update: (id: string, data: Partial<T>) =>
      nexusFetch<T>('PATCH', `${basePath}/${id}`, data),

    delete: (id: string) =>
      nexusFetch<void>('DELETE', `${basePath}/${id}`),
  }
}
