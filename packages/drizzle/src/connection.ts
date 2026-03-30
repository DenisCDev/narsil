/**
 * Drizzle Connection Factory
 *
 * Creates a Drizzle database instance from a connection URL.
 * Optimized for Supabase Supavisor (prepare: false).
 */

export interface ConnectionOptions {
  /** PostgreSQL connection URL */
  url: string;
  /** Max connections in pool (default: 10) */
  poolSize?: number;
  /** Prepare statements (default: false for Supabase compatibility) */
  prepare?: boolean;
}

/**
 * Create a Drizzle database instance.
 *
 * Usage:
 * ```ts
 * import { createDb } from '@narsil/drizzle'
 * const db = await createDb({ url: process.env.DATABASE_URL! })
 * ```
 *
 * Requires peer dependencies: drizzle-orm, postgres
 */
export async function createDb(options: ConnectionOptions) {
  // Dynamic imports for tree-shaking

  const postgresModule = await (Function('return import("postgres")')() as Promise<{ default: any }>);

  const drizzleModule = await (Function('return import("drizzle-orm/postgres-js")')() as Promise<{ drizzle: any }>);

  const postgres = postgresModule.default;
  const { drizzle } = drizzleModule;

  const client = postgres(options.url, {
    max: options.poolSize ?? 10,
    prepare: options.prepare ?? false, // CRITICAL: false for Supabase Supavisor
  });

  return drizzle(client);
}
