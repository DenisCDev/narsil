/**
 * NexusFlow useQuery Hook
 *
 * React hook for data fetching with:
 * - SWR (stale-while-revalidate)
 * - Automatic cache management
 * - Loading/error states
 * - Refetch on window focus
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { queryCache, buildCacheKey } from '../cache.js'
import { nexusFetch } from '../fetcher.js'

export interface UseQueryOptions<T> {
  /** Disable automatic fetching */
  enabled?: boolean
  /** Cache TTL in seconds */
  ttl?: number
  /** Cache tags for invalidation */
  tags?: string[]
  /** Refetch on window focus */
  refetchOnFocus?: boolean
  /** Transform the response */
  transform?: (data: unknown) => T
}

export interface UseQueryResult<T> {
  data: T | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => Promise<void>
  isFetching: boolean
}

export function useQuery<T = unknown>(
  model: string,
  operation: string,
  params?: Record<string, unknown>,
  options: UseQueryOptions<T> = {}
): UseQueryResult<T> {
  const { enabled = true, ttl = 300, tags = [], refetchOnFocus = true, transform } = options

  const cacheKey = buildCacheKey(model, operation, params)
  const mountedRef = useRef(true)

  // Initialize from cache
  const cached = queryCache.get<T>(cacheKey)
  const stale = queryCache.getStale<T>(cacheKey)

  const [data, setData] = useState<T | undefined>(cached ?? stale)
  const [isLoading, setIsLoading] = useState(!cached && enabled)
  const [isFetching, setIsFetching] = useState(!cached && enabled)
  const [error, setError] = useState<Error | null>(null)

  const fetchData = useCallback(async () => {
    if (!enabled) return

    setIsFetching(true)
    setError(null)

    try {
      const path = `/${model}`
      let result: unknown

      if (operation === 'list') {
        result = await nexusFetch<T[]>('GET', path, params)
      } else if (operation === 'get' && params?.id) {
        result = await nexusFetch<T>('GET', `${path}/${params.id}`)
      } else {
        result = await nexusFetch<T>('GET', `${path}/${operation}`, params)
      }

      const transformed = transform ? transform(result) : result

      if (mountedRef.current) {
        queryCache.set(cacheKey, transformed, ttl, [model, ...tags])
        setData(transformed as T)
        setIsLoading(false)
        setIsFetching(false)
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)))
        setIsLoading(false)
        setIsFetching(false)
      }
    }
  }, [model, operation, JSON.stringify(params), enabled, cacheKey, ttl, tags.join(','), transform])

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true
    if (enabled && !cached) {
      fetchData()
    }
    return () => {
      mountedRef.current = false
    }
  }, [fetchData, enabled, cached])

  // Subscribe to cache invalidation
  useEffect(() => {
    return queryCache.subscribe(cacheKey, () => {
      const newData = queryCache.get<T>(cacheKey)
      if (newData !== undefined) {
        setData(newData)
      } else {
        // Cache was invalidated — refetch
        fetchData()
      }
    })
  }, [cacheKey, fetchData])

  // Refetch on window focus
  useEffect(() => {
    if (!refetchOnFocus || typeof window === 'undefined') return

    const handleFocus = () => {
      // Only refetch if data is stale
      const cached = queryCache.get(cacheKey)
      if (!cached) fetchData()
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [refetchOnFocus, cacheKey, fetchData])

  return {
    data,
    isLoading,
    isError: error !== null,
    error,
    refetch: fetchData,
    isFetching,
  }
}
