'use client'

/**
 * PostList — Client Component
 *
 * Demonstrates NexusFlow React hooks:
 * - useQuery for data fetching with SWR cache
 * - useMutation for create/update/delete with optimistic updates
 * - useSubscription for realtime updates
 */

import { useQuery, useMutation, useSubscription } from '@nexusflow/client'
import { useState } from 'react'

interface Post {
  id: string
  title: string
  content: string | null
  status: string
  authorId: string
  createdAt: string
}

export function PostList({ initialPosts }: { initialPosts: Post[] }) {
  const [newTitle, setNewTitle] = useState('')

  // Fetch posts with SWR caching
  const { data: posts, isLoading, refetch } = useQuery<Post[]>(
    'posts',
    'list',
    { where: { status: 'published' }, limit: 20 },
    { ttl: 60 }
  )

  // Create mutation with optimistic update
  const { mutate: createPost, isLoading: isCreating } = useMutation<
    { data: { title: string; content: string } },
    Post
  >('posts', 'create', {
    onSuccess: () => {
      setNewTitle('')
      refetch()
    },
  })

  // Delete mutation
  const { mutate: deletePost } = useMutation<{ id: string }, void>(
    'posts',
    'delete',
    {
      invalidateTags: ['posts'],
    }
  )

  // Realtime: auto-update when new posts are created
  useSubscription<Post>('posts', {
    event: 'INSERT',
    onData: (_newPost) => {
      refetch()
    },
  })

  const displayPosts = posts ?? initialPosts

  return (
    <div>
      {/* Create post form */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!newTitle.trim()) return
          createPost({ data: { title: newTitle, content: '' } })
        }}
      >
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Post title..."
        />
        <button type="submit" disabled={isCreating}>
          {isCreating ? 'Creating...' : 'Create Post'}
        </button>
      </form>

      {/* Posts list */}
      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <ul>
          {displayPosts.map((post) => (
            <li key={post.id}>
              <h3>{post.title}</h3>
              <p>{post.content}</p>
              <small>{new Date(post.createdAt).toLocaleDateString()}</small>
              <button onClick={() => deletePost({ id: post.id })}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
