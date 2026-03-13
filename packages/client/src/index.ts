/**
 * @nexusflow/client
 *
 * React hooks, cache, and typed client SDK.
 */

// Hooks
export { useQuery } from './hooks/useQuery.js'
export type { UseQueryOptions, UseQueryResult } from './hooks/useQuery.js'

export { useMutation } from './hooks/useMutation.js'
export type { UseMutationOptions, UseMutationResult } from './hooks/useMutation.js'

export { useSubscription } from './hooks/useSubscription.js'
export type { UseSubscriptionOptions } from './hooks/useSubscription.js'

// Provider
export { NexusProvider, useNexus } from './provider.js'
export type { NexusProviderProps } from './provider.js'

// Cache
export { QueryCache, queryCache, buildCacheKey } from './cache.js'

// Fetcher
export { nexusFetch, configureFetcher, createModelClient } from './fetcher.js'
export type { FetcherConfig } from './fetcher.js'
