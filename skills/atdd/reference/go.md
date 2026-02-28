# ATDD with Protocol Drivers in Go

## Folder Structure

```
project/
  cmd/
    myapp/                         # Application entrypoint
      main.go
  internal/                        # Production code (unexported to enforce encapsulation)
    users/
      service.go
      repository.go
      handler.go
  specs/                           # Acceptance tests (separate package, external perspective)
    login_test.go
    setup_test.go                  # TestMain + driver initialization
  dsl/                             # DSL package — assertion layer
    login_dsl.go
  drivers/                         # Protocol driver implementations
    driver.go                      # Interface definition
    http_driver.go                 # HTTP protocol driver (net/http)
    inmemory_driver.go             # In-memory driver (httptest.NewServer)
  tests/                           # Unit tests (alternative location)
    users/
      service_test.go
  features/                        # Optional: godog Gherkin files
    login.feature
    login_test.go
  go.mod
```

Go convention places unit tests alongside production code (`*_test.go` in the same package). `internal/users/service_test.go` tests `service.go` with white-box access. Acceptance tests go in `specs/` as a separate package to enforce external-only access — `specs` cannot import `internal/` directly, only the driver interface.

## Test Runner Setup

Use build tags to separate acceptance tests from unit tests without extra tooling.

```go
//go:build acceptance

// specs/login_test.go
package specs
```

Every file in `specs/` starts with the `//go:build acceptance` directive. Unit tests in `internal/` have no build tag — they run by default.

```bash
# Outer loop — acceptance specs only
go test -tags=acceptance ./specs/...

# Inner loop — unit tests only (no build tags, skips specs/)
go test ./internal/...

# Both
go test -tags=acceptance ./...
```

Shared setup and teardown live in `TestMain`:

```go
//go:build acceptance

// specs/setup_test.go
package specs

import (
	"os"
	"testing"

	"myapp/drivers"
)

var driver drivers.AppDriver

func TestMain(m *testing.M) {
	driverType := os.Getenv("DRIVER")
	if driverType == "" {
		driverType = "memory"
	}

	switch driverType {
	case "http":
		baseURL := os.Getenv("BASE_URL")
		if baseURL == "" {
			baseURL = "http://localhost:8080"
		}
		driver = drivers.NewHTTPDriver(baseURL)
	case "memory":
		driver = drivers.NewInMemoryDriver()
	default:
		panic("unknown driver type: " + driverType)
	}

	code := m.Run()

	if closer, ok := driver.(interface{ Close() }); ok {
		closer.Close()
	}

	os.Exit(code)
}
```

`TestMain` runs once per package before any test functions. The package-level `driver` variable is visible to all `_test.go` files in the `specs` package.

## Protocol Driver Interface

Define the contract that every driver must fulfill. The interface speaks in domain terms only — no HTTP codes, no URLs, no implementation leakage.

```go
// drivers/driver.go
package drivers

import "context"

// PageInfo represents the page a user sees after login.
type PageInfo struct {
	Title          string
	WelcomeMessage string
}

// ErrorInfo captures the last error from the system.
type ErrorInfo struct {
	Message    string
	StatusCode int
}

// AppDriver is the protocol-agnostic contract for acceptance tests.
// Every driver implementation must satisfy this interface.
type AppDriver interface {
	CreateUser(ctx context.Context, username, password string) error
	Login(ctx context.Context, username, password string) error
	CurrentPage(ctx context.Context) (PageInfo, error)
	LastError() ErrorInfo
	CurrentUsername() string
}
```

Go interfaces are implicit — implementations satisfy `AppDriver` without an `implements` keyword. If a struct has all the methods, it is an `AppDriver`. This interface belongs in `docs/adr/` as a design artifact and is implemented here as code.

## HTTP Protocol Driver

Talks to the running application over HTTP using `net/http`. No third-party HTTP libraries needed.

```go
// drivers/http_driver.go
package drivers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

// HTTPDriver communicates with the SUT over real HTTP.
type HTTPDriver struct {
	baseURL         string
	client          *http.Client
	authToken       string
	currentUsername string
	lastError       ErrorInfo
}

func NewHTTPDriver(baseURL string) *HTTPDriver {
	return &HTTPDriver{
		baseURL: baseURL,
		client:  &http.Client{},
	}
}

func (d *HTTPDriver) CreateUser(ctx context.Context, username, password string) error {
	body, _ := json.Marshal(map[string]string{
		"username": username,
		"password": password,
	})

	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, d.baseURL+"/api/users", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := d.client.Do(req)
	if err != nil {
		return fmt.Errorf("create user request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		var result map[string]string
		json.NewDecoder(resp.Body).Decode(&result)
		d.lastError = ErrorInfo{Message: result["error"], StatusCode: resp.StatusCode}
		return fmt.Errorf("create user failed: %d %s", resp.StatusCode, result["error"])
	}

	return nil
}

func (d *HTTPDriver) Login(ctx context.Context, username, password string) error {
	body, _ := json.Marshal(map[string]string{
		"username": username,
		"password": password,
	})

	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, d.baseURL+"/api/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := d.client.Do(req)
	if err != nil {
		return fmt.Errorf("login request failed: %w", err)
	}
	defer resp.Body.Close()

	var result map[string]string
	json.NewDecoder(resp.Body).Decode(&result)

	if resp.StatusCode >= 400 {
		d.lastError = ErrorInfo{Message: result["error"], StatusCode: resp.StatusCode}
		d.currentUsername = ""
		return nil // Do not return error — DSL asserts the failure
	}

	d.authToken = result["token"]
	d.currentUsername = username
	d.lastError = ErrorInfo{}

	return nil
}

func (d *HTTPDriver) CurrentPage(ctx context.Context) (PageInfo, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, d.baseURL+"/api/dashboard", nil)
	req.Header.Set("Authorization", "Bearer "+d.authToken)

	resp, err := d.client.Do(req)
	if err != nil {
		return PageInfo{}, fmt.Errorf("current page request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		var result map[string]string
		json.NewDecoder(resp.Body).Decode(&result)
		d.lastError = ErrorInfo{Message: result["error"], StatusCode: resp.StatusCode}
		return PageInfo{}, nil
	}

	var page PageInfo
	json.NewDecoder(resp.Body).Decode(&page)

	return page, nil
}

func (d *HTTPDriver) LastError() ErrorInfo       { return d.lastError }
func (d *HTTPDriver) CurrentUsername() string     { return d.currentUsername }
```

Key design decisions: `Login` does not return an error on auth failure — it stores the error for the DSL to assert. The driver translates HTTP mechanics into domain-relevant data. No assertions here (Gate G5).

## In-Memory Protocol Driver

Uses `httptest.NewServer` to wrap the real `http.Handler` from the application. This runs the **full HTTP pipeline in-process** — real routing, middleware, handlers, JSON encoding — without opening a real network port. Go's `httptest` sends requests through a loopback connection, making round trips sub-millisecond.

```go
// drivers/inmemory_driver.go
package drivers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"

	"myapp/internal/app" // Your application's router constructor
)

// InMemoryDriver runs the real http.Handler in-process via httptest.
type InMemoryDriver struct {
	server          *httptest.Server
	client          *http.Client
	authToken       string
	currentUsername string
	lastError       ErrorInfo
}

func NewInMemoryDriver() *InMemoryDriver {
	// app.NewRouter() returns the production http.Handler with all
	// routes, middleware, and dependencies wired up.
	handler := app.NewRouter()
	srv := httptest.NewServer(handler)

	return &InMemoryDriver{
		server: srv,
		client: srv.Client(),
	}
}

func (d *InMemoryDriver) CreateUser(ctx context.Context, username, password string) error {
	body, _ := json.Marshal(map[string]string{
		"username": username,
		"password": password,
	})

	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, d.server.URL+"/api/users", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := d.client.Do(req)
	if err != nil {
		return fmt.Errorf("create user request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		var result map[string]string
		json.NewDecoder(resp.Body).Decode(&result)
		d.lastError = ErrorInfo{Message: result["error"], StatusCode: resp.StatusCode}
		return fmt.Errorf("create user failed: %d %s", resp.StatusCode, result["error"])
	}

	return nil
}

func (d *InMemoryDriver) Login(ctx context.Context, username, password string) error {
	body, _ := json.Marshal(map[string]string{
		"username": username,
		"password": password,
	})

	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, d.server.URL+"/api/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := d.client.Do(req)
	if err != nil {
		return fmt.Errorf("login request failed: %w", err)
	}
	defer resp.Body.Close()

	var result map[string]string
	json.NewDecoder(resp.Body).Decode(&result)

	if resp.StatusCode >= 400 {
		d.lastError = ErrorInfo{Message: result["error"], StatusCode: resp.StatusCode}
		d.currentUsername = ""
		return nil
	}

	d.authToken = result["token"]
	d.currentUsername = username
	d.lastError = ErrorInfo{}

	return nil
}

func (d *InMemoryDriver) CurrentPage(ctx context.Context) (PageInfo, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, d.server.URL+"/api/dashboard", nil)
	req.Header.Set("Authorization", "Bearer "+d.authToken)

	resp, err := d.client.Do(req)
	if err != nil {
		return PageInfo{}, fmt.Errorf("current page request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		var result map[string]string
		json.NewDecoder(resp.Body).Decode(&result)
		d.lastError = ErrorInfo{Message: result["error"], StatusCode: resp.StatusCode}
		return PageInfo{}, nil
	}

	var page PageInfo
	json.NewDecoder(resp.Body).Decode(&page)

	return page, nil
}

func (d *InMemoryDriver) LastError() ErrorInfo   { return d.lastError }
func (d *InMemoryDriver) CurrentUsername() string { return d.currentUsername }

// Close shuts down the in-process test server.
func (d *InMemoryDriver) Close() {
	d.server.Close()
}
```

Unlike the TypeScript/Python in-memory drivers that bypass the web layer, `httptest.NewServer` runs the **real `http.Handler` pipeline**. Request parsing, routing, middleware, JSON encoding/decoding, and response writing all execute in-process. This is Go's equivalent of C#'s `WebApplicationFactory` — it catches routing misconfigurations, middleware ordering bugs, and JSON serialization issues that a pure domain-level driver would miss. Override dependencies by injecting test doubles into your `app.NewRouter()` constructor.

## DSL Module

The DSL is the single place where assertions live. Specs call these methods — never the driver directly.

```go
// dsl/login_dsl.go
package dsl

import (
	"context"
	"strings"
	"testing"

	"myapp/drivers"
)

// LoginDSL provides Given/When/Then methods for login specifications.
type LoginDSL struct {
	T      *testing.T
	Driver drivers.AppDriver
}

func (d *LoginDSL) GivenRegisteredUser(username, password string) {
	d.T.Helper()
	err := d.Driver.CreateUser(context.Background(), username, password)
	if err != nil {
		d.T.Fatalf("failed to create user %q: %v", username, err)
	}
}

func (d *LoginDSL) WhenUserLogsIn(username, password string) {
	d.T.Helper()
	err := d.Driver.Login(context.Background(), username, password)
	if err != nil {
		d.T.Fatalf("login request failed unexpectedly: %v", err)
	}
}

func (d *LoginDSL) ThenUserSeesHomePage() {
	d.T.Helper()
	page, err := d.Driver.CurrentPage(context.Background())
	if err != nil {
		d.T.Fatalf("failed to get current page: %v", err)
	}
	if !strings.Contains(page.Title, "Home") {
		d.T.Errorf("expected page title to contain %q, got %q", "Home", page.Title)
	}
	username := d.Driver.CurrentUsername()
	if !strings.Contains(page.WelcomeMessage, username) {
		d.T.Errorf("expected welcome message to contain %q, got %q", username, page.WelcomeMessage)
	}
}

func (d *LoginDSL) ThenLoginIsRejectedWith(message string) {
	d.T.Helper()
	errInfo := d.Driver.LastError()
	if errInfo.Message != message {
		d.T.Errorf("expected error message %q, got %q", message, errInfo.Message)
	}
	if errInfo.StatusCode < 400 {
		d.T.Errorf("expected status code >= 400, got %d", errInfo.StatusCode)
	}
}
```

`t.Helper()` marks DSL methods as test helpers so that failure messages point to the spec line that called the DSL, not to the DSL internals. Use `t.Fatalf` for precondition failures (Given steps) and `t.Errorf` for assertion failures (Then steps) — `Errorf` continues execution to report all failures, while `Fatalf` stops immediately.

For `testify/assert` as an alternative:

```go
import "github.com/stretchr/testify/assert"

func (d *LoginDSL) ThenUserSeesHomePage() {
	d.T.Helper()
	page, err := d.Driver.CurrentPage(context.Background())
	assert.NoError(d.T, err)
	assert.Contains(d.T, page.Title, "Home")
	assert.Contains(d.T, page.WelcomeMessage, d.Driver.CurrentUsername())
}
```

## Executable Specification Example

Specs read like requirements. No URLs, HTTP codes, selectors, or method names — only business language (Gate G6).

```go
//go:build acceptance

// specs/login_test.go
package specs

import (
	"testing"

	"myapp/dsl"
)

func TestRegisteredUserCanLogIn(t *testing.T) {
	login := &dsl.LoginDSL{T: t, Driver: driver}

	login.GivenRegisteredUser("alice", "s3cret")
	login.WhenUserLogsIn("alice", "s3cret")
	login.ThenUserSeesHomePage()
}

func TestRejectsLoginWithWrongPassword(t *testing.T) {
	login := &dsl.LoginDSL{T: t, Driver: driver}

	login.GivenRegisteredUser("bob", "correct-password")
	login.WhenUserLogsIn("bob", "wrong-password")
	login.ThenLoginIsRejectedWith("Invalid credentials")
}
```

The package-level `driver` variable is initialized in `TestMain` (see Test Runner Setup). Each test function creates a fresh `LoginDSL` with its own `*testing.T` so failures are attributed to the correct test.

## Driver Selection Configuration

Switch between HTTP and in-memory drivers via the `DRIVER` environment variable.

```bash
# Fast feedback — full pipeline, no network
DRIVER=memory go test -tags=acceptance ./specs/...

# Full integration — requires running server
DRIVER=http BASE_URL=http://localhost:8080 go test -tags=acceptance ./specs/...
```

Both commands must produce the same pass/fail results. If they diverge, either the protocol driver has a bug or the in-memory driver is not faithful to the real system.

## Godog (BDD) Integration

For teams that prefer Gherkin `.feature` files. The DSL and drivers remain identical — only the spec format changes. `godog` integrates with `go test` — no separate binary required.

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

### Step Definitions and Test Suite

```go
//go:build acceptance

// features/login_test.go
package features

import (
	"os"
	"testing"

	"github.com/cucumber/godog"

	"myapp/drivers"
	"myapp/dsl"
)

var testDriver drivers.AppDriver

func aRegisteredUser(username, password string) error {
	login := &dsl.LoginDSL{T: currentT, Driver: testDriver}
	login.GivenRegisteredUser(username, password)
	return nil
}

func userLogsIn(username, password string) error {
	login := &dsl.LoginDSL{T: currentT, Driver: testDriver}
	login.WhenUserLogsIn(username, password)
	return nil
}

func userSeesTheHomePage() error {
	login := &dsl.LoginDSL{T: currentT, Driver: testDriver}
	login.ThenUserSeesHomePage()
	return nil
}

func loginIsRejectedWith(message string) error {
	login := &dsl.LoginDSL{T: currentT, Driver: testDriver}
	login.ThenLoginIsRejectedWith(message)
	return nil
}

func InitializeScenario(ctx *godog.ScenarioContext) {
	ctx.Step(`^a registered user "([^"]*)" with password "([^"]*)"$`, aRegisteredUser)
	ctx.Step(`^the user logs in as "([^"]*)" with password "([^"]*)"$`, userLogsIn)
	ctx.Step(`^the user sees the home page$`, userSeesTheHomePage)
	ctx.Step(`^login is rejected with "([^"]*)"$`, loginIsRejectedWith)
}

var currentT *testing.T

func TestFeatures(t *testing.T) {
	currentT = t

	driverType := os.Getenv("DRIVER")
	if driverType == "" {
		driverType = "memory"
	}

	switch driverType {
	case "http":
		baseURL := os.Getenv("BASE_URL")
		if baseURL == "" {
			baseURL = "http://localhost:8080"
		}
		testDriver = drivers.NewHTTPDriver(baseURL)
	case "memory":
		testDriver = drivers.NewInMemoryDriver()
	}

	suite := godog.TestSuite{
		ScenarioInitializer: InitializeScenario,
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"login.feature"},
			TestingT: t,
		},
	}

	if suite.Run() != 0 {
		t.Fatal("godog tests failed")
	}

	if closer, ok := testDriver.(interface{ Close() }); ok {
		closer.Close()
	}
}
```

Run godog specs with the same driver selection:

```bash
DRIVER=memory go test -tags=acceptance ./features/...
DRIVER=http BASE_URL=http://localhost:8080 go test -tags=acceptance ./features/...
```

Step definitions call the same DSL methods as the programmatic specs. The protocol drivers are shared. Switching from `go test` specs to godog (or using both) requires zero changes to the DSL or driver layers.
