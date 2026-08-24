use base64::engine::general_purpose::{URL_SAFE, URL_SAFE_NO_PAD};
use base64::Engine;
use hmac::{Hmac, Mac};
use serde::Deserialize;
use sha2::Sha256;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct User {
    pub id: String,
    pub email: Option<String>,
    pub role: Option<String>,
}

type HmacSha256 = Hmac<Sha256>;

#[derive(Deserialize)]
struct HmacClaims {
    sub: String,
    exp: u64,
}

/// Same token shape as `bench/shared.mjs`: `{payload}.{hmac-sha256}` (not a JWT).
pub fn hmac_payload(secret: impl Into<String>) -> impl Fn(&str) -> Option<User> + Send + Sync {
    let secret = secret.into();
    move |token: &str| {
        let (payload, sig) = token.split_once('.')?;
        let sig_bytes = URL_SAFE_NO_PAD.decode(sig).ok()?;
        let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).ok()?;
        mac.update(payload.as_bytes());
        mac.verify_slice(&sig_bytes).ok()?;
        let raw = URL_SAFE_NO_PAD.decode(payload).ok()?;
        let data: HmacClaims = serde_json::from_slice(&raw).ok()?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .ok()?
            .as_millis() as u64;
        if data.exp < now {
            return None;
        }
        Some(User {
            id: data.sub,
            email: None,
            role: Some("user".into()),
        })
    }
}

#[derive(Deserialize)]
struct JwtHeader {
    alg: String,
}

#[derive(Deserialize)]
struct SupabaseClaims {
    sub: String,
    email: Option<String>,
    role: Option<String>,
    exp: Option<u64>,
}

fn b64url_decode(input: &str) -> Option<Vec<u8>> {
    URL_SAFE_NO_PAD.decode(input).ok().or_else(|| {
        let mut padded = input.to_string();
        while padded.len() % 4 != 0 {
            padded.push('=');
        }
        URL_SAFE.decode(padded).ok()
    })
}

/// HS256 JWT as issued by Supabase Auth (`SUPABASE_JWT_SECRET`).
/// Pure-Rust so the crate does not need `ring` / a C compiler.
pub fn supabase_jwt(secret: impl Into<String>) -> impl Fn(&str) -> Option<User> + Send + Sync {
    let secret = secret.into();
    move |token: &str| {
        let mut parts = token.split('.');
        let header_b64 = parts.next()?;
        let payload_b64 = parts.next()?;
        let sig_b64 = parts.next()?;
        if parts.next().is_some() {
            return None;
        }
        let header: JwtHeader = serde_json::from_slice(&b64url_decode(header_b64)?).ok()?;
        if !header.alg.eq_ignore_ascii_case("HS256") {
            return None;
        }
        let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).ok()?;
        mac.update(header_b64.as_bytes());
        mac.update(b".");
        mac.update(payload_b64.as_bytes());
        mac.verify_slice(&b64url_decode(sig_b64)?).ok()?;
        let claims: SupabaseClaims = serde_json::from_slice(&b64url_decode(payload_b64)?).ok()?;
        if let Some(exp) = claims.exp {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .ok()?
                .as_secs();
            if exp < now {
                return None;
            }
        }
        Some(User {
            id: claims.sub,
            email: claims.email,
            role: claims.role,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sign_hs256(secret: &str, payload: &str) -> String {
        let header = URL_SAFE_NO_PAD.encode(r#"{"alg":"HS256","typ":"JWT"}"#);
        let payload_b64 = URL_SAFE_NO_PAD.encode(payload);
        let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(format!("{header}.{payload_b64}").as_bytes());
        let sig = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());
        format!("{header}.{payload_b64}.{sig}")
    }

    #[test]
    fn supabase_hs256_roundtrip() {
        let exp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + 60;
        let token = sign_hs256(
            "s3cret",
            &format!(r#"{{"sub":"u-1","email":"a@b.c","role":"authenticated","exp":{exp}}}"#),
        );
        let user = supabase_jwt("s3cret")(&token).expect("valid jwt");
        assert_eq!(user.id, "u-1");
        assert_eq!(user.email.as_deref(), Some("a@b.c"));
    }

    #[test]
    fn supabase_hs256_rejects_wrong_secret() {
        let token = sign_hs256("s3cret", r#"{"sub":"u-1"}"#);
        assert!(supabase_jwt("other")(&token).is_none());
    }

    #[test]
    fn supabase_hs256_rejects_alg_none() {
        let header = URL_SAFE_NO_PAD.encode(r#"{"alg":"none"}"#);
        let payload = URL_SAFE_NO_PAD.encode(r#"{"sub":"u-1"}"#);
        let token = format!("{header}.{payload}.");
        assert!(supabase_jwt("s3cret")(&token).is_none());
    }
}
