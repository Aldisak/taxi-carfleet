---
name: gc-migrate
description: EF Core migration workflow — define/modify entity, generate migration, review SQL, apply safely, rollback. Use when adding a DB table, column, index, enum, rename, or reviewing a generated migration.
argument-hint: "<EntityName> <description of change>"
---

# EF Core Migration Workflow

**Arguments:** `$ARGUMENTS` — e.g., `Absence Add HalfDayStartHour column`.

## When to use
- Add / modify / remove DB table, column, index, FK, enum.
- Review a generated migration before commit.
- Rollback a bad local migration (pre-commit).

## When not to use
- Modify an applied migration → **stop**. Create a corrective migration instead.
- Feature-level code only (no schema) → `/gc-feature`.

## Required rules

Load these at invocation — `paths:`-based auto-loading is not used, enumerate explicitly:

- `rules/ef-core.md` — entity conventions, `AuditableDo`, `IEntityTypeConfiguration<T>`, Npgsql types, index placement.
- `rules/architecture.md` — where entities/configs live relative to the vertical slice.
- `rules/naming.md` — migration verb-target names (`Add{Column}To{Entity}`, `Create{Entity}Table`, …).
- `rules/csharp-style.md` — `Guid` keys, `TimeProvider`, XML docs, one type per file.

## Steps

1. **Confirm the change** with the user:
   - New `{Entity}Do` or modify existing?
   - Columns: add / change / remove? Names, types, nullability.
   - Relationships: FK, index, nav?
   - **Destructive?** Drop column, rename, narrow type, NOT NULL on populated table → warn + confirm explicitly.
   - Migration name: `Add{Column}To{Entity}`, `Create{Entity}Table`, `Remove{Column}From{Entity}`, `AddIndexOn{Entity}{Column}`.

2. **Define/modify entity** (`Database/Entities/{Entity}Do.cs`) per `ef-core.md`:
   - YES: inherits `AuditableDo`; `Guid Id { get; set; }`; `DateOnly` / `DateTimeOffset`; `required` on non-null; collection navs `= []`.
   - Removing a property? Remove every usage (projections, validators, tests) in the same changeset.

3. **EF Core configuration** (`Infrastructure/EntityFramework/Configurations/{Entity}Configuration.cs`) — `internal sealed`, per `ef-core.md`:
   - `HasKey(x => x.Id)`
   - String length constraints on free-text
   - `HasConversion<string>()` for enums
   - FK + `OnDelete` (default `Restrict`)
   - `.HasIndex(...).IsUnique()` where applicable
   - Auto-registered via `ApplyConfigurationsFromAssembly()` — no manual registration.

4. **Register DbSet** in the DbContext:

   ```csharp
   public virtual DbSet<{Entity}Do> {Entities} => Set<{Entity}Do>();
   ```

5. **Generate migration:**

   ```bash
   dotnet ef migrations add {MigrationName} \
       --project src/GC.{Project}.App \
       --startup-project src/GC.{Project}.App
   ```

6. **Review generated SQL** — always open it before applying:
   - Correct columns added/removed
   - Types match the table below
   - No unexpected changes (= model drift)
   - Destructive ops: data-loss understood + approved

7. **Apply** (skip if `Database:MigrateOnStartup: true`):

   ```bash
   dotnet ef database update --project src/GC.{Project}.App --startup-project src/GC.{Project}.App
   dotnet ef migrations list --project src/GC.{Project}.App
   ```

8. **Build + test:**

   ```bash
   dotnet build
   dotnet test
   ```

   A broken test after a migration almost always means a projection, validator, or seed was missed.

## Npgsql type mappings

| C# type | PostgreSQL |
|---------|------------|
| `Guid` | `uuid` |
| `string` + `HasMaxLength(n)` | `character varying(n)` |
| `string` (no max) | `text` |
| `int` | `integer` |
| `long` | `bigint` |
| `DateOnly` | `date` |
| `DateTimeOffset` | `timestamp with time zone` |
| `TimeOnly` | `time` |
| `decimal` | `numeric` |
| `bool` | `boolean` |
| Enum + `HasConversion<string>()` | `text` |

## Rolling back (before commit)

```bash
dotnet ef database update {PreviousMigrationName} --project src/GC.{Project}.App
dotnet ef migrations remove --project src/GC.{Project}.App
```

## Safety matrix

| Change | Safety | Action |
|--------|--------|--------|
| Add nullable column | Safe | Add |
| Add column with `HasDefaultValue(...)` | Safe | Add |
| Add NOT NULL column to empty table | Safe | Add |
| Add NOT NULL column to populated table | Risky | Nullable → backfill → tighten in second migration |
| Rename column | Risky | `RenameColumn` + update all refs in same changeset |
| Drop column | Destructive | Confirm data not needed; soft-deprecate phase first |
| Change column type | Destructive | Data-migration script; review SQL line by line |
| Add unique index to populated table | Risky | Check for duplicates first |
| Drop index | Safe | Check query plans for regressions |

## Don't

- Don't modify a migration applied to a shared environment — create a corrective one. Modifying applied migrations corrupts `__EFMigrationsHistory` everywhere.
- Don't set `CreatedAt` / `UpdatedAt` manually — `AuditableDo` handles it.
- Don't use bare `DateTime` — `DateOnly` or `DateTimeOffset`.
- Don't introduce an `IEntityTypeConfiguration<T>` if the repo uses `[Table]` + `[MaxLength]` annotations — follow existing convention.
- Don't skip SQL review, even for "obvious" changes.

## Done when

- [ ] Entity + configuration + DbSet compile: `dotnet build`.
- [ ] Migration file generated; SQL reviewed.
- [ ] `dotnet ef database update` applied locally (or `MigrateOnStartup` confirmed).
- [ ] `dotnet test` green.
- [ ] Destructive changes confirmed with user.
