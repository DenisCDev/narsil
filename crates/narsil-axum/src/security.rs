use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const MAX_KEYS: usize = 10_000;

#[derive(Clone, Debug)]
pub struct RateLimit {
    pub window: Duration,
    pub max: u32,
}

impl Default for RateLimit {
    fn default() -> Self {
        Self {
            window: Duration::from_millis(60_000),
            max: 100,
        }
    }
}

#[derive(Clone, Debug)]
pub enum Cors {
    Disabled,
    Any,
    List(Vec<String>),
}

#[derive(Clone, Debug)]
pub struct Security {
    pub rate_limit: Option<RateLimit>,
    pub helmet: bool,
    pub cors: Cors,
    pub max_body_size: usize,
    pub request_timeout: Duration,
}

impl Default for Security {
    fn default() -> Self {
        Self {
            rate_limit: Some(RateLimit::default()),
            helmet: true,
            cors: Cors::Any,
            max_body_size: 1_048_576,
            request_timeout: Duration::from_secs(30),
        }
    }
}

pub struct RateLimiter {
    window: Duration,
    max: u32,
    inner: Mutex<HashMap<String, Entry>>,
}

struct Entry {
    count: u32,
    reset: Instant,
}

pub struct RateDecision {
    pub limited: bool,
    pub limit: u32,
    pub remaining: u32,
    pub reset_epoch: u64,
    pub retry_after: u64,
}

impl RateLimiter {
    pub fn new(cfg: &RateLimit) -> Self {
        Self {
            window: cfg.window,
            max: cfg.max,
            inner: Mutex::new(HashMap::new()),
        }
    }

    pub fn check(&self, key: &str) -> RateDecision {
        let now = Instant::now();
        let mut map = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if map.len() > MAX_KEYS {
            map.retain(|_, e| now < e.reset);
        }
        let entry = map.entry(key.to_string()).or_insert(Entry {
            count: 0,
            reset: now + self.window,
        });
        if now >= entry.reset {
            entry.count = 0;
            entry.reset = now + self.window;
        }
        entry.count = entry.count.saturating_add(1);
        let remaining = self.max.saturating_sub(entry.count.min(self.max));
        let retry_after = entry.reset.saturating_duration_since(now).as_secs().max(1);
        let reset_epoch = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() + retry_after)
            .unwrap_or(0);
        RateDecision {
            limited: entry.count > self.max,
            limit: self.max,
            remaining,
            reset_epoch,
            retry_after,
        }
    }
}
