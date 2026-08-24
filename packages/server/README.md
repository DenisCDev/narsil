# @narsil/server

HTTP router, middleware pipeline, and platform adapters for Narsil.

## Install

```bash
npm install @narsil/server
```

## Usage

```ts
import { NexusRouter, composeMiddleware, logger } from '@narsil/server'

const router = new NexusRouter()
router.add('GET', '/api/health', async () => ({ status: 'ok' }))
```

Includes adapters for Node.js, Vercel Edge, and Web Standard (Cloudflare Workers, Bun, Deno).

See the [root README](../../README.md) for full documentation.
