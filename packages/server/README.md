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

## Client addresses and rate limiting

The Node.js adapter uses the socket peer address; the Bun adapter uses
`server.requestIP(request)`. Request headers such as `x-forwarded-for` and
`x-real-ip` are ignored by default because direct clients can forge them.

When using `app.fetch` on another platform, configure `narsil({ clientIP })`
with a resolver based on trusted platform metadata. Behind a reverse proxy,
only read a forwarding header if the origin accepts traffic exclusively from
that proxy and the proxy replaces client-supplied values. The resolver must
return one valid IPv4 or IPv6 address. Missing or invalid addresses share the
default rate-limit bucket; requests are not exempt from the limit.

See the [root README](../../README.md) for full documentation.
