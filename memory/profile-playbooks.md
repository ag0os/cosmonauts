---
source: archive
plan: profile-playbooks
distilledAt: '2026-07-14'
---

# Profile + explicit playbooks (agent-memory W2)

## What Was Built

Cosmo's authored-record vocabulary grew from exactly `note` to
`note | profile | playbook`, **through the W1 `MemoryStore` contract with
`lib/memory/types.ts` byte-unchanged** — which is the headline result: W1's
`MemoryRecordDraft.type: string` + `MemoryQuery.recordTypes` seams absorbed two
new types with zero interface rework, exactly as W1 bet they would.

- **Profile** — a singleton, user-scoped document at `<userRoot>/memory/agent/profile.md`
  (`kind: semantic`), replaced in place by complete-body writes. It is the one
  record whose **body** is injected, so Cosmo starts every session (in any
  project) already knowing the user.
- **Playbook** — named procedures at `<store>/memory/agent/playbooks/<canonical-key>.md`
  (`kind: procedural`), project- or user-scoped. Stable name identity: saving an
  existing name is an *update*, gated by an explicit `confirmUpdate`.
- **Explicit-save v1** — no silent capture. Cosmo may propose; it writes only on
  conversational assent. A declined proposal persists **no** pending state
  anywhere (no `pi.appendEntry()`, no closure state).

Still Cosmo-only, still no cache/registry/backend. W3 (episodic) and W4
(dreaming/consolidation) stayed out; `consolidate()` remains the shipped no-op.
Next per the track sequence: the ◆reassess gate.

## Key Decisions

- **A registered Pi tool schema must have an object root — never a top-level
  union.** `remember` takes one flat `Type.Object` (optional `type` discriminant
  + the superset of branch fields as optional properties); the discriminated
  union exists **only** inside the handler, which validates per-branch invariants
  before any store call. See Gotchas — this is a hard Pi constraint, not taste.
- **`remember` registers `executionMode: "sequential"`; `recall` stays default.**
  Pi runs same-message tool batches in parallel, so two `remember` calls could
  both preflight an absent canonical name and both write, silently bypassing
  collision confirmation. Read-only `recall` needs no ordering.
- **The `context` hook keeps the NEWEST `agent-memory-context` message.** W1's
  handler filtered *every* one of them, including the same-turn injection — see
  Gotchas. W2 fixes it rather than preserving it; this was the plan's single
  sanctioned W1 behavioral delta.
- **Playbook identity is the current frontmatter title, not the filename.** The
  store rescans titles and canonicalizes (NFKC, lowercase, non-alphanumeric →
  `-`, ≤80 code points), so a human rename-by-editing is honored and **frees the
  old canonical key**. A create whose default path is occupied by a valid,
  differently-named record lands at the first free numeric suffix — a freed name
  must never become uncreatable. Safe-fail (refuse, name the paths) is reserved
  for genuine ambiguity: two valid files claiming one canonical name, or an
  invalid occupant at the target path.
- **Profile writes are bounded at 4,000 UTF-8 body bytes; injection shares ONE
  12,000-byte budget, profile first.** The bound is a *record-size rule*, not a
  reserved sub-budget — with no profile, the index gets the whole 12,000. Human
  edits are not size-policed: an oversized human profile still injects (as an
  excerpt + honest notice) and recalls in full, **pinned outside the 5/20 limit
  window** so newer records can't shadow the very record the notice points at.
- **`recall` gained no type-filter parameter.** Text/name matching plus the 5/20
  bounds suffice at dozens-of-records scale; a filter would widen the user-facing
  surface without evidence.
- **Per-turn full rescan re-affirmed, still no cache.** Disk-as-only-truth is what
  makes human edits trustworthy. A playbook save is worst-case *three* scans
  (extension preflight → store's own title scan → index regeneration); accepted,
  and named as ◆reassess input. Trigger unchanged: stores approaching hundreds.

## Patterns Established

- **Registered-schema shape is a Pi serialization constraint, not a style
  choice.** Before designing any multi-variant tool, check how the provider
  adapter serializes the root. Validate variants in the handler.
- **Compose lifecycle hooks in tests, don't assert them in isolation.** The W1
  defect survived precisely because `before_agent_start` and `context` were each
  tested alone. W2's test runs the real pipeline: inject, then transform, then
  assert the message is *provider-visible*.
- **Reserve footers before cutting excerpts.** All notices (oversized-profile,
  index-truncation) are computed and their bytes reserved *before* any truncation,
  so a final cut can never drop the notice that promises the `recall` exit.
  Excerpts shrink; notices never do.
- **Plan-owned markers stay one-per-plan-named-test.** Regression tests added
  during review carry **no** `@cosmo-behavior` marker, so the artifact-conformance
  gate keeps its exact 24-marker mapping. (`cosmonauts plan check-artifacts` verifies.)
- **A red/green split across tasks is legitimate.** B-002's new contract assertions
  were authored *deliberately RED* in the characterization task and turned green in
  the next. Declare it in the backlog or a verifier will read it as a defect.

## Files Changed

- Core: `lib/memory/authored-records.ts` (new — finite vocabulary, profile bound,
  canonicalizer; no IO, no Pi); `lib/memory/{okf,paths,markdown-store,index}.ts`
  (discriminated authored-record union, fixed profile/playbook paths, three-type
  write switch). **`lib/memory/types.ts` deliberately untouched.**
- Edge: `domains/shared/extensions/agent-memory/index.ts` — flat `remember` schema
  + internal union validation + sequential execution, collision preflight,
  all-type `recall` with profile pinning, one profile-first budgeted context, and
  the keep-newest context filter.
- Guidance/docs: `domains/main/prompts/cosmo.md` (propose-then-save, scope choice,
  complete-body replacement, never update from a truncated excerpt); `docs/memory.md`.
- Tests: `tests/memory/{interface,markdown-store}.test.ts`,
  `tests/extensions/agent-memory.test.ts`, `tests/domains/main-domain.test.ts`.
  2570 green.

## Gotchas & Lessons

- **Pi 0.80.6's Anthropic adapter builds `input_schema` from `schema.properties ?? {}`.**
  A top-level `Type.Union` (root `anyOf`, no `properties`) therefore reaches
  Anthropic models as a **zero-parameter tool** — while Pi still validates calls
  against the union, so the model can never produce a valid call. The OpenAI paths
  pass the root `anyOf` verbatim as an invalid function-parameters object. A
  top-level union is unshippable; three independent review lenses converged on this.
- **W1 shipped a latent defect: the `context` handler stripped its own same-turn
  injection, so the model never actually received the memory index.** Pi merges the
  `before_agent_start` custom message into the turn's context and applies
  `transformContext` before *every* LLM call. Both review channels found it
  independently. Lesson: a retrofit invariant must be read against *intended*
  behavior — the same stance W1's B-015 took toward the frozen allowlist.
- **Record bodies are bounded on write; human-edited frontmatter is NOT.** An
  unbounded metadata value (e.g. a pathological `timestamp`) escaped the
  12,000-byte injection budget (measured 15,278), and with an index present the
  profile became the non-truncatable header, where the truncation helper **threw** —
  and a throw inside `before_agent_start` breaks the turn. Bound the *framing*, not
  just the body, and make truncation total (clamp, never throw) on any path that
  runs inside a lifecycle hook.
- **An atomicity test that only blocks `index.md` does not test atomicity.** The
  original B-018 test failed *after* the record write had already succeeded and
  accepted either old-or-new content, so swapping the atomic temp+rename helper for
  a plain `writeFile()` still passed. Real fault injection: `chmod 0o500` the
  record's **directory** — that blocks creating the temp file while leaving the
  existing record file writable, so an atomic store returns `failed` with the record
  byte-identical, and a non-atomic one returns `written` and mutates it. Guard on
  `process.getuid?.() === 0` (root ignores mode bits).
- **A cap is not a fix for an unbounded search.** Bounding the alternate-filename
  probe at 100 suffixes traded an unbounded stat loop for a *correctness* bug — a
  creatable name got refused, violating "first free suffix, never fail." One
  `readdir` + an in-memory scan is both faster and correct. Beware fixes that
  convert a performance smell into a behavior change.
- **Drive stranded `missions/**` artifacts again** (Drive excludes `missions/` and
  `memory/` from per-task source commits). The B-001 audit file was left untracked
  and committed by hand. `git status` after every Drive run — third plan running.
- **The `coding/quality-manager` chain stalled again** (killed before its terminal
  line, though its stage reviews had already been written to `missions/reviews/`).
  **`codex exec` remains the reliable independent channel** — it returned
  DO-NOT-SHIP with two real findings the QM missed, then SHIP after fixes. Confirms
  `feedback_no_cli_chains` / `feedback_qm_stale_base_false_alarm`: run the gates
  yourself, and reconcile against **local `main`** (origin lagged by 6 commits).
- **Not every valid review finding is yours to fix.** Three were correctly declined:
  two were W1 parity the spec explicitly ratifies ("same contract as W1 notes"), and
  one — `remember` still describing itself to the model as *"Save an explicit note"*
  though it now saves profiles and playbooks — would have required a **second** W1
  behavioral delta, where the plan sanctioned exactly one. **Open follow-up:** that
  stale tool description is pinned by a W1 test (`plan:memory-interface#B-012`) and
  wants a small dedicated plan; `cosmo.md` guidance currently carries Cosmo's actual
  usage, so the effect is cosmetic.
