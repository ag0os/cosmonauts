---
id: COSMO-048
title: Create example config and remove built-in default workflows
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:local-vs-shared'
dependencies:
  - COSMO-046
createdAt: '2026-03-06T14:49:18.836Z'
updatedAt: '2026-03-06T14:59:02.793Z'
---

## Description

Create `.cosmonauts/config.example.json` as the canonical source of workflow definitions. Then remove the built-in defaults from `lib/workflows/defaults.ts` by setting `DEFAULT_WORKFLOWS` to an empty array. The example config becomes the only place workflows are defined — users copy it to `.cosmonauts/config.json` and customize.

**New file:** `.cosmonauts/config.example.json`
```json
{
  "skills": ["typescript"],
  "workflows": {
    "plan-and-build": {
      "description": "Full pipeline: design, create tasks, implement, and run merge-readiness quality gates",
      "chain": "planner -> task-manager -> coordinator -> quality-manager"
    },
    "implement": {
      "description": "Create tasks from existing plan, implement, and run merge-readiness quality gates",
      "chain": "task-manager -> coordinator -> quality-manager"
    },
    "verify": {
      "description": "Run lint/format checks, clean-context review, and remediation on existing changes",
      "chain": "quality-manager"
    }
  }
}
```

**Modify:** `lib/workflows/defaults.ts` — set `DEFAULT_WORKFLOWS` to `[]` (empty array). Keep the export and type import so downstream code doesn't break structurally.

This means:
- `loadWorkflows()` with no config file returns an empty array
- `loadWorkflows()` with a config file returns only what's defined there
- `resolveWorkflow()` with no config file throws for any name
- The example config file is tracked in git (unlike `.cosmonauts/config.json` which is gitignored)

Acceptance Criteria:
  [x] #1 .cosmonauts/config.example.json exists with the exact JSON content specified (skills, workflows with plan-and-build, implement, verify)
  [x] #2 `DEFAULT_WORKFLOWS` in `lib/workflows/defaults.ts` is an empty array
  [x] #3 `loadWorkflows()` returns an empty array when no project config exists
  [x] #4 The example config file is NOT in `.gitignore` (it should be tracked)

<!-- AC:BEGIN -->
- [ ] #1 .cosmonauts/config.example.json exists with the exact JSON content specified (skills, workflows with plan-and-build, implement, verify)
- [ ] #2 `DEFAULT_WORKFLOWS` in `lib/workflows/defaults.ts` is an empty array
- [ ] #3 `loadWorkflows()` returns an empty array when no project config exists
- [ ] #4 The example config file is NOT in `.gitignore` (it should be tracked)
<!-- AC:END -->

## Implementation Notes

Verified all 4 ACs:
1. `.cosmonauts/config.example.json` matches the exact specified JSON content
2. `DEFAULT_WORKFLOWS` is `[]` in `lib/workflows/defaults.ts`
3. Test "returns empty array when no config file exists" passes — all 10 workflow-loader tests pass
4. `.gitignore` uses `.cosmonauts/*` with `!.cosmonauts/config.example.json` exception, so the example is tracked
