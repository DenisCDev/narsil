//! Narsil's optional [Axum](https://docs.rs/axum) runtime.
//!
//! Same analog as the TypeScript engine: one table becomes
//! `GET+POST /api/{module}` and `GET+PATCH+DELETE /api/{module}/{id}`.
//! Same JSON error envelope, so `@narsil/client-sdk` keeps working.
//!
//! Elysia remains the default (`narsil init`). This crate is
//! `narsil init --runtime axum`.

mod app;
mod auth;
mod error;
mod ident;
mod module;
mod security;
mod store;

pub use app::App;
pub use auth::{hmac_payload, supabase_jwt, User};
pub use error::AppError;
pub use module::{Column, Crud, Module, Permission, Permissions, TableSpec};
pub use security::{Cors, RateLimit, Security};
#[cfg(feature = "postgres")]
pub use store::connect_postgres;
pub use store::{MemoryStore, Store};
