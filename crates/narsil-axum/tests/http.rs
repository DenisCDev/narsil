use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use narsil_axum::{
    App, MemoryStore, Module, Permission, Permissions, RateLimit, Security, Store, TableSpec,
};
use serde_json::{json, Value};
use std::time::Duration;
use tower::ServiceExt;

fn users_table() -> TableSpec {
    TableSpec::new("users")
        .columns_same(["id", "name", "email", "role", "userId"])
        .owner_field("userId")
}

fn public_users() -> Module {
    Module::new(users_table()).perms(Permissions::all_public())
}

async fn send(app: axum::Router, req: Request<Body>) -> (StatusCode, Value, axum::http::HeaderMap) {
    let res = app.oneshot(req).await.expect("router");
    let status = res.status();
    let headers = res.headers().clone();
    let bytes = res.into_body().collect().await.expect("body").to_bytes();
    let json = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    (status, json, headers)
}

fn get(uri: &str) -> Request<Body> {
    Request::builder().uri(uri).body(Body::empty()).unwrap()
}

fn get_auth(uri: &str, token: &str) -> Request<Body> {
    Request::builder()
        .uri(uri)
        .header("authorization", format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap()
}

fn post_json(uri: &str, body: Value) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri(uri)
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

fn post_json_auth(uri: &str, body: Value, token: &str) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri(uri)
        .header("content-type", "application/json")
        .header("authorization", format!("Bearer {token}"))
        .body(Body::from(body.to_string()))
        .unwrap()
}

#[tokio::test]
async fn list_empty() {
    let app = App::memory().module("users", public_users()).into_router();
    let (status, json, _) = send(app, get("/api/users")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json, json!([]));
}

#[tokio::test]
async fn crud_roundtrip() {
    let app = App::memory().module("users", public_users()).into_router();

    let (status, created, _) = send(
        app.clone(),
        post_json("/api/users", json!({ "name": "Ada" })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let id = created["id"].as_str().expect("id");
    assert_eq!(created["name"], "Ada");

    let (status, listed, _) = send(app.clone(), get("/api/users")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(listed.as_array().map(|a| a.len()), Some(1));

    let (status, got, _) = send(app.clone(), get(&format!("/api/users/{id}"))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(got["name"], "Ada");

    let (status, updated, _) = send(
        app.clone(),
        Request::builder()
            .method("PATCH")
            .uri(format!("/api/users/{id}"))
            .header("content-type", "application/json")
            .body(Body::from(json!({ "name": "Grace" }).to_string()))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(updated["name"], "Grace");

    let (status, deleted, _) = send(
        app.clone(),
        Request::builder()
            .method("DELETE")
            .uri(format!("/api/users/{id}"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(deleted, json!({ "success": true }));

    let (status, _, _) = send(app, get(&format!("/api/users/{id}"))).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn unknown_route_is_json_404() {
    let app = App::memory().module("users", public_users()).into_router();
    let (status, json, _) = send(app, get("/api/unknown")).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(json["error"]["code"], "NOT_FOUND");
}

#[tokio::test]
async fn authenticated_without_token_is_401() {
    let app = App::memory()
        .module(
            "users",
            Module::new(users_table()).perms(Permissions::new().list(Permission::Authenticated)),
        )
        .into_router();
    let (status, json, _) = send(app, get("/api/users")).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(json["error"]["code"], "UNAUTHORIZED");
}

#[tokio::test]
async fn authenticated_with_token_is_200() {
    let app = App::memory()
        .auth(|t| {
            (t == "valid").then_some(narsil_axum::User {
                id: "u1".into(),
                email: None,
                role: Some("user".into()),
            })
        })
        .module(
            "users",
            Module::new(users_table())
                .perms(Permissions::all_public().list(Permission::Authenticated)),
        )
        .into_router();
    let (status, _, _) = send(app, get_auth("/api/users", "valid")).await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn admin_blocks_non_admin() {
    let app = App::memory()
        .auth(|_| {
            Some(narsil_axum::User {
                id: "u1".into(),
                email: None,
                role: Some("user".into()),
            })
        })
        .module(
            "users",
            Module::new(users_table()).perms(Permissions::all_public().create(Permission::Admin)),
        )
        .into_router();
    let (status, json, _) = send(
        app,
        post_json_auth("/api/users", json!({ "name": "X" }), "t"),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(json["error"]["code"], "FORBIDDEN");
}

#[tokio::test]
async fn missing_permission_is_403() {
    let app = App::memory()
        .module(
            "users",
            Module::new(users_table()).perms(Permissions::new().list(Permission::Public)),
        )
        .into_router();
    let (status, _, _) = send(
        app,
        Request::builder()
            .method("DELETE")
            .uri("/api/users/1")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn owner_rejects_anonymous() {
    let app = App::memory()
        .module(
            "users",
            Module::new(users_table()).perms(Permissions::all_public().get(Permission::Owner)),
        )
        .into_router();
    let (status, _, _) = send(app, get("/api/users/1")).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn owner_does_not_leak_foreign_row() {
    let mem = MemoryStore::new();
    mem.seed(
        "users",
        vec![json!({ "id": "foreign", "name": "Other", "userId": "u2" })],
    );
    let app = App::with_store(Store::Memory(mem))
        .auth(|_| {
            Some(narsil_axum::User {
                id: "u1".into(),
                email: None,
                role: Some("user".into()),
            })
        })
        .module(
            "users",
            Module::new(users_table()).perms(Permissions::all_public().get(Permission::Owner)),
        )
        .into_router();
    let (status, json, _) = send(app, get_auth("/api/users/foreign", "t")).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(json["error"]["code"], "NOT_FOUND");
}

#[tokio::test]
async fn create_stamps_owner_and_ignores_spoofed_field() {
    let app = App::memory()
        .auth(|_| {
            Some(narsil_axum::User {
                id: "u1".into(),
                email: None,
                role: Some("user".into()),
            })
        })
        .module(
            "users",
            Module::new(users_table()).perms(
                Permissions::all_public()
                    .create(Permission::Authenticated)
                    .update(Permission::Owner),
            ),
        )
        .into_router();
    let (status, body, _) = send(
        app,
        post_json_auth(
            "/api/users",
            json!({ "name": "Mine", "userId": "attacker", "role": "admin" }),
            "t",
        ),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(body["userId"], "u1");
    assert!(body.get("role").is_none() || body["role"].is_null());
}

#[tokio::test]
async fn invalid_json_is_400() {
    let app = App::memory().module("users", public_users()).into_router();
    let (status, json, _) = send(
        app,
        Request::builder()
            .method("POST")
            .uri("/api/users")
            .header("content-type", "application/json")
            .body(Body::from("{not-json"))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(json["error"]["code"], "VALIDATION_ERROR");
}

#[tokio::test]
async fn rate_limit_after_max() {
    let app = App::memory()
        .security(Security {
            rate_limit: Some(RateLimit {
                window: Duration::from_secs(60),
                max: 1,
            }),
            ..Security::default()
        })
        .module("users", public_users())
        .into_router();
    let (first, _, _) = send(app.clone(), get("/api/users")).await;
    let (second, json, _) = send(app, get("/api/users")).await;
    assert_eq!(first, StatusCode::OK);
    assert_eq!(second, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(json["error"]["code"], "RATE_LIMIT_EXCEEDED");
}

#[tokio::test]
async fn cors_echoes_listed_origin() {
    let app = App::memory()
        .security(Security {
            cors: narsil_axum::Cors::List(vec![
                "https://app.example".into(),
                "https://admin.example".into(),
            ]),
            rate_limit: None,
            ..Security::default()
        })
        .module("users", public_users())
        .into_router();
    let (status, _, headers) = send(
        app,
        Request::builder()
            .uri("/api/users")
            .header("origin", "https://admin.example")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        headers
            .get("access-control-allow-origin")
            .and_then(|v| v.to_str().ok()),
        Some("https://admin.example")
    );
}

#[tokio::test]
async fn oversized_body_is_413() {
    let app = App::memory()
        .security(Security {
            max_body_size: 8,
            rate_limit: None,
            ..Security::default()
        })
        .module("users", public_users())
        .into_router();
    let (status, json, _) = send(
        app,
        post_json("/api/users", json!({ "name": "way-too-long-name" })),
    )
    .await;
    assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
    assert_eq!(json["error"]["code"], "PAYLOAD_TOO_LARGE");
}

#[tokio::test]
async fn strips_id_on_write() {
    let app = App::memory().module("users", public_users()).into_router();
    let (status, body, _) = send(
        app,
        post_json("/api/users", json!({ "id": "attacker", "name": "Ada" })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_ne!(body["id"], "attacker");
    assert_eq!(body["name"], "Ada");
}
