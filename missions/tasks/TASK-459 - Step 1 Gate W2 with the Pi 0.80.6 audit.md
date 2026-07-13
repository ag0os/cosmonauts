---
id: TASK-459
title: 'Step 1: Gate W2 with the Pi 0.80.6 audit'
status: To Do
priority: high
labels:
  - testing
  - 'plan:profile-playbooks'
dependencies: []
createdAt: '2026-07-13T14:10:31.197Z'
updatedAt: '2026-07-13T14:10:31.197Z'
---

## Description

Implementation Order step 1. Produce the Pi-First evidence gate before any W2 production change. Audit the four pinned lockstep Pi 0.80.6 packages, package.json, installed docs/types/changelog, context-file behavior, extension hooks, session custom entries, compaction, confirmation, and tool execution ordering. The planned lean/build decision is evidence-driven: use Pi lifecycle and registration primitives, but retain the W1 human-prunable disk store only if Pi lacks equivalent mutable profile/playbook and collision-save semantics. No production implementation may begin until this task is Done; contradictory evidence requires stop-and-report and plan revision, not parallel machinery.

<!-- AC:BEGIN -->
- [ ] #1 B-001 is fully evidenced in `missions/plans/profile-playbooks/pi-first-profile-playbooks-audit.md` under the named check `Pi 0.80.6 recommendation gates W2 implementation`, with `@cosmo-behavior plan:profile-playbooks#B-001`; the audit records evidence for long-term memory/profile/preference/playbook/save-confirmation/context-injection/extension-state primitives and an explicit build-vs-lean-on-Pi recommendation.
- [ ] #2 B-001's recommendation explicitly evaluates factory-time `registerTool`, `before_agent_start`, `context`, session/compaction, custom-message hooks, and confirms that `pi.appendEntry()` is not used for proposals; it also evaluates `ctx.ui.confirm` across `hasUI` and TUI/RPC/print/json mode variance, including the non-UI `false` fallback, and explains why conversational confirmation remains authoritative.
- [ ] #3 B-001's execution-order evidence records the `executionMode: "sequential"` decision for `remember`, why read-only `recall` keeps its default mode, and the W1 PID-plus-`Date.now()` temp-file naming dependency that B-021 will protect.
- [ ] #4 The audit gate has an explicit outcome: if Pi 0.80.6 provides contradictory equivalent semantics, implementation stops and the plan is revised; otherwise it recommends leaning on Pi's lifecycle/tool primitives while retaining Cosmonauts' mutable disk store because Pi lacks the required profile/playbook store and collision-save primitive.
- [ ] #5 Applicable Quality Contract gates are satisfied at this checkpoint: gate 2 has the exact root-relative evidence path/name/marker, and gates 4–6 are preserved because this audit introduces no production, shared-interface, registry/backend/approval, cache, extra-consumer, W3, or W4 machinery; the audit artifact is retained in final version-control state.
<!-- AC:END -->
