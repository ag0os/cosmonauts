---
id: TASK-286
title: 'Plan 3: Write lib/driver/README.md and update AGENTS.md'
status: Done
priority: low
labels:
  - devops
  - 'plan:external-backends-and-cli'
dependencies:
  - TASK-274
createdAt: '2026-05-04T20:22:16.149Z'
updatedAt: '2026-05-05T15:39:01.880Z'
---

## Description

Implements Implementation Order step 15.

Create `lib/driver/README.md` documenting the Backend interface and adapter authoring guide. Update `AGENTS.md` to mention `cosmonauts drive`.

No code changes required — documentation only.

<!-- AC:BEGIN -->
- [ ] #1 lib/driver/README.md documents the Backend interface contract: required fields (name, capabilities, run) and optional field (livenessCheck).
- [ ] #2 README includes a ~30-line adapter authoring guide with a minimal working backend implementation example.
- [ ] #3 README lists supported backends (codex, claude-cli) and documents excluded backends (gemini-cli, qwen, generic shell) as future work per the plan Scope section.
- [ ] #4 AGENTS.md mentions cosmonauts drive as the CLI verb for driver runs, with a one-line description of inline vs. detached mode.
<!-- AC:END -->

## Implementation Notes

Created lib/driver/README.md documenting Backend contract, adapter authoring guide, supported backends, future/excluded backends, and compile:drive-step dev-time note. Updated AGENTS.md with cosmonauts drive CLI description. Verified lint and required doc strings.
