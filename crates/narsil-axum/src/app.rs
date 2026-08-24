use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, Path, Query, State};
use axum::http::header::{AUTHORIZATION, CONTENT_TYPE};
use axum::http::{HeaderMap, HeaderName, HeaderValue, Method, Request, StatusCode, Uri};
use axum::middleware::{self, Next};
use axum::response::Response;
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use tower_http::cors::{AllowOrigin, Any, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::auth::User;
use crate::error::AppError;
use crate::ident::require_ident;
use crate::module::{Module, Permission};
use crate::security::{Cors, RateLimiter, Security};
use crate::store::{ListQuery as StoreList, Store};

pub type AuthFn = Arc<dyn Fn(&str) -> Option<User> + Send + Sync>;

pub struct App {
    store: Store,
    modules: HashMap<String, Module>,
    base_path: String,
    auth: Option<AuthFn>,
    security: Security,
}

#[derive(Clone)]
struct AppState {
    store: Store,
    modules: Arc<HashMap<String, Module>>,
    auth: Option<AuthFn>,
    security: Arc<Security>,
    rate: Option<Arc<RateLimiter>>,
}

struct Prepared {
    module: Module,
    owner_id: Option<String>,
}

#[derive(Deserialize, Default)]
struct ListParams {
    limit: Option<i64>,
    offset: Option<i64>,
}

impl App {
    pub fn memory() -> Self {
        Self::with_store(Store::memory())
    }

    #[cfg(feature = "postgres")]
    pub fn postgres(pool: sqlx::PgPool) -> Self {
        Self::with_store(Store::postgres(pool))
    }

    pub fn with_store(store: Store) -> Self {
        Self {
            store,
            modules: HashMap::new(),
            base_path: "/api".into(),
            auth: None,
            security: Security::default(),
        }
    }

    pub fn base_path(mut self, path: impl Into<String>) -> Self {
        let mut path = path.into();
        if !path.starts_with('/') {
            path.insert(0, '/');
        }
        while path.ends_with('/') && path.len() > 1 {
            path.pop();
        }
        self.base_path = path;
        self
    }

    pub fn auth(mut self, f: impl Fn(&str) -> Option<User> + Send + Sync + 'static) -> Self {
        self.auth = Some(Arc::new(f));
        self
    }

    pub fn security(mut self, security: Security) -> Self {
        self.security = security;
        self
    }

    pub fn module(mut self, name: impl Into<String>, module: Module) -> Self {
        let name = name.into();
        require_ident(&name, "module");
        module.table.validate(module.permissions.uses_owner());
        self.modules.insert(name, module);
        self
    }

    pub fn into_router(self) -> Router {
        let rate = self
            .security
            .rate_limit
            .as_ref()
            .map(|cfg| Arc::new(RateLimiter::new(cfg)));
        let max_body = self.security.max_body_size;
        let helmet = self.security.helmet;
        let cors = cors_layer(&self.security.cors);
        let base = self.base_path.clone();
        let state = AppState {
            store: self.store,
            modules: Arc::new(self.modules),
            auth: self.auth,
            security: Arc::new(self.security),
            rate,
        };

        let mut router = Router::new()
            .route(&format!("{base}/{{module}}"), get(list).post(create))
            .route(
                &format!("{base}/{{module}}/{{id}}"),
                get(get_one).patch(update).delete(delete_one),
            )
            .fallback(fallback)
            .layer(middleware::from_fn_with_state(state.clone(), timeout_mw))
            .layer(middleware::from_fn_with_state(state.clone(), rate_limit_mw));

        if helmet {
            router = router.layer(middleware::from_fn(helmet_mw));
        }

        // Hard cap above max_body so the handler can still emit the analog JSON 413.
        router = router
            .layer(DefaultBodyLimit::max(max_body.saturating_add(65_536)))
            .layer(TraceLayer::new_for_http());

        if let Some(cors) = cors {
            router = router.layer(cors);
        }

        router.with_state(state)
    }

    pub async fn serve(self, port: u16) -> std::io::Result<()> {
        let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into());
        let addr: SocketAddr = format!("{host}:{port}").parse().map_err(|_| {
            std::io::Error::new(std::io::ErrorKind::InvalidInput, "invalid HOST or port")
        })?;
        let base = self.base_path.clone();
        let mut routes: Vec<String> = self.modules.keys().cloned().collect();
        routes.sort();
        let router = self.into_router();
        let listener = tokio::net::TcpListener::bind(addr).await?;
        eprintln!("\n  Narsil Axum — http://{addr}{base}\n");
        for name in routes {
            eprintln!("  GET     {base}/{name}");
            eprintln!("  POST    {base}/{name}");
            eprintln!("  GET     {base}/{name}/{{id}}");
            eprintln!("  PATCH   {base}/{name}/{{id}}");
            eprintln!("  DELETE  {base}/{name}/{{id}}");
        }
        eprintln!();
        axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = tokio::signal::ctrl_c().await;
            })
            .await
    }
}

fn cors_layer(cors: &Cors) -> Option<CorsLayer> {
    let methods = [
        Method::GET,
        Method::POST,
        Method::PUT,
        Method::PATCH,
        Method::DELETE,
        Method::OPTIONS,
    ];
    let headers = [CONTENT_TYPE, AUTHORIZATION];
    match cors {
        Cors::Disabled => None,
        Cors::Any => Some(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(methods)
                .allow_headers(headers),
        ),
        Cors::List(origins) => {
            let parsed: Vec<HeaderValue> = origins.iter().filter_map(|o| o.parse().ok()).collect();
            Some(
                CorsLayer::new()
                    .allow_origin(AllowOrigin::list(parsed))
                    .allow_methods(methods)
                    .allow_headers(headers),
            )
        }
    }
}

async fn fallback(method: Method, uri: Uri) -> AppError {
    AppError::RouteNotFound {
        method: method.to_string(),
        path: uri.path().to_string(),
    }
}

async fn helmet_mw(req: Request<axum::body::Body>, next: Next) -> Response {
    let mut res = next.run(req).await;
    let headers = res.headers_mut();
    insert_static(headers, "x-content-type-options", "nosniff");
    insert_static(headers, "x-frame-options", "DENY");
    insert_static(headers, "x-xss-protection", "0");
    insert_static(
        headers,
        "strict-transport-security",
        "max-age=31536000; includeSubDomains",
    );
    insert_static(
        headers,
        "referrer-policy",
        "strict-origin-when-cross-origin",
    );
    res
}

fn insert_static(headers: &mut HeaderMap, name: &'static str, value: &'static str) {
    headers.insert(
        HeaderName::from_static(name),
        HeaderValue::from_static(value),
    );
}

async fn timeout_mw(
    State(state): State<AppState>,
    req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, AppError> {
    match tokio::time::timeout(state.security.request_timeout, next.run(req)).await {
        Ok(res) => Ok(res),
        Err(_) => Err(AppError::Timeout),
    }
}

async fn rate_limit_mw(
    State(state): State<AppState>,
    headers: HeaderMap,
    req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, AppError> {
    let Some(limiter) = &state.rate else {
        return Ok(next.run(req).await);
    };
    let key = client_ip(&headers);
    let decision = limiter.check(&key);
    if decision.limited {
        return Err(AppError::RateLimit {
            retry_after: decision.retry_after,
        });
    }
    let mut res = next.run(req).await;
    let h = res.headers_mut();
    if let Ok(v) = HeaderValue::from_str(&decision.limit.to_string()) {
        h.insert("x-ratelimit-limit", v);
    }
    if let Ok(v) = HeaderValue::from_str(&decision.remaining.to_string()) {
        h.insert("x-ratelimit-remaining", v);
    }
    if let Ok(v) = HeaderValue::from_str(&decision.reset_epoch.to_string()) {
        h.insert("x-ratelimit-reset", v);
    }
    Ok(res)
}

fn client_ip(headers: &HeaderMap) -> String {
    if let Some(forwarded) = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()) {
        if let Some(first) = forwarded.split(',').next() {
            let trimmed = first.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }
    if let Some(real) = headers.get("x-real-ip").and_then(|v| v.to_str().ok()) {
        if !real.is_empty() {
            return real.to_string();
        }
    }
    "unknown".into()
}

fn user_from(headers: &HeaderMap, auth: &Option<AuthFn>) -> Option<User> {
    let auth = auth.as_ref()?;
    let header = headers.get(AUTHORIZATION)?.to_str().ok()?;
    let token = header.strip_prefix("Bearer ")?;
    auth(token)
}

fn prepare(
    state: &AppState,
    name: &str,
    op: &str,
    method: &str,
    headers: &HeaderMap,
) -> Result<Prepared, AppError> {
    let module = state
        .modules
        .get(name)
        .cloned()
        .ok_or_else(|| AppError::RouteNotFound {
            method: method.into(),
            path: format!("/api/{name}"),
        })?;
    if !module.enabled(op) {
        return Err(AppError::RouteNotFound {
            method: method.into(),
            path: format!("/api/{name}"),
        });
    }
    let user = user_from(headers, &state.auth);
    check_permission(module.permissions.for_op(op), &user)?;
    let owner_id = if user.is_some()
        && (module.table.owner_field.is_some() || module.permissions.uses_owner())
    {
        user.as_ref().map(|u| u.id.clone())
    } else {
        None
    };
    Ok(Prepared { module, owner_id })
}

fn check_permission(rules: Option<&[Permission]>, user: &Option<User>) -> Result<(), AppError> {
    let Some(rules) = rules else {
        return Err(AppError::Forbidden);
    };
    let mut last = AppError::Forbidden;
    for rule in rules {
        match rule {
            Permission::Public => return Ok(()),
            Permission::Authenticated => {
                if user.is_some() {
                    return Ok(());
                }
                last = AppError::Unauthorized;
            }
            Permission::Owner => {
                if user.is_some() {
                    return Ok(());
                }
                last = AppError::Unauthorized;
            }
            Permission::Admin => {
                if user
                    .as_ref()
                    .is_some_and(|u| u.role.as_deref() == Some("admin"))
                {
                    return Ok(());
                }
                last = AppError::Forbidden;
            }
        }
    }
    Err(last)
}

fn parse_json_body(body: Bytes, max: usize) -> Result<Value, AppError> {
    if body.len() > max {
        return Err(AppError::PayloadTooLarge { max_size: max });
    }
    if body.is_empty() {
        return Err(AppError::Validation {
            field: "body".into(),
            message: "Request body is required".into(),
        });
    }
    serde_json::from_slice(&body).map_err(|_| AppError::Validation {
        field: "body".into(),
        message: "invalid json".into(),
    })
}

async fn list(
    State(state): State<AppState>,
    Path(module_name): Path<String>,
    Query(params): Query<ListParams>,
    headers: HeaderMap,
) -> Result<Json<Value>, AppError> {
    let ctx = prepare(&state, &module_name, "list", "GET", &headers)?;
    let mut limit = params.limit.unwrap_or(ctx.module.crud.default_limit);
    if limit <= 0 {
        limit = ctx.module.crud.default_limit;
    }
    limit = limit.min(ctx.module.crud.max_limit);
    let offset = params.offset.unwrap_or(0).max(0);
    let rows = state
        .store
        .list(
            &ctx.module.table,
            StoreList {
                limit,
                offset,
                owner_id: ctx.owner_id,
            },
        )
        .await?;
    Ok(Json(Value::Array(rows)))
}

async fn get_one(
    State(state): State<AppState>,
    Path((module_name, id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Json<Value>, AppError> {
    let ctx = prepare(&state, &module_name, "get", "GET", &headers)?;
    let row = state
        .store
        .get(&ctx.module.table, &id, ctx.owner_id.as_deref())
        .await?;
    Ok(Json(row))
}

async fn create(
    State(state): State<AppState>,
    Path(module_name): Path<String>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let ctx = prepare(&state, &module_name, "create", "POST", &headers)?;
    let json = parse_json_body(body, state.security.max_body_size)?;
    let row = state
        .store
        .create(&ctx.module.table, json, ctx.owner_id.as_deref())
        .await?;
    Ok((StatusCode::CREATED, Json(row)))
}

async fn update(
    State(state): State<AppState>,
    Path((module_name, id)): Path<(String, String)>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<Value>, AppError> {
    let ctx = prepare(&state, &module_name, "update", "PATCH", &headers)?;
    let json = parse_json_body(body, state.security.max_body_size)?;
    let row = state
        .store
        .update(&ctx.module.table, &id, json, ctx.owner_id.as_deref())
        .await?;
    Ok(Json(row))
}

async fn delete_one(
    State(state): State<AppState>,
    Path((module_name, id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Json<Value>, AppError> {
    let ctx = prepare(&state, &module_name, "delete", "DELETE", &headers)?;
    state
        .store
        .delete(&ctx.module.table, &id, ctx.owner_id.as_deref())
        .await?;
    Ok(Json(json!({ "success": true })))
}
