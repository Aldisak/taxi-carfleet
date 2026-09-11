---
description: Guidelines for authoring JSON Schemas under .claude/schemas/
---

# Schema Review Guideline

Applies to every JSON Schema under `.claude/schemas/*.json`. The handoff pipeline validates agent-produced JSON against these schemas; a bad schema can either allow malicious payloads through or crash the validator.

## Regex safety — ReDoS prevention

`validate.py` uses Python's `re` module, which has no timeout. When adding or changing a `pattern`:

- **No nested quantifiers** over anything that could grow — avoid `(a+)+`, `(.*)*`, `(a|a)*`. Catastrophic backtracking.
- **Anchor** with `^` and `$` whenever the field matches the whole string. `re.search` otherwise scans — adversary prepends a long non-matching run, run time explodes.
- **Bound repetition** — `{1,200}` rather than `*` or `+` for user-controlled text. Validator caps input at `MAX_PATTERN_INPUT_LEN` (10 000), but per-field `maxLength` is better.
- **Prefer character classes** over alternation for single characters: `[A-Za-z0-9]` beats `(A|B|C|...)`.

## Length caps

`maxLength` on every free-text field. A 10 000-char `notes` bloats pipeline.json and log files. 2 000 = generous default for narrative fields; 200 for identifiers.

## Enum vs. pattern

Finite value set → `enum`, not `pattern`. O(1) compares, cannot ReDoS, self-documenting.

## Structured over stringly-typed

Fields substituted into shell commands, file paths, or URLs → model as objects with typed fields (e.g. `{ "tool": "dotnet-test", "filter": "..." }`), not free strings. Consumer builds the final string from a template — eliminates the "string from attacker → shell" path. See the 2026-04 security review N3 remediation.

## additionalProperties

Every object schema → `"additionalProperties": false` unless forward-compat requires otherwise. Catches typos (`depedns_on`) and prevents drift between conductor writes and what the schema permits.

## Format strings

`validate.py` supports a small allowlist of `format` validators (currently `date-time`). Unknown formats pass silently. If your field needs a format check, verify it is in `FORMAT_VALIDATORS` and implement it there first if not.

## Checklist

- [ ] All patterns anchored (`^...$`) when matching the whole value.
- [ ] No nested/unbounded quantifiers.
- [ ] `maxLength` on every free-text field.
- [ ] `additionalProperties: false` on every object (or documented reason).
- [ ] Enum used wherever the value set is finite.
- [ ] No free string that will be shell-executed, URL-fetched, or file-pathed — use a structured object + template.
- [ ] Examples validate against the schema itself (`validate.py` exercises this when `$schema` points to the file).
