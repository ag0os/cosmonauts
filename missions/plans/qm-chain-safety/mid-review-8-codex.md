---
kind: independent-review
plan: qm-chain-safety
channel: codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only
scope: 6fadad0..(TASK-743 5c9ee93) + resolution of mid-review-7, under the D-027 threat model
date: 2026-09-24
---

# Mid-branch review 8 — codex

The prompt is `mid-review-8-prompt.md`. Final message verbatim:

## Verdict: DO-NOT-SHIP-YET for Stages 1–6

The round 7 remediations fix the reported preparation, disclosure, and seal-test defects. I found one **new MEDIUM report-integrity defect** in `6fadad0..HEAD`: after analysis preparation fails, the host can discard findings from an audit that actually completed. I also found one LOW timer leak. Stages 7–8 are excluded from this verdict.

This was a read-only source and test review. I did not run tests, the QM, a chain, or Drive. The checkout remained clean.

## Round 7 finding resolutions

“PARTIAL” means the cited route improved but an accidental case remains. Repeated Claude and Codex claims share a row.

| Round 7 finding | Status | Current evidence |
|---|---|---|
| Codex MEDIUM: successful analysis preparation disappears on assessment failure | **RESOLVED** | Failure reports now use `hostCheckLines()`, and `checks.md` includes preparation lines; a test covers session failure. [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:932), [test](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-run.test.ts:3262) |
| Codex LOW: post-check seal test cannot fail | **RESOLVED** | The test now writes reviewer evidence, attempts a late write, and asserts the late artifact is absent and original bytes survive. [test](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-run.test.ts:3103) |
| Claude MEDIUM-1: cancellation always retains the base runtime clone | **PARTIAL** | Setup now gets a settle grace before retention; work that remains live past that grace still retains the clone. [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:450), [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:1092) |
| Claude MEDIUM-2: `analysisPrepare` failure prevents assessment | **RESOLVED** | A preparation failure is recorded and assessment proceeds to a `not-ready` outcome; the stale-lockfile test covers it. [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:489), [test](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-launch.test.ts:713) |
| Claude MEDIUM-3: D-028 disclosure absent | **RESOLVED** | The host adds the disclosure to the provisional and final reports; tests cover ready, not-ready, failed, refused, and plan summaries. [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:222), [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:1018), [test](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-run.test.ts:3411) |
| Claude LOW-1: user-source exclusion untested | **RESOLVED** | The launcher excludes user sources, and a test installs an overriding user package and checks that the bundled QM wins. [launch.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-launch.ts:314), [test](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-run.test.ts:3555) |
| Claude LOW-2: suppression-registry parser became stricter | **OPEN** | Array-shaped registries and `equivalents` remain rejected; this file is unchanged in the reviewed range. The committed registry is unaffected. [script](/Users/cosmos/Projects/cosmonauts/scripts/check-new-suppressions.ts:48), [script](/Users/cosmos/Projects/cosmonauts/scripts/check-new-suppressions.ts:98) |

The Codex report also carried earlier findings forward. Their current dispositions are:

| Carried finding | Status | Current evidence |
|---|---|---|
| QM/panel runtime shadowed by reviewed or user definitions | **RESOLVED** | Source-exported base runtime, user sources disabled, panel uses that runtime. [launch.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-launch.ts:299), [spawn-tool.ts](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/orchestration/spawn-tool.ts:513) |
| Effective check inputs can be omitted from gate ownership | **PARTIAL** | This repository lists the cited inputs; coverage still depends on each project’s configured paths. [config.json](/Users/cosmos/Projects/cosmonauts/.cosmonauts/config.json:24), [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:521) |
| Source/store paths in operator or caller notes (two carried claims) | **RESOLVED** | Notes are redacted before assessment receives them. [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:270), [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:1318) |
| Abandoned-write reason replaces the original failure | **RESOLVED** | The seal reason is appended to `reason`. [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:994) |
| Disposition absent from status or removal default | **RESOLVED** | The disposition event is recorded and rendered by status; removal uses the configured timeout. [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:1124), [run-control-tools.ts](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/orchestration/run-control-tools.ts:118) |
| No in-progress reviewer artifact event | **RESOLVED under D-025** | Completed step artifacts are available to status. [controller.ts](/Users/cosmos/Projects/cosmonauts/lib/durable-runtime/controller.ts:82) |
| Direct specialist instructions and installed-definition shadowing | **RESOLVED for current installation** | Direct-spawn scope remains in the prompts; quality runtime excludes user packages. [reviewer.md](/Users/cosmos/Projects/cosmonauts/bundled/coding/prompts/reviewer.md:49), [launch.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-launch.ts:314) |
| Accidental detached check grandchild survives cleanup | **PARTIAL** | Cleanup kills the check process group; an accidentally detached daemon can survive it. Deliberate escape and tampering is hostile-only. [command.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-command.ts:58) |
| Caller prompt and requested-model calibration | **PARTIAL** | Caller text reaches the launcher; requested-model calibration belongs to Stage 7. [chain-runner.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/chain-runner.ts:515) |
| Injectable `execute` port | **PARTIAL** | The port remains; absent observed bound-gate state blocks `ready`. Real callers use the launcher’s normal execution path. [launch.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-launch.ts:290), [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:819) |
| Retained clone after an unsettled QM session | **PARTIAL** | A still-live session causes retention, with no later reclamation in this slice. [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:627), [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:1092) |
| Unavailable panel skills are omitted | **PARTIAL** | Unavailable paths are recorded and omitted. [session-factory.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/session-factory.ts:86) |
| Deliberate post-verification rewrite of materials | **RESIDUAL** | Materials are checked before assessment; deliberate later rewriting is outside D-027. [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:651) |
| JSX text mistaken for a suppression comment | **OPEN** | The comment-range scanner is unchanged. [suppression-policy.ts](/Users/cosmos/Projects/cosmonauts/lib/quality/suppression-policy.ts:36) |
| Surviving check deliberately rewrites sealed materials/base export | **RESIDUAL** | Review evidence is sealed before checks; deliberate later tampering is outside D-027. [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:659), [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:710) |
| Cited check configuration omitted in this repository | **RESOLVED for this repository** | The cited inputs are gate-owned. [config.json](/Users/cosmos/Projects/cosmonauts/.cosmonauts/config.json:25) |
| Base-runtime Git work continues after cancellation/deadline | **PARTIAL** | Export receives the abort signal and setup gets a grace period; a setup that remains live causes retention. [workspace.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-workspace.ts:244), [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:450) |
| Base-runtime regression test bypasses launcher | **RESOLVED** | The launcher path is exercised with an overriding user package. [test](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-run.test.ts:3555) |
| Checks tamper with clone Git objects before base export | **RESOLVED for that route** | Base export is made from the operator source before checks. [workspace.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-workspace.ts:244), [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:1225) |
| Clone `.pi` settings execute commands or append prompts | **RESOLVED** | Quality sessions use untrusted in-memory settings and an empty appended prompt. [session-factory.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/session-factory.ts:182) |
| Duplicate `package.json` human item | **RESOLVED** | Gate-owned paths are deduplicated. [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:521) |
| Shorthand/lifecycle scripts escape script detection | **PARTIAL generally; resolved here** | This repository owns `package.json`; other projects must list their effective inputs. [config.json](/Users/cosmos/Projects/cosmonauts/.cosmonauts/config.json:25), [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:1382) |

## NEW findings in `6fadad0..HEAD`

1. **MEDIUM — A failed preparation can erase observed audit findings.** [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:337) replaces the observed gate state whenever `analysisPrepare` fails, and [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:355) drops `assessment.auditFindings`; the indexed report’s gates are also replaced at [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:911). Concrete accidental case: dependency preparation reports a frozen-lockfile error, but an already available project-owned analyzer still completes the bound audit and reports a new finding. The real launcher returns those host-observed finding lines at [launch.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-launch.ts:409); the final report discards them and states “failed-to-run.” The new stale-lockfile test supplies only `completed-bound` and no findings, so it cannot catch this loss. This breaks **INV-005, AC-008, B-005** and D-026’s report requirement. `not-ready` remains fail-closed, but the evidence needed to remediate is lost.

2. **LOW — The new settle-grace timer remains live after setup settles early.** The `Promise.race` timer at [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:451) is never cleared when `setupPromise` wins. On cancellation, a base export that settles after 15 ms can finish its report and workspace removal while the CLI process remains alive for the full grace period. `qmSettleGraceMs` accepts any positive integer at [loader.ts](/Users/cosmos/Projects/cosmonauts/lib/config/loader.ts:224), so an accidental large setting makes this a long post-result delay. This is a **B-004 liveness** defect.

## End-to-end re-check

The real CLI, `spawn_agent`, inline `chain_run` (including named inline chains), and durable terminal QM stage converge on `launchQualityReview`; `/agent quality-manager` refuses an interactive switch. [CLI](/Users/cosmos/Projects/cosmonauts/cli/main.ts:652), [spawn](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/orchestration/spawn-tool.ts:808), [inline chain](/Users/cosmos/Projects/cosmonauts/lib/orchestration/chain-runner.ts:509), [durable chain](/Users/cosmos/Projects/cosmonauts/lib/orchestration/durable-chain-runner.ts:297), [agent switch](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/agent-switch/index.ts:57). `run status` points to the full report and disposition. [controller.ts](/Users/cosmos/Projects/cosmonauts/lib/durable-runtime/controller.ts:51), [run-control-tools.ts](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/orchestration/run-control-tools.ts:118).

The source consent is bound to the private checkout and run ID; the model-facing prompts use the private materials path, while source and host-store roots remain host context. [consent.ts](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/project-tools/analysis-consent.ts:39), [launch.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-launch.ts:331), [panel prompt](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-context.ts:26). The review base is `merge-base`; `ready` requires `completed-bound`; reviewer evidence is sealed before ordinary preparation and checks. [workspace.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-workspace.ts:399), [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:819), [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:659). D-026 explicitly permits its base-owned, lifecycle-disabled `analysisPrepare` step before assessment.

The host’s intended source-checkout write is the D-018 new plan summary; snapshot and base-export Git operations read the source. [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:1520), [workspace.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-workspace.ts:371). All four specialist prompts cover both QM materials and direct `cody`/`cosmo` spawns. [reviewer](/Users/cosmos/Projects/cosmonauts/bundled/coding/prompts/reviewer.md:49), [security](/Users/cosmos/Projects/cosmonauts/bundled/coding/prompts/security-reviewer.md:86), [performance](/Users/cosmos/Projects/cosmonauts/bundled/coding/prompts/performance-reviewer.md:84), [UX](/Users/cosmos/Projects/cosmonauts/bundled/coding/prompts/ux-reviewer.md:83). I found no change to the 200-character summary or a general evidence contract, and no cancellation of a child merely because its wait timed out. [summary](/Users/cosmos/Projects/cosmonauts/lib/orchestration/assistant-text.ts:34), [execution-liveness ACs](/Users/cosmos/Projects/cosmonauts/missions/plans/execution-liveness/spec.md:179).

## Residual limits (hostile-only)

- Deliberate post-seal rewriting of materials or the base export.
- Deliberate process-group escape to tamper with review evidence or Git objects.
- Deliberate registry redirection through reviewed package-manager configuration.

These are unranked under D-027. Host-run checks executing reviewed code with the operator’s authority are the accepted D-028 boundary.
