---
name: gc-review
description: Review .NET backend code against conventions — architecture, API design, error handling, validation, naming, EF Core, C# style, tests. Use before commit, PR, or on "convention check"/"am I doing this right?".
---

# Code Review

Review recently-changed or user-specified C# backend code against every convention. Report: violation → rule broken → corrected code → offer to apply.

## When to use
- Before commit or PR.
- User asks for review, convention check, or "am I doing this right?" in a .NET context.

## When not to use
- Writing new code → `/gc-feature` or `/gc-tdd`.
- Debugging a known bug → `/gc-debug`.

## Required rules

Load every rule file at invocation — findings without a cited rule are opinions. `paths:`-based auto-loading is not used, enumerate explicitly:

- `rules/architecture.md` — vertical slice, banned patterns, horizontal layers.
- `rules/api-design.md` — FastEndpoints REPR, `Configure()`, `Send.*`.
- `rules/error-handling.md` — Result two-level, ROP chain, `{Feature}Errors`.
- `rules/validation.md` — FluentValidation rules, `.WithErrorCode(...)`.
- `rules/naming.md` — files, types, endpoints, routes, error codes, tests.
- `rules/ef-core.md` — `DbContext` injection, `AsNoTracking`, `N+1`, indexes.
- `rules/csharp-style.md` — XML docs, primary constructors, records, `Guid`, `TimeProvider`.
- `skills/gc-tdd/references/testing-conventions.md` — test infrastructure checks.

## Scope

Unless user specifies otherwise:
1. `git diff HEAD` — staged + unstaged.
2. Any file the user names.

Small diffs: full pass. Large diffs: prioritise by severity (critical architecture/security first, then style).

## How to review

Walk every section of `references/review-checklist.md`. For each finding capture:

- **File + line**
- **Rule broken** — which rule file + section
- **Found** (code snippet)
- **Fix** (code snippet)
- **Severity** — critical / warning / nit

| Severity | Examples |
|----------|----------|
| Critical | Missing `DontCatchExceptions()`, try/catch for control flow, missing auth, `DateTime.UtcNow` |
| Warning | Missing `AsNoTracking()` on read, missing `.WithErrorCode()`, wrong error factory return type, missing XML docs |
| Nit | Cosmetic — formatting, missing target-typed `new()`, redundant type repetition |

## Report format

```
# Code Review

## Summary
- Files reviewed: N
- Findings: N critical, N warnings, N nits

---

## Warnings

### 1. [ef-core.md] Missing AsNoTracking on read query
**File:** Features/Absences/Queries/GetDetail/GetAbsenceDetailEndpoint.cs:67
**Found:**
    var absence = await dbContext.Absences.FirstOrDefaultAsync(a => a.Id == req.Id, ct);
**Fix:**
    var absence = await dbContext.Absences.AsNoTracking().FirstOrDefaultAsync(a => a.Id == req.Id, ct);

---

## Passing
- Architecture: vertical slice, feature configuration present
- Naming: conventions followed throughout
- Validation: FluentValidation + Result two-level pattern used correctly
```

After report, ask whether to apply critical fixes. Do not apply silently.

## Source of truth

Every finding cites a rule file (`architecture.md`, `api-design.md`, `error-handling.md`, `validation.md`, `naming.md`, `ef-core.md`, `csharp-style.md`). If you can't name the rule, it's opinion — say so.

## Escalation to user

- **Ambiguous cases** (e.g., static helper in `Common/` vs feature) → ask.
- **Pre-existing violations** in untouched code → list as "observed, not introduced by this change".
- **Rule conflicts** → surface both interpretations, let user pick.

## Don't

- Don't invent a rule — cite one.
- Don't apply critical fixes silently.
- Don't mix pre-existing violations with diff-introduced findings.

## Done when

- [ ] Every section of `references/review-checklist.md` walked.
- [ ] Report produced in the format above (summary + findings + passing).
- [ ] Each finding cites a rule file + section.
- [ ] User asked whether to apply critical fixes.
