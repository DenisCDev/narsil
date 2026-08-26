/**
 * Scaffolds a Rust/Axum backend that speaks the same /api analog as Narsil on TypeScript.
 * Copies crates/narsil-axum into backend/crates so the project is self-contained.
 */

import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveAxumCrateDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "../../../../crates/narsil-axum"),
    join(here, "../../../crates/narsil-axum"),
    join(here, "../../templates/narsil-axum"),
  ];
  const found = candidates.find((c) => existsSync(join(c, "Cargo.toml")));
  if (!found) {
    throw new Error("Axum crate not found. Run narsil from the Narsil repo, or reinstall @narsil/cli.");
  }
  return found;
}

function copyCrate(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, {
    recursive: true,
    filter: (from) => {
      const n = from.replace(/\\/g, "/");
      if (n.includes("/target/") || n.endsWith("/target")) return false;
      if (n.includes("/.git/") || n.endsWith("/.git")) return false;
      return true;
    },
  });
}

export async function scaffoldAxum(cwd: string): Promise<void> {
  // smaug-ignore console-log: CLI progress while scaffolding the Axum backend
  console.log("\n  Narsil — Initializing Axum backend...\n");
  // smaug-ignore console-log: CLI reminds that TypeScript remains the default runtime
  console.log("  Default runtime is still TypeScript on Bun or Node. Axum is the optional long-lived process.\n");

  const backendDir = join(cwd, "backend");
  mkdirSync(join(backendDir, "src"), { recursive: true });

  const crateSrc = resolveAxumCrateDir();
  const crateDest = join(backendDir, "crates", "narsil-axum");
  if (!existsSync(join(crateDest, "Cargo.toml"))) {
    copyCrate(crateSrc, crateDest);
    console.log("  Created: backend/crates/narsil-axum");
  }

  if (!existsSync(join(backendDir, "Cargo.toml"))) {
    writeFileSync(
      join(backendDir, "Cargo.toml"),
      `[workspace]
members = ["crates/narsil-axum"]
resolver = "2"

[package]
name = "backend"
version = "0.1.0"
edition = "2021"
publish = false

[dependencies]
narsil-axum = { path = "crates/narsil-axum", features = ["postgres"] }
tokio = { version = "1", features = ["macros", "rt-multi-thread", "signal"] }
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
`,
    );
    console.log("  Created: backend/Cargo.toml");
  }

  if (!existsSync(join(backendDir, "src", "main.rs"))) {
    writeFileSync(
      join(backendDir, "src", "main.rs"),
      `use narsil_axum::{
    connect_postgres, hmac_payload, supabase_jwt, App, Cors, Module, Permission, Permissions, Security,
    TableSpec,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let url = std::env::var("DATABASE_URL").map_err(|_| "DATABASE_URL is required")?;
    let pool = connect_postgres(&url).await?;

    let users = TableSpec::new("users")
        .columns_same(["id", "name", "email", "role", "active"])
        .column("createdAt", "created_at")
        .column("updatedAt", "updated_at")
        .owner_field("id");

    let mut app = App::postgres(pool)
        .base_path("/api")
        .security(Security {
            cors: Cors::List(vec![
                std::env::var("CORS_ORIGIN").unwrap_or_else(|_| "http://localhost:3000".into()),
            ]),
            ..Security::default()
        })
        .module(
            "users",
            Module::new(users).list_limit(20, 100).perms(
                Permissions::new()
                    .list(Permission::Public)
                    .get(Permission::Public)
                    .create(Permission::Authenticated)
                    .update(Permission::Owner)
                    .delete(Permission::Admin),
            ),
        );

    if let Ok(secret) = std::env::var("SUPABASE_JWT_SECRET") {
        app = app.auth(supabase_jwt(secret));
    } else if let Ok(secret) = std::env::var("NARSIL_HMAC_SECRET") {
        app = app.auth(hmac_payload(secret));
    }

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3001);
    app.serve(port).await?;
    Ok(())
}
`,
    );
    console.log("  Created: backend/src/main.rs");
  }

  if (!existsSync(join(backendDir, "narsil-contract.ts"))) {
    writeFileSync(
      join(backendDir, "narsil-contract.ts"),
      `/**
 * Analog of \`export type AppType = typeof app\` for an Axum backend.
 * The Rust process speaks the same /api URLs; this file is only for the TS client.
 */
type UsersRow = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  active?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type AppType = {
  _routes: {
    users: {
      schema: {
        $inferSelect: UsersRow;
        $inferInsert: Omit<UsersRow, "id" | "createdAt" | "updatedAt">;
      };
    };
  };
};
`,
    );
    console.log("  Created: backend/narsil-contract.ts");
  }

  if (!existsSync(join(backendDir, ".env.example"))) {
    writeFileSync(
      join(backendDir, ".env.example"),
      `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres
SUPABASE_JWT_SECRET=
CORS_ORIGIN=http://localhost:3000
PORT=3001
HOST=0.0.0.0
`,
    );
    console.log("  Created: backend/.env.example");
  }

  console.log("\n  Done! Next steps:");
  console.log("  1. Set DATABASE_URL (Supabase session URI, port 5432) and optionally SUPABASE_JWT_SECRET");
  console.log("  2. cd backend && cargo run");
  console.log("  3. Keep the Next rewrite: /api/:path* → http://127.0.0.1:3001/api/:path*");
  console.log("  4. Client types: import type { AppType } from './backend/narsil-contract'");
  console.log("\n  Axum is a long-lived process (Fly/VPS/Docker). TypeScript stays the default:");
  console.log("  npx narsil init --runtime typescript\n");
}
