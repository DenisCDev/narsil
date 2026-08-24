import { listUsers } from "../../lib/db.js";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const users = await listUsers();
  return (
    <main>
      <h1>lista</h1>
      <ul>
        {users.map((u) => (
          <li key={u.id}>{u.name}</li>
        ))}
      </ul>
    </main>
  );
}
