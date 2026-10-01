# Live run 1 — direct-fix tier, Claude Code backend (W3-2)

Branch `feature/lean-domain` @ `8d7927e0`, run in a scratch clone (local `main` @ `5b774b7c`, frozen install), started through `runBuild` with `createDefaultProviders()` from the coordinator's scratchpad script (the same path `lean_build` uses). Builder and code-reviewer on `claude-cli` (Claude Code 2.1.286, `claude -p --dangerously-skip-permissions --tools …`, system prompt via `--append-system-prompt-file`). Direct `request`, no plan. Lenses: general. Budget passed: 2,000,000 tokens / 60 min.

Run id `20261001T071521-d500aaa2`; record under the clone's `missions/sessions/lean/runs/`.

## Request (one paragraph, hand-written)

Fix `linkDependencies` in `lib/code-health/changed-functions.ts` so a repository that tracks a `node_modules` symlink no longer fails with EEXIST when the base worktree is created; add a fixture test; keep the existing tests green.

## Timeline

| Stage | Wall time | Note |
|---|---|---|
| graph refresh (start) | (in the ~5 s before builder-1) | `regenerated`, reason `missing` (clone has no committed map) |
| builder-1 | 61.4 s | 1,499 chars of output; last line a bare envelope |
| builder-1 repair | 7.2 s | 555 chars; envelope only |
| pass 1 providers | ~2.3 min total | verify 5/5 pass (test 98.2 s, suppressions 13.0 s, typecheck 6.8 s, reachability 0.9 s, lint 0.5 s); health info; dupes info; blast-radius info; plan-vs-actual info; mutation **fail + reenter** (Stryker 11.1 s) |
| graph refresh (pass-1) | — | `regenerated`, reason `stale` (builder edits) |

## Envelope and the repair turn (OD-4 / M-1)

The builder's final line was a bare, unfenced, unprefixed JSON line (OD-4 rule not hit). The parser still rejected it: `evidence[].result` was free text ("55 passed in 3 files; …", "no errors", "6 files checked, no issues") instead of `pass|fail|n/a`, and two `evidence[].kind` values were invented (`typecheck`, `lint`) instead of `test|command|file|claim`. The repair turn (7.2 s, read-only tools) returned exactly one valid envelope with `result: "pass"` and `kind: "command"`. Finding: the host's one-sentence envelope instruction names the fields but not the enumerations; the repair turn is doing work the instruction could prevent. Recommend adding the two enumerations to the instruction (one clause each) — the strict schema is right, the prompt is incomplete.

## Signals, pass 1 (`facts.json`)

- **verify**: 5 commands from `.cosmonauts/config.json` `qualityReview.checks`, all passed; `{base}` substituted with the run's `diffBase`. Correct.
- **health**: "3 changed functions, 1 regressed": `linkDependencies` cyclomatic 2→4, cognitive 1→4, CRAP 2.9→7.5 against the base; the two test-file arrows not regressed. Correct and useful: the try/catch + early return is exactly the regression a reviewer should weigh (it is the honest shape of the fix).
- **dupes**: 0 new groups touching changed files (floor 3 groups read from the base). Correct.
- **blast-radius**: graph `current` (regenerated before the pass), 2 changed, 11 dependents, 17 tests, including the file's own test and the health-hook/CLI tests. Plausible and matches the import graph.
- **plan-vs-actual**: 0 planned / 2 unplanned / 0 untouched — n/a for the direct tier but rendered as if the plan were empty; should say "direct tier: no plan" instead of flagging every file as unplanned (reviewer input noise).
- **mutation**: `fail`, `reenter: true`, 9 mutants in `linkDependencies` (375–384), 0 killed, 4 survived, 5 no coverage, 11.1 s. **Fired wrongly**: the only test that reaches the function, `tests/code-health/changed-functions.test.ts`, was *denied* as sandbox-unsafe (its content matches the `git worktree add` pattern), as was `mutation.test.ts`; the 15 selected tests never call the function. See W3-OD-3 in COORD-STATUS. The builder's new test does kill these mutants outside the sandbox (its own evidence: red before, green after).
- **health hook**: did not run (external backend); recorded in the manifest as `healthHook: "none (external backend)"` plus a warning — brief §4.7A satisfied.
- **token budget**: not enforced (claude-cli reports no stats) — recorded as a warning; `stats.json` has wall time only.
| builder-2 (re-entry on mutation) | 192.4 s | 2,171 chars; bare envelope again rejected for the same enumeration errors (`kind: mutation|lint|typecheck`, free-text `result`) |
| builder-2 repair | 8.2 s | 819 chars; valid |

## Builder-2: what the re-entry did with the structured signal

The re-entry prompt carried the mutation signal's JSON (`mutate` ranges, `tests.selected`, `tests.denied`, survivors). The builder read `denied`, understood why its test was excluded, and: (1) reverted its addition to `tests/code-health/changed-functions.test.ts`; (2) wrote a **new** spec `tests/code-health/changed-functions-dependencies.test.ts` whose text contains no `git clone`/`git worktree add` string (it goes through `resolveChangedFunctions`, which does the worktree add inside the temp fixture, so it is in fact sandbox-safe); (3) changed the fix from catch-EEXIST to a `readdir(checkout).includes("node_modules")` guard before the symlink, because the rethrow branch of the catch was unreachable by any test and the listing check also covers a dangling tracked symlink; (4) ran Stryker itself on the range with its spec (6 killed / 0 survived / 0 no coverage). Two readings: the structured signal was actionable enough for a one-turn fix, and the content-based deny rule is both too broad (a correct test was excluded) and trivially routed around (W3-OD-3 stands either way: the rule should decide on behavior, not text).
| pass 2 providers | ~2.2 min | verify **fail + reenter** (`bun run test` exit 1: `tests/driver/run-step.test.ts` "uses frozen episode actor…" — passes alone 7/7; a load-sensitive driver test that ran while the coordinator was generating a graph in another clone); health info (11 changed functions, 1 regressed: `linkDependencies` 2→3); dupes info; blast-radius info (18 tests, now incl. the new spec); plan-vs-actual info; mutation **info "skipped: verification did not pass"** (L-3 working) |
| graph refresh (pass-2) | — | `regenerated`, `stale` |
| reviewer | 38.6 s | private review workspace (clone has `main`); 1,927 chars; valid bare envelope, `done`, 0 findings |
| **total** | **9 min 45 s** (07:15:21 → 07:25:06) | final status **`blocked`: "re-entry signals still failing after one re-entry: verify"**, `reentries: 1`, `findingsReentries: 0`, 2 repairs |

## Final status and record completeness

`blocked` is the correct verdict for the record as it stands (the last verify did not pass), and the reason names the signal. The reviewer independently judged the failure "outside the change's blast radius … needs a host re-run to confirm" — which is exactly right, and exactly what the host cannot do: there is no "re-run verify once" step, so a flake in an unrelated suite blocks a correct fix. Record: `run.json` (tier, base/diffBase, budget, lenses, healthHook, warnings ×2, graph ×3, contextPack, repairs ×2, reviewWorkspace, reason), `facts.json` (2 passes × 6 signals), `stats.json` (5 entries incl. 2 `repair: true`), `envelopes/{builder-1,builder-2,reviewer}.json`, `request.md`, `mutation/{mutation.json,stryker.log}` — complete. Missing from the record: the raw stage transcripts (only my tee has them) and a generated PR body (`renderPrBody` exists but the runner never writes `pr-body.md`).

`diffBase` ≠ `baseSha`: the start-of-run graph regeneration left `memory/architecture/` untracked, so the attempt-1 snapshot became the diff base (W3-1's "beyond the brief" note 2, observed live; harmless, but the map files are only kept out of the builder's diff by the `DIFF_EXCLUDES` rule).

## The context pack (§4.6) for a direct request

Sections rendered: `# Plan` (the request verbatim), `# Repository conventions (AGENTS.md)`, `# Verification commands` (`bun run test|lint|typecheck`), then the envelope instruction. **No `# Repo map` section**: a direct request has no `Touches` list, so the slice gets an empty touch set and renders nothing, although the request names the file in prose. For the direct tier the host should seed the touch set from the backticked paths in the request (the plan parser already has that rule) — a one-line change in `runBuild`'s direct-request path. The builder found the file anyway (it is named); the cost is the missing neighbours (dependents, tests).

## Reviewer inputs

Prompt 30.9 KB: lenses (`general`), the request, both passes' facts rendered as JSON, the complete changed-file list (2), the diff (5.3 KB, under the 60 KB cap, full diff also written to the workspace). Complete. The reviewer read the facts correctly (noted the unrelated failing test and the regressed-complexity signal) and returned no findings — a defensible verdict for a 6-line fix with three behaviour tests.

## PR body (§4.9)

Rendered from the record with `renderChangeDiagram` + `renderPrBody` (coordinator script; the runner does not do this yet). Markdown at `live-1-out/pr-body.md` in the coordinator scratchpad; the diagram parses structurally (Changed / Impacted / Tests subgraphs, class lines). Two notes: the new spec file is classed `modified` because the renderer was not handed per-file diff statuses (`classes`) — the host should derive them from `git diff --name-status`; and "(unplanned)" is appended to every changed file in the direct tier.

## Builder's change vs. what a human would write; would I merge it?

Final diff (builder-2): `linkDependencies` becomes a guard-clause function — return if the project has no `node_modules`; return if `readdir(checkout)` already lists `node_modules`; else symlink — plus a new spec `tests/code-health/changed-functions-dependencies.test.ts` with three behaviour tests through `resolveChangedFunctions` on temp repos (linked, not linked, tracked dangling symlink). Builder-1's first version was catch-`EEXIST`-rethrow-else with one test added to the existing spec; builder-2 moved to the listing check because the rethrow branch was untestable and the listing also covers a dangling tracked link. A human would most likely write `lstat` + guard (one syscall, no directory listing) and put the test in the existing spec file; the split into a second spec file exists only to dodge the mutation deny rule. The fix is correct, minimal, flat, and better tested than I would have bothered with. **Yes, I would merge it**, with one nit (`lstat` over `readdir`). The same fix is being landed on the branch through a normal subagent package (TDD, worktree, gates) as the comparison point; see COORD-STATUS.

## Findings from this run (for the human / next packages)

1. **Envelope enumerations (2× repair)**: both builder turns emitted free-text `evidence[].result` and invented `kind`s. The repair turn fixed it each time (7–8 s) but the host's instruction should state the two enumerations (`kind: test|command|file|claim`, `result: pass|fail|n/a`). One clause; removes a whole stage per builder turn. (Low, prompt text only.)
2. **Mutation deny rule fires on text, not behaviour (W3-OD-3)**: the only covering test was denied for containing the resolver's `git worktree add` string; 0 killed → false re-entry; the builder routed around it by renaming/splitting the spec. Downgrade to `info` when every covering test is denied, and consider deciding on where the git command runs (the fixture temp repo) rather than on file text.
3. **No verify re-run on a single unrelated failure**: a known-flaky driver test turned a correct fix into `blocked`. Options: re-run only the failed command once before re-entering; or re-enter only when a blast-radius test failed and otherwise report `info` + the reviewer decides. (Medium: this is the most likely way a lean run ends wrong in this repo.)
4. **Direct tier gets no repo map** (above): seed the touch set from paths in the request.
5. **plan-vs-actual in the direct tier** reports every file as "unplanned" — should say "direct tier: no plan" and not feed noise to the reviewer and the PR body.
6. **PR body not written by the host**; file classes not derived from the diff.
7. Positive: health caught the honest complexity regression (2→4, then 2→3) each pass; dupes correct; blast radius current after each regeneration (3.5 s each); repair turn read-only worked on claude-cli (`--tools Read,Glob,Grep`); private review workspace worked with a `main` present; structured re-entry signal was actionable in one turn; wall time 9¾ min for a one-function fix with two full test-suite runs (≈3.3 min of it is `bun run test` ×2).
