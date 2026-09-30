> Checked 2026-09-30 by an independent pass; corrections and omissions are in `check.md` and folded into `README.md`.

# Spike: execution host for a lean `build` run

Read-only investigation, 2026-09-30. "Verified" means I read the code at the cited line. "Inferred" means I did not run it.

## Comparison

| | A. Drive postflight | B. Chain runner | C. New small runner |
|---|---|---|---|
| Host step between builder and reviewer | No. Postflight is a list of shell commands, pass/fail only | No. `NamedChain` is a DSL string | Yes, it is plain code |
| One structured re-entry | No. Only the contradicted-path retry | No. The revision stage gets no findings | Yes |
| Contracts forced on the worker | Task file, report contract, `task_edit` notes, outcome grammar | Plan-review tokens by role name; 200-char handoff | Only the envelope |
| Token and time stats | Duration only | Inline path: yes. Durable path (which `build` takes): dropped | Pi: yes. External: duration only |
| Backends | Pi, Codex, Claude Code (one role per run) | Pi only | Pi spawner plus Drive's `Backend` adapters |
| Writes to `missions/` | `missions/tasks/` (required) + sessions | `missions/sessions/` only | Wherever it chooses |
| Framework change needed | Yes: task root, report contract, postflight shape | Yes: chain runner and compiler | Additive only |

## Findings

**A. Drive (verified)**
- Postflight runs each command and records `{command, pass|fail, stderr}` (`lib/driver/drive-scheduler-backend.ts:614`, `run-one-task.ts:661-706`). Those records only feed `deriveOutcome` (`run-one-task.ts:527-546`). No structured result is produced, and nothing re-enters the worker. The only retry is the one-shot contradicted-path retry (`README.md:86-98`).
- Hard-wired:
  - Tasks come from `TaskManager` on `missions/tasks/`. The root is not configurable (`lib/tasks/file-system.ts:18,45`; `task-manager.ts:97`).
  - Drive writes task status itself (`run-one-task.ts:91,215`).
  - `DRIVE_REPORT_CONTRACT` is always appended. It includes the "write notes through `task_edit`" rule and the `outcome:` last-line grammar (`prompt-template.ts:35-66,118`).
  - `parseReport` is fixed (`report-parser.ts:7`).
  - There is one worker role per run (`backends/cosmonauts-subagent.ts:42`), so the reviewer cannot be a Drive stage.
- Can be switched off by configuration:
  - The envelope/persona layer (`types.ts:74-79`).
  - `commitPolicy: no-commit` with `stateCommitPolicy: none` (`types.ts:25-32`).
  - Criterion ticking: it disappears when a task has zero acceptance criteria (`prompt-template.ts:140-142`; `runtime-helpers.ts:89-103` returns undefined).
  - Pre- and postflight commands, and `retryOnContradictedBlock`.
- Brief section 5 says Drive gives "worktrees". It does not. Drive runs in `worktree: {mode: "shared"}` (`drive-graph-compiler.ts:52`). `WorktreeSpec.mode: "isolated"` is declared (`durable-runtime/types.ts:51-54`), but nothing in `lib/` implements it and there is no `git worktree` call. What Drive does provide is **snapshot refs** (`runtime-helpers.ts:409`, exported, `taskFile` optional) and the git guard, which is enabled by `runtimeContext.parentRole === "driver"` (`lib/agents/session-assembly.ts:259`).

**B. Chain runner (verified)**
- The user prompt goes only to `steps[0]` (`chain-steps.ts:50-63`). Later stages get their role default plus a purpose suffix (`stage-prompts.ts:187-222`), not the previous stage's output. Stage output is condensed to 200 characters (`assistant-text.ts:69-80`).
- In `builder -> reviewer -> builder`, the third stage gets a generic "revise … in response to the intervening review" line (`stage-prompts.ts:63-83,216`) but not the findings. The builder would have to find the findings itself.
- The parser keys off role names: `plan-reviewer`, `task-manager`, and any `*-reviewer` role (`stage-prompts.ts:46-98,153`). A lean `reviewer` is caught by `isReviewerRole`. That is harmless for `build` but is still hidden coupling.
- `build` has no loop, so it runs on the durable path (`cli/chain-execution.ts:78-81`; `durable-chain-compiler.ts:203-219`). That path:
  - is Pi-only (`durable-chain-runner.ts:127,151,214`);
  - reports `canResume: false` (`:216`);
  - discards `spawnResult.stats` and keeps only the 200-character summary (`:366-384`);
  - rebuilds stage results with `durationMs: 0` and no stats (`:750-754`).
- The durable path therefore keeps neither the envelope nor the stats. A host step would have to be added to the parser, compiler and runner: framework modification.

**C. New runner (verified interfaces, inferred assembly)**
- `AgentSpawner.spawn(SpawnConfig) → {success, sessionId, messages, stats}` (`orchestration/types.ts:383-440`), created by `createPiSpawner` (`agent-spawner.ts:118`). It returns the full messages, so `extractAssistantText` yields the envelope line. `SpawnStats` gives tokens, cost, duration, turns and tool calls (`types.ts:178-189`).
- Drive's `Backend.run(BackendInvocation) → {exitCode, stdout, durationMs}` (`backends/types.ts:8-34`) runs Claude Code (`claude-cli.ts:30`, plain `-p`) and Codex (`codex.ts:31-44`). `taskId` and `planSlug` are only used as file and label names (`codex.ts:33`).
  - Inferred: a runner can pass run-local IDs.
- To get Drive's recovery ref and guard message (`drive-worker-tool-guard.ts:179`):
  - Inferred: call `snapshotWorktree({taskId: "builder", …})` and spawn with `runtimeContext: {parentRole: "driver", taskId: "builder"}`.
- Domains can ship extensions. `bundled/coding/extensions/execution-probe/index.ts:17` imports across packages, so a `lean_build` tool for `lead` can live in the domain.

**Timing and token accounting (WP0), verified**
- Exists for Pi only: `SpawnStats` from `session.getSessionStats()` (`docs/orchestration.md:64-82`), aggregated per stage on the inline chain path (`chain-runner.ts:289-341`). `--profile` writes a trace and summary to `missions/sessions/_profiles/` (`cli/chain-execution.ts:46-52`).
- Drive's subagent backend drops stats (`cosmonauts-subagent.ts:74-78`).
- External backends report duration only.

**Run state (verified)**
- A: `missions/sessions/<plan>/runs/<runId>/` (spec.json, events.jsonl, run.json, steps/, prompts/, run.completion.json) plus task files in `missions/tasks/`.
- B: `missions/sessions/chain/runs/chain-<uuid>/` (`durable-chain-runner.ts:108-111`). Pi transcripts are kept only when `planSlug` is set (`session-factory.ts:155-159`).
- C: its own choice. `FileRunStore` takes any `rootDir` (`file-store.ts:61-66`).

**Minimum state for one re-entry plus a PR body (inferred)**
- `run.json`: base SHA, spec and plan paths, backend, `reentries: 0|1`, snapshot refs.
- `envelopes/builder-1.json`, `builder-2.json`, `reviewer.json`.
- `facts.json`: verification commands with exit code and output tail, fallow deltas, blast radius, plan-versus-actual, mutation results.
- `stats.json` per stage.

That is enough to re-enter the builder once and to render the PR body. All of it can sit in a gitignored run directory.

## Recommendation

**C: a small new runner that composes existing parts.** It uses `createPiSpawner` (stats and full text), Drive's `Backend` adapters for Claude Code and Codex, `snapshotWorktree` plus the `parentRole: "driver"` guard, and optionally `FileRunStore` for events. The lean `build` becomes ordinary code:

builder → completion loop → (re-enter once) → reviewer

This adds modules and modifies none, so none of the existing parsers, Drive or the chain runner change. The domain's `chains.ts` can still declare `review: reviewer`. `build` is started through the runner, not the chain DSL.

**Biggest risk:** the external backends give no token counts and no system prompt. The lean persona must be put into the prompt text. Measuring WP0 on Claude Code or Codex needs new output parsing (`--output-format json`, Codex JSON events), which today's adapters do not do.

## Decisions for the human

1. Where the runner lives: `lib/lean-run/` (additive framework module) or `bundled/lean/extensions/` (the domain stays self-contained, with cross-package imports).
2. Run directory: `missions/sessions/lean/runs/<runId>/` (gitignored, not plans/tasks) or somewhere outside `missions/`.
3. Where `spec.md` and `plan.md` live, and whether they are tracked in git or live only in the PR body.
4. Whether a real isolated git worktree is required. Nothing provides one today.
5. Whether v1 should support external backends before token parsing exists, or run on Pi only first.
