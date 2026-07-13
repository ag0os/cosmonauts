---
id: TASK-462
title: 'Step 4: Extend the sequential remember save edge'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:profile-playbooks'
dependencies:
  - TASK-461
createdAt: '2026-07-13T14:11:38.456Z'
updatedAt: '2026-07-13T14:11:38.456Z'
---

## Description

Implementation Order step 4. Extend only the existing factory-registered `remember` tool in `domains/shared/extensions/agent-memory/index.ts` and `tests/extensions/agent-memory.test.ts` (widen `tests/helpers/mocks/extension-api.ts` only if registration capture requires it). This task owns B-004, B-005, B-007, B-009, B-021, and B-024; it lands B-003's save/result prerequisite, while B-003 completes and is marked in step 5. The registered schema must remain one flat object-root `Type.Object` with optional branch fields—never a top-level union—and the handler alone narrows to an internal union. Keep exactly `remember` and `recall`; `remember` registers `executionMode: "sequential"`, while `recall` stays read-only/default. Preserve omitted-type W1 notes, Cosmo authorization, temp-root construction, and the existing result union. No pending/approval state, `pi.appendEntry()` proposal, cache/registry/backend, W3/W4 machinery, or new consumer is allowed. `lib/memory/types.ts` is UNCHANGED; any pressure to edit it is stop-and-report. Tests make no model calls or real-home writes.

<!-- AC:BEGIN -->
- [ ] #1 B-004 is fully proven by `tests/extensions/agent-memory.test.ts` test `updates the same profile file and reports the change summary`, carrying `@cosmo-behavior plan:profile-playbooks#B-004`: a complete confirmed profile replacement atomically updates the same `memory/agent/profile.md`, advances timestamp, creates no second profile, and visibly reports `updated` plus `changeSummary`; a malformed existing profile is refused with its path/reason and no bytes changed.
- [ ] #2 B-005 is proven by `tests/extensions/agent-memory.test.ts` test `saves named playbooks directly in project and user scopes`, carrying `@cosmo-behavior plan:profile-playbooks#B-005`: direct saves with explicit title/scope/description/body create valid procedural playbooks in each requested `playbooks/` directory and visibly report created name, scope, and human-readable path, while when-to-use/steps remains guidance rather than schema validation.
- [ ] #3 B-007 is proven by `tests/extensions/agent-memory.test.ts` test `declined or unanswered proposals write nothing and persist no pending state`, carrying `@cosmo-behavior plan:profile-playbooks#B-007`: lifecycle events without a save call leave filesystem, store-factory log, and `MockPi.entries` unchanged, create no store directory or record, never call `pi.appendEntry()`, and a later explicit request starts only from current conversation/disk; collision refusal likewise persists no entry.
- [ ] #4 B-009 is proven by `tests/extensions/agent-memory.test.ts` test `requires confirmation before updating a canonical playbook name`, carrying `@cosmo-behavior plan:profile-playbooks#B-009`: a current-title canonical collision first returns non-persisted `confirmation_required` with existing title/scope/path and no write; a confirmed re-call of `remember` with `confirmUpdate: true` updates that same path atomically, visibly reports `updated`, and leaves one match (`recall` remains read-only per B-021); a different valid name creates separately; confirm, rename, or decline are all state-free exits.
- [ ] #5 B-021 is proven by `tests/extensions/agent-memory.test.ts` test `registers remember as sequential so same batch saves cannot bypass collision confirmation`, carrying `@cosmo-behavior plan:profile-playbooks#B-021`: captured `remember` registration has `executionMode: "sequential"`, a same-batch same-canonical pair makes the second call observe the first and return `confirmation_required`, and `recall` keeps default execution mode, consistent with the B-001 audit.
- [ ] #6 B-024 is proven by `tests/extensions/agent-memory.test.ts` test `renders profile and playbook write failures visibly while the session continues`, carrying `@cosmo-behavior plan:profile-playbooks#B-024`: both new-type failures visibly state type, intended scope, human-readable path, and reason; no partial file exists under B-018, and later tool calls still work in the session.
- [ ] #7 Applicable Quality Contract gates 1–6 pass for this save-edge slice: exact markers accompany all six named tests; the flat registered object validates branch requirements/invariants before store access and maps them to `invalid_request`, collisions to `confirmation_required`, and store outcomes through existing arms; omitted `type` preserves notes; non-Cosmo calls refuse before store construction; targeted negatives catch parallel overwrite, no-confirm overwrite, persisted collision/proposal state, wrong scope/kind, and partial failure. The result remains two tools and one Cosmo-only edge with no shared-contract edit, top-level schema union, cache, registry/backend/approval, extra wiring, W3, or W4 code. Final `git status` for this task shows no changes outside its listed files — in particular `fallow.toml`, `domains/main/agents/cosmo.ts`, CLI code, architecture-map code, and coding-agent definitions/prompts stay untouched.
<!-- AC:END -->
