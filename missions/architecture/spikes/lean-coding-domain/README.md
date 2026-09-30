# Lean coding domain — phase 0 spikes

**Date:** 2026-09-30, at `main` = `5b774b7c`.
**Source:** `missions/architecture/lean-coding-domain-brief.md` (human-ratified direction). The
direction was not re-reviewed; these spikes only answer *how to make it real*.
**Method:** four read-only investigations by fresh-context agents (the mutation spike ran in a
throwaway worktree), then one independent check that re-derived the decisive claims from the code
and reproduced the name clash, the 2-of-10 probe and the smallest Stryker sample.

| Report | Question |
|---|---|
| `execution-host.md` | Which existing machinery can host `builder → host checks → reviewer` |
| `domain-packaging.md` | Whether a second bundled domain needs framework changes; skills; extensions; the post-edit hook |
| `graph-data.md` | Whether the architecture map supports `repoMapSlice` / `blastRadius` / `planVersusActual` |
| `mutation.md` (+ `mutation-setup/`) | Whether Stryker can be scoped to changed functions and run in minutes |
| `check.md` | Independent verification; overturns and omissions are folded in below |

Everything below is **verified in code or measured** unless marked *inferred*.

## 1. Corrections to the brief

1. **§5 "Drive run machinery (worktrees, …)"** — Drive creates no git worktree. It runs `worktree: {mode: "shared"}`; `mode: "isolated"` is declared but not implemented. Drive provides snapshot refs (`snapshotWorktree`) and the destructive-git guard. The one existing isolation primitive is `createPrivateReviewWorkspace` (`lib/orchestration/quality-review-workspace.ts:373`): a private *clone* with uncommitted changes, `base-sha.txt`, `changed-files.txt`, `full.diff` and base-side blobs.
2. **§4.6 "sharded OKF under `memory/architecture/`"** — never generated in this repo; `memory/architecture/` does not exist. The map is directory-level modules only (47 modules / 325 files): imports inside a module are dropped, imported names are not recorded, there is no canonical JSON, and `tests/` is outside the source roots. The brief's own WP3 acceptance probe **fails on today's data** (2 of 10 dependencies of `lib/driver/run-one-task.ts`).
3. **§4.1 "no framework change"** — holds for discovery and listing, but **adding `lean` breaks `coding`** unless handled: unqualified agent ids resolve across all domains and give up on ambiguity, so a second `reviewer`/`verifier` makes `coding/cody` spawning `reviewer` fail with "unknown target" (reproduced). Fix inside lean: `manifest.internal.agents: ["reviewer","verifier"]` and qualified ids (`lean/reviewer`) in every lean chain, prompt and spawn.
4. **§4.7 / §5** — the "post-tool hook" and "Drive postflight" framing: neither Drive nor the chain runner can host the completion loop (section 2). The Pi `tool_result` hook works for the post-edit check, but files written through `bash` bypass it.

## 2. Execution host: a small new runner (recommended)

| | Drive postflight | Chain runner | New runner |
|---|---|---|---|
| Host step between builder and reviewer | no: postflight = shell commands, pass/fail only | no: `NamedChain` is a DSL string | yes |
| One structured re-entry | no (only the contradicted-path retry) | no: revision stage gets no findings | yes |
| Contracts forced on the worker | task file under hard-coded `missions/tasks/`, always-appended report contract, `task_edit` notes, `outcome:` grammar | plan-review tokens keyed by role name; 200-char handoff | envelope only |
| Token/time stats | duration only | inline path yes; the durable path (which a loop-free `build` takes) is Pi-only and drops stats | Pi: full `SpawnStats`; external: duration only |
| Framework change | yes | yes (parser, compiler, runner) | additive only |

Evidence: `lib/driver/prompt-template.ts:35-66,118`, `lib/tasks/file-system.ts:18-19,45`, `run-one-task.ts:527-546,660-706`; `chain-steps.ts:49-62`, `stage-prompts.ts:216-217`, `durable-chain-compiler.ts:203-219`, `durable-chain-runner.ts:127,367-384,750`. The durable runtime's graph is a static DAG (`durable-runtime/types.ts:130-143`), no conditional re-entry.

**Reuse for the runner:** `createPiSpawner` (full messages + `SpawnStats`), `snapshotWorktree` + `runtimeContext.parentRole: "driver"` (git guard), optionally `FileRunStore` (any `rootDir`), and `createPrivateReviewWorkspace` for the reviewer's read-only diff. **For external backends use `lib/agent-packages/{claude-cli,codex-cli}.ts`, not Drive's `Backend` adapters:** they already send the assembled persona (`--append-system-prompt-file` / `model_instructions_file`) and map the `readonly`/`verification`/`coding` tool sets to Claude `--tools`. Token parsing for Claude Code / Codex output does not exist anywhere and is new work; timing and token accounting today exist for Pi only (`docs/orchestration.md:64-82`, `--profile`).

**Minimum run state** (*inferred*): `run.json` (base SHA, spec/plan paths, backend, `reentries`, snapshot refs), `envelopes/builder-1.json`, `builder-2.json`, `reviewer.json`, `facts.json` (verification commands + exit codes, fallow deltas, blast radius, plan-versus-actual, mutation), `stats.json` per stage. Enough for one re-entry and a PR body; can live in a gitignored run directory.

## 3. Domain packaging

- Discovery: any `bundled/*` with `cosmonauts.json` is picked up in dev mode (`lib/packages/dev-bundled.ts:38-79`); probe showed `--list-domains` = `shared, coding, lean, main`. The installed catalog lists only `coding` (`lib/packages/catalog.ts:28-35`): install by name fails outside dev, by path works.
- Minimum shapes: `domain.ts` `{id, description}`; agent needs `id, description, capabilities, model, tools, extensions, skills, projectContext, session, loop`; validator errors on missing `prompts/<id>.md`, unresolved capability/extension, lead not in domain; unresolved chain stage is only a warning.
- Tool sets (`lib/orchestration/definition-resolution.ts:21-32`): `coding` = read, bash, edit, write; `readonly` = read, grep, find, ls (**no bash** → host hands the reviewer its diff); `verification` = read, bash, grep, find, ls ("never edits" is prompt-only).
- Prompt overhead: ~60 words from cosmonauts (`base.md` 28 + sub-agent 33, not removable); Pi adds AGENTS.md (~900 words) when `projectContext: true` and ~45–60 words per visible skill. `capabilities: []`, `projectContext: false`, narrow `skills` are the opt-outs. The interactive lead also carries Pi's default preamble (*inferred* 300–400 words).
- Skills (D-5): every domain's `skills/` is on Pi's path; a lean agent loads coding's `tdd` by name with no copy, as long as coding is installed. The project allowlist in `.cosmonauts/config.json` currently hides `git-workflow` and would hide a new `contract` skill (config edit). Same-name skills in two domains: one wins silently (*inferred*).
- Extensions: a domain can ship `bundled/lean/extensions/…`, loaded only for agents that list it (precedent `bundled/coding/extensions/execution-probe`).
- Post-edit hook (Pi 0.87.1): `pi.on("tool_result", …)` with `isEditToolResult`/`isWriteToolResult`; inject by returning replaced `content` or `pi.sendMessage(...)` (becomes a steer). Silent when nothing is returned. Misses `bash` writes; external harnesses do not load Pi extensions.
- Architecture-map tools are granted to `coding/*` only (`ARCHITECTURE_MEMORY_CONSUMERS`, `lib/agents/session-assembly.ts:51-57`, duplicated in `lib/extensions/architecture-memory/index.ts:27-33`).
- Models: resolution override → definition → `anthropic/claude-opus-4-7`; coding uses `openai-codex/gpt-5.6-sol` everywhere except `worker` (`gpt-6-sol`, high). `DomainManifest.defaultModel` is never read.

## 4. Graph data

- A file-level import graph (scratch, TS parse only: 637 files, 2,373 edges, 393 ms) passes the probe: 10 deps, 4 source dependents, 4 test dependents, matching `fallow dead-code --trace-file`. Slice size 2,823 tokens with full type bodies, **1,411 with type bodies elided** (chars/4; ~1,710 at chars/3.3) — fits the 1,500 budget only barely, so ranking must drop lines.
- Recommended: a file-graph pass in `lib/architecture-map/` (nodes = files incl. tests; edges weighted by imported-name count, type-only flag; per-file exports with elided type headers) emitted as canonical `graph.json` in the same bundle/hash; the three functions on top. *Inferred* size ~500 lines + tests after the fallow shortcut below.
- **Changed-function resolution already mostly exists:** `fallow health --complexity --max-cyclomatic 0 --max-cognitive 0 --changed-since <rev> --format json` (0.4 s) lists every function in changed files with `name`, `line`, `line_count` (arrows as `<arrow>`). Intersecting with `git diff -U0` hunks (~20 lines) yields the changed ranges (verified: `snapshotWorktree` 276-342, the mutation spike's exact range). One resolver can serve blast radius, mutation ranges and the health hook. Note: the `--diff-file` flag named in `graph-data.md` **does not exist** in fallow 2.54.2. `fallow health --coverage-gaps` is a cheap cross-check for "no test reaches this".
- Known defect in the module view: source roots `lib` and `cli` are themselves modules containing everything beneath them, so `lib` is a false dependent of everything.
- Cost: analyzer 1.57 s, ~890 MB peak RSS; output 46 files / 464 KB; no incremental mode.

## 5. Mutation (D-2): Stryker

- `@stryker-mutator/core` + `vitest-runner` 10.0.0 install in 5 s; line-range `--mutate` and `--testFiles` scope as documented; reuses `vitest.config.ts`.
- Measured (`mutation.md` table): fix `f2d6242c` **6 s** (39 mutants, 21/0/8/10); feature `d1e53585` **33 s** with 4 test files or **190 s** with 51 (233 mutants); refactor `ac8dbc11` **100 s** (398 mutants). Check re-ran S1 unpatched: identical 21/0/8/10 in 5 s.
- **Required patch:** the vitest runner hard-codes `pool: 'threads'`; `process.chdir()` fails in workers for 10 test files (incl. `tests/cli/drive/run.test.ts`, a direct dependent of `run-one-task.ts`). Patch = env-switchable `forks` + `singleFork` (`mutation-setup/vitest-runner-pool-patch.txt`). `poolMatchGlobs` does **not** work around it. The patched branch is the vitest `<4.1` one; must be redone or upstreamed on a vitest upgrade.
- Other setup facts: exclude `StringLiteral` mutants; deny-list tests that `git clone` the checkout; add `.stryker-tmp/**` to vitest `exclude` and `.gitignore`; results wobble between survived/timeout across runs (count timeouts as killed, gate on trend); subprocess-only code shows as NoCoverage.
- Survivor quality (judgement): about two-thirds real weak assertions (e.g. `f2d6242c`'s own fix is not pinned by its test; path-escape throws at `sync.ts:892` / `render.ts:610` never asserted).
- Custom mutator estimate: 400–600 lines, 38 min serial on the refactor sample → Stryker is 10–40× cheaper. Wiring in: ~1–2 days.

## 6. Recommended shape (for decision, not decided)

```
lean lead (interactive, Pi) ── writes spec.md / plan.md with the human
        │
        ▼
lean runner (new, additive; lib/ or bundled/lean/extensions/)
   builder (Pi via createPiSpawner | Claude Code/Codex via agent-packages)
        │ envelope
        ▼
   completion loop: verify cmds → fallow scoped (changed-fn resolver) → blast radius (graph.json)
                    → plan-vs-actual → Stryker on changed ranges × blast-radius tests
        │ re-enter builder once on failing tests / surviving mutants
        ▼
   reviewer (readonly; diff + facts from a private review workspace) → envelope → human
```

## 7. Decisions for the human

| # | Decision | Evidence-backed default |
|---|---|---|
| D-1 | Domain name | `lean` (nothing collides at the chain/domain level) |
| D-2 | Mutation runner | **Stryker** with the forks patch, pinned vitest major |
| D-3 | Builder backend for v1 | Pi first (only backend with stats + hook); external via `agent-packages` once token parsing exists |
| D-4 | Re-entry signals | failing verification commands and surviving mutants in changed functions re-enter; the rest informs the reviewer |
| D-5 | Shared skills | reference by name; add `git-workflow` + `contract` to the project allowlist; no move |
| R-1 | Role names | keep `reviewer`/`verifier`, mark internal, use qualified ids everywhere in lean (or rename to avoid the ambiguity outright) |
| R-2 | Runner location | `lib/lean-run/` (additive framework module) vs `bundled/lean/extensions/` |
| R-3 | Run directory | `missions/sessions/lean/runs/<id>/` (already gitignored) vs outside `missions/` |
| R-4 | `spec.md` / `plan.md` location and whether tracked in git | — |
| R-5 | Isolation | reuse `createPrivateReviewWorkspace` (clone) vs a real `git worktree` |
| G-1 | `graph.json` | commit, generate on demand (~1.5 s), or cache outside git |
| G-2 | Blast-radius tests | direct importers only vs transitive closure to first test (hub explosion risk on `types.ts`) |
| G-3 | `lib`/`cli` super-module defect | fix in the module view or ignore at file level |
| G-4 | Token estimator | chars/4 acceptable, or a real tokenizer |
| P-1 | `projectContext: false` for lean agents (drops AGENTS.md, ~900 words) | — |
| P-2 | Health hook and `bash` writes | accept the gap, or diff-check on bash `tool_result` |
| F-1 | Framework touches that lean would want anyway | `ARCHITECTURE_MEMORY_CONSUMERS` declarative; catalog entry for install-by-name; file-graph pass in `lib/architecture-map/` |

## 8. Reproduce

- Name clash: scratch `AgentRegistry` with `coding/reviewer` + `lean/reviewer`, `resolveReferenceResult("reviewer", undefined, "coding")` → `not-found`.
- Probe: `lib/driver/run-one-task.ts` has 10 repo imports; the module analyzer keeps 2 modules (`analyzer.ts:163-191,402`).
- Changed functions: `fallow health --complexity --max-cyclomatic 0 --max-cognitive 0 --changed-since f2d6242c~1 --format json` ∩ `git diff -U0 f2d6242c~1 f2d6242c`.
- Mutation: `mutation-setup/run.sh <label> @<mutate-file> <tests-file>` after installing the two Stryker packages and applying `vitest-runner-pool-patch.txt`; sample ranges and test lists are the `s*-mutate.txt` / `s*-tests.txt` files.
