# @narsil/client-sdk

Type-safe, proxy-based API client for Narsil backends.

## Install

```bash
npm install @narsil/client-sdk
```

## Usage

```ts
import { createClient } from '@narsil/client-sdk'
import type { AppType } from './server'

const api = createClient<AppType>('http://localhost:3000/api', {
  getToken: () => localStorage.getItem('token'),
})

const users = await api.users.list()
const user = await api.users.get('uuid')
```

See the [root README](../../README.md) for full documentation.
