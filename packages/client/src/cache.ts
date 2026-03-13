/**
 * NexusFlow Client Query Cache
 *
 * Lightweight SWR (stale-while-revalidate) cache for client-side
 * data fetching. Integrates with useQuery/useMutation hooks.
 */

type CacheEntry = {
  data: unknown
  timestamp: number
  ttl: number
  tags: string[]
}

type CacheListener = () => void

export class QueryCache {
  private cache = new Map<string, CacheEntry>()
  private listeners = new Map<string, Set<CacheListener>>()

  /**
   * Get cached data if it exists and is not expired.
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined

    const isExpired = Date.now() - entry.timestamp > entry.ttl * 1000
    if (isExpired) {
      this.cache.delete(key)
      return undefined
    }

    return entry.data as T
  }

  /**
   * Get stale data (even if expired) for SWR pattern.
   */
  getStale<T>(key: string): T | undefined {
    const entry = this.cache.get(key)
    return entry?.data as T | undefined
  }

  /**
   * Set data in the cache.
   */
  set(key: string, data: unknown, ttl = 300, tags: string[] = []): void {
    this.cache.set(key, { data, timestamp: Date.now(), ttl, tags })
    this.notify(key)
  }

  /**
   * Invalidate entries by tag.
   */
  invalidateByTag(tag: string): void {
    const keysToDelete: string[] = []
    for (const [key, entry] of this.cache) {
      if (entry.tags.includes(tag)) {
        keysToDelete.push(key)
      }
    }
    for (const key of keysToDelete) {
      this.cache.delete(key)
      this.notify(key)
    }
  }

  /**
   * Invalidate a specific cache key.
   */
  invalidate(key: string): void {
    this.cache.delete(key)
    this.notify(key)
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    const keys = Array.from(this.cache.keys())
    this.cache.clear()
    for (const key of keys) {
      this.notify(key)
    }
  }

  /**
   * Subscribe to changes on a cache key.
   */
  subscribe(key: string, listener: CacheListener): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set())
    }
    this.listeners.get(key)!.add(listener)

    return () => {
      this.listeners.get(key)?.delete(listener)
    }
  }

  /**
   * Optimistically update a cache entry.
   * Returns a rollback function.
   */
  optimisticUpdate<T>(key: string, updater: (current: T | undefined) => T): () => void {
    const previous = this.cache.get(key)
    const currentData = previous?.data as T | undefined
    const newData = updater(currentData)

    this.set(
      key,
      newData,
      previous?.ttl ?? 300,
      previous?.tags ?? []
    )

    // Return rollback function
    return () => {
      if (previous) {
        this.cache.set(key, previous)
      } else {
        this.cache.delete(key)
      }
      this.notify(key)
    }
  }

  private notify(key: string): void {
    const listeners = this.listeners.get(key)
    if (listeners) {
      for (const listener of listeners) {
        listener()
      }
    }
  }
}

/**
 * Build a cache key from model, operation, and parameters.
 */
export function buildCacheKey(model: string, operation: string, params?: unknown): string {
  const base = `nexusflow:${model}:${operation}`
  if (!params) return base
  return `${base}:${JSON.stringify(params)}`
}

/**
 * Global cache instance.
 */
export const queryCache = new QueryCache()
