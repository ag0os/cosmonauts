---
name: tdd
description: Test-Driven Development discipline. The Red-Green-Refactor loop one agent runs while implementing a task, writing failing tests first, minimal implementations, and characterization tests before refactoring. Use when implementing behavior test-first, or before restructuring code that lacks coverage. Do NOT load when adding tests after implementation for unrelated reasons — use the engineering-principles testing section instead.
---

# Test-Driven Development (TDD)

TDD is a development discipline you apply while implementing a task: write a failing test before writing production code, write the minimum code to pass, then refactor — and repeat for the next behavior. Every line of production code exists because a test demanded it.

This is a thinking loop one agent runs, not a handoff between agents. If you're implementing a behavior-driven plan, the plan's behaviors are your test targets — work through them one at a time, running the full loop for each before moving on. Don't batch the tests at the end; the per-behavior cycle is what keeps the implementation honest.

## The Red-Green-Refactor Loop

For each behavior you implement, run three steps in order, then move to the next behavior.

### RED — Write a Failing Test

Write one test that describes a single behavior you want. Run it. Watch it fail.

Rules:
- **Write only one test.** Not a test suite, not multiple assertions for different behaviors. One test, one behavior.
- **The test must fail for the right reason.** A missing function import is not a valid failure — that is a compile error, not the behavior being absent. The test should fail because the behavior does not exist yet (assertion failure, missing return value, wrong output). If it fails on a typo, missing import, or environment issue, fix the setup and run it again until the only thing missing is the behavior.
- **Assert the behavior, not the implementation.** Test what the function returns or what side effect occurs, not how it does it internally.
- **Name the test after the behavior.** `"returns empty array when no tasks match filter"`, not `"test filter"`.

What a good failing test looks like:
- It compiles and runs (imports resolve, types check).
- The assertion fails because the expected behavior is not implemented.
- Reading the test tells you exactly what the code should do.

What a bad failing test looks like:
- It fails to compile (import error, type error). Fix the setup first.
- It fails on something unrelated to the behavior (configuration, environment).
- It tests implementation details (calls a specific private method, checks mock call counts for non-behavioral reasons).

### GREEN — Make It Pass

Write the minimum production code to make the failing test pass. Nothing more.

Rules:
- **Do the simplest thing that works.** If a hardcoded return value passes the test, that is valid. The next test will force you to generalize.
- **Do not write code for behaviors that no test requires.** No "while I am here" additions. No error handling for cases no test exercises. No abstractions no test demands.
- **Run the full test suite.** Your new code must pass the new test AND all existing tests. If an existing test breaks, fix that before proceeding.
- **Do not refactor yet.** The code can be ugly. It just needs to be correct.

### REFACTOR — Clean Up Before Moving On

With all tests green, improve the code structure without changing behavior — then go on to the next behavior.

Rules:
- **Tests must stay green.** Run them after every change. If a test fails, undo the last change.
- **Refactor both production code and tests.** Tests are code too. Remove duplication, improve naming, extract helpers.
- **Do not add behavior.** Refactoring changes structure, not behavior. If you want new behavior, go back to RED with a new test.
- **Small steps.** Each refactoring should be a single, easily reversible change. Do not combine three refactorings into one.
- **Don't skip it.** The loop is Red-Green-Refactor, not Red-Green-Red-Green. Cleaning up after each behavior keeps the codebase from accumulating debt across the task.

## Characterization Tests Before Refactoring

When you're about to restructure code that has thin or no coverage, write characterization tests first. These capture the current observable behavior exactly as it is — including quirks and warts — so you have a guardrail that fails the moment your restructuring changes something. They are a safety net, not a redesign: don't "fix" the behavior while writing them. Once they're green and pinned down, refactor with confidence.

## Recognizing Loop Violations

You are off the loop if:

- **In RED**: You are writing production code. Stop. Write the test first.
- **In RED**: You are writing multiple tests at once. Stop. One test at a time.
- **In GREEN**: You are adding code that no failing test requires. Stop. That code has no test coverage and no proven need.
- **In GREEN**: You are refactoring while making the test pass. Stop. Get to green first, then refactor.
- **In REFACTOR**: You are adding new assertions or tests. Stop. That is a new RED step — start the loop over for that behavior.
- **In REFACTOR**: A test is failing. Stop. Undo the last change and try a smaller refactoring step.

## Test Design Principles

### Test behavior, not implementation

```
// Good: tests what the function does
"returns sorted tasks with highest priority first"

// Bad: tests how it does it
"calls Array.sort with priority comparator"
```

### One assertion of intent per test

Multiple `expect` calls in one test are fine if they verify the same behavior from different angles. Split into separate tests if they verify independent behaviors. Each test should pin down exactly one piece of intent.

### Use descriptive names

The test name should read as a specification:
- `"creates task with default status To Do when no status provided"`
- `"throws ValidationError when title exceeds 200 characters"`
- `"returns empty array when directory contains no task files"`

### Isolate each test

Each test starts with clean state. No test depends on another test having run first. Use `beforeEach` for shared setup, not shared mutable state.

## Common TDD Anti-Patterns

### Writing test and implementation together
You write the test, then immediately write the implementation without running the test first. You never see it fail. This means you do not know if the test actually tests what you think it does.

### Testing implementation details
Mocking internal collaborators, asserting call counts on private methods, testing the sequence of internal operations. These tests break when you refactor even though behavior is unchanged.

### Gold-plating in GREEN
Writing more code than the test requires. "I know I will need this later." You don't know that. Write the test that proves you need it, then write the code.

### Skipping REFACTOR
The cycle is Red-Green-Refactor, not Red-Green-Red-Green-Red-Green. Skipping refactoring accumulates technical debt. Each cycle includes cleanup.

### Making tests pass by weakening assertions
If a test is hard to pass, the solution is better code, not a weaker test. Never change `toEqual(expected)` to `toBeDefined()` to make a test pass.

## When to Stop a TDD Session

Stop the Red-Green-Refactor loop when:
- All acceptance criteria for the current task have corresponding passing tests.
- The refactoring step produces no further improvements.
- The code is clean, well-named, and readable.

Do not keep adding tests speculatively. Every test should trace back to a required behavior.

## Related Skills

- `/skill:engineering-principles` — Testing principles (behavior not implementation, mock boundaries, testing as design feedback) and design guidance for the code you're building
- `/skill:refactoring` — Refactoring techniques applied during the REFACTOR step and in dedicated refactoring tasks
