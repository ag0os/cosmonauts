# Closure review 1 — Claude subagent (Opus 5.5)

The prompt is `closure-review-prompt.md`. This is channel 1 of the TASK-728 closure. The review was run at `cca8f7d4` in a detached scratch worktree. It does not cover TASK-761, which was committed during the review.

The final message is kept verbatim; only the standard review-agent preamble about scratch cleanup is shortened.

**DO-NOT-SHIP-YET.** One HIGH (a reviewer that dies on a provider error counts as a completed review). Everything else I executed held, and all four gates are green.

## Findings

**HIGH-1: a reviewer that ends on a provider error is recorded as a successful review.** This breaks AC-006, B-003 and D-011 ("missing … or empty output … fails the assessment").

- **How it happens:**
  - `executeChildPromptLoop` (`domains/shared/extensions/orchestration/spawn-tool.ts:331-352`) always returns success. It never checks the final assistant message's error or aborted state.
  - `recordReviewerResult` (`spawn-tool.ts:237-259`) then writes the reviewer file with `outcome: "success"` hard-coded.
  - `lib/orchestration/assistant-text.ts:6-32` never returns empty text. It falls back to an earlier assistant message, or to the literal `"<role> completed"`.
  - As a result, the empty-evidence check at `quality-review-artifacts.ts:260` cannot fire on the real path.
- **Scenario:** a reviewer runs out of usage mid-run. Pi retries, and `session.prompt` then resolves normally with a text-less error message (confirmed in the pinned Pi 0.80.6 `agent.js` `handleRunFailure`).
- **Executed:** I drove the real `spawn_agent` path with such a child.
  - The sealed `reviewers/reviewer.md` held `"I'll start by reading the diff."` in one case and `"reviewer completed"` in the other.
  - No integrity failure was raised, and the required lens counts as present. The run can reach `ready` with no actual review.
- **Why the shipped test misses it:** "fails the assessment for empty reviewer evidence" passes `""` directly to the sink and never goes through this path.
- **Fix:** fail the reviewer when the last assistant message has an error or aborted state, or has no text of its own. Do not use the fallback text as evidence.

**MEDIUM-1: failing audit findings never reach the report on the real launch path.** This breaks the D-025 amendment ("each introduced audit finding is reported … from the audit envelope") and AC-008.

- **How it happens:** `analysisAuditObservation` in `lib/orchestration/agent-spawner.ts`, which produces the D-025 events that come up from the QM session, keeps only the kind, capability, base and verdict. It drops `findings`, so `qualityReviewAuditFindingLines` (`quality-review-launch.ts:173-194`) always returns nothing.
- **Executed:** a real `createPiSpawner` quality spawn emitting a failing audit with one finding produced the event `{kind, capability, scope:{base}, verdict:"fail"}` and `findingLines = []`.
- **Impact:** the verdict is still `not-ready`, so there is no false `ready`. But the host never lists the introduced findings with file:line.
- **Why the shipped test misses it:** "reports each finding from a bound failing audit envelope" hand-builds its events and bypasses the spawner.

**MEDIUM-2: `@ts-nocheck` passes the suppression gate.** This breaks AC-011 ("or an equivalent") and INV-005.

- **Where:** `lib/quality/suppression-policy.ts:15-21`. The registry's `equivalents` map is empty.
- **Executed:** adding `// @ts-nocheck` to a new file gave "suppression check passed".
- **Why it matters:** a file-level typecheck mute is exactly the kind of accidental agent move the spec's Purpose describes.

**LOW-1: renaming a file that already has a directive fails the gate.**
- `scripts/check-new-suppressions.ts:126-139` compares base and current only by the new path.
- **Executed:** `git mv` of a file carrying an existing `biome-ignore` reported "unregistered biome-ignore directive" and exited 1.
- This fails closed, but it contradicts AC-011's "existing directives are unaffected".

**LOW-2: two suppression forms are not detected.**
- A multi-line block comment whose last line is `@ts-ignore` passes, and `tsc` honors it. `suppression-policy.ts:57-65` only examines the start of the comment. **Executed.**
- Only JS/TS files are scanned (`check-new-suppressions.ts:121`), so a `biome-ignore` in a `.jsonc` file passes. **Executed.**

**LOW-3: two protections have no test that fails when they are removed.**
- The unresolvable-family branch (`quality-review-models.ts:90`). The test's "unresolvable" model also differs from the configured model, so the substitution check catches it first. The behavior itself is correct when run directly.
- The reviewer digest-mismatch check (`quality-review-artifacts.ts:261`). The host computes the digest from the same text, so it is not reachable by accident.

## Attack list (TASK-728 AC #6)

| Item | What was run | Outcome | Protected? |
|---|---|---|---|
| Stale stat cache + injected porcelain call | Injected `git status` without `GIT_OPTIONAL_LOCKS=0`, and `update-index --refresh`, into the capture source reads; ran the shipped stale-stat test | The test failed in both variants (index bytes changed). With the env var set, `git status` stays green | Yes; the test fails if the protection is removed |
| Absolute or root-escaping symlink | Real `runQualityReview` with an untracked absolute link, a tracked absolute link, and `d/esc -> ../../outside`; then removed the symlink check | All `blocked` with "Unsafe symlink"; the assessment never started. Without the check, 3 probes and the shipped escape test fail | Yes. Residual: a link that looks inside but escapes through another link (`b -> .`, `a -> b/../x`) is accepted; read-only and hostile-only |
| Source edits between the two samples | Every-attempt edits (content, new file, mode, staged or unstaged index); a first-attempt-only edit; then removed the digest comparison | Refused after 3 attempts; a one-time edit converges on the edited state. Without the comparison, 5 tests fail | Yes |
| Dirty-checkout byte fidelity | Staged, unstaged, untracked and removed-from-index files; a fake QM wrote and committed in the clone; hashed the whole tree including `.git` (except logs) before and after | Identical | Yes |
| Bracket and fan-out `chain_run` to `fixer` | Seven expressions (`[reviewer, fixer]`, `fixer[3]`, `[fixer, reviewer]`, `fixer[2]`, sequential), called from `coordinator` and `coding/lead`; then made the check skip parallel groups | All refused with "cannot start fixer"; no run allocated. With the mutation, 8 tests fail (2 shipped) | Yes |
| QM or child attempting bash, write or `chain_run` | Real bun runtime; real `createAgentSessionFromDefinition` with the bundled definitions; two mutations | The QM gets read/grep/find/ls, `spawn_agent` and analysis tools only. Reviewers get read/grep/find/ls. A fixer or worker child is refused. Ordinary `cody` is unchanged. Removing the tool filter fails 5 tests. Forcing the definition's tools still ends read-only (a second layer) | Yes |
| Forged, duplicate, foreign or empty reviewer completion | Removed each sink check in turn, plus the empty-completion probe | Foreign and duplicate checks are pinned. The empty check is pinned for literal `""` only. Forged (digest) is not pinned (LOW-3). **A real empty completion is accepted (HIGH-1)** | Partly |
| Reviewer timeout with no cancellation | Removed the timeout integrity failure; ran the shipped live-child tests | The timeout test fails; child abort is not called; the workspace is retained. A second guard ("Reviewers still live at assessment end") also fails the run | Yes |
| Same-change registry edit | The real script in a temp repo, with `@ts-ignore` and its registry entry in one commit | Fails against `main`; passes only when the registry is in the base | Yes. Gaps: MEDIUM-2, LOW-2 |
| Gate-owned-file edit | Emptied the gate-owned list | 3 shipped tests fail | Yes |
| Same-family, unresolvable and substituted models | Ran the diversity check directly on four model pairs; removed each check | All four cases are correct. Removing the substitution or same-family check fails a test; removing the unresolvable check does not (LOW-3) | Behavior yes; one test gap |
| Unconfigured checks and model | Real `runQualityReview` on unconfigured, checks-only and model-only repos, with a fake QM claiming `ready`; removed both not-configured flags | Never `ready`; "not configured" human items appear. Removing the flags fails 5 tests | Yes |

Everything that involves model sessions was exercised through the test harness with fakes. That covers the tests named above, plus probes in `orchestration.test.ts` and `agent-spawner.spawn.test.ts`.

## R-014 structural notes

- **Policy stays out of prompts:** launch, artifact and model policy lives in `lib/orchestration/quality-review-*`. The coding prompts name no host path, storage root or model policy, and the QM prompt carries only the report contract.
- **Hotspots:** `executeChainStep` and the chain runner each gained only a short hand-off to the launcher; placement lives in `quality-review-chain.ts`.
- **Durable runtime:** it gained generic `artifacts` and `postTerminalDisposition` status fields, with no QM persona and no Git logic.
- **Dependency direction:** there is no new `lib` → `bundled/coding` import. `lib` → `domains/shared` goes only to project-tools (the analysis consent type and the extension factory).
- **Ordinary agents and runs:** unchanged, confirmed with real sessions (`cody`, worker, reviewer).
- **Excluded scope:** `WorktreeSpec.isolated` is untouched. There is no panel graph, owner liveness, child cancellation, summary change or evidence generalization.

## Gates (at `cca8f7d4`)

- Tests: 3408/3408 (261 files).
- Lint: 0.
- Typecheck: 0.
- The `fallow audit --base main` changed-scope audit with the three committed baselines gave `pass`: 0 dead-code, 0 complexity, 0 clone groups.
- The `check:suppressions --base main` suppression check passed.

## Residuals (hostile-only, unranked)

- A symlink that looks inside the root but escapes through another link lets reviewers read next to the clone (materials or the base export).
- Host-run checks executing reviewed code can write through such a link. D-028 already covers this.

## Verdict

**DO-NOT-SHIP-YET**, blocked by HIGH-1. MEDIUM-1 and MEDIUM-2 need a disposition under AC #5. Each fix then needs a fresh two-channel review.
