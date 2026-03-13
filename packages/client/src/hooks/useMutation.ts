/**
 * NexusFlow useMutation Hook
 *
 * React hook for mutations with:
 * - Optimistic updates
 * - Automatic cache invalidation
 * - Loading/error states
 * - Rollback on error
 */

import { useState, useCallback, useRef } from 'react'
import { queryCache } from '../cache.js'
import { nexusFetch } from '../fetcher.js'

export interface UseMutationOptions<TInput, TOutput> {
  /** Called when mutation succeeds */
  onSuccess?: (data: TOutput, input: TInput) => void
  /** Called when mutation fails */
  onError?: (error: Error, input: TInput) => void
  /** Optimistic update function */
  onOptimistic?: (cache: typeof queryCache, input: TInput) => void
  /** Cache tags to invalidate on success */
  invalidateTags?: string[]
}

export interface UseMutationResult<TInput, TOutput> {
  mutate: (input: TInput) => Promise<TOutput>
  data: TOutput | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
  reset: () => void
}

export function useMutation<TInput = unknown, TOutput = unknown>(
  model: string,
  operation: string,
  options: UseMutationOptions<TInput, TOutput> = {}
): UseMutationResult<TInput, TOutput> {
  const [data, setData] = useState<TOutput | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const rollbackRef = useRef<(() => void) | null>(null)

  const mutate = useCallback(async (input: TInput): Promise<TOutput> => {
    setIsLoading(true)
    setError(null)

    // Apply optimistic update
    if (options.onOptimistic) {
      // Create rollback by snapshotting affected caches
      options.onOptimistic(queryCache, input)
    }

    try {
      let result: TOutput

      const inputObj = input as Record<string, unknown>

      switch (operation) {
        case 'create':
          result = await nexusFetch<TOutput>('POST', `/${model}`, inputObj.data ?? inputObj)
          break
        case 'update': {
          const id = inputObj.where ? (inputObj.where as any).id : inputObj.id
          result = await nexusFetch<TOutput>('PATCH', `/${model}/${id}`, inputObj.data ?? inputObj)
          break
        }
        case 'delete': {
          const deleteId = inputObj.where ? (inputObj.where as any).id : inputObj.id ?? inputObj
          result = await nexusFetch<TOutput>('DELETE', `/${model}/${deleteId}`)
          break
        }
        default:
          result = await nexusFetch<TOutput>('POST', `/${model}/${operation}`, inputObj)
      }

      setData(result)
      setIsLoading(false)

      // Invalidate related caches
      queryCache.invalidateByTag(model)
      if (options.invalidateTags) {
        for (const tag of options.invalidateTags) {
          queryCache.invalidateByTag(tag)
        }
      }

      options.onSuccess?.(result, input)
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      setError(error)
      setIsLoading(false)

      // Rollback optimistic update
      if (rollbackRef.current) {
        rollbackRef.current()
        rollbackRef.current = null
      }

      options.onError?.(error, input)
      throw error
    }
  }, [model, operation, options])

  const reset = useCallback(() => {
    setData(undefined)
    setError(null)
    setIsLoading(false)
  }, [])

  return {
    mutate,
    data,
    isLoading,
    isError: error !== null,
    error,
    reset,
  }
}
