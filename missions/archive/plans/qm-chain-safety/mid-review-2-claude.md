---
kind: independent-review
plan: qm-chain-safety
channel: Claude subagent reviewer (general-purpose, read-only)
scope: remediation 03e2186..a203b54 (TASK-729..732) + resolution of mid-review-1
date: 2026-09-24
---

# Mid-branch review 2 — Claude reviewer

The prompt is `mid-review-2-prompt.md`. The reviewer's final message follows verbatim.

The remediation fixes most of the first-round findings, but my verdict for Stages 1–6 is **DO-NOT-SHIP-YET**. TASK-732's rewrite of the suppression scanner introduced a HIGH regression: it misses about a third of the suppressions already in this repo.

**How I checked:** I read the code and tests and ran the seven focused suites (118 tests, all pass). I also ran throwaway probes under `scratchpad/mid2/`:
- the real runtime's extension-path resolution;
- the real `runtime.skillPaths`;
- the new and old suppression scanners against this repo;
- `triageReviewLenses` on sample diffs.

I changed nothing in the repository.

## 1. Resolution table

| Finding | Status | Evidence |
|---|---|---|
| codex C1 / Claude H2: host paths reach quality sessions | **PARTIAL** | Fixed for the QM. Its prompt now names only the materials copy (`quality-review-launch.ts:245`), and `checks.md` is copied there at `quality-review-run.ts:298-305`, before sealing at `:316`. The QM gets empty skill lists (`launch.ts:256-257`). Panel reviewers still get `skillPaths: [...runtime.skillPaths]` (`spawn-tool.ts:809`), and their definitions use `skills: ["*"]`. When Cosmonauts reviews itself, those paths are in the source checkout (see M1 below). |
| codex C2 / Claude H1: analysis consent never reaches the provider | **RESOLVED** | The authorization is passed through at `launch.ts:214`. `session-factory.ts:83-114` swaps the project-tools path for a factory built with `snapshotAuthorization`, and `project-tools/index.ts:556-573` hands it to the discovery step. My probe confirmed the swapped path matches the path the real runtime resolves, so the swap actually takes effect. A test drives the real extension (`project-tools-fallow.test.ts`). |
| codex C3: an unbound audit can still yield `ready` | **RESOLVED**, one caveat | `validateQualityReviewAnalysisCalls` (`launch.ts:53-120`) checks from observed tool results that the audit binding is `bound`, the audit completed for the literal base, and its verdict is `pass`. A failure blocks `ready` and adds a human item (`run.ts:465,484`). Caveat: a missing `gateState` does not block `ready` (L1 below). |
| codex C4 / Claude M2: specialist prompts gutted, direct spawns broken | **RESOLVED** | All four prompts are back to their `e43c238` text with small targeted edits. Each now has a host-materials path and a direct-spawn path (the `git diff` recipes plus a merge-base fallback). Dimensions, the applicability step, severity and findings format are kept. |
| codex C5: `chain_run` / `run_driver` fail open without caller identity | **RESOLVED** | `chain-tool.ts:128-137` and `driver-tool.ts:196-205`; tested. |
| codex C6 / Claude M1: lens triage too coarse, QM cannot add lenses | **RESOLVED** | The host sets a minimum lens set; the QM may add any of the four, once each (`launch.ts:222-227`, `requiredReviewLenses`, spawn-tool duplicate guard). The broadened regexes over-include (L4 below). |
| codex C7: no deadline on the QM prompt | **RESOLVED** | Deadline and race at `run.ts:329-380`; the signal reaches `session.abort()` through `agent-spawner.ts` `createSessionCancellation`; tested. |
| Claude H3: base is `main`'s tip, not the merge-base | **RESOLVED** | `workspace.ts:304-306`; tested, including a gate-owned change made only on the base branch. Minor: `refs/heads/qm-review-base` still points at the tip (`:303`), which is harmless now. |
| Claude M3: cancellation ignored during the assessment | **RESOLVED** | The signal reaches prepare, checks and the QM session; tested per phase. The snapshot clone itself ignores the signal, but it is bounded by per-command timeouts. |
| Claude M4: timeouts leave orphaned processes | **RESOLVED** | Process-group kill in `quality-review-command.ts`; tested with a real grandchild. It introduces M2 below. |
| Claude M5: cleanup failure destroys a completed verdict | **RESOLVED** | Summary, `final.md`, then `finalized`, then removal (`run.ts:621-676`); tested with a throwing remover. |
| Claude M6: suppression directive forms missed | **REGRESSED** | The new forms are caught, but the scanner rewrite loses existing forms (H1 below). |
| Claude L1: plan summary reviewed as part of the change | **RESOLVED** | `excludePath` (`run.ts:231-235`, `workspace.ts:127`); tested. |
| Claude L2: model can end a run as `blocked` | **RESOLVED** | `run.ts:436-441`; the matrix test now expects `failed`. |
| Claude L3: late reviewers write into a finished run | **RESOLVED**, small window | `assessmentActive` guard (`spawn-tool.ts:189-192`), tested. The flag is only cleared at `launch.ts:279`, after the QM spawn returns. After a deadline or cancel the run can finalize first (L2 below). |
| Claude L4: caller parameters dropped | **PARTIAL** | The panel timeout is configurable and reported (`run.ts:274-281,614`). The caller's prompt and model are still dropped silently. D-025 doesn't require them. |
| Claude L5: test-only `execute` port in production types | Acceptance **mostly sound** | Nothing in production sets it. But it now also skips the new gate check, because `gateState` comes back undefined and the host treats that as passing (L1). Making a missing `gateState` block `ready` would close this. |
| Claude L6: over-broad gate ownership of config | **RESOLVED** | `qualityReviewConfigChanged` (`run.ts:805-835`); tested. |
| Claude L7: `/agent quality-manager` bypasses the launcher | **RESOLVED** | `agent-switch/index.ts:57-67,82-87` covers `/agent`, `/handoff` and the picker; tested. |
| Claude L8: `StepResult.childRun` | Acceptance **sound** | One optional field, set only by `durable-chain-runner.ts:341` and read at `:759`. |

## 2. New findings

**HIGH**

- **H1: The suppression scanner misses any directive that comes after a template literal with `${}`.** `lib/quality/suppression-policy.ts:36-55` now uses a bare `ts.createScanner` with no parser. Without a parser it misreads the closing `}` of a template substitution, treats the rest of the file as template text, and never sees later comments.
  - Scenario: a file with `` const a = `x${y}z`; `` then `// @ts-ignore` scans as `[]` (the old scanner found `@ts-ignore@3`).
  - Over this repo's tracked sources, the old scanner finds 23 directives and the new one 15. Directives in `cli/drive/subcommand.ts`, `lib/agents/resolver.ts`, `lib/skills/discovery.ts`, `lib/tasks/file-system.ts` and others are invisible.
  - An unregistered suppression added below any interpolated template passes `check-new-suppressions` and the QM host check. This breaks B-008, AC-011 and D-009.
  - The fix is to go back to the parser-based comment collection and extend the prefix stripping, which is all the new forms need.

**MEDIUM**

- **M1: Panel reviewers still see the source root when Cosmonauts reviews itself.** They get `skillPaths: [...runtime.skillPaths]` (`spawn-tool.ts:809`), and Pi writes each skill's `<location>` into the system prompt. My probe of the real `runtime.skillPaths` returned `/Users/cosmos/Projects/cosmonauts/{bundled/coding,domains/main,domains/shared}/skills` plus `~/.cosmonauts/packages/coding/skills`. Run from this checkout, every quality reviewer's system prompt names the operator checkout. This breaks D-025 ("no … system-prompt content given to a quality session names the source root"), D-004 and R-012. The TASK-729 #2 test only checks user prompts.
- **M2: Host checks now outlive the CLI.** `quality-review-command.ts:32` sets `detached: true`, which puts each prepare and check command in its own session. Terminal Ctrl-C no longer reaches them, and the CLI path passes no signal (`cli/main.ts:629,665`). Scenario: Ctrl-C on `cosmonauts -a coding/quality-manager` during `bun run test` leaves the test process tree running in the tmp clone. The timeout that would have killed it died with the parent, so nothing bounds it. Before this change the children shared the terminal's process group and got SIGINT. This is a new leaked-process path (B-004 liveness).

**LOW**

- **L1:** A missing `gateState` lets `ready` through (`run.ts:465,484`). Only the injected `execute` port produces that today. Separately, the human item comes out as "Analysis audit gate state: Analysis audit gate state: fail". A failing audit verdict is also filed as a human decision rather than a finding.
- **L2:** After a deadline or caller cancel, the run finalizes before the launcher clears `assessmentActive` (`launch.ts:279`). If a live panel child completes inside that window, its evidence is written after the terminal event.
- **L3:** When workspace removal fails, a `retained` phase is appended after `finalized`, and `final.md` is rewritten without its digest being recorded (`run.ts:639-675`). A successful removal never records `removed`; the disposition stays `pending-removal`.
- **L4:** The broadened triage regexes (`launch.ts:292-305`) match almost any diff. "filesystem" in a docs sentence pulls in security, and `throw new Error` pulls in UX. The host's minimum set becomes nearly all lenses, which costs panel time against the 900 s deadline.
- **L5:** The materials directory stays writable until after prepare and checks (`workspace.ts:385`, `run.ts:316`). The same-uid permission bits were never a real boundary, so this only matters for accidental writes.
- **L6, scope:** `SpawnEvent.tool_execution_end` now carries compacted `analysis_*` results for every spawn, not only the QM (`agent-spawner.ts:482-524`). They flow into durable chain event logs.

**Environment (not a code defect):** a catalog `coding` package installed on 2026-09-23 (`~/.cosmonauts/packages/coding`) shadows the bundled one. The runtime resolves `coding/quality-manager` to the old definition: `tools: "coding"`, the `tasks` and `architecture-memory` extensions, and the old QM and reviewer prompts. The restricted profile still enforces the tool allowlist, so safety holds. But live QM runs on this machine won't use the remediated prompts until that package is reinstalled or removed.

## 3. End-to-end checks for real callers

- **Consent bound in the clone:** yes, for every caller through `launchQualityReview`.
- **Source root and run store hidden:** yes for the QM; no for panel reviewers (M1).
- **`ready` needs a host-observed bound audit:** yes on the real launcher path.
- **Base is the merge-base:** yes.
- **Operator checkout unchanged except the D-018 plan summary:** yes; I found no new writes into it.
- **Specialist prompts serve both callers:** yes (QM panel and direct `cody`/`cosmo` spawns).
- **`/agent quality-manager`:** refused.
- **`run status`:** unchanged.

H1 blocks shipping; M1 and M2 should be fixed in the same pass.
