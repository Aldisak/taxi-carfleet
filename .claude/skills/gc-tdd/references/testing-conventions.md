# Testing Conventions (gc-tdd reference)

Project-specific .NET testing rules. Read on demand from citations like `skills/gc-tdd/references/testing-conventions.md#<anchor>`.

## Philosophy: unit first

Unit by default. Integration only when the scenario needs the full HTTP stack or a real database. When both cover the same case — choose unit.

- **Unit:** validators (`TestValidate`), handler logic (auth, not-found, conflicts), helpers, domain invariants.
- **Integration:** happy path per endpoint (full stack + DB persistence). Cases exercising DB constraints, transactions, query behavior.

## Test stack

`xunit.v3`, `Testcontainers.PostgreSql`, `Respawn` (DB reset), `FakeItEasy` (no Moq/NSubstitute), `FluentAssertions`, `Microsoft.Extensions.TimeProvider.Testing` (`FakeTimeProvider`), `FastEndpoints.Testing`.

## Test collections

Feature tests share one PostgreSQL container per collection. Collections run sequentially; different collections run in parallel with isolated containers. Collection names: `const string` on a central constants class (CLAUDE.md → TestConstants). Never hardcode.

## Test base

Extends `TestBase`, injects fixture via primary ctor (CLAUDE.md → IntegrationTestFixture):

```csharp
[Collection(TestConstants.Collections.PipelineTest)]
public class CreateOrderEndpointTests(IntegrationTestFixture app) : TestBase
{
    protected override async ValueTask SetupAsync() => await app.ResetDatabaseAsync();
}
```

## Collection attribute

Every integration test class MUST have `[Collection(TestConstants.Collections.PipelineTest)]`. Missing it → new container per class → slow + flaky.

## Reset database first

`await app.ResetDatabaseAsync();` MUST be the **first line** of `SetupAsync()`. Out of order → stale data → flaky tests.

## FakeItEasy only

No Moq, no NSubstitute. Do NOT mock `DbContext` in integration tests — use the real container. Unit tests: EF in-memory or a fake is fine.

## Cancellation token

Every async call MUST pass `TestContext.Current.CancellationToken` (xUnit v3). Skipping → CI hangs.

## HTTP client

`HttpClient` from the fixture (carries auth, points at TestContainers DB). Never instantiate `WebApplicationFactory<Program>` directly (CLAUDE.md → Client factories).

## Fixture

Wraps `AppFixture<Program>`, starts Postgres, applies migrations. Provides `ResetDatabaseAsync()` (Respawn), auth-preconfigured HTTP clients, `app.Services` for seeding + DB assertions. Register `FakeTimeProvider` as singleton (rules/csharp-style.md#timeprovider).

## Assertions

FluentAssertions. Order: HTTP status → response body → DB state.

## Deterministic GUIDs

Seed data + expected IDs: `new Guid("00000000-0000-0000-0000-000000000001")`. Never `Guid.NewGuid()` for fixed rows. `Guid.NewGuid()` is fine for IDs not asserted by value.

## Red green refactor

One failing test → minimum code to make it pass → cleanup while green. Never write implementation before the test fails for the expected reason (compile error or wrong status code). After GREEN, refactor without changing behavior; tests must stay green at every step.

## One behavior per cycle

Each RED→GREEN cycle exercises exactly one behavior (one acceptance criterion or one error path). If a new test is immediately green, the code is already doing the work — split the test or pick a smaller behavior.

## Test ordering

Start with integration happy path (RED → GREEN), then unit tests per failure branch.

| Case | Type |
|------|------|
| 200/201/204 happy path + DB verification | Integration |
| 401, 403, 404, 409 | Unit |
| 400 Bad Request (validator) | Unit (`TestValidate`) |
