# Narsil

The fastest backend framework for Next.js applications. Auto-generate type-safe REST APIs from Drizzle schemas with zero code generation.

O framework backend mais rapido para aplicacoes Next.js. Gere REST APIs type-safe a partir de schemas Drizzle sem code generation.

## Features / Funcionalidades

- **Auto-CRUD** — Define a Drizzle schema, get `list`, `get`, `create`, `update`, `delete` endpoints instantly / Defina um schema Drizzle e receba endpoints automaticamente
- **Type-safe client** — Full TypeScript inference from server to client via `typeof app` / Inferencia completa de tipos do server ao client
- **React hooks** — `useQuery` and `useMutation` with SWR caching and optimistic updates / Hooks React com cache SWR e updates otimistas
- **Auth built-in** — Declarative permissions (`public`, `authenticated`, `owner`, `admin`) + custom functions / Permissoes declarativas + funcoes customizadas
- **Security defaults** — CORS, Helmet, rate limiting, body size limits — all ON by default / Seguranca ativada por padrao
- **Edge-ready** — Works on Node.js 18+, Vercel Edge, Cloudflare Workers, Bun, Deno / Funciona em qualquer runtime

## Quick Start / Inicio Rapido

### 1. Install / Instalar

```bash
npm install narsil @narsil/drizzle @narsil/server
```

### 2. Define your schema / Defina seu schema (Drizzle)

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

### 3. Create your app / Crie sua app

```ts
import { createApp, defineModule } from 'narsil'
import { createDb } from '@narsil/drizzle'
import { users } from './schema'

const db = await createDb({ url: process.env.DATABASE_URL! })

const app = createApp({
  db,
  auth: async (token) => {
    // Your JWT verification logic / Sua logica de verificacao JWT
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

### 4. Use the client SDK / Use o client SDK

```ts
import { createClient } from '@narsil/client-sdk'
import type { AppType } from './server'

const api = createClient<AppType>('http://localhost:3000/api', {
  getToken: () => localStorage.getItem('token'),
})

// Fully typed! / Totalmente tipado!
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

## Packages / Pacotes

| Package | Description / Descricao |
|---------|-------------|
| [`narsil`](./packages/narsil) | Core app factory, module system, permissions, hooks |
| [`@narsil/server`](./packages/server) | Router, middleware pipeline, adapters (Node/Vercel/Web Standard) |
| [`@narsil/drizzle`](./packages/drizzle) | Drizzle connection factory and auto-CRUD generator |
| [`@narsil/client-sdk`](./packages/client-sdk) | Type-safe proxy-based API client |
| [`@narsil/react`](./packages/react) | React hooks (`useQuery`, `useMutation`) with SWR cache |
| [`@narsil/cache`](./packages/cache) | LRU cache for rate limiting and response caching |
| [`@narsil/cli`](./packages/cli) | CLI for `init`, `dev`, and `db` commands |

## Auth / Autenticacao

Pass an `auth` function to `createApp`. It receives the Bearer token and should return a user object or `null`.

Passe uma funcao `auth` para `createApp`. Ela recebe o Bearer token e deve retornar um objeto de usuario ou `null`.

```ts
createApp({
  db,
  auth: async (token) => {
    const user = await verifyJWT(token)
    return user // { id, email, role, ... } or null
  },
})
```

Permissions are checked per-operation using presets or custom functions.
Permissoes sao verificadas por operacao usando presets ou funcoes customizadas.

```ts
permissions: {
  list: 'public',                          // Anyone / Qualquer um
  get: 'authenticated',                    // Valid token required / Token valido necessario
  create: 'admin',                         // role === 'admin'
  update: (ctx) => ctx.user?.id === ctx.params.id, // Custom logic / Logica customizada
  delete: ['admin'],                       // Array = any match / Qualquer match
}
```

## License / Licenca

MIT
