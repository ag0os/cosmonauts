---
name: reference-adaptation
description: Methodology for studying a reference codebase and adapting its proven patterns to this project. Load when designing features that exist in another codebase.
---

# Reference Adaptation

Systematic methodology for studying how a feature is implemented in a reference codebase and translating those patterns into this project. The goal is to learn from battle-tested code without blindly copying it.

## When to Use

Load this skill when:

- A feature you need to build already exists in another codebase
- You have a local path to the reference project
- You want to adopt proven patterns rather than reinvent them

## Phase 1: Reconnaissance

Before reading source code, build a mental map of the reference project.

### Project structure

```
read the reference project's README, AGENTS.md, or equivalent
list top-level directories to understand organization
identify the package manager, language, framework
```

### Locate the feature

Use grep/glob to find the relevant code:

- Search for feature-specific keywords (e.g., "spawn", "failover", "embedding")
- Identify the entry points — where the feature is invoked or configured
- Map the module boundaries — which directories/files constitute the feature

### Assess scale

Before diving deep, gauge the complexity:

- Count the files involved (a 3-file feature adapts differently than a 60-file subsystem)
- Check for tests — they reveal expected behaviors and edge cases
- Look for configuration or types files — they reveal the public API surface

## Phase 2: Deep Analysis

Read the actual source code. Do not skip this.

### Dependency graph

Trace what the feature depends on:

- Internal dependencies (other modules in the same project)
- External dependencies (libraries, frameworks)
- Infrastructure assumptions (database, filesystem, network, runtime)

For each dependency, note whether this project has an equivalent or if one must be built.

### Core patterns

Identify the key design decisions:

- **Data flow**: How does data move through the feature? Events, callbacks, polling, streaming?
- **State management**: Where is state held? In memory, on disk, in a database? Mutable or immutable?
- **Error handling**: How are failures classified and handled? Retry logic, fallback chains, circuit breakers?
- **Configuration**: What is configurable? How are defaults provided?
- **Concurrency**: Parallel execution, queuing, locking, race condition guards?
- **Extension points**: Hooks, plugins, middleware patterns?

### Test coverage

Read the tests — they are documentation of intended behavior:

- Unit tests reveal the contract of individual functions
- Integration tests reveal how components interact
- Edge case tests reveal what the authors worried about

## Phase 3: Gap Analysis

Map the reference to this project. For each major component of the reference feature:

| Reference Component | This Project Equivalent | Gap |
|---|---|---|
| `ref/src/module.ts` | `lib/similar.ts` | Exists, needs extension |
| `ref/src/other.ts` | — | Must be built |
| `ref/src/compat.ts` | Not needed | Skip (our architecture handles this differently) |

### Classify each piece

- **Adopt**: The pattern translates directly. Use the same approach with this project's naming and conventions.
- **Adapt**: The pattern applies but needs modification. Document what changes and why.
- **Skip**: The reference handles something this project does not need, or handles differently by design. Document why.
- **Prerequisite**: The reference depends on infrastructure this project lacks. This becomes a dependency or scope item.

## Phase 4: Translation Rules

When adapting patterns, follow these principles:

### Translate, do not transplant

The reference and this project have different:

- Module boundaries and directory structures
- Naming conventions and code style
- Abstraction layers and dependency injection patterns
- Runtime environments and tooling

Map concepts to their equivalents. A class in one project might be a plain function in another. An event bus might become a callback. A database-backed store might become a filesystem-based one.

### Simplify by default

Reference codebases accumulate complexity over time. They may have:

- Backward compatibility code you do not need
- Multi-tenant or multi-platform abstractions you do not need
- Performance optimizations for scale you do not have yet
- Configuration surface area for use cases that do not apply

Start with the minimum viable version. You can always add complexity later.

### Preserve the wisdom

Some complexity exists for good reasons:

- Idempotency guards prevent duplicate processing
- Retry logic with backoff handles transient failures
- Depth limits prevent runaway recursion
- Race condition guards protect concurrent access

When you see defensive code, understand *why* before deciding to simplify it.

### Respect the target architecture

This project has its own layering, boundaries, and conventions. The adapted feature must:

- Follow this project's module structure
- Use this project's existing utilities and patterns
- Integrate at the right architectural layer
- Not introduce patterns that conflict with established conventions

## Phase 5: Plan Output

Your plan must document the full translation. For each file in the implementation:

- What it does
- Which reference file(s) informed it
- What was adopted, adapted, or skipped from the reference
- Why adaptation choices were made

This gives workers enough context to implement correctly and gives reviewers enough context to evaluate the approach.
