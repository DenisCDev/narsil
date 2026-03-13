/**
 * NexusFlow Supabase Adapter
 *
 * Deep integration with Supabase:
 * - PostgREST queries (no ORM overhead)
 * - Auth via JWT/cookies
 * - Realtime subscriptions
 * - RLS policy generation
 *
 * Uses @supabase/supabase-js client directly.
 */

import type {
  DatabaseAdapter,
  FindManyQuery,
  FindOneQuery,
  WhereClause,
  WhereOperator,
  TransactionClient,
  RealtimeEvent,
  SubscriptionFilter,
  Unsubscribe,
} from '@nexusflow/core'
import { NexusDatabaseError } from '@nexusflow/core'

// ─── Supabase Client Types (minimal, avoid importing full SDK) ──────

interface SupabaseClient {
  from(table: string): SupabaseQueryBuilder
  rpc(fn: string, params?: Record<string, unknown>): any
  channel(name: string): any
  auth: {
    getUser(): Promise<{ data: { user: any }; error: any }>
  }
}

interface SupabaseQueryBuilder {
  select(columns?: string, options?: { count?: 'exact' | 'planned' | 'estimated' }): any
  insert(data: Record<string, unknown> | Record<string, unknown>[]): any
  update(data: Record<string, unknown>): any
  delete(): any
  upsert(data: Record<string, unknown> | Record<string, unknown>[]): any
}

// ─── Where Clause Builder ───────────────────────────────────────────

function applyWhere(query: any, where: Record<string, WhereOperator<unknown>>): any {
  let q = query

  for (const [column, condition] of Object.entries(where)) {
    if (condition === null || condition === undefined) continue

    // Simple equality: { id: "123" }
    if (typeof condition !== 'object' || condition instanceof Date) {
      q = q.eq(column, condition)
      continue
    }

    // Operator objects: { id: { eq: "123" } }
    const op = condition as Record<string, unknown>

    if ('eq' in op) q = q.eq(column, op.eq)
    else if ('neq' in op) q = q.neq(column, op.neq)
    else if ('gt' in op) q = q.gt(column, op.gt)
    else if ('gte' in op) q = q.gte(column, op.gte)
    else if ('lt' in op) q = q.lt(column, op.lt)
    else if ('lte' in op) q = q.lte(column, op.lte)
    else if ('in' in op) q = q.in(column, op.in as unknown[])
    else if ('like' in op) q = q.like(column, op.like)
    else if ('ilike' in op) q = q.ilike(column, op.ilike)
    else if ('isNull' in op) q = q.is(column, op.isNull ? null : undefined)
    else {
      // Treat as equality if no known operator
      q = q.eq(column, condition)
    }
  }

  return q
}

// ─── Adapter Implementation ─────────────────────────────────────────

export interface SupabaseAdapterConfig {
  /** Supabase project URL */
  url: string
  /** Supabase anon key */
  anonKey: string
  /** Service role key for admin operations (bypasses RLS) */
  serviceRoleKey?: string
  /** Pre-built Supabase client (for SSR with cookies) */
  client?: SupabaseClient
}

export class SupabaseAdapter implements DatabaseAdapter {
  private client: SupabaseClient
  private config: SupabaseAdapterConfig

  constructor(config: SupabaseAdapterConfig) {
    this.config = config

    if (config.client) {
      this.client = config.client
    } else {
      // Dynamic import to avoid bundling @supabase/supabase-js at module level
      throw new Error(
        'SupabaseAdapter requires a pre-built client. ' +
        'Pass { client: createClient(...) } or use createSupabaseAdapter().'
      )
    }
  }

  async findMany<T>(table: string, query: FindManyQuery): Promise<T[]> {
    let q = this.client
      .from(table)
      .select(query.select || '*', query.count ? { count: 'exact' } : undefined)

    if (query.where) {
      q = applyWhere(q, query.where)
    }

    if (query.orderBy) {
      q = q.order(query.orderBy.column, { ascending: query.orderBy.asc })
    }

    if (query.limit !== undefined && query.offset !== undefined) {
      q = q.range(query.offset, query.offset + query.limit - 1)
    } else if (query.limit !== undefined) {
      q = q.limit(query.limit)
    }

    const { data, error } = await q

    if (error) {
      throw new NexusDatabaseError(error.message, { table, operation: 'findMany' })
    }

    return (data ?? []) as T[]
  }

  async findOne<T>(table: string, query: FindOneQuery): Promise<T | null> {
    let q = this.client.from(table).select(query.select || '*')

    q = applyWhere(q, query.where)
    q = q.limit(1).single()

    const { data, error } = await q

    if (error) {
      // PGRST116 = "JSON object requested, single row not found"
      if (error.code === 'PGRST116') return null
      throw new NexusDatabaseError(error.message, { table, operation: 'findOne' })
    }

    return data as T | null
  }

  async insert<T>(table: string, data: Record<string, unknown>): Promise<T> {
    const { data: result, error } = await this.client
      .from(table)
      .insert(data)
      .select()
      .single()

    if (error) {
      throw new NexusDatabaseError(error.message, { table, operation: 'insert' })
    }

    return result as T
  }

  async insertMany<T>(table: string, data: Record<string, unknown>[]): Promise<T[]> {
    const { data: result, error } = await this.client
      .from(table)
      .insert(data)
      .select()

    if (error) {
      throw new NexusDatabaseError(error.message, { table, operation: 'insertMany' })
    }

    return (result ?? []) as T[]
  }

  async update<T>(table: string, where: WhereClause, data: Record<string, unknown>): Promise<T> {
    let q = this.client.from(table).update(data)
    q = applyWhere(q, where)
    q = q.select().single()

    const { data: result, error } = await q

    if (error) {
      throw new NexusDatabaseError(error.message, { table, operation: 'update' })
    }

    return result as T
  }

  async delete(table: string, where: WhereClause): Promise<void> {
    let q = this.client.from(table).delete()
    q = applyWhere(q, where)

    const { error } = await q

    if (error) {
      throw new NexusDatabaseError(error.message, { table, operation: 'delete' })
    }
  }

  async count(table: string, where?: WhereClause): Promise<number> {
    let q = this.client.from(table).select('*', { count: 'exact' }).limit(0) as any

    if (where) {
      q = applyWhere(q, where)
    }

    const { count, error } = await q

    if (error) {
      throw new NexusDatabaseError(error.message, { table, operation: 'count' })
    }

    return count ?? 0
  }

  async transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
    // Supabase doesn't support client-side transactions directly.
    // Use rpc() to call a Postgres function, or use raw SQL.
    const tx: TransactionClient = {
      raw: async <R>(sql: string, params?: unknown[]) => {
        return this.raw<R>(sql, params)
      },
    }
    return fn(tx)
  }

  async raw<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const { data, error } = await this.client.rpc('nexusflow_raw_query', {
      query_text: sql,
      query_params: params ?? [],
    })

    if (error) {
      throw new NexusDatabaseError(error.message, { operation: 'raw', sql })
    }

    return (data ?? []) as T[]
  }

  async connect(): Promise<void> {
    // Supabase client is stateless — no connection to establish
  }

  async disconnect(): Promise<void> {
    // Supabase client is stateless — no connection to close
  }

  /**
   * Subscribe to realtime changes on a table.
   * Uses Supabase Realtime (WebSocket-based Postgres CDC).
   */
  subscribe<T>(
    table: string,
    filter: SubscriptionFilter,
    callback: (event: RealtimeEvent<T>) => void
  ): Unsubscribe {
    const channelName = `nexusflow:${table}:${Date.now()}`

    const channelConfig: Record<string, unknown> = {
      event: filter.event === '*' ? '*' : filter.event ?? '*',
      schema: 'public',
      table,
    }

    if (filter.column && filter.value !== undefined) {
      channelConfig['filter'] = `${filter.column}=eq.${filter.value}`
    }

    const channel = this.client
      .channel(channelName)
      .on('postgres_changes', channelConfig as any, (payload: any) => {
        callback({
          type: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          old: (payload.old ?? null) as T | null,
          new: (payload.new ?? null) as T | null,
        })
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }

  /**
   * Create a new adapter instance scoped to a user's auth token.
   * Useful for server-side rendering where each request has its own auth.
   */
  withClient(client: SupabaseClient): SupabaseAdapter {
    return new SupabaseAdapter({ ...this.config, client })
  }
}

// ─── Factory ────────────────────────────────────────────────────────

/**
 * Create a Supabase adapter from a pre-built client.
 * This is the recommended way — pass the SSR client from @supabase/ssr.
 *
 * @example
 * ```ts
 * import { createServerClient } from '@supabase/ssr'
 * import { createSupabaseAdapter } from '@nexusflow/db-supabase'
 *
 * const supabase = createServerClient(url, key, { cookies })
 * const db = createSupabaseAdapter(supabase)
 * ```
 */
export function createSupabaseAdapter(client: SupabaseClient): SupabaseAdapter {
  return new SupabaseAdapter({
    url: '',
    anonKey: '',
    client: client as SupabaseClient,
  })
}
