import { createHmac, timingSafeEqual } from "node:crypto";

// smaug-ignore secrets: local bench hmac fixture, never shipped as a credential
export const SECRET = process.env.BENCH_HMAC_KEY ?? "bench-hmac-fixture-key";

const ROWS = Array.from({ length: 50 }, (_, i) => ({
  id: String(i + 1),
  name: `User ${i + 1}`,
  email: `user${i + 1}@bench.local`,
}));

export function listUsers() {
  return Promise.resolve(ROWS);
}

export function signToken(sub = "u1") {
  const payload = Buffer.from(JSON.stringify({ sub, exp: Date.now() + 3_600_000 })).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyToken(token) {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", SECRET).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (data.exp < Date.now()) return null;
  return { id: data.sub, role: "user" };
}
