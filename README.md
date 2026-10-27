<h1 align="center">Narsil</h1>

<p align="center"><b>English</b> · <a href="README.pt-BR.md">Português</a></p>

<p align="center">
  <b>A typed REST API derived from a Drizzle schema, without generated source files</b>
</p>

<p align="center">
  <img src="https://github.com/DenisCDev/narsil/actions/workflows/ci.yml/badge.svg" alt="CI">
  <img src="https://img.shields.io/badge/typescript-strict-43A48E?labelColor=171310" alt="TypeScript strict">
  <img src="https://img.shields.io/badge/monorepo-7%20packages-D4A24E?labelColor=171310" alt="monorepo with 7 packages">
  <img src="https://img.shields.io/badge/license-MIT-D4A24E?labelColor=171310" alt="MIT license">
</p>

<p align="center">
  <img src="assets/mtg-anduril.jpg" width="480" alt="Andúril, the reforged Narsil, blazing with runes along the blade. Art by Jason Rainville for Magic: The Gathering">
</p>

<p align="center">
  <sub><i>"Renewed shall be blade that was broken"</i><br>
  — <b>The Fellowship of the Ring</b>, book I, chapter X · art by Jason Rainville for Magic: The Gathering, Tales of Middle-earth Commander (2023)
</p>

Narsil reads a Drizzle table definition and exposes list, read, create, update
and delete operations under the URL structure used by Next.js route handlers.
The API runs in a separate TypeScript/Narsil or Axum service; a rewrite keeps browser
requests under `/api`. Types from the server are also available to the client
and React hooks, without writing route files or generating source code.

> **Status:** working monorepo, not yet published to npm. To try it, clone the
> repo, run `npm install && npm run build`, and start from `examples/`. The
> snippets below show the intended API surface.

## Features

- **CRUD from the schema** — A Drizzle definition provides `list`, `get`, `create`, `update` and `delete` endpoints
- **Type-safe client** — Full TypeScript inference from server to client via `typeof app`
- **React hooks** — `useQuery` and `useMutation` with SWR caching and optimistic updates
- **Auth built-in** — Declarative permissions (`public`, `authenticated`, `owner`, `admin`) + custom functions
- **Security defaults** — CORS, security headers, rate limiting and body size limits are enabled by default
- **Multiple runtimes** — Supports Node.js 18+, Vercel Edge, Cloudflare Workers, Bun and Deno
- **Optional Axum** — `narsil init --runtime axum` creates a long-lived Rust process. The TypeScript runtime remains the default and runs on Bun or Node.

## Quick Start

### 1. Define your schema (Drizzle)

```ts
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  role: text('role').default('user'),
  createdAt: timestamp('created_at').defaultNow(),
})
```

### 2. Create your app

```ts
import { createApp, defineModule } from 'narsil'
import { createDb } from '@narsil/drizzle'
import { users } from './schema'

const db = await createDb({ url: process.env.DATABASE_URL! })

const app = createApp({
  db,
  auth: async (token) => {
    const payload = await verifyToken(token)
    return payload ? { id: payload.sub, role: payload.role } : null
  },
})
  .module('users', defineModule({
    schema: users,
    permissions: {
      list: 'authenticated',
      get: 'authenticated',
      create: 'admin',
      update: 'owner',
      delete: 'admin',
    },
  }))

export type AppType = typeof app
export default app
```

### 3. Use the client SDK

```ts
import { createClient } from '@narsil/client-sdk'
import type { AppType } from './server'

const api = createClient<AppType>('http://localhost:3000/api', {
  getToken: () => localStorage.getItem('token'),
})

// Fully typed!
const users = await api.users.list()
const user = await api.users.get('uuid-here')
const created = await api.users.create({ name: 'John', email: 'john@example.com' })
```

### 4. React hooks

```tsx
import { useQuery, useMutation } from '@narsil/react'

function UserList() {
  const { data: users, isLoading } = useQuery(
    () => api.users.list(),
    { tags: ['users'] }
  )

  const { mutate: createUser } = useMutation(
    (data) => api.users.create(data),
    {
      invalidateTags: ['users'],
      onOptimistic: (cache, input) => {
        return cache.optimisticUpdate('users:list', (current) => [
          ...(current ?? []),
          { ...input, id: 'temp' },
        ])
      },
    }
  )

  if (isLoading) return <p>Loading...</p>

  return (
    <ul>
      {users?.map((user) => <li key={user.id}>{user.name}</li>)}
    </ul>
  )
}
```

## Packages

| Package | Description |
|---------|-------------|
| [`narsil`](./packages/narsil) | Core app factory, module system, permissions, hooks |
| [`@narsil/server`](./packages/server) | Router, middleware pipeline, adapters (Node/Vercel/Web Standard) |
| [`@narsil/drizzle`](./packages/drizzle) | Drizzle connection factory and auto-CRUD generator |
| [`@narsil/prisma`](./packages/prisma) | Prisma Client auto-CRUD — default Next.js full-stack analog |
| [`@narsil/client-sdk`](./packages/client-sdk) | Type-safe proxy-based API client |
| [`@narsil/react`](./packages/react) | React hooks (`useQuery`, `useMutation`) with SWR cache |
| [`@narsil/cache`](./packages/cache) | LRU cache for rate limiting and response caching |
| [`@narsil/cli`](./packages/cli) | CLI for `init`, `dev`, and `db` commands |
| [`narsil-axum`](./crates/narsil-axum) | Optional Axum runtime — same `/api` analog, not the default |

## Auth

Pass an `auth` function to `createApp`. It receives the Bearer token and should return a user object or `null`:

```ts
createApp({
  db,
  auth: async (token) => {
    const user = await verifyJWT(token)
    return user // { id, email, role, ... } or null
  },
})
```

Permissions are checked per-operation using presets or custom functions:

```ts
permissions: {
  list: 'public',                          // Anyone
  get: 'authenticated',                    // Valid token required
  create: 'admin',                         // role === 'admin'
  update: (ctx) => ctx.user?.id === ctx.params.id, // Custom logic
  delete: ['admin'],                       // Array = any match
}
```

## Analog of Next API routes

| Next.js file | Narsil |
|--------------|--------|
| `app/api/users/route.ts` `GET`/`POST` | `.module('users', defineModule({ schema: users }))` |
| `app/api/users/[id]/route.ts` `GET`/`PATCH`/`DELETE` | the same module, no extra file |

The frontend keeps calling `/api/users`. Next only rewrites:

```ts
// next.config.ts
export default {
  async rewrites() {
    return [{ source: '/api/:path*', destination: 'http://127.0.0.1:3001/api/:path*' }]
  },
}
```

That is the whole transform: same routes, other engine. Not a generated tree of `route.ts`.

A default Next full-stack app usually has **Prisma** (`lib/prisma.ts`), not Drizzle. Point `db` at the Prisma Client:

```ts
import { prisma } from './lib/prisma'
import { createApp, defineModule } from 'narsil'

createApp({ db: prisma }).module(
  'users',
  defineModule({
    prisma: 'user',
    permissions: {
      list: 'public',
      get: 'public',
      create: 'authenticated',
      update: 'owner',
      delete: 'owner',
    },
  }),
)
```

Drizzle stays available via `schema: usersTable` when that is what the app already uses.

## Performance — this is not a Next.js Route Handler

If you mount Narsil inside `app/api/[[...route]]/route.ts`, you are still inside Next's Function. That path **cannot** be many times faster than the standard Next API: same runtime, same cold start, same pipeline.

The product goal is a **separate HTTP server**. Narsil's default runtime is
TypeScript: `app.start()` uses `Bun.serve` when the process is Bun and Node's
HTTP server otherwise. Next stays the UI and calls this API, so requests do not
pass through Next's router.

```bash
npx narsil init                 # TypeScript — default, Bun or Node
npx narsil init --runtime axum  # Axum — same /api URLs, Fly/VPS/Docker
```

Axum is an option, not a replacement. The rewrite in `next.config.ts` is identical. The TypeScript client keeps calling `/api/users`; with Axum, import `AppType` from `backend/narsil-contract.ts` because there is no `typeof app` from Rust.

Because `app.fetch` follows the Web Standard request/response contract, it can
also be mounted in Elysia when that framework is installed:

```ts
import { Elysia } from 'elysia'
import app from './narsil'

new Elysia()
  .all('*', ({ request }) => app.fetch(request))
  .listen(3001)
```

On Vercel, give the API its own project (not the Next app) and:

```json
{ "bunVersion": "1.x" }
```

`app.start()` already prefers `Bun.serve` when the process is Bun, and falls back to Node `http` otherwise. `app.fetch` is the WinterCG contract: Next, Elysia, Cloudflare, and Vercel Functions all speak it.

Vercel Functions still have a concurrency ceiling. For a long-lived process
that holds many connections, run Bun on Fly or a VPS. Cold Functions can add
startup latency.

### Measured vs Next.js 16.3.2

Same machine, Node v22.22.0, sequential HTTP, 200 requests after 30 warmup. Next is **16.3.2** `next start` (production). Narsil is `app.start()` on Node (not Bun). Axum is `axum-bench` release, in-memory store. JWT HMAC + 50-row list. Script: `node bench/run.mjs`.

| cenário | p50 | p95 | p99 | média |
|---------|-----|-----|-----|-------|
| Next 16.3.2 `GET /api/users` + JWT | 4.74 ms | 8.28 ms | 10.01 ms | 5.12 ms |
| Narsil `GET /api/users` + JWT | 2.68 ms | 4.78 ms | 5.67 ms | 2.82 ms |
| Axum `GET /api/users` + JWT | 1.67 ms | 3.21 ms | 6.09 ms | 1.82 ms |
| Next 16.3.2 `POST /api/users` + JWT | 4.79 ms | 8.75 ms | 11.67 ms | 5.09 ms |
| Narsil `POST /api/users` + JWT | 2.04 ms | 3.33 ms | 5.46 ms | 2.16 ms |
| Axum `POST /api/users` + JWT | 0.91 ms | 2.04 ms | 2.65 ms | 1.06 ms |
| Next 16.3.2 RSC `/feed` (db in-process) | 11.09 ms | 20.05 ms | 23.61 ms | 11.69 ms |
| Next 16.3.2 RSC `/feed-via-api` (Route Handler) | 12.66 ms | 20.77 ms | 26.15 ms | 13.36 ms |

GET+JWT p50: Next 4.74 ms → Narsil 2.68 ms (**1.8×**) → Axum 1.67 ms (**2.8×** vs Next). POST+JWT p50: Next 4.79 ms → Narsil 2.04 ms (**2.3×**) → Axum 0.91 ms (**5.3×** vs Next). Axum is faster here; it remains the optional runtime, while TypeScript is the default. A page that queries the db *inside* the RSC is a different job; Narsil/Axum do not render HTML.

## License

MIT
