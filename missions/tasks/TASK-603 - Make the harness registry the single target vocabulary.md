---
id: TASK-603
title: Make the harness registry the single target vocabulary
status: To Do
priority: medium
labels:
  - backend
  - testing
  - review-fix
  - 'review-round:1'
  - 'plan:harness-adapters'
dependencies: []
createdAt: '2026-08-26T12:28:33.706Z'
updatedAt: '2026-08-26T12:29:09.960Z'
---

## Description

Codex review finding 5 (Medium), and the open coordinator note N-1. INV-005 requires ONE harness registry and Design section 2 explicitly states "The runtime TARGETS set in lib/agent-packages/definition.ts is removed; schema syntax is not a resolution registry." That set still exists at definition.ts:34, and provenance.ts plus sync.ts independently hard-code the "claude"/"codex" literals in their JSON schema guards, so adding a registry target still requires editing several consumers.

The fix must satisfy BOTH INV-005 and D-005 simultaneously. D-005 warns that validating parsed blocks against SUPPORTED registry entries would break the pinned future-block parser test, and B-002 AC #2 requires invalid target keys to still fail parsing. The resolution is one registry exposing TWO views: a parse vocabulary (every known definition key, including deliberately-unsupported `gemini-cli` and `open-code`) and a supported-target set (implemented targets only). Parsing consults the vocabulary view; selection consults the supported view. Do NOT make parsing reject future blocks, and do NOT change any serialized package label, package id suffix, or CLI error string.

<!-- AC:BEGIN -->
- [ ] #1 INV-005: the definition-local `TARGETS` set is gone; agent-package parsing derives its accepted target-key vocabulary from the harness registry.
- [ ] #2 B-002 preserved: `claude`, `claude-cli`, `codex`, `gemini-cli`, and `open-code` blocks still parse and retain exact options; an unknown key still fails with the existing enumerated error message; parser acceptance still implies nothing about runtime support.
- [ ] #3 B-003 preserved: selection still resolves only through registry support metadata, `claude-cli` serialization, package id suffix, builder dispatch, and the `claude-cli, codex` unsupported-target error text are byte-unchanged.
- [ ] #4 Provenance and journal schema guards validate target identity against the registry rather than hard-coded `"claude"`/`"codex"` literals, so a new registry target needs no consumer edits.
- [ ] #5 A test asserts that adding a target to the registry requires no change in lib/agent-packages, lib/harness-adapters/provenance.ts, or the journal parser.
- [ ] #6 Existing B-001/B-002/B-003 tests pass under their existing titles and markers; no new behavior marker is added.
<!-- AC:END -->

## Implementation Notes

Quality Manager accepted as INV-005 structural conformance remediation. Avoid circular imports: registry may expose pure vocabulary/identity predicates; parser support and implemented materialization support remain separate views per D-005.
