---
id: TASK-639
title: 'Stage 4: Record guarded live-root dry-run evidence'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-638
createdAt: '2026-09-07T15:40:25.343Z'
updatedAt: '2026-09-07T15:40:25.343Z'
---

## Description

Execute only Implementation Order step 19 at the repository root; behavior ownership is none. This is the one allowed read-only live-root composition exercise. It must use the exact `--dry-run --no-model --json` invocation bracketed immediately by the reproducible relative-root corpus guards. It supplies final evidence for AC-010/B-010 but does not own or alter that behavior.

Ratified-ground handling: every command flag, output threshold, and guard ordering is load-bearing stop-and-escalate ground. Any hash/count mismatch, write, retirement artifact, recovery state, or pressure mismatch is a hard stop; do not retry with a write-capable variant or run a retirement round.

<!-- AC:BEGIN -->
- [ ] #1 (Quality Contract assertion 7; Implementation Order steps 2 and 21) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`. No repo-wide dead-code sweep, no export demotion, no unrelated API cleanup, no documentation, configuration, architecture-record or parent-plan edit. A prior remediation task without this criterion went 18 files wide and was fully reverted.
- [ ] #2 (Quality Contract assertion 6; Implementation Order step 1) Live corpus guard: before and after the task, `find knowledge -type f | sort | xargs shasum -a 256 | shasum -a 256` run from the repository root reports `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and `find knowledge -type f | wc -l` reports 237. The relative `knowledge` root is load-bearing. No task may modify, move or delete anything under live `knowledge/`, and no task may run a live retirement round or any non-dry-run write-capable memory command against it.
- [ ] #3 (Quality Contract assertions 5 and 7; Implementation Order step 2) Parent ownership: the parent markers `@cosmo-behavior plan:living-memory#B-012|B-016|B-021` and their plan-declared test names remain exact and parent-owned across all six carrier tests enumerated in the plan's Architecture Context. No frozen pin, receipt floor, retirement/byte authority, fail-closed model-output validation or existing behaviour marker is weakened or removed. Any commit changing `lib/memory/types.ts` re-pins its full-source SHA-256 in the profile-playbooks seam test in the same commit.
- [ ] #4 (Quality Contract assertion 7; Implementation Order step 19) Gates: `bun run test`, `bun run lint`, `bun run typecheck` and `git diff --check` all pass at the task's commit boundary. No test is committed red.
- [ ] #5 (Quality Contract assertions 7-8; Implementation Order steps 19 and 21) D-026 is not reopened, re-litigated, or given another verification layer, and retirement pathname sequencing in `lib/memory/retirement-store.ts` is not touched.
- [ ] #6 (B-010 evidence; Quality Contract assertion 6; Implementation Order step 19) Immediately after a fresh exact live hash/count guard, exactly `bun bin/cosmonauts memory consolidate --dry-run --no-model --json` runs from the repository root and reports kind `ran` or `noop`, `recovery: "none"`, and `writesCommitted: false`; no shortened, substituted, non-dry, model-enabled, or retirement invocation is used.
- [ ] #7 (B-010 evidence; Quality Contract assertion 6; Implementation Order step 19) The live command's pressure result is measured and its rendered-byte figure equals the UTF-8 bytes produced by the real combined-context knowledge renderer for the same live corpus; the exact relative-root hash/count guard is rerun immediately afterward and still reports SHA-256 `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and 237 files, with no created retirement artifact or live-byte change.
<!-- AC:END -->
