/**
 * NexusFlow React Provider
 *
 * Provides configuration context to all NexusFlow hooks.
 */

import { createContext, useContext, type ReactNode } from 'react'
import { configureFetcher } from './fetcher.js'
import { QueryCache, queryCache } from './cache.js'

// ─── Context ────────────────────────────────────────────────────────

interface NexusContextValue {
  cache: QueryCache
  baseUrl: string
}

const NexusContext = createContext<NexusContextValue>({
  cache: queryCache,
  baseUrl: '/api',
})

export function useNexus(): NexusContextValue {
  return useContext(NexusContext)
}

// ─── Provider ───────────────────────────────────────────────────────

export interface NexusProviderProps {
  children: ReactNode
  /** Base URL for API requests (default: '/api') */
  baseUrl?: string
  /** Function to get auth token for requests */
  getToken?: () => string | null | Promise<string | null>
  /** Custom headers for all requests */
  headers?: Record<string, string>
}

export function NexusProvider({
  children,
  baseUrl = '/api',
  getToken,
  headers,
}: NexusProviderProps) {
  // Configure the fetcher with provided settings
  configureFetcher({ baseUrl, getToken, headers })

  return (
    <NexusContext.Provider value={{ cache: queryCache, baseUrl }}>
      {children}
    </NexusContext.Provider>
  )
}
