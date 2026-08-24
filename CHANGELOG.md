# Changelog

## 2.0.0

Initial open-source release of Narsil — the fastest backend framework for Next.js.

### Packages

- **narsil** — Core app factory with module system, declarative permissions, lifecycle hooks, and middleware pipeline
- **@narsil/server** — Trie-based HTTP router, middleware composition, adapters for Node.js / Vercel Edge / Web Standard
- **@narsil/drizzle** — Connection factory (Supabase-optimized) and auto-CRUD generator from Drizzle schemas
- **@narsil/client-sdk** — Proxy-based, fully type-safe API client with request deduplication
- **@narsil/react** — `useQuery` and `useMutation` hooks with SWR cache, optimistic updates, and rollback
- **@narsil/cache** — LRU cache with TTL for rate limiting and response caching
- **@narsil/cli** — Project scaffolding, dev server, and database management commands

### Features

- Zero code generation — types flow from server to client via `typeof app`
- Built-in auth with permission presets (`public`, `authenticated`, `owner`, `admin`)
- Security defaults: CORS, Helmet, rate limiting, body size limits
- Edge-ready: Node.js 18+, Bun, Deno, Cloudflare Workers, Vercel Edge
