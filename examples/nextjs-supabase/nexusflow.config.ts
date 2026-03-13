import { defineConfig } from '@nexusflow/core'

export default defineConfig({
  modelsDir: './src/models',
  outputDir: './.nexusflow/generated',

  database: {
    adapter: 'supabase',
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },

  next: {
    apiPrefix: '/api',
    generateActions: true,
    generateClient: true,
  },

  realtime: {
    enabled: true,
    adapter: 'supabase',
  },
})
