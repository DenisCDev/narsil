"use client";

import { useMutation, useQuery } from "@narsil/react";
import { api } from "../lib/api.js";

export function UserList() {
  const { data: users, isLoading, error, refetch } = useQuery(["users", "list"], () => api.users.list());

  const { mutate: createUser, isLoading: isCreating } = useMutation(
    (data: { name: string; email: string }) => api.users.create(data),
    {
      invalidateTags: ["users"],
      onSuccess: (user) => {
        console.log("User created:", user);
      },
    },
  );

  if (isLoading) return <div>Loading users...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h2>Users ({users?.length ?? 0})</h2>

      <button
        disabled={isCreating}
        onClick={() =>
          createUser({
            name: "New User",
            email: `user-${Date.now()}@example.com`,
          })
        }
      >
        {isCreating ? "Creating..." : "Add User"}
      </button>

      <ul>
        {users?.map((user) => (
          <li key={user.id}>
            {user.name} — {user.email} ({user.role})
          </li>
        ))}
      </ul>

      <button onClick={() => refetch()}>Refresh</button>
    </div>
  );
}
