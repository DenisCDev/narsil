/**
 * Posts Page — React Server Component
 *
 * Uses createCaller() for ZERO HTTP overhead data fetching.
 * The database query happens directly in the server component
 * without any network round-trip.
 */

import { createCaller } from '@/nexusflow/caller'
import { PostList } from '@/components/PostList'

export default async function PostsPage() {
  // Direct function call — no HTTP, no serialization overhead
  const api = await createCaller()

  const posts = await api.posts.list({
    where: { status: 'published' },
    limit: 20,
    orderBy: { createdAt: 'desc' },
  })

  return (
    <main>
      <h1>Posts</h1>
      <PostList initialPosts={posts as any[]} />
    </main>
  )
}
