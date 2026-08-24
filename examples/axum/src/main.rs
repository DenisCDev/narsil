//! Standalone Axum backend. Same `/api/users` analog as the Elysia engine.
//! Next keeps calling `/api/:path*` via rewrite to this process.
//!
//! Supabase: set DATABASE_URL (session/direct port 5432, or pooler 6543 —
//! the crate disables prepared statements for pgbouncer) and optionally
//! SUPABASE_JWT_SECRET.

use narsil_axum::{
    connect_postgres, hmac_payload, supabase_jwt, App, Cors, Module, Permission, Permissions, Security, TableSpec,
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
            Module::new(users)
                .list_limit(20, 100)
                .perms(
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
