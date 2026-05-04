---
id: TASK-282
title: 'Plan 3: Extend driver-tool.ts to accept detached mode'
status: To Do
priority: high
labels:
  - backend
  - api
  - 'plan:external-backends-and-cli'
dependencies:
  - TASK-278
createdAt: '2026-05-04T20:21:47.318Z'
updatedAt: '2026-05-04T20:21:47.318Z'
---

## Description

Implements Implementation Order step 10. Decision Log: D-P3-3, D-P3-5. Quality Contract: QC-002.

Extend `domains/shared/extensions/orchestration/driver-tool.ts` (Plan 1 file) to accept `mode: "detached"` and route to `startDetached`.

**Cross-plan invariants:**
- P3-INV-3: Reject `backendName === "cosmonauts-subagent"` + `mode: "detached"` with a structured error before calling `startDetached`. The registry (TASK-274) also rejects it, but this guard must exist here too.
- P3-INV-5: Pi tool registration shape is `{ name, label, description, parameters: Type.Object(...), execute: async (_toolCallId, params, signal, onUpdate, ctx) => ... }` — exactly matching `domains/shared/extensions/orchestration/spawn-tool.ts:413` and `chain-tool.ts:40`. This EXTENSION adds `mode` to the **existing** `parameters` `Type.Object`; preserve the entire existing registration shape. Do NOT restructure the tool registration.

**What changes:**
- Add `mode: Type.Optional(Type.Union([Type.Literal("inline"), Type.Literal("detached")]))` to the existing `parameters` `Type.Object`.
- In `execute`: when `params.mode === "detached"`, call `startDetached(spec, deps)` and return `{ runId, workdir, eventLogPath }`. Otherwise use existing inline path unchanged.

<!-- AC:BEGIN -->
- [ ] #1 driver-tool.ts parameters Type.Object includes mode: Type.Optional(Type.Union([Type.Literal("inline"), Type.Literal("detached")])) added to the existing shape (P3-INV-5).
- [ ] #2 When params.mode === "detached", routes to startDetached and returns { runId, workdir, eventLogPath }.
- [ ] #3 When params.mode === "inline" or omitted, routes to the existing inline path unchanged.
- [ ] #4 Rejects params.backendName === "cosmonauts-subagent" + params.mode === "detached" with a structured error before calling startDetached (P3-INV-3).
- [ ] #5 Existing tool registration shape (name, label, description, execute signature) is fully preserved — no regressions on inline-mode tests (P3-INV-5).
- [ ] #6 Tests in tests/extensions/orchestration-driver-detached.test.ts verify: (a) detached call returns runId; (b) cosmonauts-subagent + detached is rejected (QC-002).
<!-- AC:END -->
