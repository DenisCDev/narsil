/**
 * NexusFlow Realtime Manager
 *
 * Manages realtime subscriptions across different adapters
 * (Supabase Realtime, Firebase onSnapshot, SSE fallback).
 */

import type { SubscriptionFilter, RealtimeEvent, Unsubscribe, DatabaseAdapter } from '@nexusflow/core'

export interface RealtimeAdapter {
  subscribe<T>(
    table: string,
    filter: SubscriptionFilter,
    callback: (event: RealtimeEvent<T>) => void
  ): Unsubscribe
}

export class RealtimeManager {
  private adapter: RealtimeAdapter | null = null
  private subscriptions = new Map<string, Unsubscribe>()

  /**
   * Configure the realtime adapter.
   */
  configure(adapter: RealtimeAdapter): void {
    this.adapter = adapter
    // Also set on globalThis for client hooks
    ;(globalThis as any).__nexusflow_realtime = this
  }

  /**
   * Subscribe to changes on a table.
   */
  subscribe<T>(
    table: string,
    filter: SubscriptionFilter,
    callback: (event: RealtimeEvent<T>) => void
  ): Unsubscribe {
    if (!this.adapter) {
      console.warn('[NexusFlow] No realtime adapter configured')
      return () => {}
    }

    const key = `${table}:${filter.event ?? '*'}:${filter.column ?? ''}:${filter.value ?? ''}`

    // Unsubscribe existing
    const existing = this.subscriptions.get(key)
    if (existing) existing()

    const unsubscribe = this.adapter.subscribe<T>(table, filter, callback)
    this.subscriptions.set(key, unsubscribe)

    return () => {
      unsubscribe()
      this.subscriptions.delete(key)
    }
  }

  /**
   * Create a realtime adapter from a DatabaseAdapter (if it supports subscribe).
   */
  static fromDatabaseAdapter(db: DatabaseAdapter): RealtimeAdapter | null {
    if (!db.subscribe) return null
    return {
      subscribe: (table, filter, callback) => db.subscribe!(table, filter, callback),
    }
  }

  /**
   * Disconnect all subscriptions.
   */
  disconnect(): void {
    for (const unsubscribe of this.subscriptions.values()) {
      unsubscribe()
    }
    this.subscriptions.clear()
  }
}

/**
 * Simple subscribe function for server-side use.
 *
 * @example
 * ```ts
 * subscribe('posts', (event) => {
 *   console.log('New post:', event.new)
 * })
 * ```
 */
export function subscribe<T>(
  table: string,
  callback: (event: RealtimeEvent<T>) => void,
  filter?: SubscriptionFilter
): Unsubscribe {
  const manager = (globalThis as any).__nexusflow_realtime as RealtimeManager | undefined
  if (!manager) {
    console.warn('[NexusFlow] Realtime not configured')
    return () => {}
  }
  return manager.subscribe<T>(table, filter ?? { event: '*' }, callback)
}
