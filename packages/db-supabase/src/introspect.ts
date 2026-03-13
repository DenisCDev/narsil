/**
 * Supabase Schema Introspection
 *
 * Reads the database schema via information_schema and generates
 * NexusFlow model definitions.
 */

import type { FieldSqlType } from '@nexusflow/core'

// ─── Types ──────────────────────────────────────────────────────────

export interface IntrospectedColumn {
  name: string
  type: string
  isNullable: boolean
  hasDefault: boolean
  defaultValue: string | null
  isPrimary: boolean
  isUnique: boolean
  maxLength: number | null
  references: { table: string; column: string } | null
}

export interface IntrospectedTable {
  name: string
  columns: IntrospectedColumn[]
  hasRLS: boolean
}

// ─── SQL Type Mapping ───────────────────────────────────────────────

function mapSqlType(pgType: string): FieldSqlType {
  const typeMap: Record<string, FieldSqlType> = {
    'uuid': 'uuid',
    'text': 'text',
    'character varying': 'text',
    'varchar': 'text',
    'integer': 'integer',
    'int4': 'integer',
    'bigint': 'bigint',
    'int8': 'bigint',
    'numeric': 'numeric',
    'decimal': 'numeric',
    'boolean': 'boolean',
    'bool': 'boolean',
    'timestamp with time zone': 'timestamptz',
    'timestamptz': 'timestamptz',
    'timestamp without time zone': 'timestamptz',
    'date': 'date',
    'jsonb': 'jsonb',
    'json': 'jsonb',
    'ARRAY': 'text[]',
  }

  // Handle array types
  if (pgType.endsWith('[]')) {
    const baseType = pgType.slice(0, -2)
    if (baseType === 'text' || baseType === 'character varying') return 'text[]'
    if (baseType === 'integer' || baseType === 'int4') return 'integer[]'
    if (baseType === 'uuid') return 'uuid[]'
    return 'text[]'
  }

  return typeMap[pgType] ?? 'text'
}

// ─── Field Builder Code Generation ──────────────────────────────────

function mapToFieldBuilder(col: IntrospectedColumn): string {
  const fieldType = mapSqlType(col.type)

  const typeToBuilder: Record<string, string> = {
    'uuid': 'field.uuid()',
    'text': 'field.text()',
    'integer': 'field.integer()',
    'bigint': 'field.bigint()',
    'numeric': 'field.numeric()',
    'boolean': 'field.boolean()',
    'timestamptz': 'field.timestamp()',
    'date': 'field.date()',
    'jsonb': 'field.json()',
    'text[]': 'field.textArray()',
    'integer[]': 'field.intArray()',
    'uuid[]': 'field.uuidArray()',
  }

  let builder = typeToBuilder[fieldType] ?? 'field.text()'

  if (col.isPrimary) builder += '.primaryKey()'
  if (col.isUnique && !col.isPrimary) builder += '.unique()'
  if (col.isNullable) builder += '.optional()'
  if (col.hasDefault && col.defaultValue) {
    builder += `.default('${col.defaultValue.replace(/'/g, "\\'")}')`
  }
  if (col.references) {
    builder += `.references('${col.references.table}', '${col.references.column}')`
  }
  if (col.maxLength && col.maxLength > 0) {
    builder += `.max(${col.maxLength})`
  }

  return builder
}

// ─── Introspection Queries ──────────────────────────────────────────

/**
 * SQL query to get all tables with their columns and metadata.
 * Designed to run via Supabase's rpc() or raw SQL.
 */
export const INTROSPECT_TABLES_SQL = `
SELECT
  t.table_name,
  c.column_name,
  c.udt_name as data_type,
  c.is_nullable = 'YES' as is_nullable,
  c.column_default IS NOT NULL as has_default,
  c.column_default,
  c.character_maximum_length,
  EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = t.table_name
    AND kcu.column_name = c.column_name
    AND tc.constraint_type = 'PRIMARY KEY'
  ) as is_primary,
  EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = t.table_name
    AND kcu.column_name = c.column_name
    AND tc.constraint_type = 'UNIQUE'
  ) as is_unique,
  ccu.table_name as ref_table,
  ccu.column_name as ref_column
FROM information_schema.tables t
JOIN information_schema.columns c
  ON c.table_name = t.table_name AND c.table_schema = t.table_schema
LEFT JOIN information_schema.key_column_usage kcu
  ON kcu.table_name = t.table_name AND kcu.column_name = c.column_name
  AND kcu.table_schema = t.table_schema
LEFT JOIN information_schema.table_constraints tc
  ON tc.constraint_name = kcu.constraint_name AND tc.constraint_type = 'FOREIGN KEY'
LEFT JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name, c.ordinal_position;
`

/**
 * Generate a model definition file from introspected table data.
 */
export function generateModelCode(table: IntrospectedTable): string {
  const modelName = table.name
  const fieldLines = table.columns.map((col) => {
    const camelName = snakeToCamel(col.name)
    return `    ${camelName}: ${mapToFieldBuilder(col)},`
  })

  // Detect relations
  const relations = table.columns
    .filter((col) => col.references)
    .map((col) => {
      const camelName = snakeToCamel(col.name).replace(/Id$/, '')
      return `    ${camelName}: relation.belongsTo('${col.references!.table}', '${snakeToCamel(col.name)}'),`
    })

  // Detect owner field
  const ownerCol = table.columns.find(
    (col) => col.references && (col.references.table === 'profiles' || col.references.table === 'users')
  )

  let code = `import { defineModel, field${relations.length > 0 ? ', relation' : ''} } from '@nexusflow/core'\n\n`
  code += `export const ${modelName} = defineModel('${modelName}', {\n`
  code += `  fields: {\n${fieldLines.join('\n')}\n  },\n`

  if (relations.length > 0) {
    code += `\n  relations: {\n${relations.join('\n')}\n  },\n`
  }

  code += `\n  permissions: {\n`
  code += `    list: 'authenticated',\n`
  code += `    get: 'authenticated',\n`
  code += `    create: 'authenticated',\n`
  code += `    update: ${ownerCol ? "'owner'" : "'authenticated'"},\n`
  code += `    delete: ${ownerCol ? "'owner'" : "'admin'"},\n`
  code += `  },\n`

  if (ownerCol) {
    code += `\n  ownerField: '${snakeToCamel(ownerCol.name)}',\n`
  }

  code += `})\n`

  return code
}

// ─── Helpers ────────────────────────────────────────────────────────

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}
