# Escalation — `episodic-log#B-028` has lost its conformance anchor

**Status**: drafted decision, awaiting human ratification. No code applied.
**Raised**: 2026-08-06, by the implementer, while fixing a load-sensitive test class.
**Route**: halt-and-escalate per `work-artifacts/references/deviation-protocol.md`.

## The finding

`missions/archive/plans/episodic-log/plan.md` records for B-028:

> - Test: `tests/driver/drive-on-graph-routing.test.ts` > `keeps disabled Drive specs results events and files byte-identical`
> - Marker: `@cosmo-behavior plan:episodic-log#B-028`

That test name does not exist anywhere in the repo, and the marker appears in
no file. `cosmonauts plan check-artifacts episodic-log` now reports it as the
plan's only `missing-marker` issue.

The nearest test is `drive-on-graph-routing.test.ts:154`, `keeps OFF-state Drive
files events layout and output byte-identical across hardened paths`, which
carries only `@cosmo-behavior plan:episodic-log-detached-hardening#B-001`. The
rename appears to have happened during the detached-hardening plan, which
absorbed the OFF-state ground without carrying the predecessor marker forward.

**The coverage did not disappear — the provenance did.** Nothing regressed; the
chain from a ratified promise to the test that proves it is simply broken.

## Why this is ratified ground

B-028's Source is AC-001: *"With the flag off (default), no episodic file is
ever created and … injected context and tool behavior are identical to today."*

The protocol marks two things always ratified regardless of provenance: the
letter of a spec acceptance criterion, and **default-state declarations (for
example, a feature gate that stays off by default)**. B-028 is both. An agent
may draft the change; it may not approve it — hence this document.

Note also: applying the marker alone would clear the checker while the plan's
recorded test name stayed wrong. That converts a visible signal into a silent
inconsistency, which is worse than the current honest failure.

## Where B-028's clauses are actually proven today

B-028 expects four things, in context *"gate absent/false across Pi/CLI inline
and detached launch"*:

| # | Clause | Proven by | Marked? |
|---|---|---|---|
| 1 | no episode source/attempt field serialized | `drive-on-graph-routing.test.ts:154`; `orchestration-driver-tool.test.ts:404`; disabled runs in `run-step.test.ts` | for other behaviors only |
| 2 | **detached launch still avoids runtime resolution** | structurally by `run-step.test.ts` B-018 (asserts `run-step.ts` contains no `CosmonautsRuntime` / `resolveDriveEpisodeWorker` / `episode-identity.ts`); behaviourally by the two disabled compiled-binary tests in that file | no |
| 3 | result/completion/events/spec bytes match baselines | `drive-on-graph-routing.test.ts:154` (inline); `orchestration-driver-tool.test.ts:404` (tool/inline) | for other behaviors only |
| 4 | no project/user episode/index path appears | both of the above assert no `memory/agent` and no `run.terminal-episodes` | no |

So the ground is genuinely covered, but by **three unmarked tests across three
files**, while the conformance model is one behavior → one named test. That
mismatch — not a careless deletion — is what broke the anchor.

Worth noting for clause 2: every candidate re-anchor target runs **inline**.
No single OFF-state test exercises detached launch behaviourally.

## Options

**A — Re-anchor to the OFF-state parity test.** Add `episodic-log#B-028`
alongside the existing hardening marker at `drive-on-graph-routing.test.ts:153`,
and update B-028's `Test:` line to the current name.
*Cheapest. Records a partial truth: that test is inline-only, so clause 2 would
be recorded as proven by a test that never launches detached.*

**B — Re-anchor to the tool-path disabled test**
(`orchestration-driver-tool.test.ts:404`). Slightly broader on clauses 1/3/4
(asserts absent **and** false config, plus no `run.terminal-episodes`).
*Same clause-2 gap as A.*

**C — Anchor a primary test and name the corroborating ones (recommended).**
Mark the OFF-state parity test as primary, amend B-028's `Test:` line to match,
and add an `Additional evidence:` field naming the tool-path and compiled-binary
tests. `episodic-log-detached-hardening#B-001` already uses exactly this field,
so there is in-repo precedent.
*Records what is actually true, at the cost of amending a ratified behavior's
`Test:` line — which is why it needs ratification rather than an agent's call.*

**D — Withdraw B-028 as absorbed by `episodic-log-detached-hardening#B-001`.**
*Carries a real risk worth stating: B-001 has a D-010 exclusion (a failing
plan-lock release is no longer byte-identical in the OFF state). Withdrawing
B-028 in favour of B-001 would quietly inherit that carve-out into AC-001's
original unqualified default-state promise. If the intent is that AC-001 stays
unqualified, D is the wrong option.*

## Drafted entry, if C is chosen

```
- **D-0NN — Re-anchor B-028 to the renamed OFF-state parity test** *(added <date>)*
  - Decision: B-028's `Test:` names `tests/driver/drive-on-graph-routing.test.ts` >
    `keeps OFF-state Drive files events layout and output byte-identical across
    hardened paths`, which carries the `episodic-log#B-028` marker alongside its
    existing `episodic-log-detached-hardening#B-001` marker. An `Additional
    evidence:` field names `tests/extensions/orchestration-driver-tool.test.ts` >
    `keeps absent and false-config inline specs completions layout and result
    exact` and the disabled-gate runs in `tests/driver/run-step.test.ts`.
  - Alternatives: leave the anchor broken (rejected: the checker reports a
    permanent missing-marker, training reviewers to ignore it); mark the marker
    present without amending the `Test:` line (rejected: clears the checker while
    the recorded test name stays wrong — a silent inconsistency); withdraw B-028
    (rejected: would inherit D-010's OFF-state exclusion into AC-001's
    unqualified promise).
  - Why: preserves AC-001's default-state guarantee by pointing it at the tests
    that actually prove it, rather than at a name that no longer exists.
  - Supersedes: B-028's `Test:` line naming `keeps disabled Drive specs results
    events and files byte-identical`.
  - Decided by: human
```

## Open question for the ratifier

Clause 2 ("detached launch still avoids runtime resolution") is currently proven
**structurally** — B-018 asserts the compiled child's source contains none of the
resolution symbols — rather than by an OFF-state detached run asserting no
episode artifacts appear. If that structural proof is considered sufficient,
option C closes this cleanly. If not, closing B-028 properly needs a small new
test, not just a marker move.
