/**
 * Narsil Backend Server
 *
 * Independent deployable backend.
 * Run: npx tsx --watch src/server.ts
 */
import { createApp } from "narsil";
import { db } from "./db/client.js";
import { postsModule } from "./modules/posts.js";
import { usersModule } from "./modules/users.js";

const app = createApp({
  db,
  basePath: "/api",
  security: {
    rateLimit: { windowMs: 60_000, max: 100 },
    helmet: true,
    cors: { origin: "http://localhost:3000" },
    maxBodySize: 1_048_576,
  },
})
  .module("users", usersModule)
  .module("posts", postsModule);

app.start(3001);

export default app;
export type AppType = typeof app;
