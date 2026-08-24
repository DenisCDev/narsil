use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use serde_json::{Map, Value};
use uuid::Uuid;

use crate::error::AppError;
use crate::module::TableSpec;

#[cfg(feature = "postgres")]
use crate::ident::sql_ident;
#[cfg(feature = "postgres")]
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
#[cfg(feature = "postgres")]
use sqlx::{PgPool, Postgres, QueryBuilder, Row};
#[cfg(feature = "postgres")]
use std::str::FromStr;
#[cfg(feature = "postgres")]
use std::time::Duration;

#[cfg(feature = "postgres")]
const DB_DEADLINE: Duration = Duration::from_secs(5);
const DENIED_WRITE: &[&str] = &[
    "id",
    "role",
    "createdAt",
    "updatedAt",
    "created_at",
    "updated_at",
];

#[derive(Clone)]
pub enum Store {
    Memory(MemoryStore),
    #[cfg(feature = "postgres")]
    Postgres(PgPool),
}

#[derive(Clone, Default)]
pub struct MemoryStore {
    inner: Arc<RwLock<HashMap<String, HashMap<String, Map<String, Value>>>>>,
}

pub struct ListQuery {
    pub limit: i64,
    pub offset: i64,
    pub owner_id: Option<String>,
}

#[cfg(feature = "postgres")]
pub async fn connect_postgres(url: &str) -> Result<PgPool, AppError> {
    if url.is_empty() {
        return Err(AppError::Database);
    }
    // statement_cache_capacity(0): Supabase transaction pooler (port 6543 / pgbouncer)
    // rejects prepared statements. Direct/session (5432) still works with the cache off.
    let opts = match PgConnectOptions::from_str(url) {
        Ok(opts) => opts.statement_cache_capacity(0),
        Err(error) => {
            tracing::error!(%error, "invalid DATABASE_URL");
            return Err(AppError::Database);
        }
    };
    match tokio::time::timeout(
        Duration::from_secs(8),
        PgPoolOptions::new()
            .max_connections(10)
            .acquire_timeout(Duration::from_secs(5))
            .connect_with(opts),
    )
    .await
    {
        Ok(Ok(pool)) => Ok(pool),
        Ok(Err(error)) => {
            tracing::error!(%error, "failed to connect to postgres");
            Err(AppError::Database)
        }
        Err(_) => {
            tracing::error!("postgres connect deadline exceeded");
            Err(AppError::Database)
        }
    }
}

impl MemoryStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn seed(&self, table: &str, rows: Vec<Value>) {
        let mut guard = self.inner.write().unwrap_or_else(|e| e.into_inner());
        let map = guard.entry(table.to_string()).or_default();
        for row in rows {
            if let Value::Object(obj) = row {
                let id = obj
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                if !id.is_empty() {
                    map.insert(id, obj);
                }
            }
        }
    }
}

impl Store {
    pub fn memory() -> Self {
        Store::Memory(MemoryStore::new())
    }

    #[cfg(feature = "postgres")]
    pub fn postgres(pool: PgPool) -> Self {
        Store::Postgres(pool)
    }

    pub async fn list(&self, spec: &TableSpec, query: ListQuery) -> Result<Vec<Value>, AppError> {
        match self {
            Store::Memory(store) => store.list(spec, query),
            #[cfg(feature = "postgres")]
            Store::Postgres(pool) => pg_list(pool, spec, query).await,
        }
    }

    pub async fn get(
        &self,
        spec: &TableSpec,
        id: &str,
        owner_id: Option<&str>,
    ) -> Result<Value, AppError> {
        match self {
            Store::Memory(store) => store.get(spec, id, owner_id),
            #[cfg(feature = "postgres")]
            Store::Postgres(pool) => pg_get(pool, spec, id, owner_id).await,
        }
    }

    pub async fn create(
        &self,
        spec: &TableSpec,
        body: Value,
        owner_id: Option<&str>,
    ) -> Result<Value, AppError> {
        match self {
            Store::Memory(store) => store.create(spec, body, owner_id),
            #[cfg(feature = "postgres")]
            Store::Postgres(pool) => pg_create(pool, spec, body, owner_id).await,
        }
    }

    pub async fn update(
        &self,
        spec: &TableSpec,
        id: &str,
        body: Value,
        owner_id: Option<&str>,
    ) -> Result<Value, AppError> {
        match self {
            Store::Memory(store) => store.update(spec, id, body, owner_id),
            #[cfg(feature = "postgres")]
            Store::Postgres(pool) => pg_update(pool, spec, id, body, owner_id).await,
        }
    }

    pub async fn delete(
        &self,
        spec: &TableSpec,
        id: &str,
        owner_id: Option<&str>,
    ) -> Result<(), AppError> {
        match self {
            Store::Memory(store) => store.delete(spec, id, owner_id),
            #[cfg(feature = "postgres")]
            Store::Postgres(pool) => pg_delete(pool, spec, id, owner_id).await,
        }
    }
}

impl MemoryStore {
    fn tables(
        &self,
    ) -> Result<
        std::sync::RwLockReadGuard<'_, HashMap<String, HashMap<String, Map<String, Value>>>>,
        AppError,
    > {
        self.inner.read().map_err(|_| AppError::Internal)
    }

    fn tables_mut(
        &self,
    ) -> Result<
        std::sync::RwLockWriteGuard<'_, HashMap<String, HashMap<String, Map<String, Value>>>>,
        AppError,
    > {
        self.inner.write().map_err(|_| AppError::Internal)
    }

    fn list(&self, spec: &TableSpec, query: ListQuery) -> Result<Vec<Value>, AppError> {
        let guard = self.tables()?;
        let mut rows: Vec<Value> = guard
            .get(&spec.table)
            .map(|t| {
                t.values()
                    .filter(|row| owner_matches(spec, row, query.owner_id.as_deref()))
                    .cloned()
                    .map(Value::Object)
                    .collect()
            })
            .unwrap_or_default();
        let offset = query.offset.max(0) as usize;
        let limit = query.limit.max(0) as usize;
        if offset >= rows.len() {
            return Ok(Vec::new());
        }
        rows = rows.into_iter().skip(offset).take(limit).collect();
        Ok(rows)
    }

    fn get(&self, spec: &TableSpec, id: &str, owner_id: Option<&str>) -> Result<Value, AppError> {
        let guard = self.tables()?;
        let row = guard
            .get(&spec.table)
            .and_then(|t| t.get(id))
            .cloned()
            .ok_or_else(|| AppError::NotFound {
                resource: spec.table.clone(),
                id: Some(id.into()),
            })?;
        if !owner_matches(spec, &row, owner_id) {
            return Err(AppError::NotFound {
                resource: spec.table.clone(),
                id: Some(id.into()),
            });
        }
        Ok(Value::Object(row))
    }

    fn create(
        &self,
        spec: &TableSpec,
        body: Value,
        owner_id: Option<&str>,
    ) -> Result<Value, AppError> {
        let mut row = sanitize_write(spec, body, owner_id, true)?;
        let id = Uuid::new_v4().to_string();
        row.insert(spec.pk_api.clone(), Value::String(id.clone()));
        let mut guard = self.tables_mut()?;
        guard
            .entry(spec.table.clone())
            .or_default()
            .insert(id, row.clone());
        Ok(Value::Object(row))
    }

    fn update(
        &self,
        spec: &TableSpec,
        id: &str,
        body: Value,
        owner_id: Option<&str>,
    ) -> Result<Value, AppError> {
        let patch = sanitize_write(spec, body, None, false)?;
        let mut guard = self.tables_mut()?;
        let table = guard.entry(spec.table.clone()).or_default();
        let row = table.get_mut(id).ok_or_else(|| AppError::NotFound {
            resource: spec.table.clone(),
            id: Some(id.into()),
        })?;
        if !owner_matches(spec, row, owner_id) {
            return Err(AppError::NotFound {
                resource: spec.table.clone(),
                id: Some(id.into()),
            });
        }
        for (k, v) in patch {
            row.insert(k, v);
        }
        Ok(Value::Object(row.clone()))
    }

    fn delete(&self, spec: &TableSpec, id: &str, owner_id: Option<&str>) -> Result<(), AppError> {
        let mut guard = self.tables_mut()?;
        let table = guard
            .get_mut(&spec.table)
            .ok_or_else(|| AppError::NotFound {
                resource: spec.table.clone(),
                id: Some(id.into()),
            })?;
        let row = table.get(id).ok_or_else(|| AppError::NotFound {
            resource: spec.table.clone(),
            id: Some(id.into()),
        })?;
        if !owner_matches(spec, row, owner_id) {
            return Err(AppError::NotFound {
                resource: spec.table.clone(),
                id: Some(id.into()),
            });
        }
        table.remove(id);
        Ok(())
    }
}

fn owner_matches(spec: &TableSpec, row: &Map<String, Value>, owner_id: Option<&str>) -> bool {
    let Some(owner_id) = owner_id else {
        return true;
    };
    let Some(col) = spec.owner_column() else {
        return true;
    };
    row.get(&col.api).and_then(|v| v.as_str()) == Some(owner_id)
}

fn sanitize_write(
    spec: &TableSpec,
    body: Value,
    owner_id: Option<&str>,
    stamp_owner: bool,
) -> Result<Map<String, Value>, AppError> {
    let Value::Object(input) = body else {
        return Err(AppError::Validation {
            field: "body".into(),
            message: "Request body is required".into(),
        });
    };
    let mut out = Map::new();
    for (key, value) in input {
        if DENIED_WRITE.contains(&key.as_str()) {
            continue;
        }
        if spec.owner_field.as_deref() == Some(key.as_str()) {
            continue;
        }
        if spec.column_by_api(&key).is_none() {
            continue;
        }
        out.insert(key, value);
    }
    if stamp_owner {
        if let (Some(col), Some(id)) = (spec.owner_column(), owner_id) {
            out.insert(col.api.clone(), Value::String(id.to_string()));
        }
    }
    Ok(out)
}

#[cfg(feature = "postgres")]
fn remap_db_to_api(spec: &TableSpec, value: Value) -> Value {
    let Value::Object(obj) = value else {
        return value;
    };
    let mut out = Map::new();
    for (db_key, v) in obj {
        if let Some(col) = spec.columns.iter().find(|c| c.db == db_key) {
            out.insert(col.api.clone(), v);
        }
    }
    Value::Object(out)
}

#[cfg(feature = "postgres")]
fn api_to_db_object(spec: &TableSpec, api_obj: Map<String, Value>) -> Map<String, Value> {
    let mut out = Map::new();
    for (api, v) in api_obj {
        if let Some(col) = spec.column_by_api(&api) {
            out.insert(col.db.clone(), v);
        }
    }
    out
}

#[cfg(feature = "postgres")]
async fn deadline<T>(
    fut: impl std::future::Future<Output = Result<T, sqlx::Error>>,
) -> Result<T, AppError> {
    match tokio::time::timeout(DB_DEADLINE, fut).await {
        Ok(Ok(v)) => Ok(v),
        Ok(Err(error)) => {
            tracing::error!(%error, "database error");
            Err(AppError::Database)
        }
        Err(_) => {
            tracing::error!("database deadline exceeded");
            Err(AppError::Database)
        }
    }
}

#[cfg(feature = "postgres")]
fn owner_filter<'a>(spec: &'a TableSpec, owner_id: Option<&'a str>) -> Option<(&'a str, &'a str)> {
    match (spec.owner_column(), owner_id) {
        (Some(col), Some(id)) => Some((col.db.as_str(), id)),
        _ => None,
    }
}

#[cfg(feature = "postgres")]
async fn pg_list(
    pool: &PgPool,
    spec: &TableSpec,
    query: ListQuery,
) -> Result<Vec<Value>, AppError> {
    let table = sql_ident(&spec.table)?;
    let mut qb = QueryBuilder::<Postgres>::new("SELECT to_jsonb(t) AS data FROM (SELECT ");
    qb.push(projection(spec)?);
    qb.push(" FROM ");
    qb.push(table);
    if let Some((col, id)) = owner_filter(spec, query.owner_id.as_deref()) {
        let col = sql_ident(col)?;
        qb.push(" WHERE ");
        qb.push(col);
        qb.push(" = ");
        push_pk_bind(&mut qb, id);
    }
    qb.push(" LIMIT ");
    qb.push_bind(query.limit);
    qb.push(" OFFSET ");
    qb.push_bind(query.offset);
    qb.push(") t");
    let rows = deadline(qb.build().fetch_all(pool)).await?;
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let data: Value = row.try_get("data").map_err(|_| AppError::Database)?;
        out.push(remap_db_to_api(spec, data));
    }
    Ok(out)
}

#[cfg(feature = "postgres")]
async fn pg_get(
    pool: &PgPool,
    spec: &TableSpec,
    id: &str,
    owner_id: Option<&str>,
) -> Result<Value, AppError> {
    let table = sql_ident(&spec.table)?;
    let pk = sql_ident(&spec.pk_column().db)?;
    let mut qb = QueryBuilder::<Postgres>::new("SELECT to_jsonb(t) AS data FROM (SELECT ");
    qb.push(projection(spec)?);
    qb.push(" FROM ");
    qb.push(table);
    qb.push(" WHERE ");
    qb.push(pk);
    qb.push(" = ");
    push_pk_bind(&mut qb, id);
    if let Some((col, oid)) = owner_filter(spec, owner_id) {
        let col = sql_ident(col)?;
        qb.push(" AND ");
        qb.push(col);
        qb.push(" = ");
        push_pk_bind(&mut qb, oid);
    }
    qb.push(" LIMIT 1) t");
    let row = deadline(qb.build().fetch_optional(pool)).await?;
    let Some(row) = row else {
        return Err(AppError::NotFound {
            resource: spec.table.clone(),
            id: Some(id.into()),
        });
    };
    let data: Value = row.try_get("data").map_err(|_| AppError::Database)?;
    Ok(remap_db_to_api(spec, data))
}

#[cfg(feature = "postgres")]
async fn pg_create(
    pool: &PgPool,
    spec: &TableSpec,
    body: Value,
    owner_id: Option<&str>,
) -> Result<Value, AppError> {
    let api_obj = sanitize_write(spec, body, owner_id, true)?;
    let db_obj = api_to_db_object(spec, api_obj);
    if db_obj.is_empty() {
        return Err(AppError::Validation {
            field: "body".into(),
            message: "Request body is required".into(),
        });
    }
    let table = sql_ident(&spec.table)?;
    let mut qb = QueryBuilder::<Postgres>::new("INSERT INTO ");
    qb.push(table);
    qb.push(" (");
    {
        let mut sep = qb.separated(", ");
        for key in db_obj.keys() {
            sep.push(sql_ident(key)?);
        }
    }
    qb.push(") VALUES (");
    {
        let mut sep = qb.separated(", ");
        for value in db_obj.values() {
            push_json_bind(&mut sep, value);
        }
    }
    qb.push(") RETURNING to_jsonb(");
    qb.push(table);
    qb.push(".*) AS data");
    let row = deadline(qb.build().fetch_one(pool)).await?;
    let data: Value = row.try_get("data").map_err(|_| AppError::Database)?;
    Ok(remap_db_to_api(spec, data))
}

#[cfg(feature = "postgres")]
async fn pg_update(
    pool: &PgPool,
    spec: &TableSpec,
    id: &str,
    body: Value,
    owner_id: Option<&str>,
) -> Result<Value, AppError> {
    let api_obj = sanitize_write(spec, body, None, false)?;
    let db_obj = api_to_db_object(spec, api_obj);
    if db_obj.is_empty() {
        return Err(AppError::Validation {
            field: "body".into(),
            message: "Request body is required".into(),
        });
    }
    let table = sql_ident(&spec.table)?;
    let pk = sql_ident(&spec.pk_column().db)?;
    let mut qb = QueryBuilder::<Postgres>::new("UPDATE ");
    qb.push(table);
    qb.push(" SET ");
    {
        let mut sep = qb.separated(", ");
        for (key, value) in &db_obj {
            sep.push(sql_ident(key)?);
            sep.push_unseparated(" = ");
            push_json_bind(&mut sep, value);
        }
    }
    qb.push(" WHERE ");
    qb.push(pk);
    qb.push(" = ");
    push_pk_bind(&mut qb, id);
    if let Some((col, oid)) = owner_filter(spec, owner_id) {
        let col = sql_ident(col)?;
        qb.push(" AND ");
        qb.push(col);
        qb.push(" = ");
        push_pk_bind(&mut qb, oid);
    }
    qb.push(" RETURNING to_jsonb(");
    qb.push(table);
    qb.push(".*) AS data");
    let row = deadline(qb.build().fetch_optional(pool)).await?;
    let Some(row) = row else {
        return Err(AppError::NotFound {
            resource: spec.table.clone(),
            id: Some(id.into()),
        });
    };
    let data: Value = row.try_get("data").map_err(|_| AppError::Database)?;
    Ok(remap_db_to_api(spec, data))
}

#[cfg(feature = "postgres")]
async fn pg_delete(
    pool: &PgPool,
    spec: &TableSpec,
    id: &str,
    owner_id: Option<&str>,
) -> Result<(), AppError> {
    let table = sql_ident(&spec.table)?;
    let pk = sql_ident(&spec.pk_column().db)?;
    let mut qb = QueryBuilder::<Postgres>::new("DELETE FROM ");
    qb.push(table);
    qb.push(" WHERE ");
    qb.push(pk);
    qb.push(" = ");
    push_pk_bind(&mut qb, id);
    if let Some((col, oid)) = owner_filter(spec, owner_id) {
        let col = sql_ident(col)?;
        qb.push(" AND ");
        qb.push(col);
        qb.push(" = ");
        push_pk_bind(&mut qb, oid);
    }
    qb.push(" RETURNING ");
    qb.push(pk);
    let row = deadline(qb.build().fetch_optional(pool)).await?;
    if row.is_none() {
        return Err(AppError::NotFound {
            resource: spec.table.clone(),
            id: Some(id.into()),
        });
    }
    Ok(())
}

#[cfg(feature = "postgres")]
fn projection(spec: &TableSpec) -> Result<String, AppError> {
    let mut cols = Vec::new();
    for col in &spec.columns {
        cols.push(sql_ident(&col.db)?.to_string());
    }
    Ok(cols.join(", "))
}

#[cfg(feature = "postgres")]
fn push_pk_bind(qb: &mut QueryBuilder<'_, Postgres>, raw: &str) {
    if let Ok(u) = Uuid::parse_str(raw) {
        qb.push_bind(u);
    } else if let Ok(i) = raw.parse::<i64>() {
        qb.push_bind(i);
    } else {
        qb.push_bind(raw.to_string());
    }
}

#[cfg(feature = "postgres")]
fn push_json_bind(sep: &mut sqlx::query_builder::Separated<'_, '_, Postgres, &str>, value: &Value) {
    match value {
        Value::Null => {
            sep.push_bind(None::<String>);
        }
        Value::Bool(b) => {
            sep.push_bind(*b);
        }
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                sep.push_bind(i);
            } else if let Some(f) = n.as_f64() {
                sep.push_bind(f);
            } else {
                sep.push_bind(n.to_string());
            }
        }
        Value::String(s) => {
            if let Ok(u) = Uuid::parse_str(s) {
                sep.push_bind(u);
            } else if let Ok(i) = s.parse::<i64>() {
                sep.push_bind(i);
            } else {
                sep.push_bind(s.clone());
            }
        }
        other => {
            sep.push_bind(sqlx::types::Json(other.clone()));
        }
    }
}
