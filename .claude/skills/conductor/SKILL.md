---
name: conductor
description: Orchestrate the UC → design → implement → review pipeline with user gates. Use only when explicitly invoked with /conductor.
disable-model-invocation: true
argument-hint: "<feature request or 'continue'>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Agent
  - Skill
  - Bash(git status:*)
  - Bash(git diff:*)
  - Bash(git add:*)
  - Bash(git log:*)
  - Bash(git push:*)
  - Bash(gh *)
  - Bash(dotnet build:*)
  - Bash(dotnet test:*)
  - Bash(dotnet format:*)
model: fable
---

# /conductor — pipeline orchestrator

You drive the UC → design → implement → review → ship pipeline by dispatching subagents via `Agent` and pausing for user approval at each gate. Every decision uses `AskUserQuestion`.

## When to use

User explicitly invokes `/conductor`. Argument is the feature request or the literal `"continue"`.

## Invariants

- **You** are the only thing that writes `.claude/state/pipeline.json`. Subagents write `.claude/state/handoff-<agent>.json` only.
- **Never** proceed past a gate without explicit user confirmation.
- **Never** commit. Phase 6 hands off to `/commit` or `/commit-push-pr`.
- All rules live in `.claude/rules/*.md` and `CLAUDE.md`. Never restate.

## Pipeline

One backend pipeline: specs live under `docs/specs/{todo,in-progress,done}/`, agents are `designer`, `design-reviewer`, `developer`, `impl-reviewer`, quality-gate commands are `dotnet build -warnaserror` / `dotnet test` / `dotnet format --verify-no-changes`. The work-items schema's `verification.tool` enum values are `dotnet-test`/`dotnet-build`.

## State file

`.claude/state/pipeline.json` validates against `.claude/schemas/pipeline-state.v1.json`. On start:

1. If exists: `jq` it. Parse fail → show raw to user, offer (a) repair, (b) reset, (c) abort.
2. If `phase != "done"`: ask "Resume UC-<id> at phase <X>?" — default yes.
3. Otherwise start a new run.

## Phases

### Phase 1 — Interview

Use `AskUserQuestion` to extract: UC id, title, actors, preconditions, main flow, acceptance criteria, out-of-scope, non-functional reqs. If `/interview` is installed, invoke it for the long-form path.

Ask one extra question: *"Domain complexity — routine CRUD / moderate / novel domain?"* Record as `pipeline.json.complexity_tag` (`"routine" | "moderate" | "novel"`).

Write the spec to `docs/specs/todo/{seq}_UC_{id}_{slug}.md`. Spec contents match `.claude/schemas/spec.v1.json`.

**Gate A:** Normally an explicit "spec looks right?" confirmation **before** dispatching the designer. Exception: if `complexity_tag === "routine"`, **defer** Gate A and present it together with Gate B after the designer returns (see Phase 2). When asked immediately, confirming moves the spec from `docs/specs/todo/` to `docs/specs/in-progress/`, records `gates_passed: ["A"]`, and updates `pipeline.json`.

### Phase 2 — Design

Dispatch optional kit specialists (`dotnet-architect`, `api-designer`, `ef-core-specialist`) **only when** `complexity_tag === "novel"`. Dispatch all in a single message with multiple Agent tool calls; feed their notes to our designer.

Dispatch `designer` with the spec path. Output: `.claude/state/handoff-designer.json` + `docs/specs/in-progress/{slug}-work-items.md`. Single-WI result is valid for small/trivial UCs.

Read the handoff, topo-sort `work_items` by `depends_on`. Cycle → fail loudly, re-dispatch designer with cycle detail.

**Gate B:** Show work-items doc. Ask "Proceed to design review?"

**Deferred Gate A (routine UCs only):** when `complexity_tag === "routine"` AND designer emits exactly 1 WI of size ≤ S, Gate A was not asked in Phase 1. Present spec **and** work items together in a single `AskUserQuestion` now, so the user approves both at once. The user must still approve the spec — this saves one round-trip but does **not** skip the approval itself. If either is rejected, fall back to asking Gate A and Gate B separately.

### Phase 3 — Design review loop (max 3 rounds)

**Fast-path skip:** when `handoff-designer.json` has exactly 1 WI AND `estimated_complexity ∈ {XS, S}` AND no new entity in `files_touched` AND `complexity_tag !== "novel"`, ask via `AskUserQuestion`: *"UC looks trivial (1 WI, size {complexity}, tag {complexity_tag}). Skip design review?"* **Default = keep design-review** — user must opt in to skip.

**Contradiction guard:** if the designer's handoff contradicts `complexity_tag` — e.g. a new `DbSet` added, `files_touched` crosses feature folders, `estimated_complexity = L` or `XL`, or `rule_citations` include architecture anchors — **do not offer the skip**. Warn and continue to the full design-review round.

If skip is chosen, jump to Phase 4.

Otherwise: dispatch `design-reviewer`. Read `.claude/state/handoff-design-reviewer.json`. If `blocks_merge: true` → re-dispatch `designer` with findings. Stop at `blocks_merge: false` or round 3.

**Gate C:** Show review report each round. Ask "Fix and re-review / accept / stop?"

### Phase 4 — Implementation loop

For each WI in topological order:

1. Dispatch `developer` with the WI id. Read `.claude/state/handoff-developer-{wi_id}.json`.
2. If `hit_max_turns: true`: resume same WI on user confirmation (re-dispatching `developer`).
3. Dispatch `impl-reviewer` with WI id. Read `.claude/state/handoff-impl-reviewer.json`. If `blocks_merge: true` → re-dispatch `developer` with findings. Max 3 rounds per WI.
4. Optionally run `/verify` or `/build-fix` between iterations.

**Gate D:** Show report after each WI iteration. Ask "Continue to next WI / redo / stop?"

**Clear boundary between WIs.** When the user chooses "Continue to next WI", before dispatching the next WI, ask via `AskUserQuestion`: *"Run `/clear` and resume from `pipeline.json`?"* Default = yes. Rationale: all state is on disk (`pipeline.json` + per-WI `handoff-*.json`); `hooks/reinject-state.sh` re-hydrates on `SessionStart` after `/clear`. Carrying every prior WI's subagent summary into the next WI's main-thread context bloats the window without adding signal — and compaction mid-WI makes gate invariants harder to re-establish. On the final WI, skip the clear and move to Phase 5. If the user declines, continue without clearing.

### Phase 5 — Quality gate

```bash
dotnet build -warnaserror     # blocking
dotnet test                   # blocking — global safety net
dotnet format --verify-no-changes   # informational; do NOT block
```

Read full output of every command; do not claim "passed" on partial evidence. On build/test failure → re-dispatch `developer` with the failure output.

**Gate E:** Show quality results. Ask "Approve commit?"

### Phase 6 — Ship

Invoke `superpowers:finishing-a-development-branch` for final verification, merge/PR options, execute user's choice. Mark `phase: "done"` only after the skill completes.

## Error recovery

- Subagent crashes (no handoff file) → ask user: retry / abort / edit state.
- `hit_max_turns: true` → ask: resume same WI or split it.
- Review round 3 still blocks → ask user to edit work items / spec, then return to Phase 3 or 4.
- `dotnet build` or `dotnet test` fails after Gate D → back to Phase 4 with the failing WI and `developer`.

## Don't

- Don't dispatch kit specialists when `complexity_tag !== "novel"`.
- Don't run the design-review loop when the fast-path skip applies and the user accepts.
- Don't commit. Don't write subagent handoff files.
- Don't proceed past any gate without explicit user confirmation.

## Done when

- `pipeline.json.phase === "done"`.
- `gates_passed` includes every required gate (A may be deferred and asked alongside B for `routine` UCs; C may be skipped via fast-path).
- `superpowers:finishing-a-development-branch` returned successfully.
