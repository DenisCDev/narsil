# narsil

Core app factory for the Narsil framework. Creates REST APIs from Drizzle schemas with permissions, hooks, and middleware.

## Install

```bash
npm install narsil
```

## Usage

```ts
import { createApp, defineModule } from 'narsil'

const app = createApp({ db })
  .module('users', defineModule({
    schema: usersTable,
    permissions: { create: 'admin' },
    hooks: {
      afterCreate: async ({ data }) => console.log('Created:', data),
    },
  }))

export default app
```

See the [root README](../../README.md) for full documentation.
