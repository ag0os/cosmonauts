# TDD Workflow Design Plan

## Summary

Add a `tdd` workflow to the coding domain that enforces the Red-Green-Refactor cycle using three phase-specific workers. Each TDD phase (Red, Green, Refactor) gets its own agent with tight constraints, making it impossible to blur phase boundaries. A `tdd-coordinator` orchestrates the cycle per task, spawning each phase worker in sequence.

## Why Phase-Specific Workers

A single TDD worker trying to juggle all three phases can easily blur boundaries — writing code while still in the "test" phase, or refactoring while making tests pass. Separate agents enforce discipline through their identity:

- **`test-writer`** (RED) — has no prompt or incentive to write production code
- **`implementer`** (GREEN) — has no prompt or incentive to write tests or refactor
- **`refactorer`** (REFACTOR) — has no prompt or incentive to add behavior

Each agent's persona prompt makes its phase boundary explicit and non-negotiable.

## Design

### Chain

```
tdd: "tdd-planner -> task-manager -> tdd-coordinator -> quality-manager"
```

### New Agents (5)

| Agent | Phase | Description |
|-------|-------|-------------|
| `tdd-planner` | Planning | Designs behaviors and test cases, not implementation files |
| `tdd-coordinator` | Orchestration | Runs RED→GREEN→REFACTOR cycle per task |
| `test-writer` | RED | Writes failing tests that capture acceptance criteria |
| `implementer` | GREEN | Writes minimum code to pass failing tests |
| `refactorer` | REFACTOR | Improves structure, keeps all tests green |

### New Skills (2)

| Skill | Purpose |
|-------|---------|
| `tdd` | Red-Green-Refactor methodology, phase rules, anti-patterns |
| `refactoring` | Refactoring techniques (extract, rename, inline, simplify) |

### Reused Unchanged (5 agents)

- `task-manager` — breaks plans into tasks regardless of methodology
- `quality-manager` — runs quality gates, review, and remediation
- `reviewer` — clean-context code review
- `fixer` — applies targeted fixes
- Chain runner — executes the pipeline (added default stage prompts for new roles)

## Files Created

| File | Purpose |
|------|---------|
| `domains/coding/agents/tdd-planner.ts` | Agent definition — behavior-driven planning |
| `domains/coding/agents/test-writer.ts` | Agent definition — RED phase |
| `domains/coding/agents/implementer.ts` | Agent definition — GREEN phase |
| `domains/coding/agents/refactorer.ts` | Agent definition — REFACTOR phase |
| `domains/coding/agents/tdd-coordinator.ts` | Agent definition — cycle orchestration |
| `domains/coding/prompts/tdd-planner.md` | Persona — thinks in behaviors, not files |
| `domains/coding/prompts/test-writer.md` | Persona — writes failing tests only |
| `domains/coding/prompts/implementer.md` | Persona — minimum code to pass tests |
| `domains/coding/prompts/refactorer.md` | Persona — improves structure, no behavior changes |
| `domains/coding/prompts/tdd-coordinator.md` | Persona — RED→GREEN→REFACTOR orchestration |
| `domains/coding/skills/tdd/SKILL.md` | TDD methodology and discipline |
| `domains/coding/skills/refactoring/SKILL.md` | Refactoring techniques and patterns |

## Files Modified

| File | Change |
|------|--------|
| `domains/coding/workflows.ts` | Added `tdd` workflow definition |
| `lib/orchestration/chain-runner.ts` | Added default stage prompts for 5 new agent roles |

## How the TDD Cycle Works Per Task

```
tdd-coordinator picks up task "COSMO-007: Add input validation"
  │
  ├─ Phase 1: RED
  │   spawn test-writer with full task details
  │   → writes failing tests for each AC
  │   → commits: "COSMO-007: Write failing tests for input validation"
  │
  ├─ Phase 2: GREEN
  │   spawn implementer with task + test-writer's notes
  │   → reads failing tests, writes minimum code to pass
  │   → commits: "COSMO-007: Implement input validation to pass tests"
  │
  └─ Phase 3: REFACTOR
      spawn refactorer with task + all previous notes
      → improves structure, all tests stay green
      → commits: "COSMO-007: Refactor input validation"
      → task marked Done
```

## Usage

```bash
cosmonauts --workflow tdd "implement user authentication"
# or
cosmonauts --chain "tdd-planner -> task-manager -> tdd-coordinator -> quality-manager" "add validation"
```
