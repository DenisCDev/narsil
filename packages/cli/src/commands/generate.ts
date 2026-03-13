/**
 * CLI: generate command
 *
 * Generates code from model definitions:
 * - types.ts (TypeScript types)
 * - server.ts (compiled validators + procedures)
 * - client.ts (typed client SDK)
 * - routes.ts (pre-compiled route table)
 * - actions.ts (Server Actions)
 * - rls.sql (RLS policies)
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export async function execute(args: string[]): Promise<void> {
  const subcommand = args[0] // models, api, rls, or undefined (= all)
  const cwd = process.cwd()

  console.log('\n  NexusFlow — Generating code...\n')

  // Load config
  const configPath = join(cwd, 'nexusflow.config.ts')
  if (!existsSync(configPath)) {
    console.error('  Error: nexusflow.config.ts not found. Run "npx nexusflow init" first.')
    process.exit(1)
  }

  // For now, use default paths
  const modelsDir = join(cwd, 'src', 'models')
  const outputDir = join(cwd, '.nexusflow', 'generated')

  // Ensure output directory
  mkdirSync(outputDir, { recursive: true })

  if (!subcommand || subcommand === 'api' || subcommand === 'all') {
    // Scan models directory
    if (!existsSync(modelsDir)) {
      console.error('  Error: src/models/ not found. Create model files first.')
      process.exit(1)
    }

    const modelFiles = readdirSync(modelsDir).filter((f: string) => f.endsWith('.ts'))
    console.log(`  Found ${modelFiles.length} model file(s)`)

    // Generate types
    generateTypes(modelFiles, modelsDir, outputDir)
    console.log('  Generated types.ts')

    // Generate client SDK
    generateClient(modelFiles, outputDir)
    console.log('  Generated client.ts')

    // Generate server actions
    generateActions(modelFiles, outputDir)
    console.log('  Generated actions.ts')
  }

  if (subcommand === 'rls') {
    generateRLS(outputDir)
    console.log('  Generated rls.sql')
  }

  if (subcommand === 'models') {
    console.log('  To generate models from database, use: npx nexusflow connect supabase')
  }

  console.log('\n  Done!\n')
}

function generateTypes(modelFiles: string[], _modelsDir: string, outputDir: string): void {
  // Generate a barrel file that re-exports types from all models
  const imports = modelFiles.map(f => {
    void f
    return `export type { InferModel, InferInsert, InferUpdate } from '@nexusflow/core'`
  })

  const reExports = modelFiles.map(f => {
    const name = f.replace('.ts', '')
    const relativePath = `../../src/models/${name}`
    return `export { ${name} } from '${relativePath}.js'`
  })

  const content = `/**
 * NexusFlow Generated Types
 * DO NOT EDIT — regenerate with: npx nexusflow generate
 */

${imports[0] ?? ''}
${reExports.join('\n')}
`

  writeFileSync(join(outputDir, 'types.ts'), content)
}

function generateClient(modelFiles: string[], outputDir: string): void {
  const models = modelFiles.map(f => f.replace('.ts', ''))

  const clientExports = models.map(m => `
  ${m}: {
    list: (params?: Record<string, unknown>) => nexusFetch('GET', '/${m}', params),
    get: (id: string) => nexusFetch('GET', '/${m}/' + id),
    create: (data: unknown) => nexusFetch('POST', '/${m}', data),
    update: (id: string, data: unknown) => nexusFetch('PATCH', '/${m}/' + id, data),
    delete: (id: string) => nexusFetch('DELETE', '/${m}/' + id),
  }`).join(',\n')

  const content = `/**
 * NexusFlow Generated Client SDK
 * DO NOT EDIT — regenerate with: npx nexusflow generate
 */

import { nexusFetch } from '@nexusflow/client'

export const api = {${clientExports}
}
`

  writeFileSync(join(outputDir, 'client.ts'), content)
}

function generateActions(modelFiles: string[], outputDir: string): void {
  const models = modelFiles.map(f => f.replace('.ts', ''))

  const actionExports = models.map(m => `
export async function create${capitalize(m)}(data: unknown) {
  const api = await createCaller()
  return (api as any).${m}.create({ data })
}

export async function update${capitalize(m)}(id: string, data: unknown) {
  const api = await createCaller()
  return (api as any).${m}.update({ where: { id }, data })
}

export async function delete${capitalize(m)}(id: string) {
  const api = await createCaller()
  return (api as any).${m}.delete({ where: { id } })
}
`).join('\n')

  const content = `/**
 * NexusFlow Generated Server Actions
 * DO NOT EDIT — regenerate with: npx nexusflow generate
 */

'use server'

import { createCaller } from '../../src/nexusflow/caller.js'

${actionExports}
`

  writeFileSync(join(outputDir, 'actions.ts'), content)
}

function generateRLS(outputDir: string): void {
  // This would import and analyze model definitions to generate RLS SQL
  // For the initial implementation, generate a placeholder
  const content = `-- NexusFlow Generated RLS Policies
-- Run: npx nexusflow db push to apply
-- Regenerate with: npx nexusflow generate rls

-- Import your models and run the RLS generator to populate this file.
-- See @nexusflow/core generateRLSSQL() for programmatic usage.
`

  writeFileSync(join(outputDir, 'rls.sql'), content)
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
