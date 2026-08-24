//! In-memory Axum process used by `node bench/run.mjs`.
//! Same HMAC token as `bench/shared.mjs`, same 50-row list, rate-limit off.

use narsil_axum::{
    hmac_payload, App, MemoryStore, Module, Permission, Permissions, Security, Store, TableSpec,
};
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mem = MemoryStore::new();
    let rows: Vec<_> = (1..=50)
        .map(|i| {
            json!({
                "id": i.to_string(),
                "name": format!("User {i}"),
                "email": format!("user{i}@bench.local"),
            })
        })
        .collect();
    mem.seed("users", rows);

    let secret =
        std::env::var("NARSIL_HMAC_SECRET").unwrap_or_else(|_| "bench-hmac-fixture-key".into());

    let users = TableSpec::new("users").columns_same(["id", "name", "email"]);

    let app = App::with_store(Store::Memory(mem))
        .auth(hmac_payload(secret))
        .security(Security {
            rate_limit: None,
            ..Security::default()
        })
        .module(
            "users",
            Module::new(users).perms(
                Permissions::new()
                    .list(Permission::Authenticated)
                    .get(Permission::Authenticated)
                    .create(Permission::Authenticated)
                    .update(Permission::Authenticated)
                    .delete(Permission::Authenticated),
            ),
        );

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3018);
    app.serve(port).await?;
    Ok(())
}
