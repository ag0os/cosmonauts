---
id: TASK-479
title: Freeze detached child identity and preserve disabled Drive parity
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:episodic-log'
dependencies:
  - TASK-471
  - TASK-478
createdAt: '2026-07-17T20:08:30.494Z'
updatedAt: '2026-07-17T20:08:30.494Z'
---

## Description

Implementation Order step 7 detached-child and off-parity branch. Carry enabled-only source/attempt identity through Pi/CLI launch specs into the compiled `run-step`, while preserving every disabled inline/detached baseline. This task solely owns B-018 and B-028. It depends on the common Drive identity/completion contract and precedes the parent-abort checkpoint.

<!-- AC:BEGIN -->
- [ ] #1 B-018 (Sources AC-002 and AC-006) is proven with `@cosmo-behavior plan:episodic-log#B-018`: enabled Codex/Claude detached specs carry the frozen qualified source, run, and attempt identity used by the compiled child, whose episode result and content-derived terminal identity match the worker actually executed under default, `main`, and project/live `coding` bindings without child-side runtime resolution.
- [ ] #2 B-028 (Source AC-001) is proven with `@cosmo-behavior plan:episodic-log#B-028`: absent/false config across Pi/CLI inline and detached launch serializes no episode source/attempt metadata, keeps detached runtime resolution uncalled, preserves result/completion/events/spec bytes, and creates zero project/user episode or induced index files.
- [ ] #3 Enabled launch freezes the already execution-resolved worker identity without duplicating resolution; inability to obtain that exact identity is a stop-and-revise condition, while resolution failure remains a visible non-fatal skip with no generic fallback actor.
- [ ] #4 Detached completion/spec/graph/event artifacts remain existing behavior, and terminal identity uses in-content `completedAt` plus frozen ids/outcome rather than completion-file mtime across `runDriveOnGraph`, `run-step`, and driver-tool settle rewrites.
- [ ] #5 The compiled child loads no runtime/config actor resolution, and disabled detached behavior remains byte-identical and OFF by default.
- [ ] #6 Targeted tests catch disabled metadata drift, accidental runtime creation, actor mismatch under bindings, mtime-derived identity, and duplicate terminal rendering.
<!-- AC:END -->
