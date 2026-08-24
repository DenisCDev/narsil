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

**Every Next.js app grows a second codebase: the API layer.** The database schema
already knows every table, every column, every type — and then the routes, the
validation, the client calls and the cache keys get written again by hand, and
drift a little further with every feature. Narsil derives the whole chain from
the Drizzle schema instead: define a table, get typed REST endpoints, a typed
client and React hooks — with auth, rate limiting and security headers on by
default, and no code-generation step in the middle.

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

## License

MIT

---

<a id="portugues"></a>

# Narsil (PT-BR)

**Todo app Next.js cria um segundo codebase: a camada de API.** O schema do banco
já sabe cada tabela, cada coluna, cada tipo — e mesmo assim as rotas, a
validação, as chamadas do client e as chaves de cache são escritas de novo à
mão, divergindo um pouco mais a cada feature. O Narsil deriva a cadeia inteira
do schema Drizzle: defina uma tabela e receba endpoints REST tipados, client
tipado e hooks React — com auth, rate limiting e headers de segurança ligados
por padrão, sem etapa de code generation no meio.

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
