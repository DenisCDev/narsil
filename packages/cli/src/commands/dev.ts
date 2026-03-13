/**
 * CLI: dev command
 *
 * Watch mode — regenerates code when model files change.
 */

import { watch } from 'node:fs'
import { join } from 'node:path'

export async function execute(_args: string[]): Promise<void> {
  const cwd = process.cwd()
  const modelsDir = join(cwd, 'src', 'models')

  console.log('\n  NexusFlow — Dev mode (watching for changes)...\n')
  console.log(`  Watching: ${modelsDir}`)
  console.log('  Press Ctrl+C to stop.\n')

  // Run initial generation
  const { execute: generate } = await import('./generate.js')
  await generate([])

  // Watch for changes
  try {
    const watcher = watch(modelsDir, { recursive: true }, async (_eventType: string, filename: string | null) => {
      if (!filename?.endsWith('.ts')) return
      console.log(`\n  File changed: ${filename}`)
      await generate([])
    })

    // Keep process alive
    await new Promise<void>((resolve) => {
      process.on('SIGINT', () => {
        watcher.close()
        console.log('\n  NexusFlow — Dev mode stopped.\n')
        resolve()
      })
    })
  } catch {
    console.log('  Warning: File watching not available. Run "npx nexusflow generate" manually.')
  }
}
