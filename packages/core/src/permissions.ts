/**
 * NexusFlow Permission System
 *
 * Declarative permission presets that map to:
 * 1. Runtime middleware checks (all adapters)
 * 2. RLS policy SQL generation (Supabase)
 */

import type { NexusContext, PermissionPreset, PermissionRule, ModelDefinition } from './types.js'
import { NexusAuthError, NexusForbiddenError } from './errors.js'

// ─── Permission Resolver ────────────────────────────────────────────

type PermissionCheckContext = {
  ctx: NexusContext
  record?: Record<string, unknown>
  model: ModelDefinition
}

/**
 * Resolves a permission rule to a boolean.
 * Used at runtime in the middleware pipeline.
 */
export async function checkPermission(
  rule: PermissionRule,
  context: PermissionCheckContext
): Promise<void> {
  const { ctx, record, model } = context

  if (typeof rule === 'function') {
    const allowed = await rule({ ctx, input: undefined, record })
    if (!allowed) throw new NexusForbiddenError()
    return
  }

  const rules = Array.isArray(rule) ? rule : [rule]

  for (const preset of rules) {
    if (await checkPreset(preset, ctx, record, model)) return
  }

  throw new NexusForbiddenError()
}

async function checkPreset(
  preset: PermissionPreset,
  ctx: NexusContext,
  record: Record<string, unknown> | undefined,
  model: ModelDefinition
): Promise<boolean> {
  switch (preset) {
    case 'public':
      return true

    case 'authenticated':
      if (!ctx.user) throw new NexusAuthError()
      return true

    case 'owner': {
      if (!ctx.user) throw new NexusAuthError()
      const ownerField = model.ownerField ?? findOwnerField(model)
      if (!ownerField) {
        throw new NexusForbiddenError('No owner field configured')
      }
      return record?.[ownerField] === ctx.user.id
    }

    case 'admin': {
      if (!ctx.user) throw new NexusAuthError()
      return ctx.user.role === 'admin'
    }

    default:
      return false
  }
}

/**
 * Auto-detect the owner field by looking for a FK to 'profiles' or 'users'.
 */
function findOwnerField(model: ModelDefinition): string | undefined {
  for (const [key, field] of Object.entries(model.fields)) {
    if (
      field.referenceTable === 'profiles' ||
      field.referenceTable === 'users'
    ) {
      return key
    }
  }
  // Convention: look for user_id, userId, author_id, authorId
  const candidates = ['user_id', 'userId', 'author_id', 'authorId']
  for (const candidate of candidates) {
    if (candidate in model.fields) return candidate
  }
  return undefined
}

// ─── RLS SQL Generation ─────────────────────────────────────────────

export interface RLSPolicy {
  name: string
  table: string
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'
  using?: string
  withCheck?: string
}

/**
 * Generate RLS policy SQL from model permission definitions.
 */
export function generateRLSPolicies(model: ModelDefinition): RLSPolicy[] {
  const policies: RLSPolicy[] = []
  const table = model.table
  const ownerField = model.ownerField ?? findOwnerField(model)

  const operationMap: Record<string, 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'> = {
    list: 'SELECT',
    get: 'SELECT',
    create: 'INSERT',
    update: 'UPDATE',
    delete: 'DELETE',
  }

  if (!model.permissions) return policies

  // Deduplicate: list and get both map to SELECT
  const processed = new Set<string>()

  for (const [action, rule] of Object.entries(model.permissions)) {
    if (!rule) continue
    const operation = operationMap[action]
    if (!operation || processed.has(operation)) continue
    processed.add(operation)

    const policyName = `nexusflow_${table}_${operation.toLowerCase()}`

    if (typeof rule === 'function') {
      // Custom functions can't be translated to RLS — skip with comment
      continue
    }

    const rules = Array.isArray(rule) ? rule : [rule]
    const conditions = rules
      .map((r) => presetToSQL(r, ownerField))
      .filter(Boolean)

    if (conditions.length === 0) continue

    const combined = conditions.length === 1
      ? conditions[0]!
      : `(${conditions.join(' OR ')})`

    if (operation === 'INSERT') {
      policies.push({ name: policyName, table, operation, withCheck: combined })
    } else {
      policies.push({ name: policyName, table, operation, using: combined })
    }
  }

  return policies
}

function presetToSQL(preset: PermissionPreset, ownerField?: string): string | null {
  switch (preset) {
    case 'public':
      return 'true'
    case 'authenticated':
      return "auth.role() = 'authenticated'"
    case 'owner':
      if (!ownerField) return null
      // Convert camelCase to snake_case for SQL
      const snakeField = ownerField.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
      return `auth.uid() = ${snakeField}`
    case 'admin':
      return `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')`
    default:
      return null
  }
}

/**
 * Generate complete RLS SQL file for a model.
 */
export function generateRLSSQL(model: ModelDefinition): string {
  const policies = generateRLSPolicies(model)
  if (policies.length === 0) return ''

  const lines: string[] = [
    `-- Generated by NexusFlow from model: ${model.name}`,
    `-- DO NOT EDIT MANUALLY — regenerate with: npx nexusflow generate rls`,
    '',
    `ALTER TABLE ${model.table} ENABLE ROW LEVEL SECURITY;`,
    '',
  ]

  // Drop existing nexusflow policies first
  for (const policy of policies) {
    lines.push(`DROP POLICY IF EXISTS "${policy.name}" ON ${policy.table};`)
  }
  lines.push('')

  for (const policy of policies) {
    if (policy.using) {
      lines.push(
        `CREATE POLICY "${policy.name}" ON ${policy.table}`,
        `  FOR ${policy.operation} USING (${policy.using});`,
        ''
      )
    } else if (policy.withCheck) {
      lines.push(
        `CREATE POLICY "${policy.name}" ON ${policy.table}`,
        `  FOR ${policy.operation} WITH CHECK (${policy.withCheck});`,
        ''
      )
    }
  }

  return lines.join('\n')
}
