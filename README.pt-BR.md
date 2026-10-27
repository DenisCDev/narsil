<h1 align="center">Narsil</h1>

<p align="center"><a href="README.md">English</a> · <b>Português</b></p>

<p align="center">
  <b>Uma API REST tipada derivada de um schema Drizzle, sem arquivos de código gerados</b>
</p>

<p align="center">
  <img src="https://github.com/DenisCDev/narsil/actions/workflows/ci.yml/badge.svg" alt="CI">
  <img src="https://img.shields.io/badge/typescript-strict-43A48E?labelColor=171310" alt="TypeScript strict">
  <img src="https://img.shields.io/badge/monorepo-7%20packages-D4A24E?labelColor=171310" alt="monorepo com 7 pacotes">
  <img src="https://img.shields.io/badge/license-MIT-D4A24E?labelColor=171310" alt="licença MIT">
</p>

<p align="center">
  <img src="assets/mtg-anduril.jpg" width="480" alt="Andúril, a Narsil reforjada, ardendo com runas ao longo da lâmina. Arte de Jason Rainville para Magic: The Gathering">
</p>

<p align="center">
  <sub><i>"Renewed shall be blade that was broken"</i><br>
  — <b>A Sociedade do Anel</b>, livro I, capítulo X · arte de Jason Rainville para Magic: The Gathering, Tales of Middle-earth Commander (2023)
</p>

O Narsil lê a definição de uma tabela Drizzle e expõe operações de listagem,
leitura, criação, atualização e exclusão na estrutura de URLs usada pelos route
handlers do Next.js. A API roda em um serviço TypeScript/Narsil ou Axum separado; um rewrite mantém as
requisições do navegador sob `/api`. Os tipos do servidor também ficam
disponíveis para o cliente e para os hooks React, sem escrever arquivos de rota
nem gerar código-fonte.

> **Status:** monorepo funcional, ainda não publicado no npm. Para experimentar,
> clone o repositório, rode `npm install && npm run build` e comece por
> `examples/`. Os trechos abaixo mostram a API pretendida.

## Funcionalidades

- **CRUD a partir do schema** — Uma definição Drizzle fornece os endpoints `list`, `get`, `create`, `update` e `delete`
- **Client type-safe** — Inferência completa de TypeScript do servidor ao cliente via `typeof app`
- **Hooks React** — `useQuery` e `useMutation` com cache SWR e atualizações otimistas
- **Auth integrado** — Permissões declarativas (`public`, `authenticated`, `owner`, `admin`) + funções customizadas
- **Segurança por padrão** — CORS, cabeçalhos de segurança, rate limiting e limite de tamanho do corpo ficam ativos por padrão
- **Múltiplos runtimes** — Suporta Node.js 18+, Vercel Edge, Cloudflare Workers, Bun e Deno
- **Axum opcional** — `narsil init --runtime axum` cria um processo Rust de longa duração. O runtime TypeScript continua sendo o padrão e roda em Bun ou Node.

## Início rápido

### 1. Defina o schema (Drizzle)

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

### 2. Crie a app

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

### 3. Use o client SDK

```ts
import { createClient } from '@narsil/client-sdk'
import type { AppType } from './server'

const api = createClient<AppType>('http://localhost:3000/api', {
  getToken: () => localStorage.getItem('token'),
})

// Totalmente tipado!
const users = await api.users.list()
const user = await api.users.get('uuid-here')
const created = await api.users.create({ name: 'John', email: 'john@example.com' })
```

### 4. Hooks React

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

## Pacotes

| Pacote | Descrição |
|--------|-----------|
| [`narsil`](./packages/narsil) | Fábrica da app, sistema de módulos, permissões, hooks |
| [`@narsil/server`](./packages/server) | Router, pipeline de middlewares, adapters (Node/Vercel/Web Standard) |
| [`@narsil/drizzle`](./packages/drizzle) | Fábrica de conexão Drizzle e gerador de CRUD automático |
| [`@narsil/prisma`](./packages/prisma) | CRUD automático com Prisma Client — equivalente ao Next.js full-stack padrão |
| [`@narsil/client-sdk`](./packages/client-sdk) | Client de API type-safe baseado em proxy |
| [`@narsil/react`](./packages/react) | Hooks React (`useQuery`, `useMutation`) com cache SWR |
| [`@narsil/cache`](./packages/cache) | Cache LRU para rate limiting e cache de respostas |
| [`@narsil/cli`](./packages/cli) | CLI para os comandos `init`, `dev` e `db` |
| [`narsil-axum`](./crates/narsil-axum) | Runtime Axum opcional — o mesmo equivalente de `/api`, não é o padrão |

## Auth

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

As permissões são verificadas por operação, usando presets ou funções customizadas:

```ts
permissions: {
  list: 'public',                          // Qualquer pessoa
  get: 'authenticated',                    // Exige token válido
  create: 'admin',                         // role === 'admin'
  update: (ctx) => ctx.user?.id === ctx.params.id, // Lógica customizada
  delete: ['admin'],                       // Array = qualquer correspondência
}
```

## Equivalente às API routes do Next

| Arquivo do Next.js | Narsil |
|--------------------|--------|
| `app/api/users/route.ts` `GET`/`POST` | `.module('users', defineModule({ schema: users }))` |
| `app/api/users/[id]/route.ts` `GET`/`PATCH`/`DELETE` | o mesmo módulo, sem arquivo extra |

O frontend continua chamando `/api/users`. O Next só faz o rewrite:

```ts
// next.config.ts
export default {
  async rewrites() {
    return [{ source: '/api/:path*', destination: 'http://127.0.0.1:3001/api/:path*' }]
  },
}
```

Essa é toda a transformação: mesmas rotas, outro motor. Não é uma árvore gerada de `route.ts`.

Uma app Next full-stack padrão costuma ter **Prisma** (`lib/prisma.ts`), não Drizzle. Aponte `db` para o Prisma Client:

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

O Drizzle continua disponível via `schema: usersTable` quando é ele que a app já usa.

## Desempenho — isto não é um Route Handler do Next.js

Se você montar o Narsil dentro de `app/api/[[...route]]/route.ts`, continua dentro da Function do Next. Esse caminho **não consegue** ser muitas vezes mais rápido que a API padrão do Next: mesmo runtime, mesmo cold start, mesmo pipeline.

O objetivo do produto é um **servidor HTTP separado**. O runtime padrão do
Narsil é TypeScript: `app.start()` usa `Bun.serve` quando o processo é Bun e o
servidor HTTP do Node nos demais casos. O Next continua sendo a interface e chama
esta API, então as requisições não passam pelo roteador do Next.

```bash
npx narsil init                 # TypeScript — padrão, Bun ou Node
npx narsil init --runtime axum  # Axum — mesmas URLs /api, Fly/VPS/Docker
```

O Axum é uma opção, não um substituto. O rewrite em `next.config.ts` é idêntico. O client TypeScript continua chamando `/api/users`; com Axum, importe `AppType` de `backend/narsil-contract.ts`, porque não existe `typeof app` vindo do Rust.

Como `app.fetch` segue o contrato Web Standard de requisição e resposta, ele
também pode ser montado no Elysia quando esse framework estiver instalado:

```ts
import { Elysia } from 'elysia'
import app from './narsil'

new Elysia()
  .all('*', ({ request }) => app.fetch(request))
  .listen(3001)
```

Na Vercel, dê à API um projeto próprio (não o da app Next) e:

```json
{ "bunVersion": "1.x" }
```

`app.start()` já prefere `Bun.serve` quando o processo é Bun e, caso contrário, recorre ao `http` do Node. `app.fetch` é o contrato WinterCG: Next, Elysia, Cloudflare e Vercel Functions falam esse contrato.

As Vercel Functions ainda têm um teto de concorrência. Para um processo de longa
duração que mantém muitas conexões, rode Bun na Fly ou em uma VPS. Functions
frias podem adicionar latência de inicialização.

### Medição contra o Next.js 16.3.2

Mesma máquina, Node v22.22.0, HTTP sequencial, 200 requisições após 30 de aquecimento. O Next é o **16.3.2** com `next start` (produção). O Narsil é `app.start()` no Node (não Bun). O Axum é o `axum-bench` em release, com armazenamento em memória. JWT HMAC + listagem de 50 linhas. Script: `node bench/run.mjs`.

| cenário | p50 | p95 | p99 | média |
|---------|-----|-----|-----|-------|
| Next 16.3.2 `GET /api/users` + JWT | 4.74 ms | 8.28 ms | 10.01 ms | 5.12 ms |
| Narsil `GET /api/users` + JWT | 2.68 ms | 4.78 ms | 5.67 ms | 2.82 ms |
| Axum `GET /api/users` + JWT | 1.67 ms | 3.21 ms | 6.09 ms | 1.82 ms |
| Next 16.3.2 `POST /api/users` + JWT | 4.79 ms | 8.75 ms | 11.67 ms | 5.09 ms |
| Narsil `POST /api/users` + JWT | 2.04 ms | 3.33 ms | 5.46 ms | 2.16 ms |
| Axum `POST /api/users` + JWT | 0.91 ms | 2.04 ms | 2.65 ms | 1.06 ms |
| Next 16.3.2 RSC `/feed` (db no mesmo processo) | 11.09 ms | 20.05 ms | 23.61 ms | 11.69 ms |
| Next 16.3.2 RSC `/feed-via-api` (Route Handler) | 12.66 ms | 20.77 ms | 26.15 ms | 13.36 ms |

GET+JWT p50: Next 4.74 ms → Narsil 2.68 ms (**1.8×**) → Axum 1.67 ms (**2.8×** vs Next). POST+JWT p50: Next 4.79 ms → Narsil 2.04 ms (**2.3×**) → Axum 0.91 ms (**5.3×** vs Next). O Axum é mais rápido aqui; ele continua sendo o runtime opcional, e o TypeScript é o padrão. Uma página que consulta o db *dentro* do RSC é outro trabalho; Narsil e Axum não renderizam HTML.

## Licença

MIT
