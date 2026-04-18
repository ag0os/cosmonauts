---
id: TASK-064
title: Update workflow loader to merge domain-sourced workflows
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:domain-config'
dependencies:
  - TASK-059
createdAt: '2026-03-09T16:04:06.868Z'
updatedAt: '2026-03-09T18:32:00.000Z'
---

## Description

Update `lib/workflows/loader.ts` to merge workflows from domain `workflows.ts` files with project config workflows.

**Changes:**
- `loadWorkflows` accepts a `DomainRegistry` parameter in addition to `projectRoot`
- Domain workflows are collected from all loaded domains' `workflows.ts` exports
- Project config workflows take precedence on name collision
- Unqualified agent names in domain workflows resolve against that domain
- Unqualified names in project config workflows resolve against the default domain

**Also:**
- Create `domains/coding/workflows.ts` exporting the default coding domain workflows (implement, plan-implement, etc.)
- Create `domains/shared/workflows.ts` (empty/minimal, no workflows initially)

**Reference:** Plan section "Workflow resolution". Current loader at `lib/workflows/loader.ts`.

<!-- AC:BEGIN -->
- [x] #1 loadWorkflows accepts a DomainRegistry and merges domain workflows with project config workflows
- [x] #2 Project config workflows take precedence over domain workflows on name collision
- [x] #3 domains/coding/workflows.ts exports default coding workflow definitions
- [x] #4 domains/shared/workflows.ts exists (can be empty/minimal)
- [x] #5 resolveWorkflow works with both domain and project config workflows
- [x] #6 Workflow loader tests verify merging behavior and precedence rules
<!-- AC:END -->

## Implementation Notes

- Added optional `domainWorkflows?: WorkflowDefinition[]` parameter to `loadWorkflows`, `resolveWorkflow`, and `listWorkflows`
- Uses a `Map<string, WorkflowDefinition>` to merge: domain workflows inserted first, then project config overwrites on collision
- Existing callers unaffected since the parameter is optional (backward compatible)
- Created `domains/coding/workflows.ts` with three standard workflows: plan-and-build, implement, verify
- Created `domains/shared/workflows.ts` with empty array (no shared workflows)
- Domain loader already discovers and loads `workflows.ts` files from domains
- Added 5 new tests covering merge, precedence, domain-only, resolveWorkflow, and listWorkflows with domain workflows
