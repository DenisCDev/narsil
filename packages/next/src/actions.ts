/**
 * NexusFlow Server Actions Generator Runtime
 *
 * Provides utilities for creating type-safe Server Actions
 * that wrap NexusFlow procedures.
 *
 * The CLI generates the actual action functions — this module
 * provides the runtime support.
 */

import { createCaller, type CallerConfig } from './caller.js'

/**
 * Create a Server Action wrapper for a model operation.
 * Used by the code generator.
 *
 * @example Generated code:
 * ```ts
 * 'use server'
 * import { createAction } from '@nexusflow/next'
 *
 * export const createPost = createAction('posts', 'create')
 * export const updatePost = createAction('posts', 'update')
 * ```
 */
export function createAction(
  modelName: string,
  operation: string,
  config?: CallerConfig
) {
  return async (input: unknown): Promise<unknown> => {
    const api = await createCaller(config)
    const model = (api as Record<string, any>)[modelName]
    if (!model) throw new Error(`Model "${modelName}" not found`)

    const op = model[operation]
    if (!op) throw new Error(`Operation "${operation}" not found on model "${modelName}"`)

    return op(input)
  }
}

/**
 * Create all CRUD actions for a model at once.
 */
export function createModelActions(modelName: string, config?: CallerConfig) {
  return {
    list: createAction(modelName, 'list', config),
    get: createAction(modelName, 'get', config),
    create: createAction(modelName, 'create', config),
    update: createAction(modelName, 'update', config),
    delete: createAction(modelName, 'delete', config),
  }
}
