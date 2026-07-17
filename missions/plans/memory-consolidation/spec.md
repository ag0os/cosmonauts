## Purpose

An enabled episodic log only accumulates; left alone it grows until it is
noise. Consolidation ("dreaming") is the counterpart that turns raw episodes
into durable, compact knowledge and keeps the store healthy: distill semantic
notes from what happened, surface recurring procedures as playbook candidates,
prune the episodes it has consumed. It is the v2 of explicit-save — implicit
learning — and the shipped `consolidate()` interface arm has been a
deliberate no-op since W1 waiting for exactly this.

Per the 2026-07-17 ◆reassess decision this ships as infrastructure: a job you
can run by hand today and schedule via the autonomy host when that exists —
nothing runs automatically by default.

## Users

- **The human (project owner)** — runs the job (or later lets the host run
  it), reads a plain report of what it distilled and pruned, and reviews the
  results as ordinary git-visible memory files they can edit or delete.
- **Cosmo** — benefits indirectly: a consolidated store means a sharper
  injected index and better recall, without Cosmo doing anything new.
- **The autonomy host** (sibling plan) — invokes consolidation as its first
  wake payload; the demonstration target for the whole push.

## User Experience

**Invocation:** an explicit cosmonauts CLI surface (and/or a Cosmo-invocable
path — planner decides the exact surface) scoped to project or user store.
Explicit invocation is its own consent; no config flag is needed to run it by
hand. Automatic invocation only ever happens through the host, behind the
host's own off-by-default gate.

**Nothing to do:** with no episodes (or the log disabled), the job reports
honestly that there is nothing to consolidate and writes nothing.

**A real run:** the job reads episodes and existing records, then

1. writes distilled semantic notes for durable facts worth keeping,
2. proposes playbook candidates where episodes show a recurring procedure,
3. prunes the episodes it consumed,

and ends with a human-readable report of exactly what it wrote, proposed, and
removed. Project-scope results are visible as a git diff.

**Trust rules (the load-bearing UX):** consolidation output is proposed truth,
clearly marked as machine-consolidated in each record's provenance. It never
updates the profile. It never modifies or deletes a human-edited or
human-authored record. A playbook candidate whose name collides with an
existing playbook is surfaced as a proposal, mirroring W2's confirm-update
semantics — never a silent overwrite. Deletion authority extends only to
machine-written episodes it has consumed.

**Failure:** an interrupted or failing run leaves the store valid — no partial
records, no episodes deleted whose distillation didn't land. Re-running after
a failure is safe.

## Acceptance Criteria

- Running against a store with no episodes reports "nothing to consolidate"
  and leaves the store byte-identical.
- Running after enabled sessions produces: a report naming every write and
  prune; distilled records carrying machine-consolidation provenance;
  consumed episodes removed.
- The profile is byte-identical across any consolidation run.
- A human-edited record (note or playbook) is never modified or deleted by a
  run; a colliding playbook candidate becomes a visible proposal, not a write.
- Killing a run mid-flight leaves a valid store: every remaining episode is
  either intact or already represented by a landed distilled record; a re-run
  completes cleanly.
- The job is declarable as an autonomy-host payload and fires from a trigger
  in that plan's demonstration; without the host it is fully usable manually.
- Consecutive runs converge: a second immediate run finds nothing new to do.
- The behavior, trust rules, and CLI surface are documented in
  `docs/memory.md`.

## Scope

Included:
- The consolidation job: distillation, playbook candidates, episode pruning.
- Provenance marking, trust rules, honest reporting.
- The payload contract so the host can invoke it.
- Idempotence/convergence and failure safety.

Excluded:
- Scheduling and triggers (`autonomy-host`).
- Decay of non-episodic records (aging out old notes) — name it as future
  policy; v1 consolidates episodes only.
- Embeddings/semantic similarity; consolidation is heuristic/model-driven over
  plain text.
- Any change to explicit-save semantics for live sessions (W2's contract
  stands untouched).
- Governance tiers; consolidation is deliberately the lightest-governance
  payload (it acts only on machine-written memory).

## Assumptions

- Consolidation quality relies on a model pass (an agent run), not pure
  heuristics — meaning cost per run and a model dependency; the planner
  designs which agent/model and how its output is constrained. If a
  heuristics-only v1 proves viable for pruning + candidate surfacing, model
  distillation can be a second slice.
- "Consumed" episodes are deleted, not archived, once their distillation
  lands (they are machine-written and the distilled record is the memory);
  if cheap, an archive-instead-of-delete variant is a planner call.
- Convergence is achievable by marking what has been consolidated
  (mechanism is a planner decision — e.g. provenance watermarks — but the
  user-visible contract is the second-run-finds-nothing criterion).

## Open Questions

- Where do playbook *candidates* live before a human (or Cosmo with assent)
  promotes them — a distinct record state, a proposals area, or ordinary
  playbooks in a candidate namespace?
- Does user-scope consolidation exist in v1, or project-scope only (episodes
  land mostly project-side per the episodic-log spec)?
- What is the report's durable form — terminal output only, or also an
  episode record of the consolidation run itself (dreaming leaving a trace in
  the log it consumed)?
