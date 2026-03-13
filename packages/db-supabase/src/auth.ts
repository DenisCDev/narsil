/**
 * Supabase Auth Integration
 *
 * Utilities for extracting user information from Supabase auth.
 */

import type { NexusUser } from '@nexusflow/core'

/**
 * Extract NexusUser from a Supabase auth user object.
 */
export function toNexusUser(supabaseUser: any): NexusUser | null {
  if (!supabaseUser) return null

  return {
    id: supabaseUser.id,
    email: supabaseUser.email,
    role: supabaseUser.app_metadata?.role ?? supabaseUser.role ?? 'authenticated',
    ...supabaseUser.user_metadata,
  }
}

/**
 * Get the current user from a Supabase client.
 */
export async function getUser(client: any): Promise<NexusUser | null> {
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) return null
  return toNexusUser(user)
}
