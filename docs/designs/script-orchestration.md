# Planner Prompt: Script-Orchestrated, Main-Agent-Coordinated Execution Pattern

This is a prompt to feed to the cosmonauts `planner` agent (interactively, via
`cosmonauts -a planner "$(cat docs/designs/script-orchestration.md)"`) to design
a first-class capability for the script-driven, real-time-coordinated
execution mode we used in the `fallow-temp-exceptions-cleanup` run.

It is intentionally a working artifact — not a finished design document. The
planner consumes it; the planner's output (a plan in `missions/plans/`) is the
durable design.

---

Design a first-class "script-orchestrated, main-agent-coordinated" execution
pattern for cosmonauts, based on what we just learned by running it ad-hoc.

## Why this matters

Cosmonauts already supports a chain-based orchestration model:
`task-manager → coordinator → integration-verifier → quality-manager`. In that
model, the coordinator is itself a chain-stage agent — it spawns workers per
task and waits. The user has no real-time coordination role; they kick off the
chain and observe. That's mechanical and works well for clean greenfield runs.

We just discovered a qualitatively different mode by accident:

- We needed to refactor cosmonauts itself across 31 tasks. Spawning cosmonauts
  sub-agents to refactor cosmonauts code mid-flight was risky (spawned agents
  load fresh code from disk, which was being mutated).
- Solution: use `codex exec --full-auto` (a separate binary, not dependent on
  the in-flight cosmonauts source) as the worker, driven by a bash script as
  the loop, with the main interactive cosmo session acting as a *real-time
  coordinator* — adapting prompts, fixing pre-existing issues, deciding how to
  resume after a token-budget overrun, owning commits because codex's sandbox
  blocks `.git/index.lock`.

This worked very well. 31 tasks landed in 34 commits on a single branch with
all four verifications green and no baseline. PR #4 is the result.

The interesting realization: the *main agent* (cosmo, but it could be any
top-level interactive agent — Claude Code, Cursor, etc.) is doing real
coordination work that no chain stage can do:

- Holds rich context across the whole run.
- Reacts to anomalies (pre-existing lint failures, mis-classified outcomes,
  scope-exceeded tasks).
- Owns commit authority and policy decisions (e.g., "is this scope creep
  acceptable?").
- Can pivot between automated and manual work without ceremony.

The script does the mechanical loop; the agent does judgment. That separation
is the pattern we want to formalize.

## What I want you to design

A first-class capability for cosmonauts that supports this orchestration mode,
sitting alongside (not replacing) the existing chain workflows. Specifically:

1. A canonical pattern for "script-orchestrated, main-agent-coordinated" runs:
   what the script owns, what the main agent owns, how they communicate.
2. A reusable driver template (or generator) that consumes a cosmonauts plan +
   tasks, runs each through a configurable execution backend (codex exec,
   `claude -p`, `cosmonauts -a worker`, etc.), and reports outcomes the main
   agent can act on.
3. A prompt-template system for the per-task worker prompts (right now the
   template is inline in the bash script — that should be promoted to a real
   asset, possibly per-execution-backend).
4. Integration with the task system: status transitions, blocked-task
   handling, dependency resolution, idempotent resumption, partial-progress
   commits (we hit this for TASK-246).
5. A decision matrix: when to use script-orchestration vs. chain workflows.
   What signals push toward each.
6. Optional but valuable: a "real-time coordinator" agent persona that tells a
   main agent (cosmo or otherwise) what its role is during a script-driven
   run — reading driver logs, deciding interventions, owning commits.

## Required first step: distillation

Before designing, distill what actually happened in the
`fallow-temp-exceptions-cleanup` run. The artifacts:

- Plan + decision log + adversarial review:
  `missions/archive/plans/fallow-temp-exceptions-cleanup/`
- Archived tasks (31, with implementation notes):
  `missions/archive/tasks/TASK-217*.md` through `TASK-247*.md`
- Driver script (the actual orchestrator we used):
  `/tmp/cosmo-fallow-cleanup/run.sh`
- Per-task prompt templates and codex logs:
  `/tmp/cosmo-fallow-cleanup/TASK-*-prompt.md`,
  `/tmp/cosmo-fallow-cleanup/TASK-*.log`,
  `/tmp/cosmo-fallow-cleanup/TASK-*-summary.txt`
- Branch history showing the actual commits this pattern produced:
  `git log fallow-temp-exceptions-cleanup ^main`
- PR #4 description (summary of stats and patterns):
  https://github.com/ag0os/cosmonauts/pull/4

Specifically distill:

- What the driver actually does, mechanically (loop structure, pre-flight,
  post-flight, parsing, commit policy, blocked handling).
- What the prompt template requires from each task and what it gets back.
- What I (cosmo) had to do that the script couldn't (every manual
  intervention is a candidate for the formal "coordinator" role).
- What broke and how we recovered (pre-existing lint, sandbox blocks
  .git/index.lock, codex misclassifying warnings, TASK-246 token overrun
  needing a 1/2 + 2/2 split, gh auth account confusion).
- How long things actually took (driver wall-clock vs. agent token budget vs.
  human attention).

Capture the distillation as a section in the plan document. It is the input to
your design — not background flavor.

## Constraints / non-goals

- Do not propose replacing chain workflows. They remain the right tool for
  greenfield, autonomous runs. This is *additional*, not substitute.
- Do not couple the design to codex exec specifically. Codex was the
  execution backend that worked here; the design must accommodate other
  backends (claude -p, cosmonauts worker spawn, etc.) as pluggable.
- The main agent ("real-time coordinator") must work with non-cosmonauts
  agents too (Claude Code, Cursor). Cosmonauts can ship templates/scripts
  but must not assume cosmo is the only possible coordinator.
- Treat the prompt template, driver script, and per-task report format as
  three separate concerns. They should compose, not be hardwired together.

## Deliverable

Plan document at `missions/plans/<slug>/plan.md` (suggest a slug). Standard
plan structure plus a Distillation section near the top. Include:

- A Decision Log for the design choices you make.
- A "When to use" decision matrix (script-orchestration vs. chain workflow vs.
  hybrid).
- Module structure for the script generator and prompt template system.
- Concrete contracts for: task→prompt rendering, execution-backend interface,
  per-task report format, driver loop API.
- A migration / introduction story: how does an existing cosmonauts user
  discover and adopt this? CLI surface? `cosmonauts run --driver` or similar?
- Risks and stress-tests (e.g., what if the backend can commit; what if the
  task graph has parallel-safe waves; what if the run spans multiple sessions
  / days; how does resumption work).

Run dialogically (interactive). Surface design choices to me before
committing them — there are real alternatives (driver as bash vs. TS, prompt
templates as files vs. generator, coordinator persona inside cosmonauts vs.
external, etc.) and I want to steer.
