import { bearer, verifyToken } from "../../../lib/auth.js";
import { listUsers } from "../../../lib/db.js";

export async function GET(request) {
  const token = bearer(request);
  if (!token || !verifyToken(token)) {
    return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  const users = await listUsers();
  return Response.json(users);
}

export async function POST(request) {
  const token = bearer(request);
  if (!token || !verifyToken(token)) {
    return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  const body = await request.json();
  return Response.json({ id: "new", name: body.name ?? "x" }, { status: 201 });
}
