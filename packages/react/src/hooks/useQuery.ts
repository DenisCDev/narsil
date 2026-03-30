/**
 * useQuery Hook
 *
 * React hook for data fetching with SWR, cache, loading/error states.
 * Works with the Narsil typed client.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { buildCacheKey, queryCache } from "../cache.js";

export interface UseQueryOptions<T> {
  enabled?: boolean;
  ttl?: number;
  tags?: string[];
  refetchOnFocus?: boolean;
  transform?: (data: unknown) => T;
}

export interface UseQueryResult<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  isFetching: boolean;
}

/**
 * Fetch data using any async function with caching and SWR.
 *
 * Usage:
 * ```tsx
 * const { data, isLoading } = useQuery(
 *   ['users', 'list'],
 *   () => api.users.list()
 * )
 * ```
 */
export function useQuery<T = unknown>(
  key: [string, string, ...unknown[]],
  fetcher: () => Promise<T>,
  options: UseQueryOptions<T> = {},
): UseQueryResult<T> {
  const { enabled = true, ttl = 300, tags = [], refetchOnFocus = true, transform } = options;

  const cacheKey = buildCacheKey(key[0], key[1], key.slice(2));
  const mountedRef = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const cached = queryCache.get<T>(cacheKey);
  const stale = queryCache.getStale<T>(cacheKey);

  const [data, setData] = useState<T | undefined>(cached ?? stale);
  const [isLoading, setIsLoading] = useState(!cached && enabled);
  const [isFetching, setIsFetching] = useState(!cached && enabled);
  const [error, setError] = useState<Error | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional computed deps for cache key stability
  const fetchData = useCallback(async () => {
    if (!enabled) return;

    setIsFetching(true);
    setError(null);

    try {
      const result = await fetcherRef.current();
      const transformed = transform ? transform(result as unknown) : result;

      if (mountedRef.current) {
        queryCache.set(cacheKey, transformed, ttl, [key[0], ...tags]);
        setData(transformed as T);
        setIsLoading(false);
        setIsFetching(false);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
        setIsFetching(false);
      }
    }
  }, [cacheKey, enabled, ttl, key[0], tags.join(","), transform]);

  // Initial fetch
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional - only refetch when fetchData or enabled changes
  useEffect(() => {
    mountedRef.current = true;
    if (enabled && !cached) {
      fetchData();
    }
    return () => {
      mountedRef.current = false;
    };
  }, [fetchData, enabled, !!cached]);

  // Subscribe to cache invalidation
  useEffect(() => {
    return queryCache.subscribe(cacheKey, () => {
      const newData = queryCache.get<T>(cacheKey);
      if (newData !== undefined) {
        setData(newData);
      } else {
        fetchData();
      }
    });
  }, [cacheKey, fetchData]);

  // Refetch on window focus
  useEffect(() => {
    if (!refetchOnFocus || typeof window === "undefined") return;
    const handleFocus = () => {
      if (!queryCache.get(cacheKey)) fetchData();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refetchOnFocus, cacheKey, fetchData]);

  return { data, isLoading, isError: error !== null, error, refetch: fetchData, isFetching };
}
