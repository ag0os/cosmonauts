---
kind: independent-review
plan: qm-chain-safety
channel: Claude subagent reviewer (general-purpose, read-only)
scope: round-2 remediation a978dbc..4c7bb15 (TASK-733, TASK-734) + resolution of mid-review-2
date: 2026-09-24
---

# Mid-branch review 3 — Claude reviewer

The prompt is `mid-review-3-prompt.md`. The reviewer's final message follows verbatim.

## Mid-branch review 3: `qm-chain-safety`, Stages 1–6 after the round-2 fixes

**Verdict: DO-NOT-SHIP-YET, but it is close.** Every round-2 blocker is fixed and I found no new HIGH. What remains is two new MEDIUM regressions and one accepted residual whose acceptance is unsound. Each is a small, local fix.

**How I checked:** I read the whole round-2 diff `a978dbc..HEAD`. I ran the 8 affected test files: 144/144 pass. I also ran throwaway probes under `scratchpad/mid3/`. I changed nothing in the repository.

### 1. Resolution table

**Round 2, codex**

| Finding | Status | Evidence |
|---|---|---|
| N1: deadline removes the workspace while the QM session is live | **RESOLVED** | After a deadline or cancel, the run waits up to 250 ms for the QM session to settle (`quality-review-run.ts:394-403`). If it hasn't, `qmSessionLive` is set, the workspace is kept, a "Live work" line goes into the report, and the lifecycle event records `liveSession` (`:656-659`, `:688-693`, `:710-718`). Test `run.test.ts:1644` has an `execute` that never settles and no panel child. On the old code it would fail, because the workspace was removed. |
| N2: missing `gateState` fails open | **RESOLVED** | `ready` is now blocked unless `gateState === "completed-bound"` (`:489`). A missing state becomes "not observed" and a human item (`:508-513`). Both tests use the injected `execute` port (`launch.test.ts` and the durable-child test). |
| N3: late reviewer evidence written after finalization | **RESOLVED** | The run seals the reviewer sink itself before it writes `final.md` (`run.ts:655`; `quality-review-artifacts.ts:133-140`). The spawn-tool checks `reviewersOpen()` in the same tick as the write (`spawn-tool.ts:189-208`). Test `orchestration.test.ts:1172` drives a real spawn-tool completion. It asserts that no reviewer file exists, that there are no `artifact_written` events, and that `abort` was not called. |
| Residual M4 (own-process-group grandchild) | Accepted, but the acceptance is **unsound**. See the accepted items below. | |
| C7, M3, L3 (round 1, marked PARTIAL in round 2) | **RESOLVED** | Covered by the N1 and N3 fixes. |
| L4 (round 1): caller prompt and model dropped | **OPEN, accepted** | Unchanged. See the accepted items below. |
| L5 (round 1): `execute` port | **RESOLVED** | Now fails closed through the N2 fix. |

**Round 2, Claude**

| Finding | Status | Evidence |
|---|---|---|
| H1: suppression scanner regressed | **RESOLVED** | Comment collection is parser-based again (`suppression-policy.ts:36-53`). My probe finds 23 directives in tracked sources, the same as the 23 registry entries. Template-literal and regex cases are tested. The repo-level equality test would fail on a scanner that drops directives. |
| M1: panel system prompts name the source root | **RESOLVED** | Skill paths under the source root are remapped into the clone, or dropped if absent there (`session-factory.ts:60-89`). `sourceRoot` is passed through the launcher (`launch.ts:216`). The new test (`quality-review-session-prompt.test.ts`) builds a real Pi session and checks its full system prompt. It would fail without the remap. |
| M2: detached checks outlive Ctrl-C | **RESOLVED for the CLI** | `cli/main.ts:629-649` and `:677-697` wire SIGINT/SIGTERM to the run's abort signal. The fix introduces NEW-M1 below. |
| L1: gate reporting | **RESOLVED, text wart remains** | A bound audit that fails goes under Gates and Findings, not Human decisions (`run.ts:536-544`). Human items are de-duplicated. The wart is NEW-L1. |
| L2: late-reviewer window | **RESOLVED** | Same fix as N3. |
| L3: lifecycle | **RESOLVED** | Exactly one terminal phase is written, with disposition `removed`, `retained` or `none`. The digest is recorded after any retention rewrite (`run.ts:680-718`). Tested for removal success and failure. |
| L4: triage over-includes | **RESOLVED, but now it under-includes** | See NEW-M2. |
| L6: analysis results captured for every spawn | **RESOLVED** | Capture now happens only when the spawn has `qualityReviewContext` (`agent-spawner.ts:429-432`, `:557-559`). The test would fail if capture were unconditional. |
| L5: materials writable during checks | Accepted; the acceptance is sound. | |

### 2. New findings

**No HIGH.**

**MEDIUM**

- **NEW-M1: While a check or prepare command runs, the host no longer exits on SIGINT or SIGTERM** (`quality-review-command.ts:14-26`).
  - **Cause:** installing a listener replaces Node's default "exit on signal". The repo already notes this hazard at `lib/driver/run-step.ts:29`. The handler kills the command groups but does not re-raise the signal.
  - **Probe:** I sent SIGTERM to a host during a two-check run. The host survived. The killed check was recorded as an ordinary failure (`exit null`, not cancelled), and the next check ran.
  - **Who is affected:** hosts that don't install their own handler. That means a foreground `cosmonauts run chain` with a terminal QM stage (only `cli/memory` has a handler), and a `spawn_agent` QM receiving an external SIGTERM. Ctrl-C is swallowed, and the run continues into the QM assessment for up to the 900 s deadline.
  - **Breaks:** B-004 liveness, and D-025's "caller cancellation … finalize(s) the run".
  - **Fix:** after killing the groups, remove the listener and re-raise the signal. The CLI SIGINT wiring itself has no test.

- **NEW-M2: The host's minimum lens set now drops real code** (`quality-review-launch.ts:292-314`). The documentation filter matches any path segment named `docs`, `memory`, `knowledge`, `missions` or `README`.
  - **Scale:** 26 tracked source files are treated as documentation, including all of `lib/memory/` (e.g. `path-safety.ts`), `cli/memory/*` and `cli/scaffold/commands/missions.ts`.
  - **Probe:** a `lib/memory/store.ts` diff adding `node:fs` writes gets `["reviewer"]`. The same diff under `lib/auth/` also gets `security-reviewer`.
  - **Pure deletions:** the triage only reads `+` lines, so removing an auth check gets `reviewer` only.
  - **Prompt changes:** changes to agent prompts (`bundled/coding/prompts/*.md`, which are behaviour) also get `reviewer` only.
  - **Breaks:** D-025's panel triage. The QM can add lenses but cannot be required to, so the host floor is what enforces coverage.

**LOW**

- **NEW-L1: Human-item text still doubles its prefix.** Unbound, unconsented or missing-status states produce "Analysis audit gate state: Analysis audit binding state: unbound; human decision required." (probed). The test fixture passes a string the validator never produces (`run.test.ts:~159`), so the AC #7 "not duplicated" test does not reflect the real path.
- **NEW-L2: Ordinary cancels leave clones behind.** The 250 ms grace is short compared with `session.abort()`, which waits for in-flight tools. A routine Ctrl-C during an `analysis_audit` call is likely to keep the clone, and nothing ever removes a kept workspace. It is safe, but clones pile up in the temp directory.
- **NEW-L3: The scanner reports JSX text as a directive.** JSX text that starts with `//` is reported as a suppression (probed: `<p>\n// @ts-ignore is text</p>` gives 1). It errs on the safe side.
- **NEW-L4: Some panel skills can vanish silently.** Skills under `<source>/node_modules/...` are dropped when the clone has no `node_modules`, so a project that installs Cosmonauts locally loses panel skills. This does not affect safety.

**Checked against the ratified constraints:**
- Timed-out children are still not cancelled; the test asserts `abort` is not called (AC-015).
- No general evidence contract was added (AC-016), and the 200-character summary is unchanged (AC-018).
- No new write into the operator checkout. No scope beyond D-025, TASK-733 and TASK-734.

### 3. End-to-end check for real callers

Callers checked: CLI print and interactive, `spawn_agent`, terminal inline and durable chain stages, `/agent`, and `run status`.

| Check | Result |
|---|---|
| Analysis consent bound in the clone | Unchanged; still correct. |
| Source root and host run store hidden | Now holds for the panel too (M1 fixed). |
| `ready` needs a host-observed, bound audit | Yes, including through the injected `execute` port. |
| Base is the merge-base | Untouched by this diff; still the merge-base. |
| Operator checkout unchanged except the D-018 plan summary | Yes. |
| Specialist prompts serve both QM panel and direct `cody`/`cosmo` spawns | Unchanged. |

N-003 (the installed catalog package shadowing the bundled one) still applies to any live run on this machine.

### Are the coordinator's acceptances sound?

- **Claude round-2 L5 (materials writable during checks): sound.** Permission bits between processes of the same user were never a boundary, and the materials are sealed before the QM starts.
- **Own-process-group grandchild: unsound as stated.** Stopping the detached grandchild would need an OS sandbox, but bounding the host's wait would not.
  - **Probe:** a check that starts a detached `sleep 6` with inherited stdout, run with a 1000 ms timeout and a cancel at 1500 ms, blocked the host for 6039 ms.
  - A long-lived daemon started by a check therefore hangs prepare or checks indefinitely, and cancellation cannot end the run. That breaks D-025's bounded, cancellable checks.
  - **Fix:** on timeout or cancel, finish on the child's `exit` event and destroy its stdio pipes instead of waiting for `close`. Accept only the leaked grandchild itself.
- **Round-1 L4 remainder (caller prompt and model dropped): sound.** Scope is set by the host by design, and the model belongs to Stage 7. I'd recommend telling the caller that its prompt was ignored.

### Verdict

DO-NOT-SHIP-YET, because of NEW-M1, NEW-M2 and the unbounded check wait. None is architectural.
