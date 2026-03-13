/**
 * @nexusflow/core
 *
 * Core definitions: models, fields, types, permissions, procedures.
 * This package has ZERO runtime dependencies.
 */

// Model definition
export { defineModel, defineConfig, getModels, getModel } from './model.js'
export type { ModelOptions } from './model.js'

// Field builders
export { field } from './field.js'
export type { FieldBuilder } from './field.js'

// Relation builders
export { relation } from './relation.js'

// Procedure builder
export { defineProcedure } from './procedure.js'

// Permissions
export { checkPermission, generateRLSPolicies, generateRLSSQL } from './permissions.js'
export type { RLSPolicy } from './permissions.js'

// Errors
export {
  NexusError,
  NexusValidationError,
  NexusNotFoundError,
  NexusAuthError,
  NexusForbiddenError,
  NexusDatabaseError,
} from './errors.js'

// Types — re-export everything for consumers
export type {
  FieldDescriptor,
  FieldSqlType,
  FieldsMap,
  RelationType,
  RelationDescriptor,
  PermissionPreset,
  PermissionRule,
  CacheConfig,
  HookContext,
  ModelHooks,
  ProcedureDefinition,
  ModelDefinition,
  InferModel,
  InferInsert,
  InferUpdate,
  InferWhere,
  InferOrderBy,
  QueryOptions,
  WhereOperator,
  FindManyQuery,
  FindOneQuery,
  WhereClause,
  TransactionClient,
  RealtimeEvent,
  SubscriptionFilter,
  Unsubscribe,
  DatabaseAdapter,
  NexusUser,
  NexusContext,
  NexusMiddleware,
  NexusPlugin,
  NexusConfig,
  GenerateContext,
  CliCommand,
} from './types.js'
