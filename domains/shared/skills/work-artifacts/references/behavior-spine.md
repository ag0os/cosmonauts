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

The line between code and authored prose is drawn by the reader, not the file type. Anything a machine parses or executes is code for this purpose and is tested: source, configuration, frontmatter keys, tool and capability names that code resolves, files a loader requires. Authored prose is natural-language text whose only reader is an agent or a human — the body of a prompt, a persona, a skill. A behavior about authored prose is verified by review of the diff against its stated outcome, never by asserting that the file contains a sentence. One file can hold both: test its frontmatter, review its body. Other documents that say "code" and "authored prose" mean this.

Tests carry no reference back to the plan. A plan is a working document that gets archived; a test protects the system and must make sense to someone who has never seen the plan.

## Direct Fix Exception

Direct fixes and tiny unplanned patches to code use a regression test as the behavior record; a fix to authored prose is its own record. They do not need `B-###` IDs.
