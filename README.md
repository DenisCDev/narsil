# Narsil

The fastest backend framework for Next.js applications. Auto-generate type-safe REST APIs from Drizzle schemas with zero code generation.

> **[Leia em Portugues](#portugues)**

## Features

- **Auto-CRUD** — Define a Drizzle schema, get `list`, `get`, `create`, `update`, `delete` endpoints instantly
- **Type-safe client** — Full TypeScript inference from server to client via `typeof app`
- **React hooks** — `useQuery` and `useMutation` with SWR caching and optimistic updates
- **Auth built-in** — Declarative permissions (`public`, `authenticated`, `owner`, `admin`) + custom functions
- **Security defaults** — CORS, Helmet, rate limiting, body size limits — all ON by default
- **Edge-ready** — Works on Node.js 18+, Vercel Edge, Cloudflare Workers, Bun, Deno

## Quick Start

### 1. Install

```bash
npm install narsil @narsil/drizzle @narsil/server
```

### 2. Define your schema (Drizzle)

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

### 3. Create your app

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

### 4. Use the client SDK

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

### 5. React hooks

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

## License

MIT

---

<a id="portugues"></a>

# Narsil (PT-BR)

O framework backend mais rapido para aplicacoes Next.js. Gere REST APIs type-safe a partir de schemas Drizzle, sem code generation.

## Funcionalidades

- **Auto-CRUD** — Defina um schema Drizzle e receba endpoints `list`, `get`, `create`, `update`, `delete` automaticamente
- **Client type-safe** — Inferencia completa de tipos do servidor ao cliente via `typeof app`
- **React hooks** — `useQuery` e `useMutation` com cache SWR e updates otimistas
- **Auth integrado** — Permissoes declarativas (`public`, `authenticated`, `owner`, `admin`) + funcoes customizadas
- **Seguranca por padrao** — CORS, Helmet, rate limiting, limite de body — tudo ativo por padrao
- **Edge-ready** — Funciona em Node.js 18+, Vercel Edge, Cloudflare Workers, Bun, Deno

## Inicio Rapido

### 1. Instalar

```bash
npm install narsil @narsil/drizzle @narsil/server
```

### 2. Definir o schema (Drizzle)

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

### 3. Criar a app

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

### 4. Usar o client SDK

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

### 5. React hooks

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

| Pacote | Descricao |
|--------|-----------|
| [`narsil`](./packages/narsil) | App factory, sistema de modulos, permissoes, hooks |
| [`@narsil/server`](./packages/server) | Router, middleware pipeline, adapters (Node/Vercel/Web Standard) |
| [`@narsil/drizzle`](./packages/drizzle) | Connection factory Drizzle e gerador de CRUD automatico |
| [`@narsil/client-sdk`](./packages/client-sdk) | Client API type-safe baseado em Proxy |
| [`@narsil/react`](./packages/react) | Hooks React (`useQuery`, `useMutation`) com cache SWR |
| [`@narsil/cache`](./packages/cache) | Cache LRU para rate limiting e cache de respostas |
| [`@narsil/cli`](./packages/cli) | CLI para comandos `init`, `dev` e `db` |

## Autenticacao

Passe uma funcao `auth` para `createApp`. Ela recebe o Bearer token e deve retornar um objeto de usuario ou `null`:

```ts
createApp({
  db,
  auth: async (token) => {
    const user = await verifyJWT(token)
    return user // { id, email, role, ... } ou null
  },
})
```

Permissoes sao verificadas por operacao usando presets ou funcoes customizadas:

```ts
permissions: {
  list: 'public',                          // Qualquer um
  get: 'authenticated',                    // Token valido necessario
  create: 'admin',                         // role === 'admin'
  update: (ctx) => ctx.user?.id === ctx.params.id, // Logica customizada
  delete: ['admin'],                       // Array = qualquer match
}
```

## Licenca

MIT
