/**
 * NexusFlow Core Type System
 *
 * Type inference engine that derives TypeScript types from model definitions
 * at compile time — zero runtime cost.
 */

// ─── Field Type Mapping ─────────────────────────────────────────────

export type FieldSqlType =
  | 'text'
  | 'integer'
  | 'bigint'
  | 'numeric'
  | 'boolean'
  | 'uuid'
  | 'timestamptz'
  | 'date'
  | 'jsonb'
  | 'text[]'
  | 'integer[]'
  | 'uuid[]'

export type SqlTypeToTs = {
  text: string
  integer: number
  bigint: number
  numeric: number
  boolean: boolean
  uuid: string
  timestamptz: Date
  date: Date
  jsonb: unknown
  'text[]': string[]
  'integer[]': number[]
  'uuid[]': string[]
}

// ─── Field Descriptor (compile-time metadata) ───────────────────────

export interface FieldDescriptor<T = unknown> {
  readonly _type: T
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
}

// ─── Model Definition ───────────────────────────────────────────────

export type FieldsMap = Record<string, FieldDescriptor<any>>

export type RelationType = 'belongsTo' | 'hasMany' | 'hasOne' | 'manyToMany'

export interface RelationDescriptor {
  type: RelationType
  target: string
  foreignKey: string
  through?: string // for manyToMany
}

export type PermissionPreset =
  | 'public'
  | 'authenticated'
  | 'owner'
  | 'admin'

export type PermissionRule<TContext = any> =
  | PermissionPreset
  | PermissionPreset[]
  | ((ctx: { ctx: TContext; input?: unknown; record?: unknown }) => boolean | Promise<boolean>)

export interface CacheConfig {
  ttl: number
  tags?: string[]
}

export interface HookContext<TData = any, TContext = any> {
  data: TData
  ctx: TContext
}

export interface ModelHooks<TFields extends FieldsMap = FieldsMap, TContext = any> {
  beforeCreate?: (ctx: HookContext<InferInsert<TFields>, TContext>) => InferInsert<TFields> | Promise<InferInsert<TFields>>
  afterCreate?: (ctx: HookContext<InferModel<TFields>, TContext>) => void | Promise<void>
  beforeUpdate?: (ctx: HookContext<Partial<InferModel<TFields>>, TContext>) => Partial<InferModel<TFields>> | Promise<Partial<InferModel<TFields>>>
  afterUpdate?: (ctx: HookContext<InferModel<TFields>, TContext>) => void | Promise<void>
  beforeDelete?: (ctx: { id: string; ctx: TContext }) => void | Promise<void>
  afterDelete?: (ctx: { id: string; ctx: TContext }) => void | Promise<void>
}

export interface ProcedureDefinition<TInput = any, TOutput = any> {
  type: 'query' | 'mutation'
  inputSchema?: (z: any) => any
  handler: (ctx: { input: TInput; ctx: any }) => Promise<TOutput>
}

export interface ModelDefinition<TFields extends FieldsMap = FieldsMap> {
  name: string
  table: string
  fields: TFields
  relations?: Record<string, RelationDescriptor>
  api?: {
    list?: boolean
    get?: boolean
    create?: boolean
    update?: boolean
    delete?: boolean
  }
  permissions?: {
    list?: PermissionRule
    get?: PermissionRule
    create?: PermissionRule
    update?: PermissionRule
    delete?: PermissionRule
    [key: string]: PermissionRule | undefined
  }
  cache?: {
    list?: CacheConfig
    get?: CacheConfig
  }
  hooks?: ModelHooks<TFields>
  procedures?: Record<string, ProcedureDefinition>
  ownerField?: string
}

// ─── Type Inference Utilities ───────────────────────────────────────

/**
 * Infer the full TypeScript type from a model's fields.
 * Maps each FieldDescriptor to its TypeScript type, respecting optional fields.
 */
export type InferModel<TFields extends FieldsMap> = {
  [K in keyof TFields as TFields[K]['isOptional'] extends true ? never : K]: TFields[K]['_type']
} & {
  [K in keyof TFields as TFields[K]['isOptional'] extends true ? K : never]?: TFields[K]['_type'] | null
}

/**
 * Infer the insert type — excludes fields with defaults (primary keys, timestamps).
 */
export type InferInsert<TFields extends FieldsMap> = {
  [K in keyof TFields as TFields[K]['hasDefault'] extends true
    ? never
    : TFields[K]['isOptional'] extends true
      ? never
      : K]: TFields[K]['_type']
} & {
  [K in keyof TFields as TFields[K]['hasDefault'] extends true
    ? K
    : TFields[K]['isOptional'] extends true
      ? K
      : never]?: TFields[K]['_type'] | null
}

/**
 * Infer the update type — all fields optional.
 */
export type InferUpdate<TFields extends FieldsMap> = {
  [K in keyof TFields]?: TFields[K]['_type']
}

/**
 * Where clause type — supports eq, neq, gt, lt, in, like, etc.
 */
export type WhereOperator<T> =
  | T
  | { eq: T }
  | { neq: T }
  | { gt: T }
  | { gte: T }
  | { lt: T }
  | { lte: T }
  | { in: T[] }
  | { like: string }
  | { ilike: string }
  | { isNull: boolean }

export type InferWhere<TFields extends FieldsMap> = {
  [K in keyof TFields]?: WhereOperator<TFields[K]['_type']>
}

/**
 * Order by type
 */
export type InferOrderBy<TFields extends FieldsMap> = {
  [K in keyof TFields]?: 'asc' | 'desc'
}

/**
 * Query options for list operations
 */
export interface QueryOptions<TFields extends FieldsMap> {
  where?: InferWhere<TFields>
  orderBy?: InferOrderBy<TFields>
  limit?: number
  offset?: number
  select?: (keyof TFields)[]
}

// ─── Database Adapter Interface ─────────────────────────────────────

export interface FindManyQuery {
  where?: Record<string, WhereOperator<unknown>>
  orderBy?: { column: string; asc: boolean }
  limit?: number
  offset?: number
  select?: string
  count?: boolean
}

export interface FindOneQuery {
  where: Record<string, WhereOperator<unknown>>
  select?: string
}

export type WhereClause = Record<string, WhereOperator<unknown>>

export interface TransactionClient {
  raw<T>(sql: string, params?: unknown[]): Promise<T[]>
}

export interface RealtimeEvent<T = unknown> {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  old: T | null
  new: T | null
}

export interface SubscriptionFilter {
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
  column?: string
  value?: unknown
}

export type Unsubscribe = () => void

export interface DatabaseAdapter {
  findMany<T>(table: string, query: FindManyQuery): Promise<T[]>
  findOne<T>(table: string, query: FindOneQuery): Promise<T | null>
  insert<T>(table: string, data: Record<string, unknown>): Promise<T>
  insertMany<T>(table: string, data: Record<string, unknown>[]): Promise<T[]>
  update<T>(table: string, where: WhereClause, data: Record<string, unknown>): Promise<T>
  delete(table: string, where: WhereClause): Promise<void>
  count(table: string, where?: WhereClause): Promise<number>
  transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T>
  raw<T>(sql: string, params?: unknown[]): Promise<T[]>
  connect(): Promise<void>
  disconnect(): Promise<void>
  subscribe?<T>(
    table: string,
    filter: SubscriptionFilter,
    callback: (event: RealtimeEvent<T>) => void
  ): Unsubscribe
}

// ─── Context ────────────────────────────────────────────────────────

export interface NexusUser {
  id: string
  email?: string
  role?: string
  [key: string]: unknown
}

export interface NexusContext {
  user: NexusUser | null
  db: DatabaseAdapter
  headers: Record<string, string>
  ip?: string
  [key: string]: unknown
}

// ─── Plugin System ──────────────────────────────────────────────────

export interface NexusMiddleware {
  name: string
  handler: (ctx: {
    ctx: NexusContext
    procedure?: { name: string; type: string; model?: string }
    next: () => Promise<unknown>
  }) => Promise<unknown>
}

export interface GenerateContext {
  models: ModelDefinition[]
  outputDir: string
}

export interface CliCommand {
  name: string
  description: string
  handler: (args: string[]) => Promise<void>
}

export interface NexusPlugin {
  name: string
  middleware?: NexusMiddleware[]
  procedures?: Record<string, ProcedureDefinition>
  extendContext?: (ctx: NexusContext) => Record<string, unknown>
  onGenerate?: (context: GenerateContext) => void | Promise<void>
  commands?: CliCommand[]
}

// ─── Config ─────────────────────────────────────────────────────────

export interface NexusConfig {
  modelsDir: string
  outputDir: string
  database: {
    adapter: 'supabase' | 'postgres' | 'firebase'
    url: string
    anonKey?: string
    serviceRoleKey?: string
  }
  next?: {
    apiPrefix?: string
    generateActions?: boolean
    generateClient?: boolean
  }
  realtime?: {
    enabled: boolean
    adapter?: 'supabase' | 'firebase' | 'sse'
  }
  plugins?: NexusPlugin[]
}
