# Review Checklist

Walk every section on every review. Each checkbox maps to one rule file section — cite it in findings.

## 1. Architecture (`architecture.md`)

- [ ] Features under `Features/{Name}/Commands|Queries/` — no horizontal layers
- [ ] New feature has `IFeatureConfiguration`, parameterless ctor, `[ExcludeFromCodeCoverage]`
- [ ] No cross-feature namespace imports
- [ ] No `ControllerBase`, `[ApiController]`, `IMediator`, MediatR
- [ ] One type per file; file name matches type
- [ ] Shared DTOs in feature's `Shared/`, not `Common/`

## 2. API Design (`api-design.md`)

- [ ] Return type is `Task<Results<TSuccess, ProblemDetails>>`
- [ ] `DontCatchExceptions()` in every `Configure()`
- [ ] `Permissions()` or `Policies()` present — never accidentally anonymous
- [ ] `.WithName(nameof(...))` + `.WithTag(_featureConfiguration)`
- [ ] Every `Produces<>()` lines up with a real return path
- [ ] No `Send.NotFoundAsync()` / `Send.ForbiddenAsync()` — use `TypedResults.*` or `CreateProblemDetailsResponse(error)`
- [ ] Route `api/{feature}/{action?}`, lowercase-kebab for multi-word
- [ ] Requests are `class` with `set`; responses are `record` with `init`

## 3. Error Handling (`error-handling.md`)

- [ ] Expected failures returned via `Result<T>` — never thrown
- [ ] Feature has `{Feature}Errors.cs` static class with factories
- [ ] `Error.{NotFound|Forbidden|Conflict|Validation}` with stable error codes
- [ ] `this.CreateProblemDetailsResponse(error)` at endpoint boundary
- [ ] No `try/catch` for control flow — only genuine infrastructure calls
- [ ] ROP `.Then/.Map/.Tap` for 3+ fallible steps; simple guards otherwise
- [ ] No `throw` for business errors

## 4. Validation (`validation.md`)

- [ ] Complex-input endpoints have `Validator<TRequest>` (FastEndpoints variant, not `AbstractValidator`)
- [ ] Every `RuleFor` has `.WithErrorCode(...)` pointing at `Utils/ErrorCodes.cs`
- [ ] FluentValidation only checks shape — not business rules
- [ ] Business rules live in `Result<T>` inside handler
- [ ] Validator is `internal sealed`

## 5. Naming (`naming.md`)

- [ ] Endpoints: `{HttpVerb}{Entity}Endpoint`
- [ ] DB entities: `{Entity}Do : AuditableDo`
- [ ] Request DTOs: `{Action}{Entity}Request`
- [ ] Response DTOs: `{Entity}Dto` or `{Entity}{Context}Dto`
- [ ] Validators: `{Request}Validator`
- [ ] Error factories: `{Feature}Errors`
- [ ] Feature config: `{Feature}FeatureConfiguration`
- [ ] Permissions: `"{domain}.{action}"` lowercase.dot; `"{domain}.{action}_{scope}"` for scoped
- [ ] Error codes: `"{Domain}.{ErrorName}"` PascalCase.PascalCase
- [ ] Namespaces: file-scoped, match folder
- [ ] Test methods: `{Method}_{Scenario}_{ExpectedResult}`

## 6. EF Core (`ef-core.md`)

- [ ] Read queries use `.AsNoTracking()`
- [ ] `.Select(...)` projections for reads
- [ ] Entities inherit `AuditableDo` — audit fields not set manually
- [ ] Primary keys are `Guid`
- [ ] Dates: `DateOnly` / `DateTimeOffset` — no bare `DateTime`
- [ ] `CancellationToken ct` forwarded to every async EF call
- [ ] Enums stored as strings (`HasConversion<string>()` or global convention)
- [ ] Entity config in `IEntityTypeConfiguration<T>` under `Infrastructure/EntityFramework/Configurations/`
- [ ] Configurations are `internal sealed`

## 7. C# Style (`csharp-style.md`)

- [ ] Primary constructors for DI
- [ ] Records with `init` for responses; classes with `set` for requests
- [ ] Endpoint/validator/feature config `internal sealed`
- [ ] No `DateTime.UtcNow` / `DateTime.Now` — injected `TimeProvider`
- [ ] No `#region` / `#endregion`
- [ ] XML `/// <summary>` on public/internal members
- [ ] File-scoped namespaces
- [ ] Guard clauses with early return — no nested if/else
- [ ] Expression-bodied `=>` for single-expression members
- [ ] Target-typed `new()` where LHS obvious
- [ ] Every async method takes/forwards `CancellationToken ct` (exact name `ct`)

## 8. Testing

- [ ] New endpoints have integration test class in `.Tests.Integration`
- [ ] Test class `[Collection(nameof(TestCollections.{Feature}TestCollection))]`
- [ ] `SetupAsync` calls `app.ResetDatabaseAsync()`
- [ ] No `DateTime.UtcNow` in tests — `FakeTimeProvider`
- [ ] `TestContext.Current.CancellationToken` on async ops
- [ ] Auth headers cleared in `finally` (or via `TestBase.TearDownAsync`)
- [ ] Coverage order: 401, 403, 400, 404, 409, 200/201/204
- [ ] Commands assert DB state after HTTP assertion
- [ ] No mocking of `DbContext` — TestContainers + real Postgres
- [ ] Seed via `DbContext`, not API calls (except testing the API chain)

## Common false positives

- `public` on types that *are* a consumed contract (shared with Azure Functions / Frontend) — check if in `Shared/` before flagging.
- Missing `.WithErrorCode()` on a `.NotEmpty()` FastEndpoints handles generically — acceptable if no localized message needed.
- `DateTime` in legacy migrations / pre-existing entities — flag as "observed, not introduced".
