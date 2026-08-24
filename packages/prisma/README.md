# @narsil/prisma

CRUD handlers from a Prisma Client model — the usual Next.js full-stack default.

```ts
import { prisma } from './lib/prisma'
import { createApp, defineModule } from 'narsil'

createApp({ db: prisma }).module(
  'users',
  defineModule({
    prisma: 'user',
    permissions: { list: 'public', get: 'public', create: 'authenticated', update: 'owner', delete: 'owner' },
  }),
)
```

Same URLs as `app/api/users/route.ts` + `[id]/route.ts`. See the [root README](../../README.md).
