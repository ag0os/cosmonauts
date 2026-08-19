---
id: TASK-561
title: 'Stage 4: Compose recall and the bounded combined context'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:knowledge-surface'
dependencies:
  - TASK-560
createdAt: '2026-08-19T18:35:23.046Z'
updatedAt: '2026-08-19T18:35:23.046Z'
---

## Description

Deliver Slice A Stage 4 and own B-006 and B-007. Compose knowledge, authorized authored memory, and authorized architecture through one domain-neutral retrieval combiner and one provider-visible allocation path. Tests must be observed RED before implementation, then GREEN, followed by refactoring to one combiner, allocator, and enabled context handler.

The D-010/D-015 boundary is fixed ground: all dedicated/framework knowledge paths depend inward on `MemoryStore`; every Cosmonauts-assembled enabled agent can read knowledge; existing authored-memory and architecture authority must not widen; generic project tools and external backends remain trusted, human-supervised, git-reviewed, and unsandboxed. D-028’s profile pin is required. Preserve OKF-only/proposals-only authority and all exclusions: no consolidation, working state, episode/explicit-save changes, embeddings, retention, cache, sandbox, or default enablement. Any collision with these ratified constraints must halt and escalate.

<!-- AC:BEGIN -->
- [ ] #1 B-006 is GREEN: framework index/recall and distinct proposal operations use `MemoryStore`; authorized `remember` separately writes ordinary notes/profiles/playbooks through `MemoryStore.write`, authored-memory recall is limited to `main/cosmo`, architecture access remains limited to the existing five-agent set, and synthetic ineligible wrapper users trigger no guarded-store call or legacy context.
- [ ] #2 The shared retrieval combiner preserves D-028 by prepending matching profiles outside the visible limit; a negative with more newer matching knowledge records than the limit still returns the matching profile, while ordinary knowledge and memory records compete under the limit.
- [ ] #3 B-007 is GREEN for populated and empty stores: one inline handler allocates memory, architecture, and knowledge within 24,000 UTF-8 bytes including framing/notices, fairly redistributes unused shares, preserves every non-empty surface, includes at most 50 metadata-only knowledge rows, directs detail reads to the proper tool, and emits no empty message/heading/warning.
- [ ] #4 Provider-message details expose per-section and aggregate wall-time scan statistics, recall preserves stats without provider text, and unauthorized sections are neither scanned nor represented.
- [ ] #5 One domain-neutral combiner sorts/applies the visible limit once, one pure allocator performs UTF-8 truncation/final clamping, pure legacy renderers feed one combined context composer, and adapters perform no direct knowledge IO; `lib/memory/` remains Pi/config/domain independent and no independent enabled handler or correctness cache appears.
- [ ] #6 The documented trust seam touched by B-006 states that generic Pi project tools and Codex/Claude Drive backends are human-supervised, git-reviewed, and deliberately not sandboxed, without claiming disabled tools, path guards, or enabled bare-host support.
- [ ] #7 Executable tests for B-006 and B-007 carry the exact `@cosmo-behavior plan:knowledge-surface#B-###` markers, are run RED before implementation and GREEN after refactor, and include budget/discoverability/empty, authorization/no-store-call, distinct `remember`, proposal-path, direct-IO, and profile-pin mutation-style negatives.
- [ ] #8 B-005's knowledge-reaching leg is closed here: the framework `recall` registered by TASK-559 now returns knowledge records through the shared combiner in eligible sessions, and the full B-005 test (including retrieval reaching knowledge) is re-run GREEN at this position.
<!-- AC:END -->
