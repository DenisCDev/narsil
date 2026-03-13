/**
 * NexusFlow Field Builders
 *
 * Fluent API for defining model fields. Each method returns a new descriptor
 * with updated metadata. NO runtime validation — descriptors are consumed
 * by code generators to emit optimized validators and SQL.
 */

import type { FieldDescriptor, FieldSqlType } from './types.js'

// ─── Field Builder Class ────────────────────────────────────────────

class FieldBuilder<T> implements FieldDescriptor<T> {
  readonly _type!: T
  readonly sqlType: FieldSqlType
  readonly isPrimary: boolean
  readonly isOptional: boolean
  readonly isUnique: boolean
  readonly isIndexed: boolean
  readonly hasDefault: boolean
  readonly defaultValue?: unknown
  readonly onUpdateValue?: unknown
  readonly minValue?: number
  readonly maxValue?: number
  readonly enumValues?: readonly string[]
  readonly referenceTable?: string
  readonly referenceColumn?: string
  readonly checkExpression?: string

  constructor(
    sqlType: FieldSqlType,
    overrides: Partial<Omit<FieldDescriptor<T>, '_type' | 'sqlType'>> = {}
  ) {
    this.sqlType = sqlType
    this.isPrimary = overrides.isPrimary ?? false
    this.isOptional = overrides.isOptional ?? false
    this.isUnique = overrides.isUnique ?? false
    this.isIndexed = overrides.isIndexed ?? false
    this.hasDefault = overrides.hasDefault ?? false
    this.defaultValue = overrides.defaultValue
    this.onUpdateValue = overrides.onUpdateValue
    this.minValue = overrides.minValue
    this.maxValue = overrides.maxValue
    this.enumValues = overrides.enumValues
    this.referenceTable = overrides.referenceTable
    this.referenceColumn = overrides.referenceColumn
    this.checkExpression = overrides.checkExpression
  }

  private clone<U = T>(overrides: Partial<Omit<FieldDescriptor<U>, '_type' | 'sqlType'>>): FieldBuilder<U> {
    return new FieldBuilder<U>(this.sqlType, {
      isPrimary: this.isPrimary,
      isOptional: this.isOptional,
      isUnique: this.isUnique,
      isIndexed: this.isIndexed,
      hasDefault: this.hasDefault,
      defaultValue: this.defaultValue,
      onUpdateValue: this.onUpdateValue,
      minValue: this.minValue,
      maxValue: this.maxValue,
      enumValues: this.enumValues,
      referenceTable: this.referenceTable,
      referenceColumn: this.referenceColumn,
      checkExpression: this.checkExpression,
      ...overrides,
    })
  }

  primaryKey(): FieldBuilder<T> {
    return this.clone({ isPrimary: true, hasDefault: true })
  }

  optional(): FieldBuilder<T | null> {
    return this.clone<T | null>({ isOptional: true })
  }

  unique(): FieldBuilder<T> {
    return this.clone({ isUnique: true })
  }

  index(): FieldBuilder<T> {
    return this.clone({ isIndexed: true })
  }

  default(value: unknown): FieldBuilder<T> {
    return this.clone({ hasDefault: true, defaultValue: value })
  }

  onUpdate(value: unknown): FieldBuilder<T> {
    return this.clone({ onUpdateValue: value })
  }

  min(n: number): FieldBuilder<T> {
    return this.clone({ minValue: n })
  }

  max(n: number): FieldBuilder<T> {
    return this.clone({ maxValue: n })
  }

  references(table: string, column: string): FieldBuilder<T> {
    return this.clone({ referenceTable: table, referenceColumn: column })
  }

  check(expression: string): FieldBuilder<T> {
    return this.clone({ checkExpression: expression })
  }
}

// ─── Field Factory ──────────────────────────────────────────────────

export const field = {
  /** Variable-length text */
  text: () => new FieldBuilder<string>('text'),

  /** Integer number */
  integer: () => new FieldBuilder<number>('integer'),

  /** Big integer */
  bigint: () => new FieldBuilder<number>('bigint'),

  /** Decimal/numeric */
  numeric: () => new FieldBuilder<number>('numeric'),

  /** Boolean */
  boolean: () => new FieldBuilder<boolean>('boolean'),

  /** UUID v4 */
  uuid: () => new FieldBuilder<string>('uuid'),

  /** Timestamp with timezone */
  timestamp: () => new FieldBuilder<Date>('timestamptz'),

  /** Date only */
  date: () => new FieldBuilder<Date>('date'),

  /** JSON/JSONB */
  json: <T = unknown>() => new FieldBuilder<T>('jsonb'),

  /** Enum — stored as text with CHECK constraint */
  enum: <const T extends readonly string[]>(values: T): FieldBuilder<T[number]> => {
    return new FieldBuilder<T[number]>('text', {
      enumValues: values,
      checkExpression: `IN (${values.map((v) => `'${v}'`).join(', ')})`,
    })
  },

  /** Text array */
  textArray: () => new FieldBuilder<string[]>('text[]'),

  /** Integer array */
  intArray: () => new FieldBuilder<number[]>('integer[]'),

  /** UUID array */
  uuidArray: () => new FieldBuilder<string[]>('uuid[]'),
} as const

export type { FieldBuilder }
