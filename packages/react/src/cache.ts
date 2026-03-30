/**
 * Narsil Query Cache
 *
 * Lightweight SWR (stale-while-revalidate) cache for client-side
 * data fetching. Integrates with useQuery/useMutation hooks.
 */

type CacheEntry = {
  data: unknown;
  timestamp: number;
  ttl: number;
  tags: string[];
};

type CacheListener = () => void;

export class QueryCache {
  private cache = new Map<string, CacheEntry>();
  private listeners = new Map<string, Set<CacheListener>>();

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > entry.ttl * 1000) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  getStale<T>(key: string): T | undefined {
    return this.cache.get(key)?.data as T | undefined;
  }

  set(key: string, data: unknown, ttl = 300, tags: string[] = []): void {
    this.cache.set(key, { data, timestamp: Date.now(), ttl, tags });
    this.notify(key);
  }

  invalidateByTag(tag: string): void {
    const keysToDelete: string[] = [];
    for (const [key, entry] of this.cache) {
      if (entry.tags.includes(tag)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.cache.delete(key);
      this.notify(key);
    }
  }

  invalidate(key: string): void {
    this.cache.delete(key);
    this.notify(key);
  }

  clear(): void {
    const keys = Array.from(this.cache.keys());
    this.cache.clear();
    for (const key of keys) {
      this.notify(key);
    }
  }

  subscribe(key: string, listener: CacheListener): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)?.add(listener);
    return () => {
      this.listeners.get(key)?.delete(listener);
    };
  }

  optimisticUpdate<T>(key: string, updater: (current: T | undefined) => T): () => void {
    const previous = this.cache.get(key);
    const currentData = previous?.data as T | undefined;
    const newData = updater(currentData);
    this.set(key, newData, previous?.ttl ?? 300, previous?.tags ?? []);
    return () => {
      if (previous) {
        this.cache.set(key, previous);
      } else {
        this.cache.delete(key);
      }
      this.notify(key);
    };
  }

  private notify(key: string): void {
    const listeners = this.listeners.get(key);
    if (listeners) {
      for (const listener of listeners) {
        listener();
      }
    }
  }
}

export function buildCacheKey(module: string, operation: string, params?: unknown): string {
  const base = `narsil:${module}:${operation}`;
  if (!params) return base;
  return `${base}:${JSON.stringify(params)}`;
}

export const queryCache = new QueryCache();
