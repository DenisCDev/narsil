/**
 * NexusFlow PostgreSQL Adapter
 *
 * Raw PostgreSQL adapter using postgres.js for maximum performance.
 * Zero ORM overhead — direct SQL execution with type safety.
 */

import type {
  DatabaseAdapter,
  FindManyQuery,
  FindOneQuery,
  WhereClause,
  WhereOperator,
  TransactionClient,
} from '@nexusflow/core'
import { NexusDatabaseError } from '@nexusflow/core'

// postgres.js types (avoid importing at module level for tree-shaking)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sql = any
type PostgresModule = { default: (connectionString: string, options?: Record<string, unknown>) => Sql }

export interface PostgresAdapterConfig {
  /** Connection string: postgres://user:pass@host:port/db */
  connectionString: string
  /** Max connections in pool (default: 10) */
  maxConnections?: number
}

export class PostgresAdapter implements DatabaseAdapter {
  private sql: Sql | null = null
  private config: PostgresAdapterConfig

  constructor(config: PostgresAdapterConfig) {
    this.config = config
  }

  private async getSql(): Promise<Sql> {
    if (!this.sql) {
      // Dynamic import for tree-shaking and lazy loading
      const mod = await (Function('return import("postgres")')() as Promise<PostgresModule>)
      const postgres = mod.default
      this.sql = postgres(this.config.connectionString, {
        max: this.config.maxConnections ?? 10,
      })
    }
    return this.sql
  }

  async findMany<T>(table: string, query: FindManyQuery): Promise<T[]> {
    const sql = await this.getSql()
    const { whereSQL, params } = buildWhere(query.where)
    const orderSQL = query.orderBy ? `ORDER BY ${query.orderBy.column} ${query.orderBy.asc ? 'ASC' : 'DESC'}` : ''
    const limitSQL = query.limit ? `LIMIT ${query.limit}` : ''
    const offsetSQL = query.offset ? `OFFSET ${query.offset}` : ''

    const queryStr = `SELECT ${query.select || '*'} FROM ${table} ${whereSQL} ${orderSQL} ${limitSQL} ${offsetSQL}`

    try {
      return await sql.unsafe(queryStr, params) as T[]
    } catch (error: any) {
      throw new NexusDatabaseError(error.message, { table, operation: 'findMany' })
    }
  }

  async findOne<T>(table: string, query: FindOneQuery): Promise<T | null> {
    const sql = await this.getSql()
    const { whereSQL, params } = buildWhere(query.where)

    try {
      const rows = await sql.unsafe(
        `SELECT ${query.select || '*'} FROM ${table} ${whereSQL} LIMIT 1`,
        params
      )
      return (rows[0] as T) ?? null
    } catch (error: any) {
      throw new NexusDatabaseError(error.message, { table, operation: 'findOne' })
    }
  }

  async insert<T>(table: string, data: Record<string, unknown>): Promise<T> {
    const sql = await this.getSql()
    const keys = Object.keys(data)
    const values = Object.values(data)
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')

    try {
      const rows = await sql.unsafe(
        `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        values
      )
      return rows[0] as T
    } catch (error: any) {
      throw new NexusDatabaseError(error.message, { table, operation: 'insert' })
    }
  }

  async insertMany<T>(table: string, data: Record<string, unknown>[]): Promise<T[]> {
    if (data.length === 0) return []
    const sql = await this.getSql()
    const keys = Object.keys(data[0]!)

    const valueSets: string[] = []
    const allValues: unknown[] = []
    let paramIndex = 1

    for (const row of data) {
      const placeholders = keys.map(() => `$${paramIndex++}`).join(', ')
      valueSets.push(`(${placeholders})`)
      allValues.push(...keys.map(k => row[k]))
    }

    try {
      return await sql.unsafe(
        `INSERT INTO ${table} (${keys.join(', ')}) VALUES ${valueSets.join(', ')} RETURNING *`,
        allValues
      ) as T[]
    } catch (error: any) {
      throw new NexusDatabaseError(error.message, { table, operation: 'insertMany' })
    }
  }

  async update<T>(table: string, where: WhereClause, data: Record<string, unknown>): Promise<T> {
    const sql = await this.getSql()
    const keys = Object.keys(data)
    const values = Object.values(data)

    const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
    const { whereSQL, params: whereParams } = buildWhere(where, values.length)

    try {
      const rows = await sql.unsafe(
        `UPDATE ${table} SET ${setClauses} ${whereSQL} RETURNING *`,
        [...values, ...whereParams]
      )
      return rows[0] as T
    } catch (error: any) {
      throw new NexusDatabaseError(error.message, { table, operation: 'update' })
    }
  }

  async delete(table: string, where: WhereClause): Promise<void> {
    const sql = await this.getSql()
    const { whereSQL, params } = buildWhere(where)

    try {
      await sql.unsafe(`DELETE FROM ${table} ${whereSQL}`, params)
    } catch (error: any) {
      throw new NexusDatabaseError(error.message, { table, operation: 'delete' })
    }
  }

  async count(table: string, where?: WhereClause): Promise<number> {
    const sql = await this.getSql()
    const { whereSQL, params } = buildWhere(where)

    try {
      const rows = await sql.unsafe(`SELECT COUNT(*)::int as count FROM ${table} ${whereSQL}`, params)
      return rows[0]?.count ?? 0
    } catch (error: any) {
      throw new NexusDatabaseError(error.message, { table, operation: 'count' })
    }
  }

  async transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
    const sql = await this.getSql()
    return sql.begin(async (tx: any) => {
      const client: TransactionClient = {
        raw: async <R>(query: string, params?: unknown[]) => {
          return tx.unsafe(query, params ?? []) as R[]
        },
      }
      return fn(client)
    })
  }

  async raw<T>(query: string, params?: unknown[]): Promise<T[]> {
    const sql = await this.getSql()
    try {
      return await sql.unsafe(query, params ?? []) as T[]
    } catch (error: any) {
      throw new NexusDatabaseError(error.message, { operation: 'raw' })
    }
  }

  async connect(): Promise<void> {
    await this.getSql()
  }

  async disconnect(): Promise<void> {
    if (this.sql) {
      await this.sql.end()
      this.sql = null
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function buildWhere(where?: Record<string, WhereOperator<unknown>>, startIndex = 0): { whereSQL: string; params: unknown[] } {
  if (!where || Object.keys(where).length === 0) {
    return { whereSQL: '', params: [] }
  }

  const conditions: string[] = []
  const params: unknown[] = []
  let paramIndex = startIndex + 1

  for (const [column, condition] of Object.entries(where)) {
    if (condition === null || condition === undefined) continue

    if (typeof condition !== 'object' || condition instanceof Date) {
      conditions.push(`${column} = $${paramIndex}`)
      params.push(condition)
      paramIndex++
      continue
    }

    const op = condition as Record<string, unknown>
    if ('eq' in op) { conditions.push(`${column} = $${paramIndex}`); params.push(op.eq); paramIndex++ }
    else if ('neq' in op) { conditions.push(`${column} != $${paramIndex}`); params.push(op.neq); paramIndex++ }
    else if ('gt' in op) { conditions.push(`${column} > $${paramIndex}`); params.push(op.gt); paramIndex++ }
    else if ('gte' in op) { conditions.push(`${column} >= $${paramIndex}`); params.push(op.gte); paramIndex++ }
    else if ('lt' in op) { conditions.push(`${column} < $${paramIndex}`); params.push(op.lt); paramIndex++ }
    else if ('lte' in op) { conditions.push(`${column} <= $${paramIndex}`); params.push(op.lte); paramIndex++ }
    else if ('in' in op) {
      const arr = op.in as unknown[]
      const placeholders = arr.map(() => `$${paramIndex++}`).join(', ')
      conditions.push(`${column} IN (${placeholders})`)
      params.push(...arr)
    }
    else if ('like' in op) { conditions.push(`${column} LIKE $${paramIndex}`); params.push(op.like); paramIndex++ }
    else if ('ilike' in op) { conditions.push(`${column} ILIKE $${paramIndex}`); params.push(op.ilike); paramIndex++ }
    else if ('isNull' in op) { conditions.push(`${column} IS ${op.isNull ? 'NULL' : 'NOT NULL'}`) }
    else { conditions.push(`${column} = $${paramIndex}`); params.push(condition); paramIndex++ }
  }

  return {
    whereSQL: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  }
}
