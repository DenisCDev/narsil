# @narsil/drizzle

Drizzle ORM connection factory and auto-CRUD handler generator for Narsil.

## Install

```bash
npm install @narsil/drizzle drizzle-orm postgres
```

## Usage

```ts
import { createDb } from '@narsil/drizzle'

const db = await createDb({ url: process.env.DATABASE_URL! })
```

CRUD handlers are auto-generated from Drizzle `pgTable` schemas and used internally by the `narsil` core package.

See the [root README](../../README.md) for full documentation.
