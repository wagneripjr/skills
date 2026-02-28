# ATDD with Protocol Drivers in C#

## Folder Structure

```
MySolution/
  MySolution.sln
  src/
    MyApp/                           # Production code (ASP.NET Core Web API)
      MyApp.csproj
      Program.cs
      Users/
        UserService.cs
        UserRepository.cs
        IUserRepository.cs
  tests/
    AcceptanceTests/                  # Specs + DSL + drivers (outer ATDD loop)
      AcceptanceTests.csproj
      Specs/
        LoginSpecs.cs
      Dsl/
        LoginDsl.cs
      Drivers/
        IAppDriver.cs                # Protocol driver interface
        HttpAppDriver.cs             # HTTP protocol driver
        InMemoryAppDriver.cs         # WebApplicationFactory driver
        DriverFactory.cs             # Driver selection via env var
    UnitTests/                       # Inner TDD loop
      UnitTests.csproj
      Users/
        UserServiceTests.cs
  features/                          # Optional: SpecFlow/Reqnroll Gherkin files
    Login.feature
    StepDefinitions/
      LoginSteps.cs
    Hooks/
      ScenarioSetup.cs
```

Use **xUnit** as the test runner. Separate acceptance specs from unit tests in distinct `.csproj` projects — this allows independent execution and dependency management.

## Test Runner Setup

```xml
<!-- tests/AcceptanceTests/AcceptanceTests.csproj -->
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <IsPackable>false</IsPackable>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.Mvc.Testing" Version="8.0.*" />
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.*" />
    <PackageReference Include="xunit" Version="2.9.*" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.8.*" />
    <PackageReference Include="FluentAssertions" Version="7.*" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\..\src\MyApp\MyApp.csproj" />
  </ItemGroup>

</Project>
```

Filter acceptance tests vs. unit tests:

```bash
# Outer loop — acceptance specs only
dotnet test tests/AcceptanceTests --filter "Category=Acceptance"

# Inner loop — unit tests only
dotnet test tests/UnitTests

# Both
dotnet test
```

## Protocol Driver Interface

Define the contract that every driver must fulfill. The interface speaks in domain terms only — no HTTP codes, no URLs, no implementation leakage.

```csharp
// tests/AcceptanceTests/Drivers/IAppDriver.cs
namespace AcceptanceTests.Drivers;

public record PageInfo(string Title, string WelcomeMessage);

public record ErrorInfo(string Message, int StatusCode);

public interface IAppDriver : IAsyncDisposable
{
    string CurrentUsername { get; }

    Task CreateUserAsync(string username, string password);

    Task LoginAsync(string username, string password);

    Task<PageInfo> GetCurrentPageAsync();

    ErrorInfo GetLastError();
}
```

This interface belongs in `docs/adr/` as a design artifact and is implemented here as code.

## HTTP Protocol Driver

Talks to the running application over HTTP using `HttpClient`.

```csharp
// tests/AcceptanceTests/Drivers/HttpAppDriver.cs
using System.Net.Http.Json;
using System.Text.Json;

namespace AcceptanceTests.Drivers;

public sealed class HttpAppDriver(HttpClient httpClient) : IAppDriver
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private string _authToken = "";
    private ErrorInfo _lastError = new("", 0);

    public string CurrentUsername { get; private set; } = "";

    public async Task CreateUserAsync(string username, string password)
    {
        var response = await httpClient.PostAsJsonAsync("/api/users", new { username, password });

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
            _lastError = new(body.GetProperty("error").GetString()!, (int)response.StatusCode);
            throw new InvalidOperationException($"CreateUser failed: {response.StatusCode}");
        }
    }

    public async Task LoginAsync(string username, string password)
    {
        var response = await httpClient.PostAsJsonAsync("/api/auth/login", new { username, password });
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);

        if (!response.IsSuccessStatusCode)
        {
            _lastError = new(body.GetProperty("error").GetString()!, (int)response.StatusCode);
            CurrentUsername = "";
            return; // Do not throw — DSL asserts the error
        }

        _authToken = body.GetProperty("token").GetString()!;
        CurrentUsername = username;
        _lastError = new("", 0);
    }

    public async Task<PageInfo> GetCurrentPageAsync()
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/dashboard");
        request.Headers.Authorization = new("Bearer", _authToken);

        var response = await httpClient.SendAsync(request);

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
            _lastError = new(body.GetProperty("error").GetString()!, (int)response.StatusCode);
            return new("", "");
        }

        var page = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        return new(
            page.GetProperty("title").GetString()!,
            page.GetProperty("welcomeMessage").GetString()!
        );
    }

    public ErrorInfo GetLastError() => _lastError;

    public ValueTask DisposeAsync()
    {
        httpClient.Dispose();
        return ValueTask.CompletedTask;
    }
}
```

Key design decisions: `LoginAsync` does not throw on auth failure — it stores the error for the DSL to assert. The driver translates HTTP mechanics into domain-relevant data. No assertions here (Gate G5).

## In-Memory Protocol Driver

This is C#'s unique strength. `WebApplicationFactory<Program>` boots the **full ASP.NET Core pipeline in-process** — real middleware, routing, DI, filters, model binding — without opening a TCP port. The `HttpClient` returned by `CreateClient()` sends requests through an in-memory transport, making round trips sub-millisecond.

```csharp
// tests/AcceptanceTests/Drivers/InMemoryAppDriver.cs
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using System.Net.Http.Json;
using System.Text.Json;

namespace AcceptanceTests.Drivers;

public sealed class InMemoryAppDriver : IAppDriver
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;
    private string _authToken = "";
    private ErrorInfo _lastError = new("", 0);

    public InMemoryAppDriver()
    {
        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.ConfigureServices(services =>
                {
                    // Override services for testing: swap real DB for in-memory,
                    // replace external APIs with fakes, etc.
                    // services.RemoveAll<IUserRepository>();
                    // services.AddSingleton<IUserRepository, InMemoryUserRepository>();
                });
            });

        _client = _factory.CreateClient();
    }

    public string CurrentUsername { get; private set; } = "";

    public async Task CreateUserAsync(string username, string password)
    {
        var response = await _client.PostAsJsonAsync("/api/users", new { username, password });

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
            _lastError = new(body.GetProperty("error").GetString()!, (int)response.StatusCode);
            throw new InvalidOperationException($"CreateUser failed: {response.StatusCode}");
        }
    }

    public async Task LoginAsync(string username, string password)
    {
        var response = await _client.PostAsJsonAsync("/api/auth/login", new { username, password });
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);

        if (!response.IsSuccessStatusCode)
        {
            _lastError = new(body.GetProperty("error").GetString()!, (int)response.StatusCode);
            CurrentUsername = "";
            return;
        }

        _authToken = body.GetProperty("token").GetString()!;
        CurrentUsername = username;
        _lastError = new("", 0);
    }

    public async Task<PageInfo> GetCurrentPageAsync()
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/dashboard");
        request.Headers.Authorization = new("Bearer", _authToken);

        var response = await _client.SendAsync(request);

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
            _lastError = new(body.GetProperty("error").GetString()!, (int)response.StatusCode);
            return new("", "");
        }

        var page = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        return new(
            page.GetProperty("title").GetString()!,
            page.GetProperty("welcomeMessage").GetString()!
        );
    }

    public ErrorInfo GetLastError() => _lastError;

    public async ValueTask DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
    }
}
```

Unlike the TypeScript/Python in-memory drivers that bypass the web layer entirely, `WebApplicationFactory` runs the **real ASP.NET Core pipeline**. Request → middleware → routing → controller → service → repository → response all execute in-process. Override specific services in `WithWebHostBuilder` to swap real databases for in-memory stores, external APIs for fakes, or configuration values for test settings. This catches routing misconfigurations, middleware ordering bugs, and DI wiring errors that a pure domain-level driver would miss.

## DSL Module

The DSL is the single place where assertions live. Specs call these methods — never the driver directly.

```csharp
// tests/AcceptanceTests/Dsl/LoginDsl.cs
using AcceptanceTests.Drivers;
using FluentAssertions;

namespace AcceptanceTests.Dsl;

public sealed class LoginDsl(IAppDriver driver)
{
    public async Task GivenRegisteredUser(string username, string password)
    {
        await driver.CreateUserAsync(username, password);
    }

    public async Task WhenUserLogsIn(string username, string password)
    {
        await driver.LoginAsync(username, password);
    }

    public async Task ThenUserSeesHomePage()
    {
        var page = await driver.GetCurrentPageAsync();
        page.Title.Should().Contain("Home");
        page.WelcomeMessage.Should().Contain(driver.CurrentUsername);
    }

    public void ThenLoginIsRejectedWith(string message)
    {
        var error = driver.GetLastError();
        error.Message.Should().Be(message);
        error.StatusCode.Should().BeGreaterThanOrEqualTo(400);
    }
}
```

FluentAssertions produces readable failure messages (e.g., `Expected page.Title to contain "Home", but found "Login"`). The `.Should()` API reads naturally in Given/When/Then context.

## Executable Specification Example

Specs read like requirements. No URLs, HTTP codes, selectors, or method names — only business language (Gate G6).

```csharp
// tests/AcceptanceTests/Specs/LoginSpecs.cs
using AcceptanceTests.Dsl;
using AcceptanceTests.Drivers;

namespace AcceptanceTests.Specs;

[Trait("Category", "Acceptance")]
public sealed class LoginSpecs : IAsyncLifetime
{
    private IAppDriver _driver = null!;
    private LoginDsl _dsl = null!;

    public Task InitializeAsync()
    {
        _driver = DriverFactory.Create();
        _dsl = new LoginDsl(_driver);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        await _driver.DisposeAsync();
    }

    [Fact]
    public async Task Registered_user_can_log_in_with_valid_credentials()
    {
        await _dsl.GivenRegisteredUser("alice", "s3cret");
        await _dsl.WhenUserLogsIn("alice", "s3cret");
        await _dsl.ThenUserSeesHomePage();
    }

    [Fact]
    public async Task Rejects_login_with_wrong_password()
    {
        await _dsl.GivenRegisteredUser("bob", "correct-password");
        await _dsl.WhenUserLogsIn("bob", "wrong-password");
        _dsl.ThenLoginIsRejectedWith("Invalid credentials");
    }
}
```

`IAsyncLifetime` provides `InitializeAsync` and `DisposeAsync` — xUnit calls these before and after each test, ensuring clean driver state and proper resource cleanup.

## Driver Selection Configuration

Switch between HTTP and in-memory drivers via the `DRIVER` environment variable.

```csharp
// tests/AcceptanceTests/Drivers/DriverFactory.cs
namespace AcceptanceTests.Drivers;

public static class DriverFactory
{
    public static IAppDriver Create()
    {
        var driverType = Environment.GetEnvironmentVariable("DRIVER") ?? "memory";

        return driverType switch
        {
            "http" => new HttpAppDriver(new HttpClient
            {
                BaseAddress = new Uri(
                    Environment.GetEnvironmentVariable("BASE_URL") ?? "http://localhost:5000")
            }),
            "memory" => new InMemoryAppDriver(),
            _ => throw new ArgumentException($"Unknown driver type: {driverType}")
        };
    }
}
```

Run specs with either driver:

```bash
# Fast feedback — full pipeline, no network
DRIVER=memory dotnet test tests/AcceptanceTests --filter "Category=Acceptance"

# Full integration — requires running server
DRIVER=http BASE_URL=http://localhost:5000 dotnet test tests/AcceptanceTests --filter "Category=Acceptance"
```

Both commands must produce the same pass/fail results. If they diverge, either the protocol driver has a bug or the in-memory driver is not faithful to the real system.

## SpecFlow/Reqnroll Integration

For teams that prefer Gherkin `.feature` files. The DSL and drivers remain identical — only the spec format changes. **Reqnroll** is the actively maintained fork of SpecFlow (SpecFlow development stopped in 2023). Use Reqnroll for new projects; SpecFlow for existing ones.

### NuGet Packages

```xml
<!-- Add to AcceptanceTests.csproj -->
<ItemGroup>
  <!-- Use ONE of these — not both -->
  <PackageReference Include="Reqnroll.xUnit" Version="2.*" />
  <!-- OR: <PackageReference Include="SpecFlow.xUnit" Version="3.9.*" /> -->
</ItemGroup>
```

### Feature File

```gherkin
# features/Login.feature
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

### Step Definitions

```csharp
// features/StepDefinitions/LoginSteps.cs
using AcceptanceTests.Dsl;
using Reqnroll;

namespace AcceptanceTests.StepDefinitions;

[Binding]
public sealed class LoginSteps(ScenarioContext scenarioContext)
{
    private LoginDsl Dsl => scenarioContext.Get<LoginDsl>();

    [Given(@"a registered user ""(.+)"" with password ""(.+)""")]
    public async Task GivenARegisteredUser(string username, string password)
    {
        await Dsl.GivenRegisteredUser(username, password);
    }

    [When(@"the user logs in as ""(.+)"" with password ""(.+)""")]
    public async Task WhenTheUserLogsIn(string username, string password)
    {
        await Dsl.WhenUserLogsIn(username, password);
    }

    [Then(@"the user sees the home page")]
    public async Task ThenTheUserSeesTheHomePage()
    {
        await Dsl.ThenUserSeesHomePage();
    }

    [Then(@"login is rejected with ""(.+)""")]
    public void ThenLoginIsRejectedWith(string message)
    {
        Dsl.ThenLoginIsRejectedWith(message);
    }
}
```

### Scenario Hooks

```csharp
// features/Hooks/ScenarioSetup.cs
using AcceptanceTests.Drivers;
using AcceptanceTests.Dsl;
using Reqnroll;

namespace AcceptanceTests.Hooks;

[Binding]
public sealed class ScenarioSetup(ScenarioContext scenarioContext)
{
    private IAppDriver? _driver;

    [BeforeScenario]
    public void SetUp()
    {
        _driver = DriverFactory.Create();
        var dsl = new LoginDsl(_driver);

        scenarioContext.Set(_driver);
        scenarioContext.Set(dsl);
    }

    [AfterScenario]
    public async Task TearDown()
    {
        if (_driver is not null)
        {
            await _driver.DisposeAsync();
        }
    }
}
```

Step definitions call the same DSL methods as xUnit specs. The protocol drivers are shared. Switching from xUnit specs to Reqnroll (or using both) requires zero changes to the DSL or driver layers.
