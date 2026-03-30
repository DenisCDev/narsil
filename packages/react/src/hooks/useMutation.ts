/**
 * useMutation Hook
 *
 * React hook for mutations with optimistic updates,
 * cache invalidation, and rollback on error.
 */

import { useCallback, useRef, useState } from "react";
import { queryCache } from "../cache.js";

export interface UseMutationOptions<TInput, TOutput> {
  onSuccess?: (data: TOutput, input: TInput) => void;
  onError?: (error: Error, input: TInput) => void;
  onOptimistic?: (cache: typeof queryCache, input: TInput) => (() => void) | undefined;
  invalidateTags?: string[];
}

export interface UseMutationResult<TInput, TOutput> {
  mutate: (input: TInput) => Promise<TOutput>;
  data: TOutput | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  reset: () => void;
}

/**
 * Execute mutations with optimistic updates and cache invalidation.
 *
 * Usage:
 * ```tsx
 * const { mutate, isLoading } = useMutation(
 *   (data) => api.users.create(data),
 *   { invalidateTags: ['users'] }
 * )
 * await mutate({ name: 'John', email: 'john@example.com' })
 * ```
 */
export function useMutation<TInput = unknown, TOutput = unknown>(
  mutationFn: (input: TInput) => Promise<TOutput>,
  options: UseMutationOptions<TInput, TOutput> = {},
): UseMutationResult<TInput, TOutput> {
  const [data, setData] = useState<TOutput | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const rollbackRef = useRef<(() => void) | null>(null);
  const mutationFnRef = useRef(mutationFn);
  mutationFnRef.current = mutationFn;

  const mutate = useCallback(
    async (input: TInput): Promise<TOutput> => {
      setIsLoading(true);
      setError(null);

      // Apply optimistic update
      if (options.onOptimistic) {
        const rollback = options.onOptimistic(queryCache, input);
        if (typeof rollback === "function") {
          rollbackRef.current = rollback;
        }
      }

      try {
        const result = await mutationFnRef.current(input);

        setData(result);
        setIsLoading(false);

        // Invalidate related caches
        if (options.invalidateTags) {
          for (const tag of options.invalidateTags) {
            queryCache.invalidateByTag(tag);
          }
        }

        options.onSuccess?.(result, input);
        return result;
      } catch (err) {
        const mutationError = err instanceof Error ? err : new Error(String(err));
        setError(mutationError);
        setIsLoading(false);

        // Rollback optimistic update
        if (rollbackRef.current) {
          rollbackRef.current();
          rollbackRef.current = null;
        }

        options.onError?.(mutationError, input);
        throw mutationError;
      }
    },
    [options],
  );

  const reset = useCallback(() => {
    setData(undefined);
    setError(null);
    setIsLoading(false);
  }, []);

  return { mutate, data, isLoading, isError: error !== null, error, reset };
}
