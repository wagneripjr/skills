# ATDD with Protocol Drivers in PHP

## Folder Structure

```
project/
  src/                           # Production code (PSR-4 autoloaded)
    Users/
      UserService.php
      UserRepository.php
      UserRepositoryInterface.php
  specs/                         # Executable specifications (business language only)
    LoginTest.php
  dsl/                           # DSL classes — assertion layer
    LoginDsl.php
  drivers/                       # Protocol driver implementations
    AppDriver.php                # Interface definition
    HttpAppDriver.php            # HTTP protocol driver (Guzzle)
    InMemoryAppDriver.php        # In-memory protocol driver (Laravel / direct)
    DriverFactory.php            # Driver selection via env var
  tests/                         # Unit tests (inner TDD loop, separate suite)
    Users/
      UserServiceTest.php
  features/                      # Optional: Behat Gherkin files
    login.feature
    bootstrap/
      LoginContext.php
  phpunit.xml
  behat.yml
  composer.json
```

Use **PHPUnit** as the primary test runner. Separate acceptance specs from unit tests using multiple test suites in `phpunit.xml`.

## Test Runner Setup

```xml
<!-- phpunit.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
         bootstrap="vendor/autoload.php"
         colors="true"
         cacheDirectory=".phpunit.cache">
    <testsuites>
        <testsuite name="acceptance">
            <directory>specs</directory>
        </testsuite>
        <testsuite name="unit">
            <directory>tests</directory>
        </testsuite>
    </testsuites>
    <php>
        <env name="APP_DRIVER" value="memory"/>
        <env name="BASE_URL" value="http://localhost:8000"/>
    </php>
    <source>
        <include>
            <directory>src</directory>
        </include>
    </source>
</phpunit>
```

```json
{
    "autoload": {
        "psr-4": {
            "App\\": "src/"
        }
    },
    "autoload-dev": {
        "psr-4": {
            "Specs\\": "specs/",
            "Tests\\": "tests/",
            "Dsl\\": "dsl/",
            "Drivers\\": "drivers/"
        }
    },
    "require-dev": {
        "phpunit/phpunit": "^11.0",
        "guzzlehttp/guzzle": "^7.9"
    }
}
```

Run acceptance specs and unit tests separately:

```bash
./vendor/bin/phpunit --testsuite acceptance    # outer loop — acceptance specs
./vendor/bin/phpunit --testsuite unit          # inner loop — unit tests
./vendor/bin/phpunit                           # both
```

## Protocol Driver Interface

Define the contract that every driver must fulfill. The interface is protocol-agnostic — it speaks in domain terms.

```php
<?php
// drivers/AppDriver.php

declare(strict_types=1);

namespace Drivers;

readonly class PageInfo
{
    public function __construct(
        public string $title,
        public string $welcomeMessage,
    ) {}
}

readonly class ErrorInfo
{
    public function __construct(
        public string $message,
        public int $statusCode,
    ) {}
}

interface AppDriver
{
    /** Register a new user account. */
    public function createUser(string $username, string $password): void;

    /** Attempt to log in with the given credentials. */
    public function login(string $username, string $password): void;

    /** Retrieve the current page the user sees after login. */
    public function getCurrentPage(): PageInfo;

    /** Return the last error produced by the system, or null if none. */
    public function getLastError(): ?ErrorInfo;

    /** The username of the currently authenticated user. */
    public function getCurrentUsername(): string;
}
```

No assertions, no HTTP codes, no implementation leakage. This interface belongs in `docs/adr/` as a design artifact and is implemented here as code.

## HTTP Protocol Driver

Talks to the running application over HTTP using Guzzle.

```php
<?php
// drivers/HttpAppDriver.php

declare(strict_types=1);

namespace Drivers;

use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;

class HttpAppDriver implements AppDriver
{
    private Client $client;
    private string $currentUsername = '';
    private ?ErrorInfo $lastError = null;
    private string $authToken = '';

    public function __construct(string $baseUrl)
    {
        $this->client = new Client([
            'base_uri' => $baseUrl,
            'http_errors' => false,
            'headers' => ['Content-Type' => 'application/json', 'Accept' => 'application/json'],
            'timeout' => 10,
        ]);
    }

    public function createUser(string $username, string $password): void
    {
        $response = $this->client->post('/api/users', [
            'json' => ['username' => $username, 'password' => $password],
        ]);

        if ($response->getStatusCode() >= 400) {
            $body = json_decode((string) $response->getBody(), true);
            $this->lastError = new ErrorInfo($body['error'], $response->getStatusCode());
            throw new \RuntimeException("createUser failed: {$response->getStatusCode()} {$body['error']}");
        }
    }

    public function login(string $username, string $password): void
    {
        $response = $this->client->post('/api/auth/login', [
            'json' => ['username' => $username, 'password' => $password],
        ]);

        $body = json_decode((string) $response->getBody(), true);

        if ($response->getStatusCode() >= 400) {
            $this->lastError = new ErrorInfo($body['error'], $response->getStatusCode());
            $this->currentUsername = '';
            return; // Do not throw — DSL asserts the error
        }

        $this->authToken = $body['token'];
        $this->currentUsername = $username;
        $this->lastError = null;
    }

    public function getCurrentPage(): PageInfo
    {
        $response = $this->client->get('/api/dashboard', [
            'headers' => ['Authorization' => "Bearer {$this->authToken}"],
        ]);

        $body = json_decode((string) $response->getBody(), true);

        if ($response->getStatusCode() >= 400) {
            $this->lastError = new ErrorInfo($body['error'], $response->getStatusCode());
            return new PageInfo('', '');
        }

        return new PageInfo($body['title'], $body['welcomeMessage']);
    }

    public function getLastError(): ?ErrorInfo
    {
        return $this->lastError;
    }

    public function getCurrentUsername(): string
    {
        return $this->currentUsername;
    }
}
```

Key design decisions: `login` does not throw on auth failure — it stores the error for the DSL to assert. The driver translates HTTP mechanics into domain-relevant data. `http_errors => false` prevents Guzzle from throwing on 4xx/5xx so the driver can inspect the response body. No assertions here (Gate G5).

## In-Memory Protocol Driver

For **Laravel** (the most common PHP framework), use the built-in HTTP testing methods to call the application in-process without a running server.

```php
<?php
// drivers/InMemoryAppDriver.php

declare(strict_types=1);

namespace Drivers;

use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Testing\TestResponse;

class InMemoryAppDriver extends TestCase implements AppDriver
{
    private string $currentUsername = '';
    private ?ErrorInfo $lastError = null;
    private string $authToken = '';

    public function createApplication(): \Illuminate\Foundation\Application
    {
        /** @var \Illuminate\Foundation\Application $app */
        $app = require __DIR__ . '/../bootstrap/app.php';
        $app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();
        return $app;
    }

    public function createUser(string $username, string $password): void
    {
        $response = $this->postJson('/api/users', [
            'username' => $username,
            'password' => $password,
        ]);

        if ($response->getStatusCode() >= 400) {
            $body = $response->json();
            $this->lastError = new ErrorInfo($body['error'], $response->getStatusCode());
            throw new \RuntimeException("createUser failed: {$response->getStatusCode()}");
        }
    }

    public function login(string $username, string $password): void
    {
        $response = $this->postJson('/api/auth/login', [
            'username' => $username,
            'password' => $password,
        ]);

        $body = $response->json();

        if ($response->getStatusCode() >= 400) {
            $this->lastError = new ErrorInfo($body['error'], $response->getStatusCode());
            $this->currentUsername = '';
            return;
        }

        $this->authToken = $body['token'];
        $this->currentUsername = $username;
        $this->lastError = null;
    }

    public function getCurrentPage(): PageInfo
    {
        $response = $this->getJson('/api/dashboard', [
            'Authorization' => "Bearer {$this->authToken}",
        ]);

        $body = $response->json();

        if ($response->getStatusCode() >= 400) {
            $this->lastError = new ErrorInfo($body['error'], $response->getStatusCode());
            return new PageInfo('', '');
        }

        return new PageInfo($body['title'], $body['welcomeMessage']);
    }

    public function getLastError(): ?ErrorInfo
    {
        return $this->lastError;
    }

    public function getCurrentUsername(): string
    {
        return $this->currentUsername;
    }
}
```

Laravel's `postJson`, `getJson` methods execute the full HTTP pipeline in-process — middleware, routing, controllers, validation — without opening a TCP port. For **Symfony**, replace with `KernelTestCase` and its internal `$client->request()` method. For **plain PHP** without a framework, instantiate domain classes directly (like the TypeScript in-memory driver).

## DSL Module

The DSL is the single place where assertions live. Specs call these methods — never the driver directly.

```php
<?php
// dsl/LoginDsl.php

declare(strict_types=1);

namespace Dsl;

use Drivers\AppDriver;
use PHPUnit\Framework\Assert;

class LoginDsl
{
    public function __construct(
        private readonly AppDriver $driver,
    ) {}

    public function givenRegisteredUser(string $username, string $password): void
    {
        $this->driver->createUser($username, $password);
    }

    public function whenUserLogsIn(string $username, string $password): void
    {
        $this->driver->login($username, $password);
    }

    public function thenUserSeesHomePage(): void
    {
        $page = $this->driver->getCurrentPage();
        Assert::assertStringContainsString('Home', $page->title);
        Assert::assertStringContainsString(
            $this->driver->getCurrentUsername(),
            $page->welcomeMessage,
        );
    }

    public function thenLoginIsRejectedWith(string $message): void
    {
        $error = $this->driver->getLastError();
        Assert::assertNotNull($error, 'Expected an error but none was recorded');
        Assert::assertSame($message, $error->message);
        Assert::assertGreaterThanOrEqual(400, $error->statusCode);
    }
}
```

The DSL class does not extend `TestCase` — it uses `PHPUnit\Framework\Assert` static methods directly, which work from any class. This keeps the DSL decoupled from the test runner lifecycle.

## Executable Specification Example

Specs read like requirements. No URLs, HTTP codes, selectors, or method names — only business language (Gate G6).

```php
<?php
// specs/LoginTest.php

declare(strict_types=1);

namespace Specs;

use Drivers\DriverFactory;
use Dsl\LoginDsl;
use PHPUnit\Framework\TestCase;

class LoginTest extends TestCase
{
    private LoginDsl $dsl;

    protected function setUp(): void
    {
        $driver = DriverFactory::create();
        $this->dsl = new LoginDsl($driver);
    }

    public function testRegisteredUserCanLogIn(): void
    {
        $this->dsl->givenRegisteredUser('alice', 's3cret');
        $this->dsl->whenUserLogsIn('alice', 's3cret');
        $this->dsl->thenUserSeesHomePage();
    }

    public function testRejectsLoginWithWrongPassword(): void
    {
        $this->dsl->givenRegisteredUser('bob', 'correct-password');
        $this->dsl->whenUserLogsIn('bob', 'wrong-password');
        $this->dsl->thenLoginIsRejectedWith('Invalid credentials');
    }
}
```

## Driver Selection Configuration

Switch between HTTP and in-memory drivers via the `APP_DRIVER` environment variable.

```php
<?php
// drivers/DriverFactory.php

declare(strict_types=1);

namespace Drivers;

class DriverFactory
{
    public static function create(): AppDriver
    {
        $driverType = getenv('APP_DRIVER') ?: 'memory';

        return match ($driverType) {
            'http' => new HttpAppDriver(getenv('BASE_URL') ?: 'http://localhost:8000'),
            'memory' => new InMemoryAppDriver(),
            default => throw new \InvalidArgumentException("Unknown driver type: {$driverType}"),
        };
    }
}
```

The default driver is set in `phpunit.xml` via `<env name="APP_DRIVER" value="memory"/>`. Override it on the command line:

```bash
# Fast feedback — no server required
APP_DRIVER=memory ./vendor/bin/phpunit --testsuite acceptance

# Full integration — requires running server
APP_DRIVER=http BASE_URL=http://localhost:8000 ./vendor/bin/phpunit --testsuite acceptance
```

Both commands must produce the same pass/fail results. If they diverge, either the protocol driver has a bug or the in-memory driver is not faithful to the real system.

## Behat Integration

**Behat** is PHP's most mature BDD framework. The DSL and drivers remain identical — only the spec format changes.

### Setup

```bash
composer require --dev behat/behat
```

### Configuration

```yaml
# behat.yml
default:
  suites:
    default:
      paths:
        - features
      contexts:
        - Features\Bootstrap\LoginContext
  extensions: ~
```

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

### Context Class

```php
<?php
// features/bootstrap/LoginContext.php

declare(strict_types=1);

namespace Features\Bootstrap;

use Behat\Behat\Context\Context;
use Drivers\DriverFactory;
use Dsl\LoginDsl;

class LoginContext implements Context
{
    private LoginDsl $dsl;

    /** @BeforeScenario */
    public function setUp(): void
    {
        $driver = DriverFactory::create();
        $this->dsl = new LoginDsl($driver);
    }

    /**
     * @Given a registered user :username with password :password
     */
    public function aRegisteredUserWithPassword(string $username, string $password): void
    {
        $this->dsl->givenRegisteredUser($username, $password);
    }

    /**
     * @When the user logs in as :username with password :password
     */
    public function theUserLogsInAsWithPassword(string $username, string $password): void
    {
        $this->dsl->whenUserLogsIn($username, $password);
    }

    /**
     * @Then the user sees the home page
     */
    public function theUserSeesTheHomePage(): void
    {
        $this->dsl->thenUserSeesHomePage();
    }

    /**
     * @Then login is rejected with :message
     */
    public function loginIsRejectedWith(string $message): void
    {
        $this->dsl->thenLoginIsRejectedWith($message);
    }
}
```

Run Behat specs with the same driver selection:

```bash
APP_DRIVER=memory ./vendor/bin/behat
APP_DRIVER=http BASE_URL=http://localhost:8000 ./vendor/bin/behat
```

Step definitions call the same DSL methods as PHPUnit specs. The protocol drivers are shared. Switching from PHPUnit specs to Behat (or using both) requires zero changes to the DSL or driver layers.
