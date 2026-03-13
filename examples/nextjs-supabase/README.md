# NexusFlow + Next.js + Supabase Example

This example demonstrates how NexusFlow replaces dozens of API route files
with a single model definition and auto-generated endpoints.

## What NexusFlow gives you

- **1 file** (`src/models/posts.ts`) replaces 5+ API route files
- **Auto-generated** REST endpoints, client SDK, Server Actions, and RLS policies
- **Zero HTTP overhead** in React Server Components via `createCaller()`
- **Type-safe** from database to UI — no manual type definitions

## Setup

```bash
npm install
# Set your Supabase credentials in .env.local
npm run dev
```

## Architecture

```
src/
  models/
    posts.ts              ← Define your data model (THE source of truth)
    comments.ts           ← Another model
  app/
    api/[...nexusflow]/
      route.ts            ← ONE file handles ALL endpoints
    posts/
      page.tsx            ← RSC with zero-HTTP data fetching
  components/
    PostList.tsx           ← Client component with hooks
  nexusflow/
    caller.ts             ← RSC caller config
```
