---
id: TASK-686
title: Implement exact audit schema and calibrated evidence-chain classifications
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:test-health-audit'
dependencies: []
createdAt: '2026-09-16T18:34:03.359Z'
updatedAt: '2026-09-16T21:39:42.378Z'
---

## Description

Stage 1 — Schema/provenance.

Owned behaviors: **B-001** and **B-005** (and no others).

Implement the pure schema/provenance boundary at `scripts/test-health-audit/schema.ts` with executable proof in `tests/scripts/test-health-audit/schema.test.ts`. The spec’s INV-001/INV-002/INV-006, AC-001/AC-005/AC-006/AC-007/AC-009/AC-014, and ratified vocabulary/authority constraints are settled stop-and-escalate ground under the deviation protocol; they are not worker-adjustable. Keep IO, Vitest runtime integration, and production imports out of the schema module.

<!-- AC:BEGIN -->
- [x] #1 B-001 is proved at seam `scripts/test-health-audit/schema.ts` by `tests/scripts/test-health-audit/schema.test.ts` > `preserves seven dimensions all grounding forms and field-level assessment provenance without a score`, carrying exact marker `@cosmo-behavior plan:test-health-audit#B-001` near the executable test.
- [x] #2 B-005 is proved across `scripts/test-health-audit/schema.ts` and profile classification fixtures by `tests/scripts/test-health-audit/schema.test.ts` > `classifies false-confidence chains without automatically demoting mocks mediation or focused units`, carrying exact marker `@cosmo-behavior plan:test-health-audit#B-005` near the executable test.
- [x] #3 Validators accept only the spec’s exact seven dimension vocabularies, common evidence bases, reason classes, portfolio conclusions, dispositions, claim statuses (`identified` | `no-meaningful-claim` | `unresolved`), and legitimate SUT kinds — with schema fixtures instantiating each of the nine `SystemUnderTestRef.sutKind` values (production-function, shipped-file, shipped-prompt, configuration, cli-output, subprocess, event, persisted-state, composition-root) and accepting each without ordering, scoring, or penalizing Grounding or Realism, including at least one `mediated-production` record at `composition-root` realism and one `direct-production` + `isolated-real-unit` record; they reject collapsed/missing dimensions, scores, overall-health fields, universal per-test verdicts, invalid vocabulary, and unsupported SUT kinds.
- [x] #4 Grounding and Realism remain independent and non-ranked, while every assessed value has field-level `objective-observation` or `agent-assessed-judgment` provenance; mechanical collectors cannot default reasoned judgments and heuristic findings cannot become CI failures. An `agent-assessed-judgment` value validates only with a `kind: "agent"` assessor carrying `id`, `model`, `modelVersion`, `assessedAt`, and `consultedAuthorities`; an `objective-observation` value validates only with a `kind: "collector"` assessor carrying `id`, `version`, and `observedAt`; a `kind: "human"` assessor is rejected on a profile and accepted only inside the ratification packet; an `overrides` entry validates only with `previousDigest`, `reason`, `assessor`, and `at`.
- [x] #5 Absent or conflicting contract authority validates only as `unresolved`; no current implementation or test expectation becomes authority by default.
- [x] #6 `tests/domains/coding-agents.test.ts` and `AgentDefinition.session` are represented as audit evidence excluded from runtime guardrail claims with an `observational-memory-adoption` pointer, and neither is remediated by this work.
- [x] #7 The pure schema module imports no IO, Vitest, census, artifact, probe, CLI, or production modules, and project-native correctness checks for its focused tests pass.
- [x] #8 `EvidenceDigest` carries `scope: "declaration-span" | "file"` with `span` required when and only when `scope` is `declaration-span`; validators require declaration-span scope for `production-function` system-under-test material inputs and whole-file scope for runner, config, setup, and contract inputs, and reject both inverted combinations (a file-scope `production-function` SUT digest, and a declaration-span digest for a runner/config/setup/contract input).
<!-- AC:END -->
