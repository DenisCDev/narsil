/**
 * NexusFlow Firebase/Firestore Adapter
 *
 * Maps the DatabaseAdapter interface to Firestore operations.
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

// Firestore types (minimal, avoid importing full SDK)
type Firestore = any

export interface FirebaseAdapterConfig {
  /** Pre-built Firestore instance */
  firestore: Firestore
}

export class FirebaseAdapter implements DatabaseAdapter {
  private db: Firestore

  constructor(config: FirebaseAdapterConfig) {
    this.db = config.firestore
  }

  async findMany<T>(table: string, query: FindManyQuery): Promise<T[]> {
    try {
      let ref = this.db.collection(table)

      if (query.where) {
        for (const [field, condition] of Object.entries(query.where)) {
          ref = applyFirestoreWhere(ref, field, condition)
        }
      }

      if (query.orderBy) {
        ref = ref.orderBy(query.orderBy.column, query.orderBy.asc ? 'asc' : 'desc')
      }

      if (query.limit) {
        ref = ref.limit(query.limit)
      }

      if (query.offset) {
        // Firestore doesn't have native offset — use startAfter with cursor
        // For simplicity, just skip documents
        ref = ref.limit((query.offset || 0) + (query.limit || 50))
      }

      const snapshot = await ref.get()
      const docs: T[] = []

      snapshot.forEach((doc: any) => {
        docs.push({ id: doc.id, ...doc.data() } as T)
      })

      // Apply manual offset if needed
      if (query.offset) {
        return docs.slice(query.offset)
      }

      return docs
    } catch (error: any) {
      throw new NexusDatabaseError(error.message, { table, operation: 'findMany' })
    }
  }

  async findOne<T>(table: string, query: FindOneQuery): Promise<T | null> {
    try {
      // If querying by ID directly
      if ('id' in query.where && typeof query.where.id === 'string') {
        const doc = await this.db.collection(table).doc(query.where.id as string).get()
        if (!doc.exists) return null
        return { id: doc.id, ...doc.data() } as T
      }

      // Otherwise, query with limit 1
      const results = await this.findMany<T>(table, { ...query, limit: 1 })
      return results[0] ?? null
    } catch (error: any) {
      throw new NexusDatabaseError(error.message, { table, operation: 'findOne' })
    }
  }

  async insert<T>(table: string, data: Record<string, unknown>): Promise<T> {
    try {
      const { id, ...rest } = data

      if (id) {
        await this.db.collection(table).doc(id as string).set({
          ...rest,
          createdAt: new Date(),
        })
        return { id, ...rest } as T
      }

      const ref = await this.db.collection(table).add({
        ...rest,
        createdAt: new Date(),
      })

      return { id: ref.id, ...rest } as T
    } catch (error: any) {
      throw new NexusDatabaseError(error.message, { table, operation: 'insert' })
    }
  }

  async insertMany<T>(table: string, data: Record<string, unknown>[]): Promise<T[]> {
    const results: T[] = []
    const batch = this.db.batch()

    for (const item of data) {
      const ref = this.db.collection(table).doc()
      batch.set(ref, { ...item, createdAt: new Date() })
      results.push({ id: ref.id, ...item } as T)
    }

    await batch.commit()
    return results
  }

  async update<T>(table: string, where: WhereClause, data: Record<string, unknown>): Promise<T> {
    try {
      const id = where.id as string
      if (!id) throw new Error('Firebase update requires an id in where clause')

      await this.db.collection(table).doc(id).update({
        ...data,
        updatedAt: new Date(),
      })

      const doc = await this.db.collection(table).doc(id).get()
      return { id: doc.id, ...doc.data() } as T
    } catch (error: any) {
      throw new NexusDatabaseError(error.message, { table, operation: 'update' })
    }
  }

  async delete(table: string, where: WhereClause): Promise<void> {
    try {
      const id = where.id as string
      if (!id) throw new Error('Firebase delete requires an id in where clause')
      await this.db.collection(table).doc(id).delete()
    } catch (error: any) {
      throw new NexusDatabaseError(error.message, { table, operation: 'delete' })
    }
  }

  async count(table: string, where?: WhereClause): Promise<number> {
    let ref = this.db.collection(table) as any
    if (where) {
      for (const [field, condition] of Object.entries(where)) {
        ref = applyFirestoreWhere(ref, field, condition)
      }
    }
    const snapshot = await ref.count().get()
    return snapshot.data().count
  }

  async transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
    return this.db.runTransaction(async () => {
      const tx: TransactionClient = {
        raw: async () => { throw new Error('Raw queries not supported in Firebase') },
      }
      return fn(tx)
    })
  }

  async raw<T>(): Promise<T[]> {
    throw new NexusDatabaseError('Raw queries not supported in Firebase')
  }

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  subscribe<T>(
    table: string,
    filter: SubscriptionFilter,
    callback: (event: RealtimeEvent<T>) => void
  ): Unsubscribe {
    let ref = this.db.collection(table) as any

    if (filter.column && filter.value !== undefined) {
      ref = ref.where(filter.column, '==', filter.value)
    }

    return ref.onSnapshot((snapshot: any) => {
      snapshot.docChanges().forEach((change: any) => {
        const eventType = change.type === 'added' ? 'INSERT'
          : change.type === 'modified' ? 'UPDATE'
          : 'DELETE'

        if (filter.event && filter.event !== '*' && filter.event !== eventType) return

        callback({
          type: eventType,
          old: change.type === 'removed' ? { id: change.doc.id, ...change.doc.data() } as T : null,
          new: change.type !== 'removed' ? { id: change.doc.id, ...change.doc.data() } as T : null,
        })
      })
    })
  }
}

function applyFirestoreWhere(ref: any, field: string, condition: WhereOperator<unknown>): any {
  if (typeof condition !== 'object' || condition instanceof Date) {
    return ref.where(field, '==', condition)
  }

  const op = condition as Record<string, unknown>
  if ('eq' in op) return ref.where(field, '==', op.eq)
  if ('neq' in op) return ref.where(field, '!=', op.neq)
  if ('gt' in op) return ref.where(field, '>', op.gt)
  if ('gte' in op) return ref.where(field, '>=', op.gte)
  if ('lt' in op) return ref.where(field, '<', op.lt)
  if ('lte' in op) return ref.where(field, '<=', op.lte)
  if ('in' in op) return ref.where(field, 'in', op.in)

  return ref.where(field, '==', condition)
}
