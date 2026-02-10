# Cosmonauts — Approach

## What We're Actually Building

Cosmonauts automates **what a developer already does**, step by step, when working on something:

1. Read specs / understand requirements
2. Explore the codebase
3. Plan the implementation
4. Implement changes across files
5. Run tests, fix what's broken
6. Commit with a meaningful message
7. Open a PR, link it to the issue
8. Review the code (or get it reviewed)
9. Iterate based on feedback

Today, a developer does all of this manually, in sequence, one thing at a time. Cosmonauts puts agents on steps 4–9 — the mechanical part — while keeping humans on steps 1–3 where they add the most value.

**This is not about replicating Claude Forge's planner/coordinator/worker hierarchy.** It's about automating the developer workflow. The orchestration structure should follow from *that* goal, not from an abstract agent taxonomy.

## The Two Phases of Work

### 1. Design Phase (Human + AI)

The human drives this, possibly with help from planner agents. Different planners can use different approaches — explore-first, spec-first, conversation-driven. The output is always:

- A clear understanding of what needs to change
- An implementation plan: what files, what approach, what order
- Acceptance criteria: how do we know it's done

This can be a formal document, a conversation, or a SPECS.md file. The format doesn't matter. What matters is that there's a **clear, approved plan** before any agent writes code.

Multiple planner agents with different styles is fine. The human picks what works for each situation.

### 2. Execution Phase (Automated)

Once the implementation plan is approved, everything else is automated. This is the core of Cosmonauts — a pipeline that a coordinator drives:

```
Plan approved
  │
  ├─ 1. COORDINATE: Create tasks from the plan
  │    - Break plan into atomic, implementable tasks
  │    - Set dependencies between tasks
  │    - Assign skills/labels for routing
  │    - Verify tasks are well-formed before proceeding
  │
  ├─ 2. IMPLEMENT: Fire up agents for ready tasks
  │    - Each agent gets: task description, relevant files, project conventions
  │    - Each agent has: the right language/domain skills for the task
  │    - Agents work in parallel on independent tasks
  │    - Each agent: implements → runs tests → commits
  │    - Dependencies respected: task B waits for task A
  │
  ├─ 3. VERIFY: Quality gate (every task, after implementation)
  │    │
  │    ├─ a. Tests pass
  │    │    Not just green — tests must be meaningful.
  │    │    Did the agent write real assertions or just smoke tests?
  │    │
  │    ├─ b. Linting / coding style
  │    │    Run the project's linter. Does the code follow
  │    │    the project's conventions? This is mechanical — no LLM needed.
  │    │
  │    ├─ c. Code review (clean-context agent)
  │    │    A separate agent with a FRESH context reviews the changes.
  │    │    This is critical: the implementing agent is biased toward
  │    │    its own code. The reviewer sees only the diff, the task,
  │    │    and the plan — not the implementation journey.
  │    │
  │    │    The reviewer checks:
  │    │    - Does the code match the plan and acceptance criteria?
  │    │    - Are there obvious bugs, edge cases, or security issues?
  │    │    - Is the code idiomatic for the project?
  │    │    - Are tests actually testing the right things?
  │    │
  │    └─ d. Fix pass (if review has findings)
  │         Review output → fed to an agent → apply fixes → re-verify.
  │         This can loop, but should converge quickly (cap at 2-3 rounds).
  │
  ├─ 4. COMMIT + PR
  │    - Meaningful commit messages referencing task IDs
  │    - PR creation linking back to the plan/issue
  │    - Full traceability: spec → plan → task → commit → PR
  │
  └─ Done. Human reviews the PR as a final check.
```

## Key Design Decisions

### The coordinator is a program, not an LLM agent

The coordinator drives the pipeline above. Most of it is **deterministic logic**:

- "Are there ready tasks?" → query task files
- "What skills does this task need?" → read task labels
- "Did tests pass?" → run command, check exit code
- "Did linting pass?" → run command, check exit code

LLM calls only happen when judgment is needed:
- Creating tasks from a plan (one-shot `completeSimple()` or a short agent session)
- Code review (needs an agent with read-only tools)
- Deciding whether to retry a failed task or escalate

This keeps costs down and makes the system predictable.

### Code review needs a clean context

The implementing agent has seen the whole journey — false starts, debugging, context accumulation. It's biased. The review agent starts fresh with only:
- The diff (what changed)
- The task description and acceptance criteria
- The project's conventions (CLAUDE.md, linter config)
- Read-only tools to explore the codebase if needed

This mirrors how human code review works — you review the PR, not the developer's thought process.

### The verify → fix loop is bounded

Review findings go back to an agent for fixes, then re-verification. But this loop has a cap (2-3 rounds). If it doesn't converge, the task is flagged for human attention. Infinite loops are worse than imperfect code.

### Agents are just sessions with context

We don't need a rigid role hierarchy. We need:

- **A way to give an agent the right context** (which files, which task, which conventions)
- **A way to give it the right tools** (coding tools for implementation, read-only for review, git tools for version management)
- **A way to scope its skills** (TypeScript for a TS project, testing skill for writing tests)

Pi gives us all three: `createAgentSession()` with `tools`, `skillsOverride`, and system prompt injection via `before_agent_start`.

### Tasks are the shared state

Agents don't talk to each other. They talk to **task files**:
- Read their task to know what to do
- Update their task when they're done
- The coordinator reads task state to decide what's next

This is simple, debuggable, and git-trackable. No message bus, no shared memory, no complexity.

### Git is the integration point

All agent work lands as git commits. This means:
- Parallel agents work on branches or well-separated files
- Conflicts surface through normal git mechanisms
- Human review uses normal PR review tools
- Rollback is just `git revert`

## What We Don't Need

> **Note**: This section was written early in the design process. Some items were later reconsidered as the system took shape. Annotations below reflect what actually happened.

- ~~**A chain DSL**~~ — We built a lightweight chain DSL (`"planner -> task-manager -> coordinator"`). It's pure topology — role names and arrows, no loop counters or per-stage config. Loop behavior is intrinsic to each role. This turned out to be valuable for composability without adding real complexity.
- **Separate agent "roles" as first-class concepts** — still true. An agent is a session with context. The "role" is just which skills and tools it gets. *(Validated.)*
- ~~**A task manager agent**~~ — We created a task-manager skill. Breaking a plan into well-formed atomic tasks benefits from a dedicated skill with clear constraints, even if it runs as a short session.
- **Separate binaries or commands** — still mostly true. `cosmonauts` is a single entry point (not `cosmonauts plan`, `cosmonauts build`, etc.). It supports `--chain` and `--print` flags for different execution patterns. *(Validated — one binary, many modes.)*
- **Session persistence for workers** — they're ephemeral. `SessionManager.inMemory()`. Done. *(Validated.)*
- **Streaming/stdout parsing** — Pi gives us event subscription. No markers needed. *(Validated.)*

## What We Built (Phase 0)

1. **Task extension** — tools for creating, listing, viewing, editing, searching tasks (forge-tasks format). ✓
2. **Chain runner** — role-based lifecycle, completion detection via task state, global safety caps. ✓
3. **Agent spawner** — creates Pi sessions with scoped skills and tools per role. ✓
4. **Agent skills** — planner, task-manager, coordinator, worker. All work in both interactive and non-interactive modes. ✓
5. **Orchestration extension** — `chain_run` and `spawn_agent` tools registered in Pi. ✓
6. **CLI** — `cosmonauts-tasks` for standalone task management. ✓

## What's Next (Phase 0 remaining)

1. **Cosmo main agent** — default system prompt (Claude Code-style), the identity you talk to when you start Cosmonauts
2. **Todo tool** — in-memory session task tracking (`todo_write`/`todo_read`), distinct from forge-tasks
3. **TypeScript language skill** — first language skill for workers
4. **CLI entry point** — `cosmonauts` binary with `--print`, `--chain`, Pi flag passthrough
5. **End-to-end test** — run the full pipeline on a real project

## How It Grows

Once Phase 0 works end-to-end on a real project:

- **Phase 1**: More language/domain skills. Web/deepwiki tools for agents that need to look things up. Smarter skill routing based on task labels.
- **Phase 2**: Memory (agents learn from past sessions). Better test quality assessment. Parallel workers on independent tasks.
- **Phase 3**: Cost tracking and budget limits. Sandboxed execution via Pi's RPC mode. Progress reporting.
- **Phase 4**: Run in background. Notify when done. Accept work via messaging channels.

Each phase gets detailed specs before we build it, informed by what we learned in the previous phase.
