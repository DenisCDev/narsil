use crate::error::AppError;

/// Postgres identifier: ASCII letters, digits, underscore; must start with a letter or `_`.
pub fn sql_ident(name: &str) -> Result<&str, AppError> {
    if name.is_empty() || name.len() > 63 {
        return Err(AppError::Validation {
            field: "identifier".into(),
            message: "invalid".into(),
        });
    }
    let mut chars = name.chars();
    let first = chars.next().expect("non-empty checked above");
    if !(first.is_ascii_alphabetic() || first == '_')
        || !chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        return Err(AppError::Validation {
            field: "identifier".into(),
            message: "invalid".into(),
        });
    }
    Ok(name)
}

pub fn require_ident(name: &str, field: &str) {
    if sql_ident(name).is_err() {
        panic!("narsil-axum: {field} `{name}` is not a valid SQL identifier");
    }
}

#[cfg(test)]
mod tests {
    use super::sql_ident;

    #[test]
    fn accepts_snake_case() {
        assert_eq!(sql_ident("users").unwrap(), "users");
        assert_eq!(sql_ident("created_at").unwrap(), "created_at");
        assert_eq!(sql_ident("_tmp").unwrap(), "_tmp");
    }

    #[test]
    fn rejects_injection() {
        assert!(sql_ident("users; drop table users").is_err());
        assert!(sql_ident("users-name").is_err());
        assert!(sql_ident("").is_err());
        assert!(sql_ident("1users").is_err());
    }
}
