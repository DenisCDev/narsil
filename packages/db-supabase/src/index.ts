/**
 * @nexusflow/db-supabase
 *
 * Deep Supabase adapter: queries, auth, realtime, RLS generation.
 */

export { SupabaseAdapter, createSupabaseAdapter } from './adapter.js'
export type { SupabaseAdapterConfig } from './adapter.js'

export { toNexusUser, getUser } from './auth.js'

export {
  INTROSPECT_TABLES_SQL,
  generateModelCode,
} from './introspect.js'
export type { IntrospectedColumn, IntrospectedTable } from './introspect.js'
