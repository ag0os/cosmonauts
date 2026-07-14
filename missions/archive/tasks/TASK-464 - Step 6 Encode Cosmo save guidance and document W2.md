---
id: TASK-464
title: 'Step 6: Encode Cosmo save guidance and document W2'
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:profile-playbooks'
dependencies:
  - TASK-463
createdAt: '2026-07-13T14:12:49.562Z'
updatedAt: '2026-07-13T21:22:07.969Z'
---

## Description

Implementation Order step 6. Update `domains/main/prompts/cosmo.md`, `tests/domains/main-domain.test.ts`, and `docs/memory.md`. This task owns B-006 and B-019. Encode only conversational guidance—no event parser, approval workflow, persisted proposal, or model-compliance claim. Keep `agent-memory` consumed only by `main/cosmo`, with exactly the existing `remember` and `recall` tools; no agent wiring, cache/registry/backend, relevance gate, W3/W4 machinery, or shared-contract change is in scope. `lib/memory/types.ts` remains UNCHANGED and any pressure to edit it is stop-and-report. Tests use injected temporary roots and make no model calls.

<!-- AC:BEGIN -->
- [x] #1 B-006 is proven at its honest prompt-contract boundary by `tests/domains/main-domain.test.ts` test `guides Cosmo to propose profile and playbook saves and call remember only after confirmation`, carrying `@cosmo-behavior plan:profile-playbooks#B-006`: Cosmo is told to propose an unsolicited durable save, name intended scope, call `remember` only after explicit assent, never repeat a declined proposal, and produce B-005's visible created result after a confirmed playbook call; no event handler parses conversation or implements approval state.
- [x] #2 B-019 is fully proven by `tests/domains/main-domain.test.ts` test `keeps W2 memory Cosmo only without broadening the tool allowlist`, carrying `@cosmo-behavior plan:profile-playbooks#B-019`: no tool name is added, `remember`/`recall` remain factory-registered and reject non-Cosmo execution before store access, only `main/cosmo` declares `agent-memory`, and all W2 filesystem tests inject temporary `userCosmonautsRoot`/`storeFactory` dependencies and make no model calls.
- [x] #3 The Cosmo prompt covers the ratified UX boundaries: profile versus note/playbook content, direct versus proposed save timing, explicit playbook scope, complete-profile replacement and visible `changeSummary`, collision confirmation, no nagging/pending state, pull recall, and the rule that an injected truncated profile excerpt is never an update source until the full body is recalled.
- [x] #4 `docs/memory.md` accurately documents the W2 fixed project/user layout and OKF examples, singleton profile and stable current-title playbook identity (including canonicalization/human rename behavior), explicit-save/collision/failure flows, 4,000-byte profile write bound, one profile-first 12,000-byte budget, human edit/delete ownership, unchanged two-tool/Cosmo-only/no-op-consolidation boundaries, and full-scan cost: one per-turn scan and worst-case three scans per playbook save, with stores approaching hundreds as the reassess trigger and no cache in W2.
- [x] #5 Applicable Quality Contract gates 1–6 pass for this UX/documentation slice: both exact behavior markers are by their named tests; W1 allowlist/authorization evidence remains green; prompt assertions make no model call; boundary review finds no new tool/consumer, architecture/shared-interface edit, registry/backend/approval/cache, speculative configuration, relevance push, embeddings, W3, or W4/dead code. Final `git status` for this task shows no changes outside `domains/main/prompts/cosmo.md`, `tests/domains/main-domain.test.ts`, and `docs/memory.md` — in particular `fallow.toml`, `domains/main/agents/cosmo.ts`, CLI code, architecture-map code, and coding-agent definitions stay untouched.
<!-- AC:END -->
