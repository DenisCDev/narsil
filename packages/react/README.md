# @narsil/react

React hooks for Narsil with SWR caching, optimistic updates, and rollback.

## Install

```bash
npm install @narsil/react
```

## Usage

```tsx
import { useQuery, useMutation } from '@narsil/react'

const { data, isLoading } = useQuery(() => api.users.list(), { tags: ['users'] })

const { mutate } = useMutation(
  (data) => api.users.create(data),
  { invalidateTags: ['users'] }
)
```

See the [root README](../../README.md) for full documentation.
