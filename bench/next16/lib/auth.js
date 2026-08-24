import { createHmac, timingSafeEqual } from "node:crypto";

// smaug-ignore secrets: local bench hmac fixture, never shipped as a credential
const SECRET = process.env.BENCH_HMAC_KEY ?? "bench-hmac-fixture-key";

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

export function bearer(req) {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7);
}
