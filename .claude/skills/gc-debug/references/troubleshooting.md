# Troubleshooting Reference

Per-status and per-symptom tables. Consult when `/gc-debug` Step 3 doesn't yield an obvious cause.

## 401 Unauthorized

| Question | If yes → |
|----------|----------|
| `DontCatchExceptions()` missing from `Configure()`? | Real failure (often auth) is swallowed — add it, rerun |
| Test missing `AuthTestHelper.SetAuthHeaders(...)`? | Add correct role |
| JWT/test token lacks expected claims? | Check `TestUsersIds.X` vs seeded user |
| Endpoint anonymous on purpose, global policy forces auth? | Add `AllowAnonymous()` explicitly |

## 403 Forbidden

| Question | If yes → |
|----------|----------|
| Permission constant string matches seed exactly? (`absences.view` vs `absence.view`) | Fix typo in constant OR seed, not both |
| Test role has this permission in `SeedPermissionsData`? | Map it |
| `CanAccessResourceAsync` called with right `PermissionScopeSet`? | Check scope-set composition |
| `currentUser.Id` is who the test thinks it is? | Confirm `AuthTestHelper` role matches `TestUsersIds.X` |
| `PermissionScopeSet` has right mix of `View`/`ViewTeam`/`ViewAll`? | Remember: OR across permissions |
| `TeamHierarchyService` returning expected manager chain? | Debug manager FK chain in seed |

## 404 Not Found

| Question | If yes → |
|----------|----------|
| Entity actually seeded for this test? | Add via `DbContext.Add(...)` + `SaveChangesAsync` |
| `ResetDatabaseAsync()` wiping your seed? | Seed inside the test, not in constructor |
| Request ID matches seeded entity ID? | Log and compare; don't eyeball Guids |
| `Where` filters on right column? | `Where(e => e.UserId == ...)` vs `Where(e => e.CreatedBy == ...)` |
| Stale cache from tracked read? | Add `AsNoTracking()` or re-open DbContext scope |

## 400 Bad Request

| Question | If yes → |
|----------|----------|
| Which validator rule fires? | Check `.WithErrorCode(...)` in response |
| JSON property name matches request class? (snake_case globally) | Fix property name or payload |
| Required field missing/null? | Confirm `required` keyword + test payload |
| FluentValidation used for a business rule? | Move to endpoint handler as `Result` |

## 409 Conflict

| Question | If yes → |
|----------|----------|
| Which business rule fires? | Match error code to factory |
| Uniqueness constraint at DB and domain level? | Check in domain with Result; DB is last line of defence |
| Unique index missing, duplicates slipping through? | Add index + migration |
| Race possible (multiple requests creating same resource)? | Consider `SERIALIZABLE` or unique constraint + catch-convert |

## 500 Internal Server Error

| Question | If yes → |
|----------|----------|
| `NullReferenceException` in projection? | `Select(...)` deref nullable nav — guard or fix FK |
| EF constraint violation (FK, unique, NOT NULL)? | Domain failed invariant — add `Result` branch |
| External service timeout/failure? | Wrap with `try/catch` only if recoverable |
| `ArgumentException` / `InvalidOperationException` from EF config? | Model drift — run migrations, confirm shape |

## Wrong data in response

| Symptom | Usual cause |
|---------|-------------|
| Null fields that shouldn't be | Projection missed — fix `Select(...)` |
| Date off by one | `DateOnly` vs `DateTime`, timezone-naive conversion |
| Count wrong | `AsNoTracking()` missing + prior tracked entities |
| List unsorted | No `OrderBy` — Postgres doesn't guarantee order |
| Calculation wrong only in tests | `FakeTimeProvider` not pinned |
| Enum displays numeric | Missing `HasConversion<string>()` or `JsonStringEnumConverter` |

## Test-suite behaviour

| Symptom | Usual cause |
|---------|-------------|
| Passes alone, fails in suite | Prior test left state — `ResetDatabaseAsync()` in `SetupAsync` or dedicate collection |
| Flaky | Non-deterministic time/Guid, or parallel collections hitting same container |
| `Collection fixture could not be created` | Fixture ctor threw — usually Docker/Testcontainers boot |
| Deadlock/hang | Collection contention, or `SaveChangesAsync` without `ct` |
| `A second operation started on this context` | Reused DbContext across awaits — resolve fresh via `CreateScope()` |

## Environment / configuration

| Symptom | Usual cause |
|---------|-------------|
| Bug in CI only | Docker/resource — check Testcontainers image version, memory |
| Bug in one env only | `appsettings.{Env}.json` drift |
| Secrets not loaded | Keyvault source missing or managed identity not granted |
| Migrations not applying | `Database:MigrateOnStartup` false, or app user lacks DDL |

## EF Core specifics

| Symptom | Cause |
|---------|-------|
| "LINQ expression could not be translated" | C# method EF can't translate — `AsEnumerable()` only after filter narrows |
| Seed data not persisting | `ResetDatabaseAsync()` runs after seed — seed inside test |
| Slow query | Missing index or loading full entities — `.Select(...)` or add index |
| `Cannot insert explicit value for identity column` | Misconfigured key strategy — Guid keys here are client-generated |

## Permission system specifics

| Symptom | Cause |
|---------|-------|
| User with "All" still 403 | Endpoint uses `PermissionScopeSet` without `All`, or scope checked against resource context |
| Two endpoints with "same" permission behave differently | One flat, one scoped — check `Permissions()` vs `CanAccessResourceAsync` |
| Permission added but not recognised | Not in role-permission seed matrix — add it |

## When none apply

1. Log full request, full response, `currentUser.Id` at start of `HandleAsync`.
2. Compare with a test that *does* work — what differs in state, auth, seed?
3. Write a minimal reproduction pinning the exact failing input.
