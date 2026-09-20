# Behaviors

A behavior says what must be true, for whom, once the work ships. It connects user intent to the finished system: user intent, acceptance criterion, behavior, then code and tests written by whoever builds it.

## IDs

- Specs use `AC-###` for planned-work acceptance criteria.
- Plans use `B-###` for behavior entries.

## Behavior Entry

Each `B-###` states:

- Source — the `AC-###` it delivers; in a plan with no spec, the `INV-###` it serves
- Observer — who or what notices: a human at the CLI, an agent calling a tool, a session receiving an event, a later process reading a file
- Entry point — the shipped surface the observer uses: a command, a registered tool, a lifecycle event, a persisted artifact
- Outcome — what the observer sees, including the failure and edge cases that matter

Example:

```md
### B-003 - Spawned agents report completion to their parent

- Source: AC-004
- Observer: an agent that called `spawn_agent` from an interactive session
- Entry point: the `spawn_agent` tool and the follow-up message it promises
- Outcome: the parent receives exactly one completion message per accepted spawn, carrying the child's final summary; a child that crashes produces a completion message that says so rather than silence
```

## What a Behavior Does Not Say

A behavior never names a source file, a function, a test file, or a test title. Those are decisions for whoever has seen the code, and a plan is written before that code exists.

The check: if nobody outside the codebase could observe the behavior through something that ships, it is not a behavior. "A caller invokes `compileFoo` and gets a graph" has no observer — it describes a function, and a plan that asks for it will receive an unwired function and a test of that function. Either state what the real observer gains, or move the sentence to `## Design` as a note about structure.

Internal structure still matters. It belongs in `## Design`, where it is guidance the implementer may revise, not a contract a test is pinned to.

## Tests

The implementer owns test design. A plan does not pre-name tests, and there is no one-test-per-behavior rule: one behavior may need several tests at different levels, and one test may protect several behaviors.

What gets tested is decided by one question: does anything depend on this content as a contract?

- **Contract** — content that software, a script, or a documented consumer interprets: program logic, configuration, syntax and identifiers a parser looks for (frontmatter keys, section markers, IDs, tool and capability names that code resolves), and output a program may consume (exit codes, field order and delimiters of machine-readable output, the facts an error must carry). Contracts are tested, wherever they live.
- **Authored prose** — natural-language content whose meaning only a reader judges: the body of a prompt, persona, or skill; the sentence inside an acceptance criterion; a decision's rationale; a prompt written as a string literal in source. Authored prose is verified by review of the diff against the behavior's stated outcome, never by asserting that it contains a sentence.

Neither file type nor passing through a parser decides it; the same file, and the same string, can hold both. Test that a prompt string is routed and interpolated correctly, review what it says. Test that an acceptance-criteria block is delimited and indexed, review its wording. Test that an error names the right task, not how the sentence is phrased — unless a caller matches on the phrase, which makes it a contract. Other documents that say "code" and "authored prose" mean this split.

Tests carry no reference back to the plan. A plan is a working document that gets archived; a test protects the system and must make sense to someone who has never seen the plan.

## Direct Fix Exception

Direct fixes and tiny unplanned patches to code use a regression test as the behavior record; a fix to authored prose is its own record. They do not need `B-###` IDs.
