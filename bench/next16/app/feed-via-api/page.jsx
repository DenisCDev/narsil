import { createHmac } from "node:crypto";

export const dynamic = "force-dynamic";

// smaug-ignore secrets: local bench hmac fixture, never shipped as a credential
const SECRET = process.env.BENCH_HMAC_KEY ?? "bench-hmac-fixture-key";

function signToken() {
  const payload = Buffer.from(JSON.stringify({ sub: "u1", exp: Date.now() + 3_600_000 })).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export default async function FeedViaApiPage() {
  const token = signToken();
  const res = await fetch("http://127.0.0.1:3016/api/users", {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5_000),
  });
  const users = await res.json();
  return (
    <main>
      <h1>lista via api</h1>
      <ul>
        {users.map((u) => (
          <li key={u.id}>{u.name}</li>
        ))}
      </ul>
    </main>
  );
}
