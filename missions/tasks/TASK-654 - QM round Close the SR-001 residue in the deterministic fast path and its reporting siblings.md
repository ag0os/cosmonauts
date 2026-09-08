---
id: TASK-654
title: >-
  QM round: Close the SR-001 residue in the deterministic fast path and its
  reporting siblings
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-641
createdAt: '2026-09-08T02:32:11.380Z'
updatedAt: '2026-09-08T02:48:40.331Z'
---

## Description

Remediation opened by the post-implementation Quality Manager review. Three findings are
in scope because this branch introduced or should have closed them; the rest are
pre-existing and recorded as follow-ups, not fixed here.

**SR-010 (correctness, the priority).** TASK-642 closed SR-001 in the judgment path at
`lib/memory/living-memory.ts:634-644`, but the *deterministic fast path* — the block
guarded by `if (deterministic.length > 0 && !needsJudgment)` — still carries the exact
pre-SR-001 pattern at `:475-480`:

    const capDeferredRetirements = observedRetirementCandidates
      .slice(pressure.kind === "measured"
        ? dependencies.limits.maxRetirements
        : observedRetirementCandidates.length)

When pressure is unusable that slices the whole array away, so pressure-blocked
retirement candidates are reported neither as applied nor as deferred — they vanish —
and no `retirement-pressure-deferred` decline is emitted, because that decline is added
only at `:893` in the judgment path. This is the same defect SR-001 named, unfixed in a
sibling path, and it directly contradicts TASK-642's own acceptance criterion that
pressure-blocked candidates are "represented truthfully in the reported outcome rather
than silently dropped". The path is reachable in both model modes whenever deterministic
findings suffice, including the `--no-model` invocation the owner actually runs. Ten
review rounds missed it.

**SR-011 (reporting fidelity, introduced by this branch).** Stage 2 made warned read/parse
omissions and malformed episodes increment `omitted` (previously a malformed episode was
`if (!parsed.ok) continue;` with no increment). Result assembly maps any source with a
non-zero omitted count to `code: "source-deferred"`, stating the records "were deferred by
the bounded source pass". Integrity failures are therefore reported as ordinary bounded
backlog, so a consumer may retry or raise limits instead of repairing the path named by
the warning. Emit bounded-deferral diagnostics only for genuine cap deferrals and a
distinct integrity diagnostic for read/parse/inventory failures.

**SR-012 (reporting fidelity, introduced by this branch).** Per-source `inventoryComplete`
declarations are reduced to one aggregate boolean, and the fatal
`source-inventory-incomplete` decline names no source. `details.sources` rows keep only
`sourceId`, `admitted` and `omitted`. A source may declare incomplete with `omitted: 0` and
no warning, leaving nothing in the reported result that identifies which adapter blocked
the pass. This matters because D-009 makes the exit from a blocked pass human-only: an
operator who cannot see which source is incomplete cannot perform the only available
remedy. Preserve per-source completeness in `details.sources` and name the incomplete
source in the structured decline.

NOT IN SCOPE — pre-existing on `main`, verified untouched by this branch, recorded as
follow-ups: the corpus body-admission ordering starvation (QM PRF-001; `admittedBodies`
and `representedKeys` are byte-identical to `main`), per-file aggregate deferral growth
(PRF-002), the episode-source escaping-symlink prune (SRQ-001; `directEpisodePaths` is
byte-identical to `main`), and rejected knowledge directories reported as a healthy
complete inventory (SRQ-002 — this is the residue the plan's Risks section already records
as knowingly open with an explicit "do not close this by widening the rule without a
ruling"). Do not fix any of these here.

Ratified-ground handling: the five common constraints below and INV-001..INV-004 are
stop-and-escalate ground. Do not weaken the Stage-1 measurement contract, the Stage-2
completeness barrier, or the Stage-3/4 committed-write recording while making these
changes.

<!-- AC:BEGIN -->
- [x] #1 (Quality Contract assertion 7; Implementation Order steps 2 and 21) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`. No repo-wide dead-code sweep, no export demotion, no unrelated API cleanup, no documentation, configuration, architecture-record or parent-plan edit.
- [x] #2 (Quality Contract assertion 6; Implementation Order step 1) Live corpus guard: before and after the task, `find knowledge -type f | sort | xargs shasum -a 256 | shasum -a 256` run from the repository root reports `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and `find knowledge -type f | wc -l` reports 237. No live `knowledge/` change and no non-dry-run write-capable memory command.
- [x] #3 (Quality Contract assertions 5 and 7) Parent ownership: all six exact parent B-012/B-016/B-021 marker/name carriers remain exact and parent-owned; no frozen pin, receipt floor, retirement/byte authority, fail-closed validation or existing marker is weakened. Any commit changing `lib/memory/types.ts` re-pins its full-source SHA-256 in the same commit.
- [x] #4 (Quality Contract assertion 7) Gates: `bun run test`, `bun run lint`, `bun run typecheck`, `git diff --check` and `bun bin/cosmonauts plan check-artifacts living-memory-fidelity` all pass, with artifact conformance GREEN. No test is committed red.
- [x] #5 (Quality Contract assertions 7-8; D-026) D-026 is not reopened or given another verification layer, and retirement pathname sequencing in `lib/memory/retirement-store.ts` is not touched.
- [x] #6 (SR-010; INV-003, TASK-642 AC) A RED counterexample reproduces SR-010 before any production edit: the deterministic fast path (`deterministic.length > 0 && !needsJudgment`) runs with unusable pressure and at least one observed retirement candidate, and the reported result is shown to contain that candidate neither as applied nor as deferred, with no `retirement-pressure-deferred` decline. After the fix the candidate is reported as deferred with the pressure decline, matching the judgment path exactly.
- [x] #7 (SR-010; consistency) Pressure-blocked retirement diagnostics are identical between the deterministic fast path and the judgment path — same retirement row status and reason, same decline code — so automation can identify them with one code across `--no-model` and default runs. A test asserts the equivalence rather than each path separately.
- [x] #8 (SR-010; regression) The deterministic fast path's `capDeferredRetirements` no longer slices from `observedRetirementCandidates.length` under unusable pressure. Any other occurrence of that pre-SR-001 pattern anywhere in `lib/memory/` is found and fixed; the task notes record the search performed and its result.
- [x] #9 (SR-011) Read/parse/inventory integrity omissions are no longer reported with a bounded-deferral diagnostic that states the records were deferred by the bounded source pass. A distinct diagnostic distinguishes integrity failures from genuine record/byte/aggregate cap deferrals, and a test pins both classifications on the same pass.
- [x] #10 (SR-012) The reported result identifies which source is incomplete: per-source completeness is preserved in `details.sources` and the structured `source-inventory-incomplete` decline names the incomplete source. A test covers a source declaring incomplete with `omitted: 0` and no warning, where nothing else in the result would identify it.
- [x] #11 (scope) None of the pre-existing findings listed as out of scope in the description is modified: the corpus body-admission ordering, per-file aggregate deferral shape, `directEpisodePaths` symlink handling, and `listKnowledgeFiles` dirent-exclusion completeness all remain exactly as they are on `main`.
- [x] #12 (Quality Contract assertions 1-4) The Stage-1 measurement contract, Stage-2 completeness barrier, warning append-only monotonicity and Stage-3/4 committed-write recording are preserved unweakened. The full fidelity pack B-001..B-012, the commit-interleaving tests and the exact parent B-012/B-016/B-021 carrier tests all pass.
<!-- AC:END -->

## Implementation Notes

Implementation evidence for TASK-654:
- RED SR-010 command: bunx vitest run tests/memory/living-memory.test.ts -t "reports pressure-blocked retirements identically with and without model judgment". Before the production edit it failed because the deterministic path returned no retirement-pressure-deferred decline while the judgment path returned one. The pre-fix deterministic fallback already retained the deferred retirement row, so the task description overstated the row-loss half of the residue; the pressure diagnostic mismatch was reproduced directly and is now closed by identical explicit row and decline construction.
- RED SR-011 command: bunx vitest run tests/memory/living-memory.test.ts -t "distinguishes integrity omissions from bounded source deferrals". It failed with two source-deferred declines, including integrity-source; after the fix only bounded-source receives that bounded diagnostic and integrity-source receives source-inventory-incomplete.
- RED SR-012 command: bunx vitest run tests/memory/living-memory.test.ts -t "identifies an incomplete source with no omissions or warnings". It failed because source-inventory-incomplete lacked sourceId; after the fix details.sources preserves inventoryComplete false and the decline names silent-incomplete-source.
- Pre-SR-001 search: rg -n -U old pressure-kind conditional slice pattern across lib/memory and rg -n observedRetirementCandidates.length lib/memory returned zero matches after the fix. The only retirement-pressure-deferred occurrences are the deterministic and judgment reporting siblings.
- Scope audit: git diff main --unified=0 for consolidation-sources.ts, knowledge-store.ts, and retirement-store.ts shows no changed hunk for admittedBodies, representedKeys, directEpisodePaths, listKnowledgeFiles, per-file aggregate deferral shape, or retirement pathname sequencing.
- Final verification: bun run test passed 263 files and 3088 tests; the six-file fidelity, parent-carrier, and commit-interleaving pack passed 147 tests; bun run lint, bun run typecheck, git diff --check, and bun bin/cosmonauts plan check-artifacts living-memory-fidelity all passed. Artifact conformance reported 12 behaviors, 0 issues, and 0 advisories. The final live corpus guard remained adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932 with 237 files.
