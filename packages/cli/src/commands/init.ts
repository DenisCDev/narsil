/**
 * CLI: init command
 *
 * Scaffolds a Narsil v2 backend project.
 * Detects Next.js or Vite and creates the appropriate structure.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function execute(_args: string[]): Promise<void> {
  const cwd = process.cwd();

  console.log("\n  Narsil — Initializing project...\n");

  // Detect frontend framework
  const isNextjs =
    existsSync(join(cwd, "next.config.js")) ||
    existsSync(join(cwd, "next.config.ts")) ||
    existsSync(join(cwd, "next.config.mjs"));
  const isVite = existsSync(join(cwd, "vite.config.ts")) || existsSync(join(cwd, "vite.config.js"));

  if (isNextjs) console.log("  Detected: Next.js project");
  else if (isVite) console.log("  Detected: Vite project");
  else console.log("  No frontend framework detected — creating standalone backend");

  // Create backend directory structure
  const backendDir = join(cwd, "backend");
  const dirs = [join(backendDir, "src", "db"), join(backendDir, "src", "modules")];

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }

  // Generate backend/src/db/schema.ts
  if (!existsSync(join(backendDir, "src", "db", "schema.ts"))) {
    writeFileSync(
      join(backendDir, "src", "db", "schema.ts"),
      `import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").default("user"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})
`,
    );
    console.log("  Created: backend/src/db/schema.ts");
  }

  // Generate backend/src/db/client.ts
  if (!existsSync(join(backendDir, "src", "db", "client.ts"))) {
    writeFileSync(
      join(backendDir, "src", "db", "client.ts"),
      `import { createDb } from "@narsil/drizzle"

export const db = await createDb({
  url: process.env.DATABASE_URL!,
})
`,
    );
    console.log("  Created: backend/src/db/client.ts");
  }

  // Generate backend/src/modules/users.ts
  if (!existsSync(join(backendDir, "src", "modules", "users.ts"))) {
    writeFileSync(
      join(backendDir, "src", "modules", "users.ts"),
      `import { defineModule } from "narsil"
import { users } from "../db/schema"

export const usersModule = defineModule({
  schema: users,
  crud: {
    list: { defaultLimit: 20, maxLimit: 100 },
    create: true,
    update: true,
    delete: true,
  },
  permissions: {
    list: "public",
    create: "authenticated",
    update: "owner",
    delete: "admin",
  },
})
`,
    );
    console.log("  Created: backend/src/modules/users.ts");
  }

  // Generate backend/src/server.ts
  if (!existsSync(join(backendDir, "src", "server.ts"))) {
    writeFileSync(
      join(backendDir, "src", "server.ts"),
      `import { createApp } from "narsil"
import { db } from "./db/client"
import { usersModule } from "./modules/users"

const app = createApp({ db })
  .module("users", usersModule)

app.start(3001)

export default app
export type AppType = typeof app
`,
    );
    console.log("  Created: backend/src/server.ts");
  }

  // Generate backend/drizzle.config.ts
  if (!existsSync(join(backendDir, "drizzle.config.ts"))) {
    writeFileSync(
      join(backendDir, "drizzle.config.ts"),
      `import { defineConfig } from "drizzle-kit"

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
`,
    );
    console.log("  Created: backend/drizzle.config.ts");
  }

  // Generate backend/package.json
  if (!existsSync(join(backendDir, "package.json"))) {
    writeFileSync(
      join(backendDir, "package.json"),
      `${JSON.stringify(
        {
          name: "backend",
          private: true,
          type: "module",
          scripts: {
            dev: "tsx --watch src/server.ts",
            build: "tsc",
            start: "node dist/server.js",
            "db:push": "drizzle-kit push",
            "db:pull": "drizzle-kit pull",
            "db:generate": "drizzle-kit generate",
            "db:migrate": "drizzle-kit migrate",
          },
          dependencies: {
            narsil: "latest",
            "@narsil/drizzle": "latest",
            "drizzle-orm": "latest",
            postgres: "latest",
          },
          devDependencies: {
            "drizzle-kit": "latest",
            tsx: "latest",
            typescript: "^5.9.0",
          },
        },
        null,
        2,
      )}\n`,
    );
    console.log("  Created: backend/package.json");
  }

  console.log("\n  Done! Next steps:");
  console.log("  1. Set DATABASE_URL in your environment");
  console.log("  2. cd backend && npm install");
  console.log("  3. npx narsil dev");
  console.log();
}
