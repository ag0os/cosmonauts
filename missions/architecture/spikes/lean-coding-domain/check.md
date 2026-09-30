# Check: lean-domain spike claims

Read-only, at HEAD `5b774b7c`. Probes ran in `/private/tmp/lean-check/`: a resolver script, a scratch clone at `f2d6242c`, and Stryker using the spike worktree's `node_modules` through a symlink. I removed the one empty `.vite-temp` directory my run created there.

## 1. Drive and chain-runner exclusions: confirmed

- **Drive:** the report contract is always appended (`lib/driver/prompt-template.ts:35-66,118`), and the task root is fixed at `missions/tasks` (`lib/tasks/file-system.ts:18-19,45`). Postflight is pass/fail only and feeds only `deriveOutcome` (`run-one-task.ts:660-706,527-546`). The only retry is the contradicted-path retry.
- **Chain runner:** only `steps[0]` gets the prompt (`chain-steps.ts:49-62`), and revision gets no findings (`stage-prompts.ts:216-217`). A loop-free chain goes durable (`durable-chain-compiler.ts:203-219`), which is Pi-only (`durable-chain-runner.ts:127`) and drops stats (`:367-384`, `durationMs: 0` at `:750`).
- The durable runtime is not an alternative host either. Its graph is a static DAG (`durable-runtime/types.ts:130-143`) with no conditional re-entry.

**Overstated: "nothing provides a worktree."** `lib/` does not create a git worktree for a build. But `createPrivateReviewWorkspace` (`lib/orchestration/quality-review-workspace.ts:373-477`) already makes an isolated private clone. It includes uncommitted changes, is checked against a digest while it copies, and writes `base-sha.txt`, `changed-files.txt`, `full.diff` and the base-side blobs as read-only files. That covers "the host must supply the diff to a `readonly` reviewer." It also gives isolation without new code, though it makes a clone rather than a worktree.

## 2. `reviewer` name clash and its fix: confirmed

A scratch `AgentRegistry` holding `coding/reviewer` and `lean/reviewer` gave these results (`resolver.ts:251-274`):

| Lookup | Result |
|---|---|
| `resolveReferenceResult("reviewer", undefined, "coding")` | `not-found` |
| same, with `domainContext = "coding"` | `found` |
| same, with lean's `reviewer` marked internal | `found`, resolves to `coding` |
| from lean, unqualified | `not-found` (still ambiguous) |
| from lean, `lean/reviewer` | `found` |

The spawn tool resolves with `runtime.domainContext`, not with the caller's domain (`spawn-tool.ts:563-567`). This repo's config sets no domain, and `cody` lists a bare `reviewer`/`verifier` (`bundled/coding/agents/cody.ts:29-46`). The fix holds, but every lean chain, prompt and spawn must then use qualified ids.

## 3. The 2-of-10 probe, and "no changed-function resolver"

**The probe is confirmed.** `run-one-task.ts` has 10 repo imports. A module is the first directory segment under a source root (`analyzer.ts:163-191`), so `lib/driver/backends` belongs to `lib/driver`. Intra-module edges are dropped (`analyzer.ts:402`). What survives is 2 modules (3 of the 10 files). Tests are outside the default roots (`config.ts:34-41`), but `architectureMap.sourceRoots` and `moduleRoots` can be configured (`config.ts:83-93`).

**The resolver claim is overstated.** No resolver exists in the repo, but fallow already does most of the work. I ran:

`fallow health --complexity --max-cyclomatic 0 --max-cognitive 0 --changed-since f2d6242c~1 --format json`

- It took 0.4 s and returned 42 findings, which is every function in the changed file, arrows included as `<arrow>`, each with `name`, `line` and `line_count`.
- I intersected those with the hunks from `git diff -U0` (312-319 and 321). That gives `snapshotWorktree` at lines 276-342, exactly the range the mutation spike used.

What remains is about 20 lines of hunk intersection, not a TypeScript compiler-API pass. It also returns complexity for each function, so WP3 (blast radius), WP4 (mutation ranges) and the health hook can share one resolver. The claimed flag **`--diff-file` does not exist** in fallow 2.54.2: it is rejected, and `fallow schema` has no such flag.

## 4. Stryker patch is necessary and small: confirmed, with a scope note

- I re-ran S1 in the scratch clone with the unpatched thread pool. It reproduced exactly: 21 killed, 0 timeout, 8 survived, 10 no coverage, in 5 s.
  - So the patch is not needed when no `process.chdir` test is selected.
- With `tests/cli/drive/list.test.ts` selected, the dry run fails with "process.chdir() is not supported in workers" (reproduced).
- Vitest's own `poolMatchGlobs` does **not** work around it (tested). Stryker's pool setting wins.
- The alternative is a deny-list. It would drop the 10 chdir files, which include `tests/cli/drive/run.test.ts`, a direct test dependent of `run-one-task.ts`. So keep the patch.
- The patched branch applies only to vitest `<4.1.0` (`vitest-test-runner.js:39-49`). For 4.1 and later, the runner hard-codes `pool: 'threads'` in a separate branch, so the patch has to be redone when vitest is upgraded. Pin the vitest version or send the change upstream.

## 5. No token counts from external adapters: confirmed; "no persona" is overstated

- Drive's backends return only `{exitCode, stdout, durationMs}`: `claude-cli.ts:30` runs a plain `-p`, and `codex.ts:31-44` runs `exec -o summary`. Nothing in `lib/`, `cli/` or `bin/` parses tokens from Claude Code or Codex.
- A persona path does exist:
  - `lib/agent-packages/claude-cli.ts:27-72` passes an agent's assembled system prompt through `--append-system-prompt-file` or `--system-prompt-file`. It also maps the `readonly`, `verification` and `coding` tool sets to Claude `--tools` lists.
  - `codex-cli.ts:105` does the same through `model_instructions_file`.
  - `buildAgentPackage` (`build.ts:30`) produces the package from an agent definition.
- **What changes:** runner C should drive external roles through the `agent-packages` invokers, not through Drive's `Backend` adapters. That removes the "persona goes into the prompt text" workaround and enforces the reviewer's read-only tools on Claude Code as well. Token parsing is still new work either way.

## Other material omissions

1. **The `agent-packages` invokers** (section 5). They are the natural external-backend layer for runner C.
2. **The QM private review workspace** (section 1). It provides isolation plus the diff and base materials, and it answers decision 4 in the execution-host report.
3. **fallow at zero thresholds as a function inventory** (section 3). This cuts the graph spike's roughly 160-line `blastRadius` estimate and replaces the mutation spike's 70-line `changed-fns.mjs`.
4. **`fallow health --coverage-gaps`** lists files and exports that no test root reaches. It is a cheap cross-check on the "no tests reach this" signal.
