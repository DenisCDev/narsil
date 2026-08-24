use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::{json, Value};

/// Same envelope as `NexusError.toJSON()` in the TypeScript engine.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Validation failed: {field} — {message}")]
    Validation { field: String, message: String },
    #[error("{resource}{} not found", .id.as_deref().map(|id| format!(" ({id})")).unwrap_or_default())]
    NotFound {
        resource: String,
        id: Option<String>,
    },
    #[error("Route not found: {method} {path}")]
    RouteNotFound { method: String, path: String },
    #[error("Authentication required")]
    Unauthorized,
    #[error("Permission denied")]
    Forbidden,
    #[error("Too many requests")]
    RateLimit { retry_after: u64 },
    #[error("Request body too large (max: {max_size} bytes)")]
    PayloadTooLarge { max_size: usize },
    #[error("Request timed out")]
    Timeout,
    #[error("Internal server error")]
    Database,
    #[error("Internal server error")]
    Internal,
}

impl AppError {
    pub fn status(&self) -> StatusCode {
        match self {
            Self::Validation { .. } => StatusCode::BAD_REQUEST,
            Self::NotFound { .. } | Self::RouteNotFound { .. } => StatusCode::NOT_FOUND,
            Self::Unauthorized => StatusCode::UNAUTHORIZED,
            Self::Forbidden => StatusCode::FORBIDDEN,
            Self::RateLimit { .. } => StatusCode::TOO_MANY_REQUESTS,
            Self::PayloadTooLarge { .. } => StatusCode::PAYLOAD_TOO_LARGE,
            Self::Timeout => StatusCode::GATEWAY_TIMEOUT,
            Self::Database | Self::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    pub fn code(&self) -> &'static str {
        match self {
            Self::Validation { .. } => "VALIDATION_ERROR",
            Self::NotFound { .. } | Self::RouteNotFound { .. } => "NOT_FOUND",
            Self::Unauthorized => "UNAUTHORIZED",
            Self::Forbidden => "FORBIDDEN",
            Self::RateLimit { .. } => "RATE_LIMIT_EXCEEDED",
            Self::PayloadTooLarge { .. } => "PAYLOAD_TOO_LARGE",
            Self::Timeout => "TIMEOUT",
            Self::Database | Self::Internal => "INTERNAL_ERROR",
        }
    }

    pub fn to_json(&self) -> Value {
        let mut error = serde_json::Map::new();
        error.insert("code".into(), Value::String(self.code().into()));
        error.insert("message".into(), Value::String(self.to_string()));
        match self {
            Self::Validation { field, message } => {
                error.insert(
                    "details".into(),
                    json!({ "field": field, "message": message }),
                );
            }
            Self::NotFound { resource, id } => {
                error.insert("details".into(), json!({ "resource": resource, "id": id }));
            }
            Self::RateLimit { retry_after } => {
                error.insert("details".into(), json!({ "retryAfter": retry_after }));
            }
            Self::PayloadTooLarge { max_size } => {
                error.insert("details".into(), json!({ "maxSize": max_size }));
            }
            _ => {}
        }
        json!({ "error": error })
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let mut response = (self.status(), Json(self.to_json())).into_response();
        if let Self::RateLimit { retry_after } = &self {
            if let Ok(value) = axum::http::HeaderValue::from_str(&retry_after.to_string()) {
                response.headers_mut().insert("retry-after", value);
            }
        }
        response
    }
}

#[cfg(test)]
mod tests {
    use super::AppError;

    #[test]
    fn validation_envelope_matches_typescript() {
        let err = AppError::Validation {
            field: "body".into(),
            message: "invalid json".into(),
        };
        let json = err.to_json();
        assert_eq!(json["error"]["code"], "VALIDATION_ERROR");
        assert_eq!(json["error"]["details"]["field"], "body");
    }
}
