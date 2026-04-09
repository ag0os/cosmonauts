---
name: refactoring
description: Code refactoring techniques and discipline. When to refactor, what patterns to apply, and how to keep tests green throughout. Use when simplifying conditionals, extracting functions, removing duplication, cleaning up code structure, or when asked to "clean up" or "refactor" code. Do NOT load for new feature implementation or bug fixes that don't involve restructuring.
---

# Refactoring

Refactoring changes the structure of code without changing its behavior. The test suite is your proof that behavior is preserved — if tests pass before and after, the refactoring is correct.

## When to Refactor

Refactor when you see a clear structural problem in code that already works and has passing tests. Do not refactor speculatively, and do not refactor code that is not covered by tests (write tests first).

Trigger refactoring when you see structural problems, but prioritize by real-world cost, not textbook severity:

- **Fix now**: Code that causes bugs across the team, blocks feature work, or sits in a file that appears in >30% of recent commits.
- **Fix soon**: Duplication across 3+ call sites, functions that require 20+ lines of test setup, logic scattered across 4+ files for one concept.
- **Leave alone**: One-off long parameter lists, single naming nitpicks, style inconsistencies in stable code nobody edits.

Common smells, in rough priority order:
- **Duplication** — the same logic appears in two or more places
- **Poor naming** — a variable, function, or type name does not describe what it represents
- **Long functions** — a function does more than one thing and is hard to follow
- **Deep nesting** — multiple levels of conditionals or loops that obscure the logic
- **Primitive obsession** — raw strings or numbers used where a named type would add clarity
- **Dead code** — unused imports, variables, functions, or branches

A working codebase the team understands beats a theoretically perfect one.

Do NOT refactor when:
- Tests are failing (fix the tests first)
- You are in the middle of implementing a new behavior (finish the behavior first)
- The code is "not how I would write it" but works correctly and is readable
- The refactoring would change public API contracts without corresponding test updates

## Core Techniques

### Extract Function

When a block of code inside a function does one coherent thing, extract it:

```
Before: one function with inline validation, transformation, and persistence
After:  three focused functions called in sequence
```

Extract when: the block has a clear purpose you can name, and extracting it makes the calling function read like a high-level description of the workflow.

Do not extract when: the block is only two or three lines and the extraction just adds indirection without improving readability.

### Inline Function

The reverse of extract. When a function is called in only one place and its body is as clear as its name, inline it.

### Rename

Change a name to better describe what the thing represents. This is the most common and most valuable refactoring. A good name eliminates the need for comments.

Apply to: variables, functions, parameters, types, files, directories. Rename everywhere the symbol is used — use your editor or search tools to find all references.

### Extract Variable

When an expression is complex or its purpose is not obvious, assign it to a well-named variable:

```
Before: if (user.createdAt > cutoffDate && user.role !== "admin" && !user.suspended)
After:  const isRecentNonAdminActiveUser = user.createdAt > cutoffDate && user.role !== "admin" && !user.suspended;
        if (isRecentNonAdminActiveUser)
```

### Replace Conditional with Guard Clause

When a function has deeply nested conditionals, flatten by returning early for edge cases:

```
Before: if (input) { if (input.valid) { ...main logic... } else { return error; } } else { return null; }
After:  if (!input) return null;
        if (!input.valid) return error;
        ...main logic...
```

### Choosing the Right Technique

Apply the simplest pattern that resolves the smell. Escalate only when specific criteria are met:

- **Extract function** is the default. Escalate to a method object or dedicated class only when: 4+ interacting local variables, would need 3+ params passed between extracted pieces, or the logic warrants its own test suite.
- **Keep logic inline** is the default. Extract to a separate module or class only when: 2+ call sites need it, it has its own state, or it is independently testable and worth testing alone.
- **A simple conditional is fine.** Escalate to polymorphism or pattern matching only when the same type/status dispatch appears in 3+ places.

If you cannot articulate why the heavier pattern is necessary, use the lighter one.

### Remove Duplication

When you see the same pattern in two or more places:

1. Confirm the duplicated code really does the same thing (not just looks similar).
2. Extract the shared logic into a function, type, or constant.
3. Replace all occurrences with calls to the shared abstraction.
4. Run tests after each replacement, not just at the end.

Important: do not extract a shared abstraction from a single occurrence. Wait until you have two or three concrete instances to see the real pattern. Premature abstraction is worse than duplication.

Same code is not always real duplication. If two blocks look identical but would change for different reasons, leave them separate — they are coincidentally similar, not truly duplicated. When duplication is real, extract it. But do not DRY across module or service boundaries just to eliminate surface similarity — the coupling you create is worse than the duplication you remove.

### Simplify Conditional Logic

- **Consolidate conditionals**: Combine multiple conditions that lead to the same outcome.
- **Decompose conditionals**: Replace a complex condition with a well-named function or variable.
- **Replace nested conditionals with early returns**: Reduce nesting depth.

## Refactoring Safety

- **One structural change per commit.** Verify tests pass after each step.
- **Never change behavior and structure in the same commit.** If you need to change behavior, do it in a separate commit with its own tests. Mixing the two makes it impossible to tell whether a test failure is from the behavior change or the restructuring.
- **If test coverage does not exist, write characterization tests before refactoring.** Characterization tests capture the current behavior — right or wrong — so you can refactor with confidence. Only after they are green should you change the structure.

## Judging a Refactoring

After making a change, evaluate whether it actually helped:

- If a refactoring introduces as much indirection as it removes duplication, it is a lateral move. Revert it.
- Ask: would a new team member find this easier to understand? If the answer is ambiguous, the refactoring is not worth it.
- The goal is "measurably better," not "perfect." Stop when complexity is reduced and the code is easier to change.

## Refactoring Workflow

1. **Confirm tests pass.** Run the full suite before changing anything. If tests fail, stop — you have a bug, not a refactoring opportunity.
2. **Identify one specific improvement.** Do not plan a chain of refactorings. Pick one.
3. **Apply the change.** Make the smallest edit that achieves the improvement.
4. **Run tests.** All tests must pass. If any fail, undo the change immediately and try a smaller step.
5. **Repeat or stop.** If you see another improvement, go back to step 2. If the code is clean enough, stop. "Clean enough" means: readable, no duplication, clear names, reasonable function sizes.

## Refactoring Tests

Tests are code. They deserve the same care:

- **Extract shared setup** into `beforeEach` or helper functions when multiple tests use the same arrangement.
- **Name test helpers** after what they create, not how: `createTaskWithDependencies()`, not `setupTest()`.
- **Remove redundant assertions** that duplicate what other tests already verify.
- **Keep tests readable** — a test should read top-to-bottom as arrange, act, assert without jumping to helpers for the core logic.

## The Rule of Three

Do not abstract on the first occurrence. Do not abstract on the second occurrence. On the third occurrence, you have enough data points to see the real pattern. Then extract.

This applies to: helper functions, shared types, configuration constants, test utilities.

## When to Stop

A refactoring session is done when:
- The targeted smell is resolved and tests pass.
- The code is readable and names are clear.
- No obvious duplication remains in the touched area.
- A new team member could follow the logic without a guide.

Do not chase perfection. "Measurably better" is the goal, not "ideal." If the next improvement would add as much indirection as it removes complexity, stop.

## Related Skills

- `/skill:engineering-principles` — Design principles that inform refactoring decisions (cohesion, coupling, naming, dependency direction)
- `/skill:tdd` — Red-Green-Refactor cycle, where the refactoring phase applies these techniques
