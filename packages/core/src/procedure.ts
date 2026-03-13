/**
 * NexusFlow Procedure Builder
 *
 * Fluent API for defining custom procedures beyond auto-CRUD.
 * Procedures are type-safe query/mutation handlers.
 */

import type { ProcedureDefinition, NexusContext } from './types.js'

// ─── Builder ────────────────────────────────────────────────────────

class ProcedureBuilder<TInput = void, TOutput = unknown> {
  private _type: 'query' | 'mutation' = 'query'
  private _inputSchema?: (z: any) => any
  /** @internal Type brand for TOutput inference */
  readonly _output?: TOutput

  /**
   * Define the input schema using a Zod-like builder callback.
   * The callback receives a schema builder (z) and returns a schema.
   */
  input<TNewInput>(schema: (z: any) => any): ProcedureBuilder<TNewInput, TOutput> {
    const builder = new ProcedureBuilder<TNewInput, TOutput>()
    builder._type = this._type
    builder._inputSchema = schema
    return builder
  }

  /**
   * Define this procedure as a query (GET, idempotent).
   */
  query<TResult>(
    handler: (ctx: { input: TInput; ctx: NexusContext }) => Promise<TResult>
  ): ProcedureDefinition<TInput, TResult> {
    return {
      type: 'query',
      inputSchema: this._inputSchema,
      handler: handler as any,
    }
  }

  /**
   * Define this procedure as a mutation (POST, side effects).
   */
  mutation<TResult>(
    handler: (ctx: { input: TInput; ctx: NexusContext }) => Promise<TResult>
  ): ProcedureDefinition<TInput, TResult> {
    return {
      type: 'mutation',
      inputSchema: this._inputSchema,
      handler: handler as any,
    }
  }
}

/**
 * Create a new procedure builder.
 *
 * @example
 * ```ts
 * const archive = defineProcedure()
 *   .input(z => z.object({ id: z.string().uuid() }))
 *   .mutation(async ({ input, ctx }) => {
 *     return ctx.db.posts.update({ where: { id: input.id }, data: { archived: true } })
 *   })
 * ```
 */
export function defineProcedure(): ProcedureBuilder {
  return new ProcedureBuilder()
}
