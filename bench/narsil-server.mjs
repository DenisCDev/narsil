import { createApp } from "../packages/narsil/dist/index.js";
import { listUsers, verifyToken } from "./shared.mjs";

const db = {
  user: {
    findMany: async () => listUsers(),
    findFirst: async ({ where }) => {
      const rows = await listUsers();
      return rows.find((r) => r.id === where.id) ?? null;
    },
    create: async ({ data }) => ({ id: "new", ...data }),
    update: async ({ data, where }) => ({ id: where.id, ...data }),
    delete: async ({ where }) => ({ id: where.id }),
  },
};

const app = createApp({
  db,
  auth: async (token) => verifyToken(token),
  security: { rateLimit: false, cors: { origin: "*" }, helmet: true },
}).module("users", {
  prisma: "user",
  permissions: {
    list: "authenticated",
    get: "authenticated",
    create: "authenticated",
    update: "authenticated",
    delete: "authenticated",
  },
});

const port = Number(process.env.PORT ?? 3017);
await app.start(port);
