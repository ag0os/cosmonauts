# Calibration — epoch-fixture

This is the complete Stage 5 calibration rerun. Calibration, rather than a reviewed flag, licenses profiling: every N/X/P control below passed its predeclared obligation, so profile acceptance is `licensed`. A missing row, counterexample, or expected/actual mismatch evaluates to `miss` and changes profile acceptance to `blocked`.

The method digest covers the calibration contract in `plan.md` plus `schema.ts` and `artifacts.ts`. No method/schema amendment was needed in this epoch. If one is needed later, the validator requires a successor epoch, a changed method digest, preserved prior misses, affected-evidence invalidation, and an entire-corpus rerun.

External X controls calibrate the method only; no deintroverter code was used or ported. N-010 is evidence-only: `AgentDefinition.session` is excluded from runtime guardrail evidence, linked to `observational-memory-adoption`, and deliberately unremediated.

```json calibration
{
  "schemaVersion": 1,
  "epochId": "epoch-fixture",
  "methodDigest": "0d0b872a188b662fc5349d4d2d330f1d7b4e25847bc3e438230e23063b6a9e30",
  "status": "pass",
  "profileAcceptance": "licensed",
  "run": {
    "scope": "entire-corpus",
    "controlIds": ["N-001", "N-002", "N-003", "N-004", "N-005", "N-006", "N-007", "N-008", "N-009", "N-010", "N-011", "X-001", "X-002", "X-003", "X-004", "X-005", "P-001", "P-002", "P-003", "P-004", "P-005", "P-006", "P-007", "P-008", "P-009", "P-010"]
  },
  "controls": [
    {
      "id": "N-001", "polarity": "negative",
      "sources": [{"path": "missions/reviews/improvements/living-memory-implementation.md", "identity": "A fully green behaviour suite proved nothing about the system's real input"}],
      "expected": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": ["missing composition root"], "portfolioEffect": "unprotected", "constraints": ["fixture contributors retained", "shipped composition-root cell missing"]},
      "actual": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": ["missing composition root"], "portfolioEffect": "unprotected", "constraints": ["fixture contributors retained", "shipped composition-root cell missing"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:30:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "missions/reviews/improvements/living-memory-implementation.md"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    },
    {
      "id": "N-002", "polarity": "negative",
      "sources": [{"path": "missions/reviews/improvements/living-memory-implementation.md", "identity": "A test can encode the bug it should catch"}],
      "expected": {"dimensionConclusions": ["contractAlignment:misaligned"], "evidenceBases": "unconstrained", "reasonCodes": ["wrong-side expectation"], "portfolioEffect": "unconstrained", "constraints": ["excluded from guardrail evidence until corrected against ratified authority"]},
      "actual": {"dimensionConclusions": ["contractAlignment:misaligned"], "evidenceBases": "unconstrained", "reasonCodes": ["wrong-side expectation"], "portfolioEffect": "unconstrained", "constraints": ["excluded from guardrail evidence until corrected against ratified authority"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:31:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "missions/reviews/improvements/living-memory-implementation.md"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    },
    {
      "id": "N-003", "polarity": "negative",
      "sources": [{"path": "missions/reviews/improvements/living-memory-fidelity.md", "identity": "A test that pins a producer does not pin its consumer"}],
      "expected": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": ["missing consumer seam"], "portfolioEffect": "partially-protected", "constraints": ["producer contribution remains producer-only", "survived mutation not counted"]},
      "actual": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": ["missing consumer seam"], "portfolioEffect": "partially-protected", "constraints": ["producer contribution remains producer-only", "survived mutation not counted"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:32:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "missions/reviews/improvements/living-memory-fidelity.md"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    },
    {
      "id": "N-004", "polarity": "negative",
      "sources": [{"path": "missions/reviews/improvements/living-memory-fidelity.md", "identity": "Consumer-seam regressions with another double supplying the outcome"}],
      "expected": {"dimensionConclusions": ["faultSensitivity:probe-survived"], "evidenceBases": "unconstrained", "reasonCodes": ["mock-supplied outcome"], "portfolioEffect": "unconstrained", "constraints": ["probe-confirmed requires a rerun with other doubles non-contributing"]},
      "actual": {"dimensionConclusions": ["faultSensitivity:probe-survived"], "evidenceBases": "unconstrained", "reasonCodes": ["mock-supplied outcome"], "portfolioEffect": "unconstrained", "constraints": ["probe-confirmed requires a rerun with other doubles non-contributing"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:33:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "missions/reviews/improvements/living-memory-fidelity.md"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    },
    {
      "id": "N-005", "polarity": "negative",
      "sources": [{"path": "missions/reviews/improvements/living-memory-fidelity.md", "identity": "Reviews read the diff, so a defect in an unchanged sibling path is invisible"}],
      "expected": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": ["missing caller or alternate path"], "portfolioEffect": "partially-protected", "constraints": ["path-parity gap explicit"]},
      "actual": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": ["missing caller or alternate path"], "portfolioEffect": "partially-protected", "constraints": ["path-parity gap explicit"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:34:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "missions/reviews/improvements/living-memory-fidelity.md"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    },
    {
      "id": "N-006", "polarity": "negative",
      "sources": [{"path": "missions/reviews/improvements/living-memory-implementation.md", "identity": "No task owned the production corpus adapter"}],
      "expected": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unprotected", "constraints": ["fixture contact cannot substitute for shipped adapter or composition evidence"]},
      "actual": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unprotected", "constraints": ["fixture contact cannot substitute for shipped adapter or composition evidence"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:35:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "missions/reviews/improvements/living-memory-implementation.md"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    },
    {
      "id": "N-007", "polarity": "negative",
      "sources": [{"path": "missions/reviews/improvements/living-memory-fidelity.md", "identity": "A correct local fix can change the safety of a distant call site"}],
      "expected": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": ["missing caller or alternate path"], "portfolioEffect": "unresolved", "constraints": ["every caller requires fix-or-justification evidence"]},
      "actual": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": ["missing caller or alternate path"], "portfolioEffect": "unresolved", "constraints": ["every caller requires fix-or-justification evidence"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:36:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "missions/reviews/improvements/living-memory-fidelity.md"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    },
    {
      "id": "N-008", "polarity": "negative",
      "sources": [{"path": "missions/reviews/improvements/living-memory-fidelity.md", "identity": "A defect class has more axes than the rounds that closed it found"}],
      "expected": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "partially-protected", "constraints": ["only observed axis protected", "unobserved axes remain explicit gaps"]},
      "actual": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "partially-protected", "constraints": ["only observed axis protected", "unobserved axes remain explicit gaps"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:37:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "missions/reviews/improvements/living-memory-fidelity.md"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    },
    {
      "id": "N-009", "polarity": "negative",
      "sources": [{"path": "missions/archive/plans/living-memory-fidelity/review-16.md", "identity": "CDX16-001 — Existing-proposal confirmation discards a real publication"}, {"path": "missions/archive/plans/living-memory-fidelity/review-16.md", "identity": "CDX16-002 — Accepted-receipt read can write with no reporting channel"}, {"path": "missions/archive/plans/living-memory-fidelity/review-16.md", "identity": "CDX16-003 — Episode proposal confirmation discards a real publication"}],
      "expected": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "partially-protected", "constraints": ["error axis separate", "success or proxy axis separate", "confirmation or republication axis separate"]},
      "actual": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "partially-protected", "constraints": ["error axis separate", "success or proxy axis separate", "confirmation or republication axis separate"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:38:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "missions/archive/plans/living-memory-fidelity/review-16.md"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    },
    {
      "id": "N-010", "polarity": "negative",
      "sources": [{"path": "tests/domains/coding-agents.test.ts", "identity": "coding domain agent invariants > uses valid session values"}],
      "expected": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unconstrained", "constraints": ["excluded-from-runtime-guardrail-evidence", "roadmap:observational-memory-adoption", "remediation:none"]},
      "actual": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unconstrained", "constraints": ["excluded-from-runtime-guardrail-evidence", "roadmap:observational-memory-adoption", "remediation:none"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:39:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "tests/domains/coding-agents.test.ts", "ROADMAP.md"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    },
    {
      "id": "N-011", "polarity": "negative",
      "sources": [{"path": "tests/driver/backends/process-reaping.test.ts", "identity": "backend process reaping > escalates an ignored SIGTERM to SIGKILL on a bounded deadline"}, {"path": "tests/driver/backends/process-reaping.test.ts", "identity": "backend process reaping > leaves no live descendant when the backend settles (%s)"}],
      "expected": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "partially-protected", "constraints": ["timeout budget is engineering-quality evidence only", "descendant exit observation may contribute cleanup evidence"]},
      "actual": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "partially-protected", "constraints": ["timeout budget is engineering-quality evidence only", "descendant exit observation may contribute cleanup evidence"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:40:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "tests/driver/backends/process-reaping.test.ts"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    },
    {
      "id": "X-001", "polarity": "external",
      "sources": [{"path": "missions/plans/test-health-audit/spec.md", "identity": "External negative control > undiscovered external control"}],
      "expected": {"dimensionConclusions": ["execution:undiscovered"], "evidenceBases": ["observed"], "reasonCodes": ["undiscovered or filtered test"], "portfolioEffect": "unprotected", "constraints": ["never clean"]},
      "actual": {"dimensionConclusions": ["execution:undiscovered"], "evidenceBases": ["observed"], "reasonCodes": ["undiscovered or filtered test"], "portfolioEffect": "unprotected", "constraints": ["never clean"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:41:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "missions/plans/test-health-audit/spec.md"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    },
    {
      "id": "X-002", "polarity": "external",
      "sources": [{"path": "missions/plans/test-health-audit/spec.md", "identity": "External negative control > swallowed analysis error"}],
      "expected": {"dimensionConclusions": "unconstrained", "evidenceBases": ["blocked"], "reasonCodes": ["collection or execution error", "assessment blind spot"], "portfolioEffect": "unresolved", "constraints": ["no clean conclusion"]},
      "actual": {"dimensionConclusions": "unconstrained", "evidenceBases": ["blocked"], "reasonCodes": ["collection or execution error", "assessment blind spot"], "portfolioEffect": "unresolved", "constraints": ["no clean conclusion"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:42:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "missions/plans/test-health-audit/spec.md"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    },
    {
      "id": "X-003", "polarity": "external",
      "sources": [{"path": "missions/plans/test-health-audit/plan.md", "identity": "Calibration contract > live run-3 accepted-limitation laundering instance"}, {"path": "tests/scripts/test-health-audit/census.test.ts", "identity": "test health audit census > counts nested multiline each literals and blocks dynamic parameter sets"}],
      "expected": {"dimensionConclusions": "unconstrained", "evidenceBases": ["missing", "blocked"], "reasonCodes": ["assessment blind spot"], "portfolioEffect": "unresolved", "constraints": ["recognized subset cannot certify completeness", "disposition:repair-required-tooling", "disposition:limitation-accepted forbidden"]},
      "actual": {"dimensionConclusions": "unconstrained", "evidenceBases": ["missing", "blocked"], "reasonCodes": ["assessment blind spot"], "portfolioEffect": "unresolved", "constraints": ["recognized subset cannot certify completeness", "disposition:repair-required-tooling", "disposition:limitation-accepted forbidden"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:43:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "missions/plans/test-health-audit/spec.md", "tests/scripts/test-health-audit/census.test.ts"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    },
    {
      "id": "X-004", "polarity": "external",
      "sources": [{"path": "missions/plans/test-health-audit/spec.md", "identity": "External negative control > orphaned intent manifest"}],
      "expected": {"dimensionConclusions": ["contractAlignment:unresolved"], "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unresolved", "constraints": ["no test or portfolio claim inferred"]},
      "actual": {"dimensionConclusions": ["contractAlignment:unresolved"], "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unresolved", "constraints": ["no test or portfolio claim inferred"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:44:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "missions/plans/test-health-audit/spec.md"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    },
    {
      "id": "X-005", "polarity": "external",
      "sources": [{"path": "missions/plans/test-health-audit/spec.md", "identity": "External negative control > golden comparison omits material properties"}],
      "expected": {"dimensionConclusions": ["contractAlignment:partially-aligned"], "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "partially-protected", "constraints": ["omitted material property remains an explicit gap", "authority may instead require unresolved"]},
      "actual": {"dimensionConclusions": ["contractAlignment:partially-aligned"], "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "partially-protected", "constraints": ["omitted material property remains an explicit gap", "authority may instead require unresolved"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:45:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "missions/plans/test-health-audit/spec.md"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    },
    {
      "id": "P-001", "polarity": "positive",
      "sources": [{"path": "tests/orchestration/spawn-limits.test.ts", "identity": "resolveMaxConcurrentSpawns > returns default when called with no argument"}],
      "expected": {"dimensionConclusions": ["grounding:direct-production", "realism:isolated-real-unit"], "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unconstrained", "constraints": ["focused production-function unit retained without composition penalty"]},
      "actual": {"dimensionConclusions": ["grounding:direct-production", "realism:isolated-real-unit"], "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unconstrained", "constraints": ["focused production-function unit retained without composition penalty"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:46:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "tests/orchestration/spawn-limits.test.ts"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    },
    {
      "id": "P-002", "polarity": "positive",
      "sources": [{"path": "tests/orchestration/chain-event-adapter.test.ts", "identity": "chain-event-adapter > maps durable chain spawn evidence to ChainEvents and refuses to fabricate missing session ids"}],
      "expected": {"dimensionConclusions": ["grounding:mediated-production"], "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unconstrained", "constraints": ["event mediation is not weakness"]},
      "actual": {"dimensionConclusions": ["grounding:mediated-production"], "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unconstrained", "constraints": ["event mediation is not weakness"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:47:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "tests/orchestration/chain-event-adapter.test.ts"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    },
    {
      "id": "P-003", "polarity": "positive",
      "sources": [{"path": "tests/artifacts/behavior-conformance.test.ts", "identity": "behavior conformance > keeps the analysis-capabilities artifacts passing under extended checks"}, {"path": "tests/prompts/planner.test.ts", "identity": "planner prompt > records decision provenance and checks mechanism against intent"}],
      "expected": {"dimensionConclusions": ["grounding:shipped-artifact"], "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unconstrained", "constraints": ["artifact contract needs no composition-depth promotion"]},
      "actual": {"dimensionConclusions": ["grounding:shipped-artifact"], "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unconstrained", "constraints": ["artifact contract needs no composition-depth promotion"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:48:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "tests/artifacts/behavior-conformance.test.ts", "tests/prompts/planner.test.ts"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    },
    {
      "id": "P-004", "polarity": "positive",
      "sources": [{"path": "tests/config/loader.test.ts", "identity": "loadProjectConfig > parses config with both skills and chains"}],
      "expected": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unconstrained", "constraints": ["configuration is a legitimate SUT", "synthetic config limits explicit"]},
      "actual": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unconstrained", "constraints": ["configuration is a legitimate SUT", "synthetic config limits explicit"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:49:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "tests/config/loader.test.ts"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    },
    {
      "id": "P-005", "polarity": "positive",
      "sources": [{"path": "tests/cli/main.test.ts", "identity": "renderAgentsList > JSON mode includes domain, model, tools, and session per agent"}],
      "expected": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unconstrained", "constraints": ["CLI output is observable", "renderer coverage contributes only at renderer seam"]},
      "actual": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unconstrained", "constraints": ["CLI output is observable", "renderer coverage contributes only at renderer seam"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:50:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "tests/cli/main.test.ts"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    },
    {
      "id": "P-006", "polarity": "positive",
      "sources": [{"path": "tests/agent-packages/claude-binary-runner.test.ts", "identity": "runClaudeBinary > passes Claude args through, pipes Claude output from tests, exits with Claude's code, and cleans up"}, {"path": "tests/driver/backends/process-reaping.test.ts", "identity": "backend process reaping > leaves no live descendant when the backend settles (%s)"}],
      "expected": {"dimensionConclusions": ["realism:simulated-boundary", "realism:integrated-subsystem"], "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unconstrained", "constraints": ["simulated subprocess and real process observation are distinct legitimate roles", "only real process observation proves cleanup"]},
      "actual": {"dimensionConclusions": ["realism:simulated-boundary", "realism:integrated-subsystem"], "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unconstrained", "constraints": ["simulated subprocess and real process observation are distinct legitimate roles", "only real process observation proves cleanup"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:51:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "tests/agent-packages/claude-binary-runner.test.ts", "tests/driver/backends/process-reaping.test.ts"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    },
    {
      "id": "P-007", "polarity": "positive",
      "sources": [{"path": "tests/sessions/session-store.test.ts", "identity": "writeTranscript > writes content to <sessionsDir>/<filename>"}],
      "expected": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unconstrained", "constraints": ["persisted state is a legitimate SUT", "durability limits explicit"]},
      "actual": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unconstrained", "constraints": ["persisted state is a legitimate SUT", "durability limits explicit"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:52:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "tests/sessions/session-store.test.ts"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    },
    {
      "id": "P-008", "polarity": "positive",
      "sources": [{"path": "tests/durable-runtime/scheduler-recovery.test.ts", "identity": "durable scheduler recovery > promotes terminal attempt results on restart without starting a duplicate backend"}],
      "expected": {"dimensionConclusions": ["realism:integrated-subsystem"], "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unconstrained", "constraints": ["recovery contributor not demoted for setup depth"]},
      "actual": {"dimensionConclusions": ["realism:integrated-subsystem"], "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unconstrained", "constraints": ["recovery contributor not demoted for setup depth"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:53:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "tests/durable-runtime/scheduler-recovery.test.ts"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    },
    {
      "id": "P-009", "polarity": "positive",
      "sources": [{"path": "tests/tasks/task-manager-concurrency.test.ts", "identity": "TaskManager concurrency > allocates distinct IDs for concurrent creates across separate TaskManager instances"}],
      "expected": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unconstrained", "constraints": ["concurrency risk protected when observation and determinism established"]},
      "actual": {"dimensionConclusions": "unconstrained", "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unconstrained", "constraints": ["concurrency risk protected when observation and determinism established"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:54:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "tests/tasks/task-manager-concurrency.test.ts"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    },
    {
      "id": "P-010", "polarity": "positive",
      "sources": [{"path": "tests/cli/memory/subcommand.test.ts", "identity": "memory owner CLI > matches real-corpus injection pressure through the CLI composition root on a copy"}],
      "expected": {"dimensionConclusions": ["realism:composition-root"], "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unconstrained", "constraints": ["copied real corpus limit explicit", "dry-run limit explicit"]},
      "actual": {"dimensionConclusions": ["realism:composition-root"], "evidenceBases": "unconstrained", "reasonCodes": "unconstrained", "portfolioEffect": "unconstrained", "constraints": ["copied real corpus limit explicit", "dry-run limit explicit"]},
      "assessor": {"kind": "agent", "id": "codex-drive-task-694", "model": "openai-codex", "modelVersion": "gpt-5", "assessedAt": "2026-09-17T18:55:00.000Z", "consultedAuthorities": ["missions/plans/test-health-audit/plan.md", "tests/cli/memory/subcommand.test.ts"]}, "reviewed": true, "counterexamples": [], "result": "pass"
    }
  ]
}
```
