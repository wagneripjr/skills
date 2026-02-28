# ATDD with Protocol Drivers in Python

## Folder Structure

```
project/
  specs/                       # Executable specifications (business language only)
    test_login.py
    conftest.py                # Driver/DSL fixtures, marker registration
  dsl/                         # DSL methods — assertion layer
    __init__.py
    login_dsl.py
  drivers/                     # Protocol driver implementations
    __init__.py
    app_driver.py              # Abstract base class definition
    http_driver.py             # HTTP protocol driver (httpx)
    in_memory_driver.py        # In-memory protocol driver (TestClient / direct)
  src/                         # Production code
    users/
      __init__.py
      user_service.py
      user_repository.py
  tests/                       # Unit tests (inner TDD loop, pytest)
    users/
      test_user_service.py
  features/                    # Optional: Cucumber/BDD specs (behave)
    login.feature
    steps/
      login_steps.py
    environment.py
  pyproject.toml
```

Use **pytest** as the primary test runner. Separate acceptance specs from unit tests using custom markers and directory conventions.

## Test Runner Setup

```toml
# pyproject.toml
[project]
name = "my-app"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn>=0.34.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.0",
    "pytest-asyncio>=0.25.0",
    "httpx>=0.28.0",
    "behave>=1.2.6",
]

[tool.pytest.ini_options]
markers = [
    "acceptance: Executable specification (outer ATDD loop)",
    "unit: Unit test (inner TDD loop)",
]
testpaths = ["specs", "tests"]
asyncio_mode = "auto"

# Run subsets:
#   pytest -m acceptance          # outer loop — acceptance specs
#   pytest -m unit                # inner loop — unit tests
#   pytest                        # both
```

```python
# specs/conftest.py
from __future__ import annotations

import pytest


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--driver",
        default="memory",
        choices=["http", "memory"],
        help="Protocol driver to use for acceptance specs (default: memory)",
    )


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    """Auto-apply the 'acceptance' marker to every test under specs/."""
    for item in items:
        if "specs" in str(item.fspath):
            item.add_marker(pytest.mark.acceptance)
        elif "tests" in str(item.fspath):
            item.add_marker(pytest.mark.unit)
```

## Protocol Driver Interface

Define the contract that every driver must fulfill. The interface is protocol-agnostic — it speaks in domain terms.

```python
# drivers/app_driver.py
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class PageInfo:
    title: str
    welcome_message: str


@dataclass(frozen=True)
class ErrorInfo:
    message: str
    status_code: int


class AppDriver(ABC):
    """Protocol-agnostic driver interface. Domain terms only."""

    @property
    @abstractmethod
    def current_username(self) -> str: ...

    @abstractmethod
    def create_user(self, username: str, password: str) -> None: ...

    @abstractmethod
    def login(self, username: str, password: str) -> None: ...

    @abstractmethod
    def get_current_page(self) -> PageInfo: ...

    @abstractmethod
    def get_last_error(self) -> ErrorInfo: ...
```

No assertions, no HTTP codes, no implementation leakage. This interface belongs in `docs/adr/` as a design artifact and is implemented here as code.

## HTTP Protocol Driver

Talks to the running application over HTTP using `httpx` (synchronous client for simplicity). For async FastAPI apps, swap `httpx.Client` with `httpx.AsyncClient` and make methods `async`.

```python
# drivers/http_driver.py
from __future__ import annotations

import httpx

from .app_driver import AppDriver, ErrorInfo, PageInfo


class HttpAppDriver(AppDriver):
    def __init__(self, base_url: str) -> None:
        self._base_url = base_url
        self._client = httpx.Client(base_url=base_url, timeout=10.0)
        self._current_username = ""
        self._last_error = ErrorInfo(message="", status_code=0)
        self._auth_token = ""

    @property
    def current_username(self) -> str:
        return self._current_username

    def create_user(self, username: str, password: str) -> None:
        res = self._client.post(
            "/api/users",
            json={"username": username, "password": password},
        )
        if not res.is_success:
            body = res.json()
            self._last_error = ErrorInfo(
                message=body["error"], status_code=res.status_code
            )
            raise RuntimeError(f"create_user failed: {res.status_code} {body['error']}")

    def login(self, username: str, password: str) -> None:
        res = self._client.post(
            "/api/auth/login",
            json={"username": username, "password": password},
        )
        body = res.json()

        if not res.is_success:
            self._last_error = ErrorInfo(
                message=body["error"], status_code=res.status_code
            )
            self._current_username = ""
            return  # Do not raise — DSL asserts the error

        self._auth_token = body["token"]
        self._current_username = username
        self._last_error = ErrorInfo(message="", status_code=0)

    def get_current_page(self) -> PageInfo:
        res = self._client.get(
            "/api/dashboard",
            headers={"Authorization": f"Bearer {self._auth_token}"},
        )
        if not res.is_success:
            body = res.json()
            self._last_error = ErrorInfo(
                message=body["error"], status_code=res.status_code
            )
            return PageInfo(title="", welcome_message="")

        body = res.json()
        return PageInfo(title=body["title"], welcome_message=body["welcomeMessage"])

    def get_last_error(self) -> ErrorInfo:
        return self._last_error
```

Key design decisions: `login` does not raise on auth failure — it stores the error for the DSL to assert. The driver translates HTTP mechanics into domain-relevant data. No assertions here (Gate G5).

## In-Memory Protocol Driver

For **FastAPI** apps, use `starlette.testclient.TestClient` to call the ASGI app in-process with zero network overhead.

```python
# drivers/in_memory_driver.py
from __future__ import annotations

from starlette.testclient import TestClient

from src.main import app  # Your FastAPI/Starlette app instance

from .app_driver import AppDriver, ErrorInfo, PageInfo


class InMemoryAppDriver(AppDriver):
    """In-process driver using Starlette TestClient. No network, no server."""

    def __init__(self) -> None:
        self._client = TestClient(app)
        self._current_username = ""
        self._last_error = ErrorInfo(message="", status_code=0)
        self._auth_token = ""

    @property
    def current_username(self) -> str:
        return self._current_username

    def create_user(self, username: str, password: str) -> None:
        res = self._client.post(
            "/api/users",
            json={"username": username, "password": password},
        )
        if res.status_code >= 400:
            body = res.json()
            self._last_error = ErrorInfo(
                message=body["error"], status_code=res.status_code
            )
            raise RuntimeError(f"create_user failed: {res.status_code}")

    def login(self, username: str, password: str) -> None:
        res = self._client.post(
            "/api/auth/login",
            json={"username": username, "password": password},
        )
        body = res.json()

        if res.status_code >= 400:
            self._last_error = ErrorInfo(
                message=body["error"], status_code=res.status_code
            )
            self._current_username = ""
            return

        self._auth_token = body["token"]
        self._current_username = username
        self._last_error = ErrorInfo(message="", status_code=0)

    def get_current_page(self) -> PageInfo:
        res = self._client.get(
            "/api/dashboard",
            headers={"Authorization": f"Bearer {self._auth_token}"},
        )
        if res.status_code >= 400:
            body = res.json()
            self._last_error = ErrorInfo(
                message=body["error"], status_code=res.status_code
            )
            return PageInfo(title="", welcome_message="")

        body = res.json()
        return PageInfo(title=body["title"], welcome_message=body["welcomeMessage"])

    def get_last_error(self) -> ErrorInfo:
        return self._last_error
```

For **Django**, replace `TestClient(app)` with `django.test.Client()`. For **plain Python** without a web framework, import domain modules directly (like the TypeScript in-memory driver). The TestClient approach reuses routing and middleware while avoiding network overhead (~5ms vs ~100ms for HTTP).

## DSL Module

The DSL is the single place where assertions live. Specs call these methods — never the driver directly.

```python
# dsl/login_dsl.py
from __future__ import annotations

from drivers.app_driver import AppDriver


class LoginDSL:
    """Assertion layer for login-related specs. Wraps a protocol driver."""

    def __init__(self, driver: AppDriver) -> None:
        self._driver = driver

    def given_registered_user(self, username: str, password: str) -> None:
        self._driver.create_user(username, password)

    def when_user_logs_in(self, username: str, password: str) -> None:
        self._driver.login(username, password)

    def then_user_sees_home_page(self) -> None:
        page = self._driver.get_current_page()
        assert "Home" in page.title
        assert self._driver.current_username in page.welcome_message

    def then_login_is_rejected_with(self, message: str) -> None:
        error = self._driver.get_last_error()
        assert error.message == message
        assert error.status_code >= 400
```

Plain `assert` statements are sufficient — pytest's assert rewriting produces detailed failure messages automatically. No need for a separate assertion library.

## Executable Specification Example

Specs read like requirements. No URLs, HTTP codes, selectors, or method names — only business language (Gate G6).

```python
# specs/test_login.py
from __future__ import annotations

import pytest

from dsl.login_dsl import LoginDSL


@pytest.mark.acceptance
class TestUserLogin:
    def test_registered_user_can_log_in(self, login_dsl: LoginDSL) -> None:
        login_dsl.given_registered_user("alice", "s3cret")
        login_dsl.when_user_logs_in("alice", "s3cret")
        login_dsl.then_user_sees_home_page()

    def test_rejects_login_with_wrong_password(self, login_dsl: LoginDSL) -> None:
        login_dsl.given_registered_user("bob", "correct-password")
        login_dsl.when_user_logs_in("bob", "wrong-password")
        login_dsl.then_login_is_rejected_with("Invalid credentials")
```

## Driver Selection Configuration

Switch between HTTP and in-memory drivers via the `--driver` CLI option.

```python
# specs/conftest.py  (extend the conftest shown earlier)
from __future__ import annotations

import pytest

from drivers.app_driver import AppDriver
from drivers.http_driver import HttpAppDriver
from drivers.in_memory_driver import InMemoryAppDriver
from dsl.login_dsl import LoginDSL


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--driver",
        default="memory",
        choices=["http", "memory"],
        help="Protocol driver to use for acceptance specs",
    )


@pytest.fixture
def driver(request: pytest.FixtureRequest) -> AppDriver:
    driver_type = request.config.getoption("--driver")
    match driver_type:
        case "http":
            import os

            base_url = os.environ.get("BASE_URL", "http://localhost:8000")
            return HttpAppDriver(base_url)
        case "memory":
            return InMemoryAppDriver()
        case _:
            raise ValueError(f"Unknown driver type: {driver_type}")


@pytest.fixture
def login_dsl(driver: AppDriver) -> LoginDSL:
    return LoginDSL(driver)
```

Run specs with either driver:

```bash
# Fast feedback — no server required
pytest specs/ --driver=memory

# Full integration — requires running server
BASE_URL=http://localhost:8000 pytest specs/ --driver=http
```

Both commands must produce the same pass/fail results. If they diverge, either the protocol driver has a bug or the in-memory driver is not faithful to the real system.

## Cucumber/BDD Integration

For teams that prefer Gherkin `.feature` files. The DSL and drivers remain identical — only the spec format changes.

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

### Step Definitions (behave)

```python
# features/steps/login_steps.py
from behave import given, when, then  # type: ignore[import-untyped]

from dsl.login_dsl import LoginDSL


@given('a registered user "{username}" with password "{password}"')
def step_given_registered_user(context, username: str, password: str) -> None:
    dsl: LoginDSL = context.login_dsl
    dsl.given_registered_user(username, password)


@when('the user logs in as "{username}" with password "{password}"')
def step_when_user_logs_in(context, username: str, password: str) -> None:
    dsl: LoginDSL = context.login_dsl
    dsl.when_user_logs_in(username, password)


@then("the user sees the home page")
def step_then_user_sees_home_page(context) -> None:
    dsl: LoginDSL = context.login_dsl
    dsl.then_user_sees_home_page()


@then('login is rejected with "{message}"')
def step_then_login_rejected(context, message: str) -> None:
    dsl: LoginDSL = context.login_dsl
    dsl.then_login_is_rejected_with(message)
```

### Environment Setup (behave)

```python
# features/environment.py
from __future__ import annotations

import os

from drivers.http_driver import HttpAppDriver
from drivers.in_memory_driver import InMemoryAppDriver
from dsl.login_dsl import LoginDSL


def before_scenario(context, scenario) -> None:
    driver_type = os.environ.get("DRIVER", "memory")
    match driver_type:
        case "http":
            base_url = os.environ.get("BASE_URL", "http://localhost:8000")
            driver = HttpAppDriver(base_url)
        case "memory":
            driver = InMemoryAppDriver()
        case _:
            raise ValueError(f"Unknown driver type: {driver_type}")

    context.driver = driver
    context.login_dsl = LoginDSL(driver)
```

### pytest-bdd Alternative

For teams that want Gherkin syntax but prefer staying within pytest:

```python
# specs/test_login_bdd.py
from pytest_bdd import scenario, given, when, then, parsers

from dsl.login_dsl import LoginDSL


@scenario("../features/login.feature", "Registered user logs in with valid credentials")
def test_registered_user_can_log_in() -> None:
    pass


@given(parsers.parse('a registered user "{username}" with password "{password}"'))
def registered_user(login_dsl: LoginDSL, username: str, password: str) -> None:
    login_dsl.given_registered_user(username, password)


@when(parsers.parse('the user logs in as "{username}" with password "{password}"'))
def user_logs_in(login_dsl: LoginDSL, username: str, password: str) -> None:
    login_dsl.when_user_logs_in(username, password)


@then("the user sees the home page")
def user_sees_home_page(login_dsl: LoginDSL) -> None:
    login_dsl.then_user_sees_home_page()
```

Run behave specs with the same driver selection:

```bash
DRIVER=memory behave features/
DRIVER=http BASE_URL=http://localhost:8000 behave features/
```

Step definitions call the same DSL methods as pytest specs. The protocol drivers are shared. Switching from pytest specs to behave (or using both) requires zero changes to the DSL or driver layers.
