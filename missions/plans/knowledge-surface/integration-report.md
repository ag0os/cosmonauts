# Integration Report

plan: knowledge-surface
overall: incorrect

## Overall Assessment

The implemented TASK-559–TASK-564 scope is structurally present, but one shipped archive instruction still contradicts B-009’s proposals-only contract and the declared transition/collision seams lack executable regression coverage. B-010, B-011, D-027, the accepted migration sweep, the empty tracked `memory/`, and baseline timing flakes were not treated as defects.

## Findings

- id: I-001
  priority: P1
  severity: high
  confidence: 0.99
  complexity: simple
  contract: B-009 / INV-1 / INV-3
  files: domains/shared/skills/archive/SKILL.md, tests/prompts/archive-skill.test.ts
  lineRange: domains/shared/skills/archive/SKILL.md:42-79
  summary: The archive skill still tells the acting agent to write `memory/<slug>.md`, create `memory/`, and emit the legacy `source/plan/distilledAt` memory-file template, even though its later proposal section says `memory/agent/proposals/` is the sole machine-knowledge output root. This directly contradicts B-009’s required active archive contract and the proposals-only path invariant. The B-009 test at `tests/prompts/archive-skill.test.ts:25-72` checks that proposal language exists but never rejects the earlier write-to-root instruction, so both incompatible instructions pass. Concrete failure scenario: an archive/distiller run follows the first complete procedure, creates a new machine-authored `memory/example.md`, and bypasses `propose_knowledge`, strict proposal provenance, and human promotion review.
  suggestedFix: Replace or explicitly supersede the legacy write-to-`memory/<slug>.md` procedure with the proposal-tool workflow, and add a negative assertion that active archive guidance contains no machine instruction or template for root `memory/<slug>.md` output.
  task:
    title: -
    labels: -
    acceptanceCriteria:
      1. Archive guidance names `memory/agent/proposals/` as the only machine-knowledge output and contains no instruction to write `memory/<slug>.md`.
      2. B-009 coverage fails if a root-memory output instruction or legacy distillation template is reintroduced.

- id: I-002
  priority: P1
  severity: medium
  confidence: 0.98
  complexity: complex
  contract: B-008 transition seams
  files: tests/episodic/pre-w3-disabled-baselines.test.ts, tests/agents/session-assembly.test.ts, cli/session.ts
  lineRange: tests/episodic/pre-w3-disabled-baselines.test.ts:18-183
  summary: The B-008 marker test does not execute reload, plain-new, restart, or `/agent` transition behavior; it only asserts that a frozen JSON object contains the expected transition labels. The nearby assembly test at `tests/agents/session-assembly.test.ts:276-298` similarly reuses an already-returned params object for “reload/plain-new” rather than driving either runtime seam. Production reassembly does occur in `cli/session.ts:555-590`, but no test proves the frozen-versus-reassembled matrix. Concrete failure scenario: a future reload callback begins rebuilding resources from edited config and turns an OFF session ON mid-runtime; the static fixture and params-object assertions remain green because neither invokes reload.
  suggestedFix: Add executable transition tests through the actual CLI/Pi runtime replacement seams for both OFF→ON and ON→OFF: reload and plain-new must retain the frozen selection, while restart and `/agent` switch must rebuild and adopt the edit. Assert tool/context/store effects, not only config labels.
  task:
    title: Exercise the B-008 frozen and reassembled transition matrix
    labels: plan:knowledge-surface, testing
    acceptanceCriteria:
      1. Reload and plain-new tests execute their real session seams and retain the prior gate state in both directions without knowledge store construction when frozen OFF.
      2. Restart and `/agent` switch tests execute reassembly and adopt OFF→ON and ON→OFF edits, asserting observable tool/context outcomes.

- id: I-003
  priority: P1
  severity: medium
  confidence: 0.97
  complexity: complex
  contract: B-005 collision at initial, switch, and spawn seams
  files: tests/cli/session.test.ts, tests/orchestration/session-factory.security.test.ts, cli/session.ts, lib/orchestration/session-factory.ts
  lineRange: tests/cli/session.test.ts:116-273
  summary: Production calls the recall-owner assertion on switch and initial CLI paths (`cli/session.ts:582-584`, `cli/session.ts:613-615`) and on spawned sessions (`lib/orchestration/session-factory.ts:82-84`), but tests exercise only the single-owner success case. The B-005 test’s loader mock manufactures only the inline owner, while the spawned-session test at `tests/orchestration/session-factory.security.test.ts:77-110` only checks factory forwarding. No seam test loads an arbitrary extension that also registers `recall`, verifies failure before session use, or checks that both owner paths appear. Concrete failure scenario: collision checking is accidentally removed from the spawned path; an installed extension and the framework both register `recall`, yet all current B-005 tests still pass because none creates the conflicting owner at that seam.
  suggestedFix: Add independent initial-CLI, `/agent`-switch, and spawned-session collision cases whose loaders expose the inline framework owner plus an arbitrary path owner; assert assembly fails with both paths and does not create/use the session. Keep a success case at each seam for unrelated tools.
  task:
    title: Cover B-005 recall collisions at every declared session seam
    labels: plan:knowledge-surface, testing
    acceptanceCriteria:
      1. Initial CLI, `/agent` switch, and spawned-session tests each fail on an inline-plus-arbitrary `recall` collision and name both owner paths.
      2. Each seam proves unrelated extension tools remain callable when no recall collision exists.
