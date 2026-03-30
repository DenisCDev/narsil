import { PostList } from "../components/PostList.js";
import { UserList } from "../components/UserList.js";

export default function Home() {
  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: 20 }}>
      <h1>Narsil v2 — Example App</h1>
      <p>
        Backend: <code>http://localhost:3001/api</code>
      </p>
      <hr />
      <UserList />
      <hr />
      <PostList />
    </main>
  );
}
