---
id: TASK-077
title: '[R1-F1] Wire domain workflow defaults into CLI workflow resolution'
status: Done
priority: high
assignee: worker
labels:
  - review-fix
  - 'review-round:1'
  - architecture
  - domains
  - cli
  - workflows
dependencies: []
createdAt: '2026-03-09T17:55:46.283Z'
updatedAt: '2026-03-09T17:59:43.605Z'
---

## Description

Reviewer finding R1-F1: CLI does not pass discovered domain workflows into workflow listing/resolution, so domain defaults are ignored unless duplicated in .cosmonauts/config.json. Fix workflow aggregation and resolution paths in CLI.

<!-- AC:BEGIN -->
- [x] #1 cli/main.ts builds a domain workflow set from discovered domains before workflow operations.
- [x] #2 `--list-workflows` includes domain defaults when `.cosmonauts/config.json` has no workflows.
- [x] #3 `--workflow <name>` resolves domain-provided workflows without requiring project config entries.
- [x] #4 Project config workflows override domain workflows on name collisions.
- [x] #5 Tests cover CLI workflow resolution with and without project-config overrides.
<!-- AC:END -->

## Implementation Notes

Fix was minimal — the workflow loader already accepted optional `domainWorkflows` parameter, but `cli/main.ts` never passed it. Added 3 lines to aggregate domain workflows via `domains.flatMap(d => d.workflows)` and pass them to `listWorkflows()` and `resolveWorkflow()`. Added 8 tests in `tests/cli/workflow-resolution.test.ts` covering: domain defaults without config, resolve without config, override on collision, additive merging, and multi-domain aggregation.
