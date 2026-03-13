/**
 * NexusFlow useSubscription Hook
 *
 * React hook for realtime subscriptions.
 * Integrates with Supabase Realtime to auto-update query cache.
 */

import { useEffect, useRef } from 'react'
import { queryCache } from '../cache.js'

export interface UseSubscriptionOptions<T> {
  /** Event type to listen for */
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
  /** Filter by column value */
  filter?: Record<string, unknown>
  /** Callback when new data arrives */
  onData?: (data: T) => void
  /** Whether subscription is active */
  enabled?: boolean
}

// Subscription registry to avoid duplicates
const activeSubscriptions = new Map<string, { count: number; unsubscribe: () => void }>()

/**
 * Hook into realtime changes for a model.
 * Automatically updates the query cache when changes arrive.
 *
 * Requires a realtime adapter to be configured (e.g., Supabase Realtime).
 */
export function useSubscription<T = unknown>(
  model: string,
  options: UseSubscriptionOptions<T> = {}
): void {
  const { event = '*', filter, onData, enabled = true } = options
  const onDataRef = useRef(onData)
  onDataRef.current = onData

  useEffect(() => {
    if (!enabled) return

    const filterKey = filter ? JSON.stringify(filter) : ''
    const subKey = `${model}:${event}:${filterKey}`

    // Check if subscription already exists
    const existing = activeSubscriptions.get(subKey)
    if (existing) {
      existing.count++
      return () => {
        existing.count--
        if (existing.count === 0) {
          existing.unsubscribe()
          activeSubscriptions.delete(subKey)
        }
      }
    }

    // Create subscription via global realtime manager
    const realtimeManager = (globalThis as any).__nexusflow_realtime
    if (!realtimeManager) {
      console.warn('[NexusFlow] Realtime not configured. Call configureRealtime() first.')
      return
    }

    const unsubscribe = realtimeManager.subscribe(model, {
      event,
      column: filter ? Object.keys(filter)[0] : undefined,
      value: filter ? Object.values(filter)[0] : undefined,
    }, (realtimeEvent: { type: string; new: T; old: T }) => {
      // Auto-invalidate query cache for this model
      queryCache.invalidateByTag(model)

      // Call user's onData callback
      if (onDataRef.current) {
        const data = realtimeEvent.type === 'DELETE'
          ? realtimeEvent.old
          : realtimeEvent.new
        onDataRef.current(data)
      }
    })

    activeSubscriptions.set(subKey, { count: 1, unsubscribe })

    return () => {
      const sub = activeSubscriptions.get(subKey)
      if (sub) {
        sub.count--
        if (sub.count === 0) {
          sub.unsubscribe()
          activeSubscriptions.delete(subKey)
        }
      }
    }
  }, [model, event, JSON.stringify(filter), enabled])
}
