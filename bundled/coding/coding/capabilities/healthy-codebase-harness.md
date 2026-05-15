# Healthy Codebase Harness

The coding domain exists to keep software structure healthy while agents help write code. Syntax may be delegated to tools and models; structure remains the shared responsibility of every role.

## Core Thesis

Form and function are coupled. The way a program is shaped affects whether it works, whether it can be changed safely, and whether future agents can understand it. Treat structure as part of the behavior you are delivering, not as style.

The harness has two structures:

- **Program structure**: module boundaries, responsibilities, dependency direction, names, contracts, state ownership, and integration seams.
- **Procedure structure**: the way work is specified, planned, decomposed, implemented, reviewed, verified, and revised.

Healthy code needs both. A correct-looking patch without a behavioral harness is not trustworthy. A clean-looking architecture without tested behavior is not substance.

## Role Contract

- **Spec work** defines behavior from a user's seat: who acts, what they do, what they observe, and what happens on failure, cancellation, invalid input, or edge cases.
- **Planning work** couples structure to behavior: every module boundary and contract exists to deliver named behaviors, and every behavior has an implementation home and a test boundary.
- **Task decomposition** preserves the harness: tasks carry behavior ownership, dependency order, and acceptance criteria that a single worker can finish without inventing missing architecture.
- **Implementation work** follows the behavior loop: failing test, minimal code, refactor, repeat. Refactoring is not optional cleanup; it is where the program structure catches up with the proven behavior.
- **Review and verification** test both structures: code must satisfy observable behavior and preserve coherent boundaries, dependency direction, state ownership, and integration contracts.

## Operating Rules

- Do not treat syntax generation as completion. Completion means the behavior is specified, tested, implemented, integrated, and structurally coherent.
- Make structure explicit before parallel work: shared types, public APIs, file ownership, state ownership, and dependency rules must be written down where independent agents will see them.
- Prefer behaviorally focused acceptance tests. Tests should describe context, action, and expected observable result, including important non-happy paths.
- Use mutation-style thinking when judging tests: if the implementation were wrong in a realistic way, would the tests fail? For critical behavior, add a targeted negative, edge, or mutation-style check that proves the test would catch the fault.
- When tests are hard to write, treat that as design feedback. Hidden state, deep coupling, or unclear boundaries should be fixed in the design, not papered over with brittle tests.
- Never let a process artifact become empty ceremony. Specs, plans, tasks, reviews, and quality contracts earn their place by making behavior and structure clearer, safer, and easier to change.
