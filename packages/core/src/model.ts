/**
 * NexusFlow Model Definition
 *
 * The central API of the framework. defineModel() declares a data model
 * that drives:
 * - TypeScript type generation
 * - CRUD endpoint generation
 * - Client SDK generation
 * - RLS policy generation
 * - Database migration generation
 */

import type { FieldsMap, ModelDefinition, RelationDescriptor, PermissionRule, CacheConfig, ModelHooks, ProcedureDefinition } from './types.js'

// ─── Model Registry ─────────────────────────────────────────────────

const modelRegistry = new Map<string, ModelDefinition>()

/**
 * Get all registered models.
 */
export function getModels(): ModelDefinition[] {
  return Array.from(modelRegistry.values())
}

/**
 * Get a model by name.
 */
export function getModel(name: string): ModelDefinition | undefined {
  return modelRegistry.get(name)
}

// ─── defineModel ────────────────────────────────────────────────────

export interface ModelOptions<TFields extends FieldsMap> {
  /** SQL table name. Defaults to the model name. */
  table?: string

  /** Field definitions */
  fields: TFields

  /** Relation definitions */
  relations?: Record<string, RelationDescriptor>

  /** Which CRUD endpoints to generate */
  api?: {
    list?: boolean
    get?: boolean
    create?: boolean
    update?: boolean
    delete?: boolean
  }

  /** Permission rules per operation */
  permissions?: {
    list?: PermissionRule
    get?: PermissionRule
    create?: PermissionRule
    update?: PermissionRule
    delete?: PermissionRule
    [key: string]: PermissionRule | undefined
  }

  /** Cache configuration per operation */
  cache?: {
    list?: CacheConfig
    get?: CacheConfig
  }

  /** Lifecycle hooks */
  hooks?: ModelHooks<TFields>

  /** Custom procedures beyond CRUD */
  procedures?: Record<string, ProcedureDefinition>

  /** Field that identifies the owner (for 'owner' permission preset) */
  ownerField?: string
}

/**
 * Define a data model. This is the central API of NexusFlow.
 *
 * @example
 * ```ts
 * import { defineModel, field, relation } from '@nexusflow/core'
 *
 * export const posts = defineModel('posts', {
 *   fields: {
 *     id:        field.uuid().primaryKey().default('gen_random_uuid()'),
 *     title:     field.text().min(1).max(200),
 *     content:   field.text().optional(),
 *     authorId:  field.uuid().references('profiles', 'id'),
 *     createdAt: field.timestamp().default('now()'),
 *   },
 *   permissions: {
 *     list: 'authenticated',
 *     create: 'authenticated',
 *     update: 'owner',
 *     delete: 'owner',
 *   },
 * })
 * ```
 */
export function defineModel<TFields extends FieldsMap>(
  name: string,
  options: ModelOptions<TFields>
): ModelDefinition<TFields> {
  const model: ModelDefinition<TFields> = {
    name,
    table: options.table ?? name,
    fields: options.fields,
    relations: options.relations,
    api: options.api ?? { list: true, get: true, create: true, update: true, delete: true },
    permissions: options.permissions,
    cache: options.cache,
    hooks: options.hooks,
    procedures: options.procedures,
    ownerField: options.ownerField,
  }

  modelRegistry.set(name, model as ModelDefinition)
  return model
}

/**
 * Define framework configuration.
 */
export function defineConfig(config: import('./types.js').NexusConfig): import('./types.js').NexusConfig {
  return config
}
