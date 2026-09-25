# Plan Review: qm-chain-safety — round 3 (coordinator independent channel)

Four-lens adversarial review (spec fidelity, codebase feasibility, design attack, scope/sequencing), run without reading review-1/2, each lens's findings verified by a refuting verifier against the repository (workflow `wf_d255f9f5-310`, 2026-09-23). Dispositions refer to the revised `plan.md`.

## Findings

- id: SPEC-FIDELITY-001
  severity: high (finder: high)
  verdict: CONFIRMED
  title: "Plan invents a new duplication baseline, although a committed one already exists"
  checkable_claim: "`git ls-files .fallow-baselines` lists `.fallow-baselines/dupes.json` (last touched in commit 6b36c80), while plan.md D-008 calls the duplication baseline \"the currently missing file\" and Files to Change marks `.fallow-baselines/duplication.json` as \"(new)\"."
  disposition: applied: D-008 rewritten to consume dupes.json as-is

- id: SPEC-FIDELITY-002
  severity: medium (finder: high)
  verdict: PARTIAL
  title: "Removing shell from QM and panel goes beyond the spec and weakens AC-013 and AC-016"
  checkable_claim: "bundled/coding/agents/performance-reviewer.ts sets `tools: \"coding\"`, and bundled/coding/prompts/quality-manager.md lines 114-118 have the QM discover project checks from project artifacts through `verifier`. Plan D-012 and Design \u00a71 limit every quality-profile session to read/grep/find/ls and run checks only from configured argv entries, while spec.md Excluded says \"Isolation covers INV-001\"."
  disposition: partly applied: no-shell profile kept (AC-002/INV-001, D-012); unconfigured-project regression escalated as H-003; perf P1 evidence from host check timings

- id: SPEC-FIDELITY-003
  severity: medium (finder: medium)
  verdict: CONFIRMED
  title: "The legacy-file migration misses referencing files and edits curated knowledge without the required human act"
  checkable_claim: "`git grep -n -E \"(review|security-review|ux-review|performance-review)-round-[0-9]\\.md\"` returns hits in missions/reviews/qm/framework-health-incidents.md and tests/fixtures/knowledge-seed-inventory.json. Neither file appears in plan.md Files to Change, which does list knowledge/analysis-investigation-procedures.md for editing."
  disposition: escalated as H-005

- id: SPEC-FIDELITY-004
  severity: medium (finder: medium)
  verdict: CONFIRMED
  title: "Required model-family config makes the QM refuse in any project that lacks it, breaking AC-016"
  checkable_claim: "`grep -rn \"qualityReview\\|modelFamilies\" lib/config` returns nothing today. Plan B-011 states that \"every invalid/same-family/unavailable cell refuses or fails visibly\", and no behavior or design paragraph defines the outcome when that config is absent."
  disposition: applied in D-005 (shipped alias table); unconfigured outcome escalated as H-003

- id: SPEC-FIDELITY-005
  severity: low (finder: medium)
  verdict: PARTIAL
  title: "D-010 overstates the AC-003 collision and blocks stages it does not affect"
  checkable_claim: "spec.md AC-003 lists 'HEAD, refs, index, tracked files, uncommitted edits and untracked files' and does not mention ignored files. AGENTS.md says `missions/sessions/` is gitignored. plan.md Implementation Order says \"All stages are blocked until D-010 receives a human ruling\"."
  disposition: applied: D-010 narrowed to the plan summary as H-001; blocks scoped per stage

- id: SPEC-FIDELITY-006
  severity: low (finder: low)
  verdict: PARTIAL
  title: "Host report validation and closure enforcement come close to the excluded mechanical triage"
  checkable_claim: "spec.md Excluded names 'a machine-readable dispositions file' and makes triage the caller's job, and AC-013 says 'Reviewer guidance does not let...'. plan.md Design \u00a75 requires a `COSMO_QM_REPORT` footer carrying findings, humanItems and observations, and B-010's Seam is 'reviewer guidance and final-report validation'."
  disposition: applied: D-017 (index defect is not a failed run); Seam fields removed (D-014)

- id: FEASIBILITY-001
  severity: high (finder: high)
  verdict: CONFIRMED
  title: "The private clone cannot run the configured checks or the analysis tools"
  checkable_claim: ".gitignore line 1 is `node_modules/`. domains/shared/extensions/project-tools/fallow-provider.ts resolves the installed executable only via join(projectRoot, \"node_modules\", \"fallow\", ...) and says it omits PATH/global lookup. domains/shared/extensions/project-tools/analysis-consent.ts keys consent on realpath(projectRoot). No plan section says how the snapshot gets dependencies, tool binaries, or consent."
  disposition: applied: D-004 prepare step + in-memory consent mapping; R-006, R-007

- id: FEASIBILITY-002
  severity: high (finder: high)
  verdict: CONFIRMED
  title: "Forcing QM chains onto the durable runner hits an existing hard refusal"
  checkable_claim: "lib/orchestration/durable-chain-compiler.ts:203-219 (shouldRunChainInline returns true on completionLabel or loop). lib/orchestration/durable-chain-runner.ts:78-89 throws for inline-only chains. bundled/coding/agents/coordinator.ts:20 has `loop: true`. lib/orchestration/chain-parser.ts:95 copies the definition's loop. bundled/coding/chains.ts shows four of five QM-ending chains include coordinator."
  disposition: applied: D-016 (inline-chain QM stage runs as its own one-step durable QM run)

- id: FEASIBILITY-003
  severity: medium (finder: medium)
  verdict: CONFIRMED
  title: "A committed duplication baseline already exists; the plan says it is missing and creates a different file"
  checkable_claim: "`git ls-files .fallow-baselines` lists dead-code.json, dupes.json and health.json. The plan's Files to Change marks `.fallow-baselines/duplication.json` as new and D-008 says 'the currently missing file'. Spec Assumptions (spec.md ~261) name the committed `.fallow-baselines/` files as the baseline of record."
  disposition: applied: D-008

- id: FEASIBILITY-004
  severity: medium (finder: medium)
  verdict: CONFIRMED
  title: "The old-path link inventory is wrong and includes a frozen test fixture and pinned knowledge records"
  checkable_claim: "`git grep -l -E \"missions/reviews/(review|security-review|ux-review|performance-review)-round-[0-9]\"` returns tests/fixtures/knowledge-seed-inventory.json, which is not in the plan's list. `git grep -n review-round knowledge/analysis-capability-runtime.md` shows only `review-round-N.md` (line 128). missions/reviews/qm/framework-health-incidents.md lines 23, 91 and 108 name the old filenames."
  disposition: escalated as H-005

- id: FEASIBILITY-005
  severity: low (finder: low)
  verdict: CONFIRMED
  title: "Two Pi-First and D-005 claims do not match the code"
  checkable_claim: "`grep -n model: bundled/coding/agents/*.ts domains/main/agents/*.ts` shows openai-codex/gpt-5.6-sol on every definition. `fullText` appears only in lib/orchestration/spawn-tracker.ts, spawn-completion-loop.ts, message-bus.ts and domains/shared/extensions/orchestration/spawn-tool.ts, never in durable-chain-runner.ts or in node_modules/@earendil-works/pi-coding-agent."
  disposition: applied: D-005 and Pi-First bullet corrected; D-011 spawn_agent-only panel

- id: DESIGN-ATTACK-001
  severity: high (finder: high)
  verdict: CONFIRMED
  title: "No-bash review profile plus an origin-less clone leaves the QM and panel with no way to find the base or diff"
  checkable_claim: "bundled/coding/prompts/reviewer.md:51-57 and bundled/coding/prompts/quality-manager.md:29-39,81-82,142 find scope only by running git commands. plan.md:285-286 (D-012) and plan.md:541-545 remove bash from every QM and panel session. plan.md:157-158 (D-004) removes the clone's origin. No part of the plan's Design says the host computes and supplies the base SHA, the changed files or the diff."
  disposition: applied: D-004 base ref in clone + host-prepared review materials; Design §2, §6

- id: DESIGN-ATTACK-002
  severity: high (finder: high)
  verdict: CONFIRMED
  title: "The snapshot clone has no node_modules, so the configured checks and the Fallow provider cannot run there"
  checkable_claim: ".gitignore line 1 is `node_modules/`. domains/shared/extensions/project-tools/fallow-provider.ts:396-416 resolves fallow under `join(projectRoot, \"node_modules\", ...)`. domains/shared/extensions/project-tools/index.ts:465 and :555 pass `ctx.cwd` as projectRoot. plan.md:155-162 copies only 'tracked and non-ignored untracked state', and nothing in plan.md says how dependencies reach the clone."
  disposition: applied: D-004 qualityReview.prepare; R-006

- id: DESIGN-ATTACK-003
  severity: high (finder: high)
  verdict: CONFIRMED
  title: "D-008 bootstraps a 'missing' duplication baseline, but a tracked duplication baseline already exists"
  checkable_claim: "`git ls-files .fallow-baselines` lists dead-code.json, dupes.json and health.json. plan.md:217-218 and plan.md:880 describe `.fallow-baselines/duplication.json` as new or missing. .shepherd/work/in-progress/qm-chain-safety/investigation.md:54 names `dupes.json` as the committed floor."
  disposition: applied: D-008

- id: DESIGN-ATTACK-004
  severity: low (finder: medium)
  verdict: PARTIAL
  title: "Sampling the source with ordinary git porcelain rewrites the operator's .git/index, so AC-003 byte identity fails"
  checkable_claim: "`grep -rn 'optional-locks\\|OPTIONAL_LOCKS' lib cli domains bundled` returns nothing. plan.md:589-590 requires reading index identity and paths 'without source writes' but names no mechanism that stops git from refreshing the index."
  disposition: applied: GIT_OPTIONAL_LOCKS=0 plumbing-only capture (D-004, Design §2, R-004, B-002)

- id: DESIGN-ATTACK-005
  severity: medium (finder: medium)
  verdict: PARTIAL
  title: "Nested panel launches root their run store and transcripts in the disposable clone, not the host store"
  checkable_claim: "domains/shared/extensions/orchestration/chain-tool.ts:125 and :147 use `ctx.cwd` for both getRuntime and `projectRoot`. domains/shared/extensions/orchestration/spawn-tool.ts:638 passes `cwd: ctx.cwd`. lib/orchestration/session-factory.ts:111 derives the sessions dir from `config.cwd`. plan.md:825-829 lists no change that decouples the run-store root from the session cwd for these tools."
  disposition: applied: hostRunStoreRoot in profile; panel via spawn_agent only (D-011)

- id: DESIGN-ATTACK-006
  severity: low (finder: medium)
  verdict: PARTIAL
  title: "Snapshot workspaces can leak: no record before creation, removal is only optional, and cleanup waits for the next QM run"
  checkable_claim: "plan.md:608-615 lists no phase between `allocated` and `snapshot-ready` that records the workspace path before creation. plan.md:633-634 says the completion callback 'can remove the workspace', which requires nothing. plan.md:634-636 limits deletion of retained workspaces to a 'QM startup/cleanup pass'. `du -sh .git` reports 69M."
  disposition: applied: workspace-reserved event, mandatory removal (D-013)

- id: SCOPE-SEQUENCING-001
  severity: high (finder: high)
  verdict: CONFIRMED
  title: "Stage 1 removes the QM's check and report paths before any stage replaces them, so Stages 1-4 ship a QM that cannot run project checks or receive reviewer reports"
  checkable_claim: "bundled/coding/agents/quality-manager.ts lists `verifier` in subagents and bundled/coding/prompts/quality-manager.md:114-116 runs project checks only through `verifier`. plan.md:985-989 (Stage 1) removes verifier roles and shell, while the host-owned check runner (Design \u00a71, plan.md:550-564) first appears in Stage 5 (plan.md:1003-1006)."
  disposition: applied: Stage 6 removes authority together with its replacements

- id: SCOPE-SEQUENCING-002
  severity: medium (finder: high)
  verdict: PARTIAL
  title: "Stage 3's workspace cleanup after a wait timeout needs a late-completion signal the tracker drops today, and only execution-liveness AC-015 would add it, as a deferred follow-up"
  checkable_claim: "lib/orchestration/spawn-tracker.ts:162-166 throws on complete() for a non-running spawn, and lib/orchestration/spawn-completion-loop.ts:82 marks every running child failed on timeout. missions/plans/execution-liveness/spec.md:250-252 says the lossless-delivery fix is AC-015, which that plan leaves as a follow-up."
  disposition: applied: timed-out reviewer = missing, workspace retained (D-011, D-013)

- id: SCOPE-SEQUENCING-003
  severity: medium (finder: medium)
  verdict: CONFIRMED
  title: "Stage 2 must persist refusals and create durable runs, but run identity, lifecycle and the conservative report only exist from Stage 3"
  checkable_claim: "plan.md:366 (B-002, tagged to Stage 2) requires 'a named persisted refusal', while plan.md:994-995 (Stage 3) is the first stage that allocates QM run identity and creates the provisional report."
  disposition: applied: lifecycle/report stage (4) precedes snapshot stage (5)

- id: SCOPE-SEQUENCING-004
  severity: medium (finder: medium)
  verdict: CONFIRMED
  title: "QM lifecycle ownership and host-run check processes duplicate execution-liveness's owner, descendant and status seams that its ratified plan does not cover"
  checkable_claim: "missions/plans/execution-liveness/spec.md:199-209 includes the outer durable QM attempt, its descendants and the lapsed-owner check in that plan's scope. missions/plans/execution-liveness/plan.md Files to Change (lines ~1466-1532) lists no lib/orchestration/quality-review-* file. qm-chain-safety plan.md:300-303 and 632-637 define an independent owner-process-death cleanup."
  disposition: applied: owner-death protocol removed (D-013); R-008 names the execution-liveness amend-on-record

- id: SCOPE-SEQUENCING-005
  severity: medium (finder: medium)
  verdict: CONFIRMED
  title: "The duplication baseline the plan bootstraps as missing already exists at .fallow-baselines/dupes.json, so Stage 6's bootstrap step, its abort risks and the new duplication.json are unneeded scope"
  checkable_claim: "`git ls-files .fallow-baselines` lists dead-code.json, dupes.json and health.json. .shepherd/work/in-progress/qm-chain-safety/investigation.md:54 names `.fallow-baselines/{dead-code,dupes,health}.json` as the committed floor. plan.md:218-219 and 880 treat the duplication baseline as a missing new file named duplication.json."
  disposition: applied: D-008

- id: SCOPE-SEQUENCING-006
  severity: low (finder: low)
  verdict: PARTIAL
  title: "The blanket D-010 block and the late placement of the independent gate stages delay work that neither needs D-010 nor depends on the QM stages"
  checkable_claim: "plan.md:980-981 blocks all stages on D-010, while plan.md:244-261 (D-010) concerns only AC-003 versus AC-007. plan.md:1007-1014 (Stages 6-7) reference no artifact built in Stages 1-5."
  disposition: applied: independent stages 1-3 first; blocks scoped per H-item

## Convergence with review-1/review-2

Independently converged: dependency tree missing in the clone (review-2 PR-002 = DESIGN-ATTACK-002/FEASIBILITY-001), analysis consent (PR-003 = FEASIBILITY-001), no diff contract for read-only reviewers (PR-006 = DESIGN-ATTACK-001), unconfigured projects (PR-008 = SPEC-FIDELITY-004/002), Seam field drift (PR-009 = SPEC-FIDELITY-006). Unique to review-2: PR-001 (clone vs decided worktree → H-002), PR-004 (pre-import alias → H-004), PR-005 (gate tampering → D-009 tamper rule), PR-007 (policy owner in bundled/coding → D-003). Unique to this channel: duplication baseline already exists, inline QM-ending chains cannot use the durable runner, index refresh during capture, nested chain_run roots in the clone, stage ordering, execution-liveness owner-seam overlap.
