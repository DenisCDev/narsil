"use client";

import { useMutation, useQuery } from "@narsil/react";
import { api } from "../lib/api.js";

export function PostList() {
  const { data: posts, isLoading, error } = useQuery(["posts", "list"], () => api.posts.list());

  const { mutate: createPost, isLoading: isCreating } = useMutation(
    (data: { title: string; content?: string }) => api.posts.create(data),
    {
      invalidateTags: ["posts"],
    },
  );

  const { mutate: deletePost } = useMutation((id: string) => api.posts.delete(id), {
    invalidateTags: ["posts"],
  });

  if (isLoading) return <div>Loading posts...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h2>Posts ({posts?.length ?? 0})</h2>

      <button
        disabled={isCreating}
        onClick={() =>
          createPost({
            title: `Post ${Date.now()}`,
            content: "Hello from Narsil v2!",
          })
        }
      >
        {isCreating ? "Creating..." : "New Post"}
      </button>

      <ul>
        {posts?.map((post) => (
          <li key={post.id}>
            <strong>{post.title}</strong> — {post.status}
            <button onClick={() => deletePost(post.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
