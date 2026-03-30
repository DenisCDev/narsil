# @narsil/cache

Lightweight LRU cache for serverless environments. Used internally by Narsil for rate limiting and response caching.

## Install

```bash
npm install @narsil/cache
```

## Usage

```ts
import { LRUCache } from '@narsil/cache'

const cache = new LRUCache<string>(1000)
cache.set('key', 'value', 60) // 60s TTL
cache.get('key') // 'value'
```

See the [root README](../../README.md) for full documentation.
