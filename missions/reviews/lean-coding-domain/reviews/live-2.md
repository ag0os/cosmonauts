# Live run 2 — plan tier, Claude Code backend (W3-3)

Branch `feature/lean-domain` @ `8d7927e0`, scratch clone `live-2-clone` (local `main` @ `5b774b7c`, frozen install, `graph.json` generated beforehand), `runBuild` + `createDefaultProviders()` from the coordinator's script (the `lean_build` path). Builder and code-reviewer on `claude-cli` (Claude Code 2.1.286). Plan tier: `missions/lean/graph-spec-rule/plan.md`, committed in the clone (`7ad9fbd5`), written by the coordinator playing the lead from the §4.4 template with `Touches`/`Reuses` taken from a real `cosmonauts architecture slice --touch lib/lean-run/graph/blast-radius.ts,lib/lean-run/graph/mermaid.ts,lib/architecture-map/file-graph.ts --budget 1500`. Target: wp5-2 F-8 (one spec-file predicate shared by the file graph and the blast-radius walk), F-9 (`labelPaths` drops `lib/` in `A["lib/ everything"]`), F-10 (an invalid-Mermaid label case in the test), spanning `lib/architecture-map` and `lib/lean-run/graph`.

## Context pack (§4.6), plan tier

Sections: `# Plan` (plan.md verbatim, 1,842 words of prompt in total), `# Repo map` (the slice), `# Repository conventions (AGENTS.md)`, `# Verification commands`, envelope instruction. **Slice: 6,037 chars ≈ 1,509 tokens by the chars/4 rule, i.e. at the 1,500 budget** (`lean.repoMapBudgetTokens` default). It rendered all 7 `Touches` as `[touch]` with signatures, 2 `[reuse]` entries, and ~25 ranked `[dependency]`/`[dependent]` neighbours with signatures (e.g. `lib/architecture-map/types.ts`, `lib/lean-run/providers/blast-radius.ts`, `tests/lean-run/graph/mermaid-parse.test.ts`). Two of the four `Reuses` did not render as `[reuse]`: `lib/architecture-map/file-graph.ts` is also a touch (touch wins, fine) and `tests/helpers/mermaid-structure.ts` **does not exist** (the file is `tests/helpers/mermaid-shape.ts`; I copied the name from a wave-2 note) — the host dropped it silently. Finding: a `Reuses`/`Touches` path that is not in the graph should produce a manifest warning so the lead sees the typo. Graph was `current` at start (pre-generated), regenerated `stale` before each pass.

## Timeline

| Stage | Wall time | Note |
|---|---|---|
| builder-1 | 159.4 s | 2,768 chars; bare envelope rejected: `evidence[].result` free text, `kind: lint|typecheck` — same enumeration error as both W3-2 builder turns |
| builder-1 repair | 12.4 s | 1,690 chars, envelope only (richer evidence, `n/a` for the full suite it did not run) |
| pass 1 providers | ~3.5 min | verify 5/5 pass (test 96.3 s); health info 13 changed functions, **0 regressed**; dupes 0; blast-radius info 7 changed / 18 dependents / 28 tests (hub `lib/architecture-map/index.ts` not expanded transitively); **plan-vs-actual 7 planned / 0 unplanned / 0 untouched**; mutation **fail + reenter**: 17 mutants in 3 changed functions, 15 killed (7 by timeout), 2 survived, 0 no coverage, Stryker 78.8 s, 20 tests selected, 2 denied (`mutation.test.ts`, `run-build.test.ts`, both correctly: they spawn Stryker / clone repos) |

## Signals, pass 1 — what fired and whether it was right

- **plan-vs-actual**: exactly the seven `Touches`, nothing unplanned, nothing untouched. The builder's transcript also says it found a *third* copy of the regex (`lib/lean-run/providers/mutation-tests.ts` `SPEC_FILE`) and left it alone "because it is outside the plan". Both the discipline and the host's check worked; the leftover copy is a note for the reviewer, not a defect of the run.
- **Reuses**: the diff uses `normalizeRepoPaths` from `lib/lean-run/graph/paths.ts` (named in Reuses), the `TEST_FILE_PATTERN` it was told to export rather than a new literal, and the real-parser harness (`mermaid-parse.test.ts`) — the builder said it checked the replaced backtick case there "rather than duplicating" the harness. The transcript cites the plan's wording, so the pack was visibly read.
- **health**: `isTestFilePath` new (cyclomatic 1), `classifyNodes` 4→4, `labelPaths` 2→2 — no regression, correct.
- **mutation**: the two survivors are `MethodExpression`/`ArrowFunction` mutants of the `.sort(...)` comparator at `file-graph.ts:106`, a line the builder did not change (its change in that function is the predicate call at line 97). No test pins node ordering, which is a true "tests that assert nothing" signal — but about the *base's* tests, not this change. The brief scopes mutants to changed *functions* (§4.7B.5), so the provider is by-the-brief; the brief's own principle "thresholds are regression against the base, never absolute" argues that survivors on unchanged lines should be `info`, and only survivors inside the changed hunks should re-enter. Recommend for W3-6 or later: intersect survivor lines with the diff hunks (the host already has them from the changed-functions resolver) and re-enter only on survivors in changed lines. Cost of the current rule here: one builder re-entry (~3 min) to write ordering tests for code the plan did not touch.
| builder-2 (re-entry on mutation) | 64.2 s | 1,580 chars; added one ordering test in `tests/architecture-map/file-graph.test.ts` ("orders nodes by path when a source root sorts after the test root"), production untouched; verified by applying both mutants by hand; bare envelope rejected for the same enumeration reason |
| builder-2 repair | 8.1 s | 742 chars; valid |
| pass 2 providers | ~3.6 min | verify 5/5 pass (test 94.0 s); health 16 changed functions, 0 regressed; dupes 0; blast radius unchanged; plan-vs-actual 7/0/0; **mutation pass: 17 killed (7 by timeout), 0 survived, 0 no coverage** (80.3 s) |
| reviewer | 70.4 s | private review workspace; prompt 1,281 lines, diff 9.7 KB inline (under the 60 KB cap); 1,953 chars; valid bare envelope, `done`, **1 low finding** |
| **total** | **12 min 11 s** (07:30:16 → 07:42:27) | final status **`done`**, `reentries: 1`, `findingsReentries: 0` (low findings do not re-enter), 2 repairs |

## Final status and record

`done` is right: the last verify passed, mutation passed, the reviewer finished with no high/medium finding. Record complete: `run.json` (tier `plan`, planPath, budget, lenses, graph ×3, contextPack `built`, repairs ×2, reviewWorkspace `private`, warnings ×2), `facts.json` 2 passes × 6 signals, `stats.json` 5 entries, `envelopes/{builder-1,builder-2,reviewer}.json`, `mutation/`. As in live-1: no raw transcripts and no `pr-body.md` in the record (W3-6 ruling 6).

## Did the builder use what `Reuses` named? Did it visibly use the pack?

Yes on both. The diff imports and uses `normalizeRepoPaths` from `lib/lean-run/graph/paths.ts` (Reuses), exports and reuses the existing `TEST_FILE_PATTERN` from `file-graph.ts` instead of writing a new literal (Reuses), and checks the replaced label case through `tests/lean-run/graph/mermaid-parse.test.ts` (Reuses) rather than duplicating the harness — the builder's transcript says so in those words. Its transcript also cites the plan's B-1..B-3 and Risks (it checked the dead-code concern by making the export used, and stripped punctuation before the raw-token path test exactly as the Risks bullet warned). Plan-vs-actual reported 0 unplanned files in both passes; the builder noticed a third copy of the regex outside the plan and reported it instead of touching it.

## Reviewer

Inputs complete (lenses, plan, both passes, 7 changed files, 9.7 KB diff). Its single finding is real: filtering raw tokens with `isPathLike` before normalizing drops backslash-separated extensionless paths in multi-word labels (`A["lib\mod the module"]`), which the old order handled because `normalizeRepoPaths` converts `\` to `/` first. Severity low is right (Windows-style paths in a hand-written Mermaid label). Fix is one clause plus a test case. The reviewer also judged the tests meaningful, which the mutation pass corroborates.

## PR body (§4.9)

Rendered from the record with the plan's `## Diagram` restyled (coordinator script, `live-2-out/pr-body.md`): the five plan nodes keep their ids and edges, the one changed file absent from the plan diagram (`tests/architecture-map/file-graph.test.ts`) is appended under "Changed, not in plan diagram", 18 impacted and 28 tests follow, then the verification table (all pass/info), blast radius (with the "hubs not expanded" note), plan-versus-actual 7/0/0, and the finding with disposition `open`. This is the artifact the brief describes; it only needs the host to write it (W3-6 ruling 6) and to pass `classes` from `git diff --name-status`.

## Would I merge it?

Yes, as is, with the reviewer's low fixed in the same PR (`isPathLike` accepting `\`). The change is the plan: one exported predicate, aliases kept so nothing else moves, `labelPaths` filters raw tokens then normalizes, tests for each behaviour plus the ordering test the mutation re-entry forced. A human would have written the same shape; the ordering test is the only thing a human would likely not have added (and it pins pre-existing behaviour, which is fine). The same change is being landed on the branch through a normal subagent package as the comparison point.

## Findings from this run

1. **Envelope enumerations again** (2 more repairs; 4 of 4 builder turns across the two Claude runs): W3-6 ruling 1 closes it.
2. **Mutation scope is "changed functions", not "changed lines"**: both survivors sat on an unchanged line of a touched function; the re-entry cost ~3 min and produced a test for base behaviour. Recommend intersecting survivor lines with the diff hunks and re-entering only on survivors inside changed lines (survivors elsewhere → `info`). Not in W3-6; for the human.
3. **A `Reuses` path that is not in the graph is dropped silently** (`tests/helpers/mermaid-structure.ts` vs the real `mermaid-shape.ts`): the host should warn so the lead sees the typo.
4. **Slice budget**: 1,509 tokens by chars/4 for a 1,500 budget — at the limit, as designed; the slice carried all 7 touches with signatures and ~25 neighbours, enough for the builder to find the parse harness and the dependents it needed.
5. **Blast radius truncation note** ("hubs not expanded transitively: `lib/architecture-map/index.ts`") is accurate and useful: touching the module index would otherwise pull in half the repo.
6. **Stryker timeouts**: 7 of 17 kills were by timeout (the file-graph tests build real TypeScript programs); 80 s per pass is acceptable but it is the slowest provider here.
7. Positive: health 0 regressed both passes; plan-vs-actual exact; graph regenerated before each pass (`stale` → `current` for the walk); private review workspace; repair turns read-only; the structured mutation signal was again actionable in one turn; wall time 12 min for a 7-file, 3-module change with two full suites and two Stryker runs.
