---
source: archive
plan: memory-interface
distilledAt: '2026-07-09'
---

# Shared memory interface + plain-text substrate (agent-memory W1)

## What Was Built

The **shared pluggable memory interface** —
`write(record)` / `retrieve(scope, query)` / `consolidate()` — extracted into a
new domain-neutral `lib/memory/` core, now with **two real implementations
behind it** (the premature-abstraction guard's precondition finally met):

1. **General-memory markdown store** (`lib/memory/markdown-store.ts`) — authored
   `note` records as plain-text OKF v0.1 markdown under sibling scope stores:
   project notes at `<projectRoot>/memory/agent/notes/`, user notes at
   `~/.cosmonauts/memory/agent/notes/`. Scope-filtered, recency-ordered
   retrieval; per-store `index.md`.
2. **Architecture-map retrieval adapter** (`lib/architecture-map/retrieval.ts`) —
   the shipped code-structure map's *retrieval* path (index injection + shard
   reads) retrofitted onto the interface, behavior-preserving. Generation/store/
   viewer stayed native and untouched.

Plus the thin authored sliver end-to-end: Cosmo's `remember`/`recall` tools and a
compact memory-index injection (`domains/shared/extensions/agent-memory/`), wired
into `main/cosmo` only. "Remember this" → OKF file on disk → recalled in a later
session. This is W1 of the `agent-memory` track; W2 (profile + playbooks), W3
(episodic log), W4 (background consolidation/decay) stayed explicitly out.

## Key Decisions

- **Interface lives in `lib/`, not a capability/extension.** It is shared
  substrate, consumed by domain extensions at the edge. Simple data shapes, **no
  registry/plugin framework** — W1 has exactly two concrete stores; extract
  machinery when W2 proves it's needed.
- **Second taxonomy axis is named `kind`, not `type`.** OKF already owns
  `type` (`note`), so scope × type becomes `scope` (`session|project|user`) ×
  `kind` (`semantic|procedural|episodic`) as custom frontmatter keys. W1 authored
  records are exactly `type: note`.
- **Sibling stores per scope, one interface.** Project store beside the repo's
  tracked `memory/`, user store under `~/.cosmonauts/`, architecture map
  untouched at `memory/architecture/`. A single physical store was rejected
  because user scope cannot live in a repo.
- **Pi-First audit (B-001) gated session-scope, result = build nothing.** Pi
  session JSONL, compaction, `pi.appendEntry()`, and `ctx.sessionManager` already
  cover short-term/session continuity, so W1 builds **no** session-scoped markdown
  store. `session` stays in the scope vocabulary; a caller that requests it gets
  `skippedScopes: [{ scope: "session", ... }]`, never a silent drop. (Mirrors how
  `analysis-tools` gated the map's substrate. See `memory/code-structure-map.md`.)
- **Root binding at store construction, never guessed inside `write()`.**
  `createMarkdownMemoryStore({ projectRoot, userCosmonautsRoot?, now? })` and
  `createArchitectureMapMemoryStore({ projectRoot, ...deps })`. `retrieve()`
  asserts `scope.projectRoot` equals the bound root — a mismatch is a caller
  error, not an alternate lookup mode. Tests inject a temp `userCosmonautsRoot`
  so the suite never touches the real `~/.cosmonauts`.
- **B-015 fixed a REAL shipped bug, didn't preserve it.** Real sessions freeze the
  tool allowlist via `buildToolAllowlist()` at session creation, and Pi 0.80.3's
  `_refreshToolRegistry` filters runtime-registered tools against that frozen
  list. The shipped `architecture_map_read` was registered lazily inside
  `before_agent_start`, so it was **filtered out of every real session** — latent
  dead tool. Fix: register at extension **factory load** (same treatment as
  `remember`/`recall`). The retrofit invariant is read against *intended*
  behavior ("five agents can pull shards"), which the shipped code never delivered.
- **`consolidate()` is `noop`-only.** `MemoryConsolidateResult` is deliberately
  the single `noop` shape — a `consolidated` variant would be unreachable W4
  scaffolding and would trip the plan's own dead-code gate. W4 widens the union
  when real behavior exists.
- **`MemoryWriteResult.failed` is a reachable arm, not a placeholder.** Unwritable
  store / permission error returns `failed` with path+reason, leaves no partial
  file (atomic temp+rename; unlink on the not-pre-existing path), session
  continues.
- **Independent 12,000-byte budget for the memory index** (map keeps its own
  24,000). W1 consumers are disjoint (map → five coding agents; memory → cosmo
  only); a future agent consuming both must reassess a combined budget.

## Patterns Established

- **Construction-seam mirroring for testability.** `createAgentMemoryExtension(deps)`
  mirrors the shipped `createArchitectureMemoryExtension(deps)`: injectable
  `userCosmonautsRoot`, `storeFactory`, `now` (agent-memory) and an injectable
  `createStore` adapter factory (architecture-memory). The `createStore` seam is
  what makes B-003's "no parallel retrieval path" an **executable** spy test
  (inject a spy `MemoryStore`, assert every index/shard read flows through it),
  not a review-only promise.
- **Factory-register for allowlist, guard execution per turn.** Both extensions
  register their tools at factory load (so `buildToolAllowlist` includes them),
  then hold a closure `authorized` boolean: reset to `false` on `session_start` /
  `session_shutdown`, set per-turn in `before_agent_start` from the runtime
  identity marker (`main/cosmo` for memory; `isConsumingAgent` for the map).
  Unauthorized calls refuse and touch no store. This is the standard shape for a
  factory-registered-but-identity-scoped tool.
- **Disk is the only source of truth.** Retrieval and index building re-scan and
  re-parse every note file on each call (per turn for injection) — no cache to
  invalidate, which is exactly what makes human edits/deletions trustworthy
  (B-009). Accepted at W1 scale, documented in `docs/memory.md`; the W2/reassess
  gate must revisit scan cost before stores grow to hundreds of records.
- **Tracked-derived byte-idempotence.** Because the project store is git-tracked,
  `index.md` is a pure function of the current record set (no generation
  timestamps / volatile keys), and `writeFileIfChanged` skips a no-op rewrite.
  Same tracked-derived-churn rule the map needed (timestamp inheritance).
- **Physical store location decides scope eligibility, frontmatter cannot.** A
  project-store file with `scope: user` (or vice-versa) is malformed → skipped
  with a warning naming the file; one bad file never breaks the session or hides
  healthy records.
- **List mode = empty query text.** `retrieve()` with absent/empty `text` matches
  all eligible records (index building relies on it); the `recall` tool itself
  requires non-empty text, defaults `limit` 5, caps caller `limit` at 20 (it
  returns full bodies, which would dwarf the budgeted index).

## Files Changed

- Core (new): `lib/memory/{types,okf,paths,markdown-store,index}.ts`;
  `lib/architecture-map/retrieval.ts`.
- Extension (new): `domains/shared/extensions/agent-memory/index.ts`; added to
  `domains/main/agents/cosmo.ts` only; concise guidance in
  `domains/main/prompts/cosmo.md`.
- Retrofit: `domains/shared/extensions/architecture-memory/index.ts` (retrieval
  moved to the adapter; `architecture_map_read` → factory registration + per-turn
  guard); `lib/architecture-map/index.ts` exports the adapter.
- Docs/config: `docs/memory.md` (new); `fallow.toml` gained `lib/memory/index.ts`
  as a public entry point.
- Tests: `tests/memory/{interface,markdown-store}.test.ts` (new),
  `tests/extensions/agent-memory.test.ts` (new), updates to
  `tests/extensions/architecture-memory.test.ts`, `tests/domains/coding-agents.test.ts`,
  `tests/domains/main-domain.test.ts`. Behavior markers `B-001..B-015`.
- Audit: `pi-first-session-memory-audit.md` (B-001, now under
  `missions/archive/plans/memory-interface/`).
- **Untouched (verified):** `lib/architecture-map/{generator,store}.ts`, CLI
  architecture subcommands, `lib/artifact-viewer/*`, `memory/architecture/*`.

## Gotchas & Lessons

- **Drive stranded `missions/**` artifacts again.** The B-001 audit file was
  written by the worker but left **untracked** (Drive excludes `missions/` and
  `memory/` from per-task source commits). Committed manually. Always `git status`
  after a Drive run. Same class as the `config.json` / audit-artifact notes in
  `memory/{task-id-system,code-structure-map}.md`.
- **The fresh-generate verification produces throwaway `memory/architecture/`.**
  TASK-458 ran `cosmonauts architecture generate --no-narrative` (that tree is
  *not* tracked in this working copy and the plan lists it under "files
  intentionally not changed"). It gets left untracked — regenerate to verify,
  then `rm -rf memory/architecture` before the final state. Don't commit it.
- **Long CLI review chains die under the harness / Opus usage.** The
  `coding/quality-manager` chain (cosmonauts-subagent backend on Opus) was killed
  mid-run **twice** — once by a 2-minute foreground Bash timeout, once as a
  ~20-min background job — before printing its terminal line. It had already
  committed its REVIEW-FIX commits + reports, so re-running full ground-truth
  gates on the post-fix HEAD recovered the state. Lesson: launch such chains as
  harness-tracked background work, and if it's Opus-backed expect it may never
  reach a terminal line; the **codex exec** post-review (GPT-backed) is the
  reliable independent channel. See `feedback_no_cli_chains`.
- **Factory registration newly exposes a tool — preserve inertness with a guard.**
  Moving `architecture_map_read` to factory time (B-015) made it *visible* to
  non-consuming agents / external Pi hosts that auto-load
  `domains/shared/extensions`. The QM's F-001 fix — keep it registered but
  **refuse execution** for non-consuming turns (`scope-ineligible`, store never
  touched) — is a legitimate *behavior-preservation* fix (it keeps the
  pre-existing "auto-loaded extension stays inert for non-consuming agents"
  contract), not scope creep. Same B-012 guard pattern.
- **QM under-remediates but rejected out-of-scope noise well here.** It signed off
  merge-ready and its fixes were sound, but per standing guidance its verdict was
  independently re-verified (fixes re-checked, full suite re-run 2543 green).
  Notably it *correctly rejected* two round-2 reviewer artifacts: a false
  `generator.ts` flag (unchanged in the diff) and a perf finding that contradicted
  the plan's accepted W1 rescan stance. Reconcile QM against **local `main`** —
  origin lagged by 5 commits.
- **Codex post-review verdict: SHIP.** One Low finding (architecture-memory tests
  changed beyond the single sanctioned absent-directory delta) — accepted, no
  change: all original tests preserved and strengthened; the changes are direct
  consequences of the B-015 registration flip and the B-003/B-004 typed-details /
  spy work the plan explicitly authorizes.
