# TDD Workflow Design Plan

## Summary

Add a `tdd` workflow to the coding domain that follows the Red-Green-Refactor cycle. Two new agents (`tdd-planner`, `tdd-worker`) enforce test-first development, while existing agents (`task-manager`, `coordinator`, `quality-manager`) are reused unchanged. A new `tdd` skill provides shared methodology knowledge.

## Why New Agents Instead of Skills Alone

The existing `planner` thinks in terms of files-to-change and implementation approach. TDD requires thinking in terms of **behaviors and test cases first**. Similarly, the existing `worker` implements code then optionally writes tests. A TDD worker must follow a strict Red-Green-Refactor cycle: write failing test → write minimal code → refactor. These are fundamentally different workflows that warrant dedicated personas, not just skill overlays.

## Design

### Chain

```
tdd: "tdd-planner -> task-manager -> coordinator -> quality-manager"
```

The `task-manager` and `coordinator` work unchanged — they already handle generic tasks. The `quality-manager` already verifies tests pass and code quality. The TDD-specific behavior lives entirely in:

1. **`tdd-planner`** — the plan output is structured around behaviors and expected test cases rather than implementation files
2. **`tdd-worker`** — the coordinator spawns this instead of `worker` for TDD tasks

### New Agent: `tdd-planner`

**Definition** (`domains/coding/agents/tdd-planner.ts`):
- `id`: `"tdd-planner"`
- `capabilities`: `["core", "coding-readonly", "spawning"]` (same as planner — read-only exploration)
- `model`: `"anthropic/claude-opus-4-6"`
- `tools`: `"readonly"`
- `extensions`: `["plans", "orchestration"]`
- `skills`: `["pi", "plan", "tdd"]`
- `loop`: `false`
- `thinkingLevel`: `"high"`

**Persona prompt** (`domains/coding/prompts/tdd-planner.md`):

The TDD planner's key differences from the regular planner:
- **Thinks in behaviors, not files.** The plan describes what the system should DO, expressed as testable behaviors, not which files to create/modify.
- **Plan output includes a "Behaviors" section** listing each behavior with its expected test cases (inputs, expected outputs, edge cases).
- **Implementation Order is test-first.** Each step is "Test: [behavior] → Implement: [make it pass]".
- **Files to Change still exists** but is organized as test file + source file pairs.
- Shares the same critical rules as the regular planner (never writes code, never creates tasks, be specific).

### New Agent: `tdd-worker`

**Definition** (`domains/coding/agents/tdd-worker.ts`):
- `id`: `"tdd-worker"`
- `capabilities`: `["core", "coding-readwrite", "tasks"]` (same as worker — full coding access)
- `model`: `"anthropic/claude-opus-4-6"`
- `tools`: `"coding"`
- `extensions`: `["tasks"]`
- `skills`: `undefined` (all skills available)
- `loop`: `false`

**Persona prompt** (`domains/coding/prompts/tdd-worker.md`):

The TDD worker follows a strict per-AC cycle:

1. **Read the task** (same as worker)
2. **Claim the task** (same as worker)
3. **Load skills** — always loads `tdd` skill plus relevant project skills
4. **Explore before you edit** (same as worker)
5. **For each acceptance criterion, follow Red-Green-Refactor:**
   - **RED**: Write a failing test that captures the AC's behavior. Run the test suite — confirm it fails for the right reason (not a syntax error or import error, but an actual assertion failure or missing implementation).
   - **GREEN**: Write the minimum code to make the test pass. No more. Run the test suite — confirm the new test passes AND all existing tests still pass.
   - **REFACTOR**: Look at the code just written. Remove duplication, improve naming, simplify. Run tests again — confirm nothing broke.
   - **Check off the AC** via `task_edit`.
6. **Commit** — single commit per task with `COSMO-XXX: ...` format
7. **Mark Done**

Critical rules (additions to worker rules):
- **Never write production code without a failing test first.** If you catch yourself writing code before a test, stop and write the test.
- **Never write more test than necessary to fail.** One behavior per test function.
- **Never write more code than necessary to pass.** Resist the urge to generalize prematurely.
- **Tests are first-class code.** They follow project conventions, use descriptive names, and are kept clean during refactor.

### New Skill: `tdd`

**Location**: `domains/coding/skills/tdd/SKILL.md`

Content covers:
- The Red-Green-Refactor cycle (operational, not theoretical)
- How to write a good failing test (assert the behavior, not the implementation)
- How to write minimal passing code (hardcode first if that's all that's needed)
- When and how to refactor (remove duplication, extract abstractions only when the pattern is clear from 3+ instances)
- Common TDD anti-patterns to avoid:
  - Writing the test and implementation together
  - Writing tests that test implementation details (mock-heavy, brittle)
  - Skipping the refactor step
  - Making tests pass by weakening assertions
- How to handle existing code (write a characterization test first, then refactor)

### Coordinator → TDD Worker Routing

The existing `coordinator` spawns `"worker"` by default. For the TDD workflow, it needs to spawn `"tdd-worker"` instead. Two options:

**Option A (Recommended): Update coordinator's subagents list for TDD context.**
The `tdd-planner` can instruct the task-manager to add a `tdd` label to all tasks. Then the coordinator's prompt (injected via `buildStagePrompt` override in the workflow) tells it to spawn `tdd-worker` for tasks labeled `tdd`. This requires no code changes to the coordinator agent — just a prompt overlay.

However, looking at the chain runner, the coordinator's `subagents` allowlist controls which agents it CAN spawn. The existing coordinator only allows `["worker"]`. So the cleanest approach is:

**Option B: Create a `tdd-coordinator` that allows `["tdd-worker"]`.**
This is a thin wrapper — same definition as coordinator but with `subagents: ["tdd-worker"]`. Its persona prompt is identical to the coordinator's but references `tdd-worker` instead of `worker`.

I recommend **Option B** because it requires no changes to existing agents and keeps the TDD workflow self-contained.

### New Agent: `tdd-coordinator`

**Definition** (`domains/coding/agents/tdd-coordinator.ts`):
- Same as `coordinator` but `subagents: ["tdd-worker"]`
- Same capabilities, model, tools, extensions, loop behavior

**Persona prompt** (`domains/coding/prompts/tdd-coordinator.md`):
- Same content as `coordinator.md` but referencing `tdd-worker` role in spawn calls.

### Updated Chain

```
tdd: "tdd-planner -> task-manager -> tdd-coordinator -> quality-manager"
```

### Workflow Registration

Add to `domains/coding/workflows.ts`:

```typescript
{
    name: "tdd",
    description: "Test-driven development: design behaviors, write failing tests first, then implement",
    chain: "tdd-planner -> task-manager -> tdd-coordinator -> quality-manager",
},
```

## Files to Create

| File | Purpose |
|------|---------|
| `domains/coding/agents/tdd-planner.ts` | Agent definition |
| `domains/coding/agents/tdd-worker.ts` | Agent definition |
| `domains/coding/agents/tdd-coordinator.ts` | Agent definition |
| `domains/coding/prompts/tdd-planner.md` | Persona prompt |
| `domains/coding/prompts/tdd-worker.md` | Persona prompt |
| `domains/coding/prompts/tdd-coordinator.md` | Persona prompt |
| `domains/coding/skills/tdd/SKILL.md` | TDD methodology skill |

## Files to Modify

| File | Change |
|------|--------|
| `domains/coding/workflows.ts` | Add `tdd` workflow definition |

## What We Reuse Unchanged

- **`task-manager`** — breaks plans into tasks regardless of methodology
- **`quality-manager`** — runs quality gates, review, and remediation
- **`reviewer`** — clean-context code review
- **`fixer`** — applies targeted fixes
- **Chain runner** — executes the pipeline, no changes needed
- **Task system** — tasks are tasks, TDD or not
- **All capabilities** — `core`, `coding-readonly`, `coding-readwrite`, `tasks`, `spawning`
- **Domain loader** — auto-discovers new agent files

## Usage

```bash
cosmonauts --workflow tdd "implement user authentication"
# or
cosmonauts --chain "tdd-planner -> task-manager -> tdd-coordinator -> quality-manager" "add validation"
```
