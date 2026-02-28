# ATDD with Protocol Drivers in Rust

## Folder Structure

```
project/
  src/                               # Production code
    lib.rs                           # Library root (exports modules)
    users/
      mod.rs
      service.rs
      repository.rs
      handler.rs
  tests/                             # Integration tests (external crate perspective)
    acceptance/
      mod.rs                         # Module root for acceptance specs
      login.rs                       # Login specification
    common/
      mod.rs
      driver.rs                      # AppDriver trait definition
      http_driver.rs                 # HTTP protocol driver (reqwest)
      inmemory_driver.rs             # In-memory driver (axum + tower)
      login_dsl.rs                   # DSL — assertion layer
    cucumber/
      main.rs                        # cucumber-rs harness
  features/                          # Optional: Gherkin feature files
    login.feature
  Cargo.toml
```

Rust convention places unit tests inline via `#[cfg(test)] mod tests` inside each source file in `src/`. Integration tests go in `tests/` — each file there compiles as its own crate with only access to the public API. This aligns perfectly with ATDD: `tests/` enforces the external perspective, so acceptance specs cannot reach into private internals. Use `tests/common/mod.rs` (not `tests/common.rs`) to share helpers without Rust treating `common` as its own test binary.

## Test Runner Setup

```toml
# Cargo.toml
[package]
name = "myapp"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.8"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }

[dev-dependencies]
reqwest = { version = "0.12", features = ["json"] }
tokio = { version = "1", features = ["full", "test-util"] }
tower = { version = "0.5", features = ["util"] }
http-body-util = "0.1"
cucumber = "0.21"
```

Separate acceptance from unit tests with standard Cargo commands:

```bash
# Outer loop — acceptance specs only
cargo test --test acceptance

# Inner loop — unit tests only (inline #[cfg(test)] modules)
cargo test --lib

# Both
cargo test

# Slow acceptance tests marked #[ignore]
cargo test --test acceptance -- --include-ignored
```

Use `#[ignore]` on slow tests that require external services. `cargo test --test acceptance` runs the fast subset; `--include-ignored` adds the slow ones for CI.

## Protocol Driver Interface

Define the contract that every driver must fulfill. The trait speaks in domain terms only — no HTTP codes, no URLs, no implementation leakage.

```rust
// tests/common/driver.rs
use std::future::Future;

#[derive(Debug, Clone)]
pub struct PageInfo {
    pub title: String,
    pub welcome_message: String,
}

#[derive(Debug, Clone, Default)]
pub struct ErrorInfo {
    pub message: String,
    pub status_code: u16,
}

pub trait AppDriver: Send + Sync {
    fn create_user(
        &self,
        username: &str,
        password: &str,
    ) -> impl Future<Output = anyhow::Result<()>> + Send;

    fn login(
        &mut self,
        username: &str,
        password: &str,
    ) -> impl Future<Output = anyhow::Result<()>> + Send;

    fn current_page(&self) -> impl Future<Output = anyhow::Result<PageInfo>> + Send;

    fn last_error(&self) -> Option<ErrorInfo>;

    fn current_username(&self) -> &str;
}
```

Rust 2024 edition supports `async fn` in traits natively. For 2021 edition, use return-position `impl Future` (RPITIT, stabilized in Rust 1.75) as shown above. This avoids the `async_trait` crate dependency. `anyhow::Result` simplifies error handling in test code — production code should use typed errors. `Send + Sync` bounds allow drivers to work across async tasks.

## HTTP Protocol Driver

Talks to the running application over HTTP using `reqwest`. This driver validates the full stack: routing, middleware, serialization, and network behavior.

```rust
// tests/common/http_driver.rs
use super::driver::{AppDriver, ErrorInfo, PageInfo};
use reqwest::Client;
use serde::Deserialize;
use std::sync::Mutex;

pub struct HttpDriver {
    base_url: String,
    client: Client,
    auth_token: Mutex<String>,
    current_username: Mutex<String>,
    last_error: Mutex<Option<ErrorInfo>>,
}

#[derive(Deserialize)]
struct AuthResponse {
    token: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct ErrorResponse {
    error: String,
}

impl HttpDriver {
    pub fn new(base_url: &str) -> Self {
        Self {
            base_url: base_url.to_string(),
            client: Client::new(),
            auth_token: Mutex::new(String::new()),
            current_username: Mutex::new(String::new()),
            last_error: Mutex::new(None),
        }
    }
}

impl AppDriver for HttpDriver {
    async fn create_user(&self, username: &str, password: &str) -> anyhow::Result<()> {
        let resp = self
            .client
            .post(format!("{}/api/users", self.base_url))
            .json(&serde_json::json!({ "username": username, "password": password }))
            .send()
            .await?;

        if !resp.status().is_success() {
            let body: ErrorResponse = resp.json().await?;
            *self.last_error.lock().unwrap() = Some(ErrorInfo {
                message: body.error.clone(),
                status_code: 400,
            });
            anyhow::bail!("create user failed: {}", body.error);
        }

        Ok(())
    }

    async fn login(&mut self, username: &str, password: &str) -> anyhow::Result<()> {
        let resp = self
            .client
            .post(format!("{}/api/auth/login", self.base_url))
            .json(&serde_json::json!({ "username": username, "password": password }))
            .send()
            .await?;

        let status = resp.status();
        let body: AuthResponse = resp.json().await?;

        if status.is_client_error() || status.is_server_error() {
            *self.last_error.lock().unwrap() = Some(ErrorInfo {
                message: body.error.unwrap_or_default(),
                status_code: status.as_u16(),
            });
            *self.current_username.lock().unwrap() = String::new();
            return Ok(()); // Do not error — DSL asserts the failure
        }

        *self.auth_token.lock().unwrap() = body.token.unwrap_or_default();
        *self.current_username.lock().unwrap() = username.to_string();
        *self.last_error.lock().unwrap() = None;

        Ok(())
    }

    async fn current_page(&self) -> anyhow::Result<PageInfo> {
        let token = self.auth_token.lock().unwrap().clone();
        let resp = self
            .client
            .get(format!("{}/api/dashboard", self.base_url))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await?;

        if !resp.status().is_success() {
            let body: ErrorResponse = resp.json().await?;
            *self.last_error.lock().unwrap() = Some(ErrorInfo {
                message: body.error,
                status_code: resp.status().as_u16(),
            });
            return Ok(PageInfo {
                title: String::new(),
                welcome_message: String::new(),
            });
        }

        let page: PageInfo = resp.json().await?;
        Ok(page)
    }

    fn last_error(&self) -> Option<ErrorInfo> {
        self.last_error.lock().unwrap().clone()
    }

    fn current_username(&self) -> &str {
        // Safety: leaked reference lives as long as the driver.
        // In test code this is acceptable. For production, use Arc<Mutex<String>>.
        unsafe { &*(&*self.current_username.lock().unwrap() as *const String) }
    }
}
```

Key design decision: `login` does not return an error on auth failure — it stores the error for the DSL to assert. The driver translates HTTP mechanics into domain-relevant data. No assertions here (Gate G5). `Mutex` wraps mutable state to satisfy `Sync`; test code runs sequentially per test so contention is not a concern.

## In-Memory Protocol Driver

Uses Axum's `Router` with `tower::ServiceExt::oneshot` to process requests in-process. No TCP listener, no network — the router handles requests directly. This is Rust's equivalent of Go's `httptest.NewServer` and C#'s `WebApplicationFactory`.

```rust
// tests/common/inmemory_driver.rs
use super::driver::{AppDriver, ErrorInfo, PageInfo};
use axum::body::Body;
use axum::Router;
use http_body_util::BodyExt;
use tower::ServiceExt;

pub struct InMemoryDriver {
    router: Router,
    auth_token: String,
    current_username: String,
    last_error: Option<ErrorInfo>,
}

impl InMemoryDriver {
    pub fn new(router: Router) -> Self {
        Self {
            router,
            auth_token: String::new(),
            current_username: String::new(),
            last_error: None,
        }
    }
}

impl AppDriver for InMemoryDriver {
    async fn create_user(&self, username: &str, password: &str) -> anyhow::Result<()> {
        let body = serde_json::json!({ "username": username, "password": password });

        let request = http::Request::builder()
            .method(http::Method::POST)
            .uri("/api/users")
            .header("Content-Type", "application/json")
            .body(Body::from(serde_json::to_vec(&body)?))
            .unwrap();

        let response = self.router.clone().oneshot(request).await?;

        if !response.status().is_success() {
            let bytes = response.into_body().collect().await?.to_bytes();
            let err: serde_json::Value = serde_json::from_slice(&bytes)?;
            anyhow::bail!("create user failed: {}", err["error"]);
        }

        Ok(())
    }

    async fn login(&mut self, username: &str, password: &str) -> anyhow::Result<()> {
        let body = serde_json::json!({ "username": username, "password": password });

        let request = http::Request::builder()
            .method(http::Method::POST)
            .uri("/api/auth/login")
            .header("Content-Type", "application/json")
            .body(Body::from(serde_json::to_vec(&body)?))
            .unwrap();

        let response = self.router.clone().oneshot(request).await?;
        let status = response.status();
        let bytes = response.into_body().collect().await?.to_bytes();
        let result: serde_json::Value = serde_json::from_slice(&bytes)?;

        if status.is_client_error() || status.is_server_error() {
            self.last_error = Some(ErrorInfo {
                message: result["error"].as_str().unwrap_or_default().to_string(),
                status_code: status.as_u16(),
            });
            self.current_username.clear();
            return Ok(());
        }

        self.auth_token = result["token"].as_str().unwrap_or_default().to_string();
        self.current_username = username.to_string();
        self.last_error = None;

        Ok(())
    }

    async fn current_page(&self) -> anyhow::Result<PageInfo> {
        let request = http::Request::builder()
            .method(http::Method::GET)
            .uri("/api/dashboard")
            .header("Authorization", format!("Bearer {}", self.auth_token))
            .body(Body::empty())
            .unwrap();

        let response = self.router.clone().oneshot(request).await?;
        let bytes = response.into_body().collect().await?.to_bytes();
        let page: PageInfo = serde_json::from_slice(&bytes)?;

        Ok(page)
    }

    fn last_error(&self) -> Option<ErrorInfo> {
        self.last_error.clone()
    }

    fn current_username(&self) -> &str {
        &self.current_username
    }
}
```

`Router::clone()` is cheap (Arc internally). Each `oneshot` call processes one request through the full Axum pipeline — routing, middleware, extractors, handlers, JSON serialization — identical to production. Override dependencies by injecting test doubles into your `Router` constructor via Axum's state mechanism. The `InMemoryDriver` owns its state directly (no `Mutex`) because `&mut self` on `login` provides exclusive access.

## DSL Module

The DSL is the single place where assertions live. Specs call these methods — never the driver directly.

```rust
// tests/common/login_dsl.rs
use super::driver::AppDriver;

pub struct LoginDsl<'a, D: AppDriver> {
    driver: &'a mut D,
}

impl<'a, D: AppDriver> LoginDsl<'a, D> {
    pub fn new(driver: &'a mut D) -> Self {
        Self { driver }
    }

    pub async fn given_registered_user(&self, username: &str, password: &str) {
        self.driver
            .create_user(username, password)
            .await
            .expect("failed to create user");
    }

    pub async fn when_user_logs_in(&mut self, username: &str, password: &str) {
        self.driver
            .login(username, password)
            .await
            .expect("login request failed unexpectedly");
    }

    pub async fn then_user_sees_home_page(&self) {
        let page = self
            .driver
            .current_page()
            .await
            .expect("failed to get current page");

        assert!(
            page.title.contains("Home"),
            "expected page title to contain \"Home\", got {:?}",
            page.title
        );

        let username = self.driver.current_username();
        assert!(
            page.welcome_message.contains(username),
            "expected welcome message to contain {:?}, got {:?}",
            username,
            page.welcome_message
        );
    }

    pub async fn then_login_is_rejected_with(&self, message: &str) {
        let error = self
            .driver
            .last_error()
            .expect("expected an error, but none was recorded");

        assert_eq!(
            error.message, message,
            "expected error message {:?}, got {:?}",
            message, error.message
        );
        assert!(
            error.status_code >= 400,
            "expected status code >= 400, got {}",
            error.status_code
        );
    }
}
```

The DSL is generic over `D: AppDriver`, so it works with any driver implementation. Use `expect` for precondition failures (Given steps) — panics immediately with context. Use `assert!`/`assert_eq!` for assertions (Then steps) — also panics on failure, but the message indicates a specification violation rather than infrastructure failure. The `'a` lifetime ties the DSL to its driver, preventing use-after-free at compile time.

For trait objects instead of generics: replace `D: AppDriver` with `dyn AppDriver`. Generics enable static dispatch (zero overhead, monomorphized), while trait objects enable runtime dispatch (flexible, one binary). In tests the performance difference is negligible — choose based on ergonomics.

## Executable Specification Example

Specs read like requirements. No URLs, HTTP codes, selectors, or method names — only business language (Gate G6).

```rust
// tests/acceptance/login.rs
use crate::common::driver::AppDriver;
use crate::common::inmemory_driver::InMemoryDriver;
use crate::common::login_dsl::LoginDsl;

fn create_driver() -> impl AppDriver {
    let driver_type = std::env::var("DRIVER").unwrap_or_else(|_| "memory".to_string());

    match driver_type.as_str() {
        "http" => {
            let base_url =
                std::env::var("BASE_URL").unwrap_or_else(|_| "http://localhost:8080".to_string());
            crate::common::http_driver::HttpDriver::new(&base_url)
        }
        "memory" => {
            let router = myapp::create_router(); // Production router constructor
            InMemoryDriver::new(router)
        }
        other => panic!("unknown driver type: {other}"),
    }
}

#[tokio::test]
async fn registered_user_can_log_in() {
    let mut driver = create_driver();
    let mut login = LoginDsl::new(&mut driver);

    login.given_registered_user("alice", "s3cret").await;
    login.when_user_logs_in("alice", "s3cret").await;
    login.then_user_sees_home_page().await;
}

#[tokio::test]
async fn rejects_login_with_wrong_password() {
    let mut driver = create_driver();
    let mut login = LoginDsl::new(&mut driver);

    login.given_registered_user("bob", "correct-password").await;
    login.when_user_logs_in("bob", "wrong-password").await;
    login.then_login_is_rejected_with("Invalid credentials").await;
}
```

Each test creates its own driver — no shared mutable state between tests. Rust's ownership model enforces this at compile time. The `create_driver` function reads `DRIVER` at runtime, returning the appropriate implementation.

## Driver Selection Configuration

Switch between HTTP and in-memory drivers via the `DRIVER` environment variable.

```bash
# Fast feedback — full Axum pipeline, no network
DRIVER=memory cargo test --test acceptance

# Full integration — requires running server
DRIVER=http BASE_URL=http://localhost:8080 cargo test --test acceptance
```

Both commands must produce the same pass/fail results. If they diverge, either the protocol driver has a bug or the in-memory driver is not faithful to the real system.

Note: when both drivers implement different concrete types (as shown above), `create_driver` cannot return `impl AppDriver` from both branches. Two solutions: (1) use `Box<dyn AppDriver>` to return a trait object, or (2) use an enum wrapper that delegates to the inner driver. The enum approach preserves static dispatch:

```rust
pub enum AnyDriver {
    Http(HttpDriver),
    InMemory(InMemoryDriver),
}

impl AppDriver for AnyDriver {
    async fn login(&mut self, username: &str, password: &str) -> anyhow::Result<()> {
        match self {
            Self::Http(d) => d.login(username, password).await,
            Self::InMemory(d) => d.login(username, password).await,
        }
    }
    // ... delegate all other methods
}
```

## Cucumber-rs Integration

For teams that prefer Gherkin `.feature` files. The DSL and drivers remain identical — only the spec format changes. `cucumber-rs` replaces the default test harness for its binary.

### Feature File

```gherkin
# features/login.feature
Feature: User Login

  Scenario: Registered user logs in with valid credentials
    Given a registered user "alice" with password "s3cret"
    When the user logs in as "alice" with password "s3cret"
    Then the user sees the home page

  Scenario: Login rejected with wrong password
    Given a registered user "bob" with password "correct-password"
    When the user logs in as "bob" with password "wrong-password"
    Then login is rejected with "Invalid credentials"
```

### Cargo Configuration

```toml
# Cargo.toml — add a separate test binary for cucumber
[[test]]
name = "cucumber"
harness = false  # cucumber-rs provides its own main
```

### World and Step Definitions

```rust
// tests/cucumber/main.rs
use cucumber::{given, then, when, World};

#[derive(Debug, Default, World)]
pub struct LoginWorld {
    username: String,
    password: String,
    driver: Option<InMemoryDriver>,
}

impl LoginWorld {
    fn driver_mut(&mut self) -> &mut InMemoryDriver {
        self.driver.get_or_insert_with(|| {
            let router = myapp::create_router();
            InMemoryDriver::new(router)
        })
    }
}

#[given(expr = "a registered user {string} with password {string}")]
async fn registered_user(world: &mut LoginWorld, username: String, password: String) {
    let driver = world.driver_mut();
    driver
        .create_user(&username, &password)
        .await
        .expect("failed to create user");
    world.username = username;
    world.password = password;
}

#[when(expr = "the user logs in as {string} with password {string}")]
async fn user_logs_in(world: &mut LoginWorld, username: String, password: String) {
    let driver = world.driver_mut();
    driver
        .login(&username, &password)
        .await
        .expect("login request failed unexpectedly");
}

#[then("the user sees the home page")]
async fn sees_home_page(world: &mut LoginWorld) {
    let driver = world.driver_mut();
    let page = driver.current_page().await.expect("failed to get page");
    assert!(page.title.contains("Home"));
    assert!(page.welcome_message.contains(&world.username));
}

#[then(expr = "login is rejected with {string}")]
async fn login_rejected(world: &mut LoginWorld, message: String) {
    let driver = world.driver_mut();
    let error = driver.last_error().expect("expected an error");
    assert_eq!(error.message, message);
    assert!(error.status_code >= 400);
}

#[tokio::main]
async fn main() {
    LoginWorld::run("features/").await;
}
```

Run cucumber specs:

```bash
# Runs features/ directory against cucumber-rs
cargo test --test cucumber

# With environment-based driver selection
DRIVER=memory cargo test --test cucumber
DRIVER=http BASE_URL=http://localhost:8080 cargo test --test cucumber
```

The `World` struct holds per-scenario state — cucumber-rs creates a fresh instance for each scenario. Step definitions use `#[given]`, `#[when]`, `#[then]` attribute macros that register regex or expression-based matchers. The `harness = false` setting in `Cargo.toml` lets cucumber-rs supply its own `main` function with custom output formatting, parallel execution, and feature file discovery.
