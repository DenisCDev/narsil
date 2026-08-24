<h1 align="center">Narsil</h1>

<p align="center">
  <b>Type-safe REST APIs generated from your Drizzle schema, with no code generation step</b><br>
  <sub><i>"Seek for the Sword that was broken..."</i></sub>
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

> *"Andúril, Narsil Reforged"*, art by Jason Rainville for **Magic: The Gathering**,
> Tales of Middle-earth Commander (2023). The sword that was broken, forged anew.
> This framework is also on its second forge (v2), sharper than the first.

> **[Leia em Português](#portugues)**

**A Next app already has the API shape.** `app/api/users/route.ts` is GET+POST;
`app/api/users/[id]/route.ts` is GET+PATCH+DELETE. Narsil is that map, analogically:
one Drizzle table becomes those five routes, same URLs, same verbs — you do not
write the `route.ts` files, and nothing is code-generated.

The Next app stays the UI. A rewrite sends `/api/:path*` to the Narsil process
on Bun, so `fetch('/api/users')` in the browser looks like a normal Next API.

> **Status:** working monorepo, not yet published to npm. To try it, clone the
> repo, run `npm install && npm run build`, and start from `examples/`. The
> snippets below show the intended API surface.

## Features

- **Auto-CRUD** — Define a Drizzle schema, get `list`, `get`, `create`, `update`, `delete` endpoints instantly
- **Type-safe client** — Full TypeScript inference from server to client via `typeof app`
- **React hooks** — `useQuery` and `useMutation` with SWR caching and optimistic updates
- **Auth built-in** — Declarative permissions (`public`, `authenticated`, `owner`, `admin`) + custom functions
- **Security defaults** — CORS, Helmet-style headers, rate limiting, body size limits — all ON by default
- **Edge-ready** — Works on Node.js 18+, Vercel Edge, Cloudflare Workers, Bun, Deno

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

The product goal is a **separate HTTP server on Bun**, with [Elysia](https://elysiajs.com) as the host (first-class on Vercel since November 2025). Next stays the UI and calls this API. That is how the request stays off Next's router.

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

Vercel Functions (even Elysia + Fluid compute) still have a concurrency ceiling. For a long-lived process that holds many connections, run Bun on Fly/a VPS. Do not promise "instant" on a cold Function.

### Measured vs Next.js 16.3.2

Same machine, Node v22.22.0, sequential HTTP, 200 requests after 30 warmup. Next is **16.3.2** `next start` (production). Narsil is `app.start()` on Node (not Bun). JWT HMAC + 50-row list. Script: `node bench/run.mjs`.

| cenário | p50 | p95 | p99 | média |
|---------|-----|-----|-----|-------|
| Next 16.3.2 `GET /api/users` + JWT | 2.60 ms | 3.83 ms | 4.69 ms | 2.73 ms |
| Narsil `GET /api/users` + JWT | 0.96 ms | 2.07 ms | 2.50 ms | 1.11 ms |
| Next 16.3.2 `POST /api/users` + JWT | 2.65 ms | 3.73 ms | 4.19 ms | 2.75 ms |
| Narsil `POST /api/users` + JWT | 1.15 ms | 2.42 ms | 4.22 ms | 1.34 ms |
| Next 16.3.2 RSC `/feed` (db in-process) | 5.70 ms | 8.64 ms | 12.43 ms | 6.06 ms |
| Next 16.3.2 RSC `/feed-via-api` (Route Handler) | 8.13 ms | 10.56 ms | 12.32 ms | 8.46 ms |

GET+JWT p50: Next 2.60 ms → Narsil 0.96 ms (**2.7×**). POST+JWT p50: 2.65 ms → 1.15 ms (**2.3×**). A page that queries the db *inside* the RSC is a different job (5.70 ms); one that goes through its own Route Handler is 8.13 ms. Narsil does not render HTML.

## License

MIT

---

<a id="portugues"></a>

# Narsil (PT-BR)

**O app Next já tem o formato da API.** `app/api/users/route.ts` é GET+POST;
`app/api/users/[id]/route.ts` é GET+PATCH+DELETE. O Narsil é esse mapa, por analogia:
uma tabela Drizzle vira essas cinco rotas, mesmos URLs, mesmos verbos — você não
escreve os `route.ts`, e nada é gerado por IA.

O Next fica na UI. Um rewrite manda `/api/:path*` para o processo Narsil no Bun,
então `fetch('/api/users')` no browser parece a API normal do Next.

> **Status:** monorepo funcional, ainda não publicado no npm. Para experimentar,
> clone o repositório, rode `npm install && npm run build` e comece pelos
> `examples/`. Os trechos abaixo mostram a API pretendida.

## Funcionalidades

- **Auto-CRUD** — Defina um schema Drizzle e receba endpoints `list`, `get`, `create`, `update`, `delete` automaticamente
- **Client type-safe** — Inferência completa de tipos do servidor ao cliente via `typeof app`
- **React hooks** — `useQuery` e `useMutation` com cache SWR e updates otimistas
- **Auth integrado** — Permissões declarativas (`public`, `authenticated`, `owner`, `admin`) + funções customizadas
- **Segurança por padrão** — CORS, headers de segurança, rate limiting, limite de body — tudo ativo por padrão
- **Edge-ready** — Funciona em Node.js 18+, Vercel Edge, Cloudflare Workers, Bun, Deno

## Início rápido

### 1. Definir o schema (Drizzle)

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

### 2. Criar a app

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

### 3. Usar o client SDK

```ts
import { createClient } from '@narsil/client-sdk'
import type { AppType } from './server'

const api = createClient<AppType>('http://localhost:3000/api', {
  getToken: () => localStorage.getItem('token'),
})

// Totalmente tipado!
const users = await api.users.list()
const user = await api.users.get('uuid-aqui')
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

  if (isLoading) return <p>Carregando...</p>

  return (
    <ul>
      {users?.map((user) => <li key={user.id}>{user.name}</li>)}
    </ul>
  )
}
```

## Pacotes

| Pacote | Descrição |
|--------|-----------|
| [`narsil`](./packages/narsil) | App factory, sistema de módulos, permissões, hooks |
| [`@narsil/server`](./packages/server) | Router, middleware pipeline, adapters (Node/Vercel/Web Standard) |
| [`@narsil/drizzle`](./packages/drizzle) | Connection factory Drizzle e gerador de CRUD automático |
| [`@narsil/prisma`](./packages/prisma) | CRUD do Prisma Client — analogia do Next full-stack default |
| [`@narsil/client-sdk`](./packages/client-sdk) | Client API type-safe baseado em Proxy |
| [`@narsil/react`](./packages/react) | Hooks React (`useQuery`, `useMutation`) com cache SWR |
| [`@narsil/cache`](./packages/cache) | Cache LRU para rate limiting e cache de respostas |
| [`@narsil/cli`](./packages/cli) | CLI para os comandos `init`, `dev` e `db` |

## Autenticação

Passe uma função `auth` para `createApp`. Ela recebe o Bearer token e deve retornar um objeto de usuário ou `null`:

```ts
createApp({
  db,
  auth: async (token) => {
    const user = await verifyJWT(token)
    return user // { id, email, role, ... } ou null
  },
})
```

Permissões são verificadas por operação usando presets ou funções customizadas:

```ts
permissions: {
  list: 'public',                          // Qualquer um
  get: 'authenticated',                    // Token válido necessário
  create: 'admin',                         // role === 'admin'
  update: (ctx) => ctx.user?.id === ctx.params.id, // Lógica customizada
  delete: ['admin'],                       // Array = qualquer match
}
```

## Analogia com as rotas do Next

| Arquivo Next | Narsil |
|--------------|--------|
| `app/api/users/route.ts` `GET`/`POST` | `.module('users', defineModule({ schema: users }))` |
| `app/api/users/[id]/route.ts` `GET`/`PATCH`/`DELETE` | o mesmo módulo, sem arquivo extra |

O front continua chamando `/api/users`. O Next só faz rewrite:

```ts
// next.config.ts
export default {
  async rewrites() {
    return [{ source: '/api/:path*', destination: 'http://127.0.0.1:3001/api/:path*' }]
  },
}
```

Essa é a transformação inteira: mesmas rotas, outro motor. Sem árvore gerada de `route.ts`.

Um Next full-stack “default” costuma ter **Prisma** (`lib/prisma.ts`), não Drizzle:

```ts
createApp({ db: prisma }).module('users', defineModule({ prisma: 'user', permissions: { ... } }))
```

Drizzle continua no `schema:` se o app já usa isso.

Números medidos contra **Next.js 16.3.2** (`next start`, produção, Node v22.22.0, 200 pedidos): GET+JWT p50 2.60 ms → 0.96 ms (2,7×); POST+JWT p50 2.65 ms → 1.15 ms (2,3×). Tabela completa na seção em inglês. Script: `node bench/run.mjs`.

## Performance — isso não é uma Route Handler do Next

Se você montar o Narsil em `app/api/[[...route]]/route.ts`, continua dentro da Function do Next. **Esse caminho não fica muitas vezes mais rápido** que a API padrão: mesmo runtime, mesmo cold start, mesmo pipeline.

O objetivo do produto é um **servidor HTTP separado no Bun**, com [Elysia](https://elysiajs.com) como host (suporte de primeira classe na Vercel desde novembro de 2025). O Next fica na UI e chama essa API. É assim que o request sai do router do Next.

```ts
import { Elysia } from 'elysia'
import app from './narsil'

new Elysia()
  .all('*', ({ request }) => app.fetch(request))
  .listen(3001)
```

Na Vercel, o projeto da API é outro (não o do Next) e o `vercel.json` leva:

```json
{ "bunVersion": "1.x" }
```

`app.start()` já prefere `Bun.serve` quando o processo é Bun, e cai no `http` do Node se não for. `app.fetch` é o contrato WinterCG: Next, Elysia, Cloudflare e Functions da Vercel falam isso.

Function da Vercel (mesmo Elysia + Fluid compute) ainda tem teto de concorrência. Processo longo, muita gente junta: Bun na Fly/VPS. Não prometa "instantâneo" em Function fria.

## Licença

MIT
