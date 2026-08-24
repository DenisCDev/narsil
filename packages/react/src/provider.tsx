/**
 * Narsil React Provider
 *
 * Provides cache context to all Narsil hooks.
 */

import { type ReactNode, createContext, useContext } from "react";
import { type QueryCache, queryCache } from "./cache.js";

// ─── Context ────────────────────────────────────────────────────────

interface NexusContextValue {
  cache: QueryCache;
}

const NexusContext = createContext<NexusContextValue>({
  cache: queryCache,
});

export function useNexusCache(): QueryCache {
  return useContext(NexusContext).cache;
}

// ─── Provider ───────────────────────────────────────────────────────

export interface NexusProviderProps {
  children: ReactNode;
  /** Custom QueryCache instance (default: global singleton) */
  cache?: QueryCache;
}

export function NexusProvider({ children, cache }: NexusProviderProps) {
  return <NexusContext.Provider value={{ cache: cache ?? queryCache }}>{children}</NexusContext.Provider>;
}
