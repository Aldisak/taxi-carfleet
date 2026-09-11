---
name: gc-tdd
description: Test-first flow for .NET endpoints — red integration test, minimal impl, unit tests for failures, refactor, review. Use on "TDD", "red-green-refactor", test-first, or regression-then-fix.
argument-hint: "<feature> <endpoint description>"
---

# TDD Workflow

**Iron law:** the failing integration test is written *before* the endpoint exists.

Red → Green → Refactor: one failing test, minimum code to pass, cleanup while green. Theory + testing conventions (stack, fixtures, collections, cancellation tokens) live in `references/testing-conventions.md`.

## When to use
- Adding an endpoint test-first.
- Reproducing then fixing a bug with a regression test.
- User says "TDD", "red-green-refactor", "test-first".

## When not to use
- Scaffolding without test-first → `/gc-feature`.
- Pure convention check → `/gc-review`.

## Required rules

Load these at invocation — `paths:`-based auto-loading is not used, enumerate explicitly:

- `skills/gc-tdd/references/testing-conventions.md` — test stack, collections, fixtures, cancellation tokens, test ordering.
- `rules/architecture.md` — vertical-slice layout the tests must respect.
- `rules/api-design.md` — endpoint shape the integration test exercises.
- `rules/error-handling.md` — Result + ROP patterns the unit tests assert against.
- `rules/validation.md` — FluentValidation behaviour under `TestValidate`.
- `rules/naming.md` — `{Method}_{Scenario}_{ExpectedResult}` test naming.
- `rules/csharp-style.md` — records for DTOs, `TimeProvider`/`FakeTimeProvider`, `CancellationToken` propagation.

## Cycle

```
RED → GREEN → REFACTOR → REVIEW
```

One test case per tick — not the whole endpoint.

## Unit-first for failure paths

Per `references/testing-conventions.md`: unit tests cover all failure branches (401, 403, 400, 404, 409). Integration covers happy path (HTTP stack + real DB).

## Step 1 — RED

- Pick simplest success case (command: 201; query: 200 with expected DTO).
- Create test class in `.Tests.Integration`, follow `references/testing-conventions.md` → Test collections, Test base, Fixture.
- Run: `dotnet test --filter "FullyQualifiedName~{Action}{Entity}EndpointTests"`.
- Must fail (compile error or 404/405). **Do not implement until RED.**

Minimum stub:

```csharp
[Collection(nameof(TestCollections.{Feature}TestCollection))]
public class {Action}{Entity}EndpointTests(TestFixtures.{Feature}TestsFixture app) : TestBase
{
    protected override async ValueTask SetupAsync() => await app.ResetDatabaseAsync();

    [Fact]
    public async Task HandleAsync_ValidRequest_ReturnsCreatedWithId()
    {
        AuthTestHelper.SetAuthHeaders(app.Client, Roles.Employee);
        try
        {
            var response = await app.Client.PostAsJsonAsync(
                "api/{feature}",
                new {Action}{Entity}Request { /* minimal valid payload */ },
                TestContext.Current.CancellationToken);

            response.StatusCode.Should().Be(HttpStatusCode.Created);
            var id = await response.Content.ReadFromJsonAsync<Guid>(JsonHelper.Options);
            id.Should().NotBeEmpty();
        }
        finally { AuthTestHelper.ClearAuthHeaders(); }
    }
}
```

## Step 2 — GREEN

Hand off to `/gc-feature` for scaffolding. Implement only what this test requires. Order:

1. `{Action}{Entity}Request.cs`
2. Response DTO (if needed)
3. Entity + EF config + migration (if new table) → `/gc-migrate`
4. `{Action}{Entity}Endpoint.cs`
5. `{Feature}FeatureConfiguration.cs` (if new)

Rerun filtered test until GREEN.

## Step 3 — add failure cases (one at a time)

Order per `references/testing-conventions.md#test-ordering`. Failure cases are **unit tests** in `.Tests.Unit`:

1. `HandleAsync_Unauthorized_Returns401`
2. `HandleAsync_InsufficientPermission_Returns403`
3. `HandleAsync_InvalidInput_Returns400` (if validator, via `TestValidate`)
4. `HandleAsync_{Entity}NotFound_Returns404`
5. `HandleAsync_{Condition}_Returns409` (per business rule)
6. `HandleAsync_ValidRequest_Persists{Entity}ToDatabase` — **integration**, DB-state assertion

Each: RED → GREEN. If a new test is immediately green, it isn't exercising the code you think — fix it first.

## Step 4 — REFACTOR

Clean up without changing behaviour:

- YES: extract private methods for multi-step logic
- YES: switch to ROP chain if 3+ sequential fallible guards (`error-handling.md` → "Complex Case")
- YES: add missing `AsNoTracking()` on reads
- YES: fill in XML `/// <summary>` docs
- YES: remove scaffolding comments

After each change: `dotnet test --filter "FullyQualifiedName~{Action}{Entity}EndpointTests"`. Red → revert, try smaller refactor.

## Step 5 — REVIEW

Run `/gc-review` on the diff. Apply critical fixes, rerun tests.

## Step 6 — final verification

```bash
dotnet test       # full suite — no regressions
dotnet build      # no warnings
```

## ROP and TDD

Endpoint with 4+ fallible steps (fetch user → permission → domain rule → conflict → save) → one `[Fact]` per step. Each `.Then()` corresponds to one `Returns{status}` test.

## Don't

- Don't write the endpoint first and tests second — kills the discriminating signal.
- Don't write all six tests upfront — loses per-step RED/GREEN rhythm.
- Don't mock `DbContext` in integration tests — use TestContainers (fakes fine in unit).
- Don't use `DateTime.UtcNow` in tests — `FakeTimeProvider` via DI.
- Don't test private methods — test through the HTTP boundary.
- Don't skip REFACTOR while tests are green — debt compounds.

## Done when

- [ ] `dotnet test --filter "FullyQualifiedName~{Action}{Entity}EndpointTests"` green.
- [ ] Unit tests cover 401/403/400/404/409 as applicable; integration covers happy path + DB state.
- [ ] `dotnet test` green (full suite, no regressions).
- [ ] `dotnet build` no warnings.
- [ ] `/gc-review` run; critical findings resolved.
