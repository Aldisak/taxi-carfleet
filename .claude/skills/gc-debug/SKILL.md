---
name: gc-debug
description: Systematic debug workflow for .NET backend — reproduce, isolate, root-cause, fix, verify, lock in regression test. Use on wrong status codes, red tests, EF errors, 500s, auth anomalies.
argument-hint: "<description of the issue>"
---

# Systematic Debugging

**Arguments:** `$ARGUMENTS` — e.g., `CreateAbsence returns 403 for Manager role when it should return 201`.

## When to use
- Endpoint returns wrong status / unexpected data.
- Failing test, 500 in logs, EF Core error, permission/auth anomaly.
- Environment-specific behaviour difference.

## When not to use
- Adding new behaviour → `/gc-feature` or `/gc-tdd`.
- Migration rollback → `/gc-migrate` → "Rolling back".

## Required rules

Load these at invocation — `paths:`-based auto-loading is not used, enumerate explicitly:

- `rules/api-design.md` — endpoint `Configure()`, `DontCatchExceptions()`, `Permissions(...)`, `Send.*` — the surface most 401/403/405/500 bugs live in.
- `rules/error-handling.md` — Result branches, ROP chain, `{Feature}Errors` factory — root-cause shapes.
- `rules/ef-core.md` — `AsNoTracking`, `Include`, projections, tracking conflicts, migration state.
- `rules/validation.md` — which rule fires on 400; where error codes come from.
- `rules/csharp-style.md` — `TimeProvider`/`FakeTimeProvider` for deterministic repro.
- `rules/naming.md` — regression-test naming (`{Method}_{Scenario}_{ExpectedResult}`).
- `skills/gc-debug/references/troubleshooting.md` — per-status tables, data-shape/JSON/test-isolation symptoms.

## Cycle

```
REPRODUCE → READ → ISOLATE → IDENTIFY → FIX → VERIFY → PREVENT
```

Do not skip steps. Each step's output is the next step's input.

## Step 1 — REPRODUCE

- [ ] Make it deterministic before investigating.
- [ ] Failing test? Run in isolation: `dotnet test --filter "FullyQualifiedName~{TestMethodName}" --verbosity detailed`.
- [ ] No test? Write one capturing current wrong behaviour, then flip the assertion — that's the target red.
- [ ] Intermittent? Name the nondeterminism source: `DateTime.UtcNow` vs `FakeTimeProvider`, test collection isolation, order-dependent seed.

## Step 2 — READ

Orient before hypothesising:

```
Endpoint.Configure()  → Permissions() declared? right string?
                      → DontCatchExceptions()? missing → auth looks like 401 silently
Endpoint.HandleAsync → Result branches? DB queries (AsNoTracking? Includes? projections)?
                      → services called (CurrentUser, PermissionService, TimeProvider)
```

Also read: feature `Errors.cs`, validator, EF config for involved entities. For 403, read permission constant value and role-permission seed mapping.

## Step 3 — ISOLATE by status

Full per-status tables in `references/troubleshooting.md`. Quick orientation:

| Status | First question |
|--------|----------------|
| 401 | `DontCatchExceptions()` present? Missing it makes auth exceptions look like 401 |
| 403 | Does the test role actually hold the required permission string? |
| 404 | Entity in DB at test time (seed vs `ResetDatabaseAsync`)? ID correct? |
| 400 | Which validator rule fires? JSON casing matches? (snake_case) |
| 409 | Business rule — thrown error code vs error factory |
| 500 | Unhandled exception in logs? Null ref in projection? EF constraint? |

## Step 4 — IDENTIFY root cause

State it in one sentence before fixing. If you can't, return to Step 2.

- CORRECT: "`ViewScope` is constructed with only `View` in its scope set; Manager has `absences.view_team`, so the OR never matches."
- Anti-pattern: "Something about permissions."

Verify: bug disappears **iff** you change the line you think is wrong. If unrelated changes also "fix" it, you found a coincidence.

## Step 5 — FIX minimally

Fix only what the root cause requires. No refactor-in-a-bugfix-commit.

Common shapes (idioms in `error-handling.md`):

- Missing error factory → add to `{Feature}Errors.cs`, return via `CreateProblemDetailsResponse`.
- Missing guard → early-return guard clause (no nested ifs).
- Missing `AsNoTracking()` on a read → add it.
- Wrong permission constant → fix constant **and** role-permission seed.
- Wrong projection field → fix `Select(...)`; don't reach for `Include` unless you need the full entity.

## Step 6 — VERIFY

```bash
dotnet test --filter "FullyQualifiedName~{TestMethodName}"   # targeted — now green
dotnet test                                                   # full suite — no regression
dotnet build                                                  # no warnings
```

Unrelated test turned red → fix has side effects → back to Step 4.

## Step 7 — PREVENT

Regression test must:
1. Fail against pre-fix code.
2. Pass against post-fix code.
3. Name follows `{Method}_{Scenario}_{ExpectedResult}`.

This is the most-skipped, most-valuable step.

## Common symptom → cause

Full table (data-shape, JSON, test-isolation) in `references/troubleshooting.md`.

| Symptom | Usual cause |
|---------|-------------|
| 405 Method Not Allowed | Endpoint not registered — missing/misnamed `IFeatureConfiguration` |
| 401 on authenticated request | `DontCatchExceptions()` missing — auth exception swallowed |
| 500 on valid request | Unhandled exception — null ref in projection or EF constraint |
| Wrong result in one test only | `FakeTimeProvider` not pinned / forgotten |
| Passes alone, fails in suite | `ResetDatabaseAsync()` missing — depends on prior test's state |
| EF tracking conflict on update | Prior read didn't use `AsNoTracking()` |
| Null deserialisation | snake_case / camelCase mismatch vs `JsonNamingPolicy` |
| 403 for a user who "should" have access | Permission constant typo, wrong scope set, or role-seed mismatch |

## Don't

- Don't swallow an exception to make a symptom disappear.
- Don't hardcode a value to turn a red test green.
- Don't add `!` to suppress a null warning without understanding the null source.
- Don't disable a permission check "temporarily".
- Don't widen a test's accepted range to encompass the wrong answer.
- Don't modify an applied migration — create a corrective one (see `/gc-migrate`).

## Escalation

- Reproduces in CI, not locally → TestContainers/Docker. Capture CI logs + local `docker info`.
- One environment only → config drift. Diff `appsettings.{Env}.json`, check key vault / env vars.
- Touches migration history → **stop**. See `/gc-migrate` → "Rolling back".

## Done when

- [ ] Root cause stated in one sentence.
- [ ] `dotnet test --filter "FullyQualifiedName~{TestMethodName}"` green.
- [ ] `dotnet test` green (no regressions).
- [ ] `dotnet build` no warnings.
- [ ] Regression test committed; named `{Method}_{Scenario}_{ExpectedResult}`.
