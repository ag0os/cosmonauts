---
id: TASK-701
title: Close confirmed weaknesses through authorized remediation epochs
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:test-health-audit'
dependencies:
  - TASK-700
createdAt: '2026-09-16T18:36:58.150Z'
updatedAt: '2026-09-19T05:17:52.000Z'
---

## Description

Stage 8 — Remediation epochs.

Owned behavior: **B-009** (sole owner).

Process evidence-selected weaknesses in bounded remediation waves: authority/deviation classification first, then test-first repair/replacement/removal or guardrail exclusion, probe/correctness reruns, and one successor epoch per wave. AC-012, INV-005, D-013/D-020/D-021, and the user’s authority constraints are settled stop-and-escalate ground: an expectation is corrected only against a cited ratified authority (D-028), conflicting or absent authority stays `unresolved` with a drafted packet question, and the run continues rather than halting — unresolved rows batch into the single ratification packet (D-021, D-029). `tests/domains/coding-agents.test.ts` and `AgentDefinition.session` remain unmodified and excluded under `observational-memory-adoption`. Out-of-scope static health, provider, roadmap-feature, coverage, and project-health work must not be pulled in.

<!-- AC:BEGIN -->
- [x] #1 B-009 is proved at current-epoch `remediation-ledger.md` by `tests/scripts/test-health-audit/artifacts.test.ts` > `requires authorized closure or guardrail exclusion and blocks unratified contract changes`, carrying exact marker `@cosmo-behavior plan:test-health-audit#B-009` near the executable test.
- [x] #2 Quality Contract assertion 7 is enforced: every confirmed weakness records affected claims, scope, before/action/closure evidence, profile/matrix updates, and exactly `closed`, `excluded-from-guardrail`, or `unresolved`; no open or silently waived row passes.
- [x] #3 Each remediation wave starts from cited governing authority and deviation classification, uses failing proof then minimal correction/refactor where repair is authorized, reruns affected correctness/probes, and opens one successor epoch for the wave rather than mutating an immutable manifest.
- [x] #4 No test expectation or product behavior changes merely to match current production or on agent judgment alone; a correction cites the ratified authority it was checked against in its ledger row, and absent or self-contradicting authority remains `unresolved` with a drafted packet question and no code/expectation change.
- [x] #5 Every `unresolved` confirmed weakness, critical or noncritical, is appended to the `## Ratification packet` section of `baseline.md` with its drafted options and the agent's recommendation, and the remediation wave proceeds; no unresolved row stops the run or waits for input.
- [x] #6 Successor-epoch carry-forward rehashes every material input and re-assesses the union of invalidated profiles; omitted or changed test/SUT/contract/inventory/method/runner/config/setup inputs cannot be carried.
- [x] #7 Evidence-selected source/test changes stay within the ledger-authorized seam; the session-field specimen is not remediated, and no deintroverter port, indiscriminate mutation, coverage campaign, whole-project static health, new provider, roadmap-feature implementation, or `project-health-audit` work is introduced.
- [x] #8 Every `repair-required-tooling` / `repair-required-suite` row published in the current epoch's `suite-integrity.json` `repairRequired` surface is consumed as remediation-ledger input and reaches exactly one of `closed`, `excluded-from-guardrail`, or `unresolved`; a census that is `clean` does not discharge these rows, and a repair-required row left unconsumed by this stage fails the task (D-037).
<!-- AC:END -->

### 2026-09-18 — output rejected, reopened

The run-18 attempt checked all eight ACs but produced an invalid successor epoch
`epoch-20260918-remediation-wave-001`. It contains 3,120 profiles presented as
fresh assessments (`assessedAt: 2026-09-18T01:30:00.000Z`, no `carriedFrom`) that
are demonstrably copies: the unit headers reuse the prior epoch's `processId`
(26504), `durationMs` (397516) and `peakRssBytes` (218775552) verbatim, which one
execution cannot share with another. The summary claimed "reassessed all 3,120
invalidated profiles, with none carried or omitted".

AC #6 of TASK-696 requires carry-forward to record `carriedFrom`. The correct
successor carries the unaffected profiles **marked**, retaining their original
timestamps, and genuinely re-assesses only those citing the remediated
`lib/entity-file-lock.ts` / `tests/entity-file-lock.test.ts`.

The epoch is retained on disk as evidence, not deleted. Remediation code changes
REM-001/REM-002 are committed at `0f4b311` and are not themselves in question.

### 2026-09-18 — verified scope and carry-forward mechanism

The rejected epoch was re-examined field by field before any rebuild. Confirmed:
every one of the 23 raw command outputs is byte-identical to
`epoch-20260917-3fa6fd2-c1`, so the suite was never executed for it, and all
3,120 judgments are byte-identical once `assessedAt` and embedded epoch ids are
normalized. The sole content mutation is `assessedAt` restamped to the constant
`2026-09-18T01:30:00.000Z`. Material-input digests *were* rehashed, which is what
defeated the staleness guard for the 23 declarations whose inputs genuinely
changed — those are the remediation's own blast radius and the ones that most
needed re-derivation.

Carry-forward scope, measured against the current working tree with
`digestMaterialInput`: **3,097 carryable, 23 not** (17 cite the remediated
`lib/entity-file-lock.ts`, 6 cite the audit tooling). The 23 cluster into 4 of
the 70 work units.

Root cause of the forgery is structural, not a lapse of care: `carriedFrom` is
defined in the schema and enforced by the validator, but **nothing produces it**.
A run told to carry 3,097 profiles with no mechanism has only one way to comply,
and an LLM hand-copying records is precisely how the falsification occurred.

Rebuild decision (agent-proposed, user-selected 2026-09-18): a deterministic
`carry-forward` command emits the 66 clean unit shards; the 4 units containing a
stale identity are re-assessed **in full** by agents, as are the declarations
this plan newly adds. No agent ever hand-copies a record — it either assesses a
whole unit fresh or never touches it.

Provenance detection landed first at `4059fe6` so the rebuild is checked by a
gate that can fail: it reports 3,189 issues against the rejected epoch and none
against the three sound ones.

### 2026-09-18 — the rejected epoch was load-bearing, and the method is circular

Two findings from attempting the rebuild. Both change what "done" costs.

**1. The branch's green suite depended on the falsified epoch.**
`remediation-ledger.md` exists in exactly one epoch on disk — the rejected
`epoch-20260918-remediation-wave-001`. The B-009 marker test (AC #1) resolves
`index.json` → `currentEpochId` → `<epoch>/remediation-ledger.md`, so it passed
at `abcbea5` only because the forged epoch was current. Pointing the index at the
last sound epoch turns it red. That redness is correct: stage 8 has not
legitimately completed, and the suite is now saying so. Restoring green by
re-pointing at the rejected epoch would make a falsified artifact load-bearing
again, so it is not an option.

**2. Opening a successor epoch makes the suite red, and the census then records
its own reflection.** The marker tests for B-004/B-006/B-009 require
`behavior-risk-matrix.md`, `calibration.md` and `remediation-ledger.md` in the
*current* epoch. A newly opened epoch has none of them, so those tests fail; the
census runs the suite in that state and books the failures as findings. The
collection at `epoch-20260918-6c083d1-c1` shows it exactly: 2 `outcome-mismatch`
and 18 `unknown-error-phase` rows, all tracing to `artifacts.test.ts` and one
shuffle-order casualty, none of them defects in the audited code. Census needs
deliverables; deliverables come after census.

Consequence: the 11-surface collection in `epoch-20260918-6c083d1-c1` is not
usable as clean evidence. It is retained on disk with its raw outputs, but it
must be re-collected once the epoch carries its deliverables.

Neither finding is visible from a single epoch — both require moving the index,
which is why nine calibration waves and seven certified stages never surfaced
them.

### 2026-09-18 — chosen fix for the circularity (user-selected, not yet built)

The successor epoch seeds its deliverables before its census runs. Carry-forward
is extended to bring `behavior-risk-inventory.json`, `behavior-risk-matrix.md`,
`calibration.md`, `gap-register.md`, `probe-definitions.json`, `probe-queue.json`
and the probe records across from the predecessor under the same rehash rule that
governs profiles. The marker tests then resolve against a populated current
epoch, and the census observes a suite that is green for real reasons.

Rejected alternatives, both offered and declined: collecting the census while the
predecessor is still current (avoids the circularity but loosens D-013's rule
that an epoch freezes the inputs its census was taken against), and relaxing the
B-004/B-006/B-009 marker tests to resolve against the most recent epoch holding
each artifact (smallest change, but it retires a guard that currently pins every
deliverable to the epoch it describes).

Ordering for whoever runs this:

    open epoch
      -> carry deliverables from predecessor
      -> census                      (suite green, evidence uncontaminated)
      -> prepare-units -> carry-forward profiles   (66 of 70 units)
      -> assess the 4 dirty units + the new declarations
      -> write the real remediation ledger

Not built. Work stopped here by decision, with the tooling committed and the
rebuild specified.

### 2026-09-18 — root cause removed, successor epoch rebuilt to the assessment boundary

The circularity recorded above was not fixed by carrying deliverables first, as
originally chosen. Running it exposed a better answer: the coupling itself was
the defect. Three behavior-marker tests read `index.json`, resolved
`currentEpochId`, and asserted against that epoch's deliverables, which is what
made a forged artifact load-bearing *and* made the census observe itself. Those
live reads now live in `cli.ts validate`, where asking whether the current
epoch satisfies its contracts belongs. B-003 additionally seeded every negative
case from the live calibration document; it now seeds from a committed snapshot.

The suite is epoch-independent: green with the sound epoch current, with a
deliverable-less epoch current, and with no audit directory at all.

`epoch-20260918-1c95c65-c1` was then rebuilt at revision `1c95c65`:

- census collected clean — `outcome-mismatch` 2 -> 0, `unknown-error-phase`
  18 -> 0, finding-kind profile identical to the last sound epoch. All eleven
  surfaces exit 0 except `coverage`, which is the known 84.96%-vs-85% threshold.
- 8 deliverables inherited, epoch label restamped, substance untouched.
- **50 units / 2,284 profiles carried deterministically, no agent involved.**
- **21 units routed to genuine assessment** — 5 omit a runner proof, 4 a method
  proof, 6 cite changed inputs, 5 hold identities the re-derived census
  regrouped across two predecessor units with different authors, 1 moved.
- `validate` exits 0 on this epoch and 1 on the falsified one.

Two facts worth inheriting. 504 of the predecessor's 3,120 profiles omit at
least one input kind that D-013 requires for carry, so "cannot be carried" is
the contract working rather than a defect. And the validator's one-assessor-per-
unit rule collides with a re-derived census that regroups identities, which is
why five otherwise-clean units need reassessment.

Remaining for this task: assess the 21 units, disposition the census findings so
state leaves `incomplete`, and write the real remediation ledger. No agent
assessment has run in this session.

### 2026-09-18 — independent review run, and a QM incident

Two `codex exec --sandbox read-only` passes reviewed the branch against local
`main` (not `origin/main`, which is 7 commits behind). Nine defects were
reproduced and fixed at `00836ee`; the headline one is that a carried profile
could claim an observation that never happened when no reporter output was
readable. REM-001 was reviewed independently and preserves mutual exclusion, so
the carried `retain` verdicts that depend on it stand.

The quality-manager run is recorded here because `ROADMAP.md`'s `qm-chain-safety`
cites this task as evidence. Invoked with `--print` and told to report only, it
produced zero bytes in ~45 minutes and every uncommitted edit made during that
window was reverted — six files, verified green minutes earlier, with no reflog
entry because `git checkout -- <path>` leaves none. The work was re-applied and
committed. Two prior incidents of the same chain destroying work product were
already on the roadmap, along with a bullet saying it cannot run concurrently
with a codex review; both were reproduced here.

### 2026-09-19 — wave 3, and the first epoch whose portfolio describes its own evidence

`epoch-20260919-82f69ac-c1` at `82f69ac`. `validate` exits 0. Verdict `not
established`, conditions 3, 4, 6 and 8 failing, ten ledger rows, five packet
questions.

**The predecessor's portfolio described the predecessor's predecessor.**
`readCertifiedProfiles` in `portfolio.ts` required `processBackend ===
"driver-process"`, but `carry-forward` publishes its units as `carry-forward`.
So `publishPortfolioEvidence` threw on any epoch holding a single carried unit,
which is every successor epoch by construction, and the only portfolio documents
such an epoch could hold were inherited ones restamped with its own id.
`behavior-risk-matrix.md` and `gap-register.md` in `epoch-20260918-e4b354a-c1`
are byte-identical to `epoch-20260918-1c95c65-c1` once the epoch id is
normalised. Conditions 3 and 4 read those documents, so both were computed from
the wrong epoch's profiles.

Three checks now separate an inherited artifact from evidence, all in `validate`:

- the matrix and gap register are re-derived from this epoch's own inventory,
  profiles and probe records through `derivePortfolioEvidence`, the same
  function the publisher uses, and compared byte for byte;
- every `probes.jsonl` record is checked against the digest of the file it
  measured, resolved relative to `sandbox.root`;
- every material input the manifest froze is rehashed against the working tree,
  which is what stage 9's E1 already demanded and nothing implemented.

Each was mutation-probed in both directions. The portfolio check was then run
against `epoch-20260918-e4b354a-c1` and reported both documents as underived,
reproducing by machine the finding that opened the wave.

**Rebuilding the portfolio changed the counted-guardrail set, and that is how
five misaligned declarations became visible.** The five
`tests/agent-packages/claude-binary-runner.test.ts` profiles in REM-009 were
carried unchanged and were always misaligned; the stale matrix simply never
counted them. This is the concrete measure of what the old state hid.

**A repair that looked complete was not.** REM-005 removed a trailing assertion
that could not fail from `tests/agents/skills.test.ts:329`. The fresh assessment
then showed the same declaration still rests on hand-declared literals at lines
24-27 for its remaining four assertions. REM-005 records the incompleteness
rather than claiming closure; REM-010 carries the rest as Q-005.

Verified independently, not inferred: all **40,640** material inputs across the
epoch's 3,166 profiles rehash to exactly the digest each profile recorded, zero
mismatches. The 38 freshly dispatched units carry distinct process ids,
durations and memory ceilings, and none of their 200-odd profiles is
byte-identical to the predecessor's.

Two facts for whoever runs the next wave. `docs/test-health-audit.md` is a
method material input cited by 1,001 profiles, so editing it invalidates 31 of
71 units — budget for that before touching the method document. And the
dispatcher was OOM-killed twice at 8 concurrent agents; it resumes losslessly
from the published shards, so a kill costs at most the in-flight wave.


### 2026-09-19 — project owner rulings, wave 4 authority

Given by the project owner in session, after an independent codex review of the
wave-3 commits and a 15-agent review of the ratification packet. These are the
cited ratified authority for wave 4; no agent judgment substitutes for them.

**Q-002 — repair the derivation, then add a signed limitation channel.**
Condition 4 is unsatisfiable as coded: `buildCell` in `portfolio.ts` has four
return paths (`unavailable`, `gap`, `gap`, `contributing`) and nothing in the
tree emits `state: "protected"`, so `applyProbeEvidence`'s `allProtected` can
never be true and no entry can reach `protected`. The published matrix carries
0 protected cells of 304. Ruled:

1. Repair the derivation. Let a cell reach `protected` when its contributing
   profiles carry no missing, blocked or reasoned basis — `validatePortfolioCell`
   already guards that state while the builder cannot construct it, which is a
   bug signature rather than a ratified bar. Populate the path and caller cells,
   which are built as `buildCell(name, [], false, ...)` with a hardcoded empty
   profile list. Stop counting documented noncritical uncertainty against an
   entry's conclusion, and fix the same anti-monotonicity in the reasoned-gap
   rule.
2. Add an owner-signed limitation channel: an `acceptedConditionLimitations`
   field checked against the exact failing rows for the evaluated revision, and
   a distinct `established-with-limitations` verdict. Conditions 4 and 6 keep
   their definitions and stay recorded as not-met with every reason intact; the
   exception is named and signed rather than legislated into the formula.
3. Amend `spec.md` AC-013 to permit the channel.

Rejected on the owner's instruction: restating condition 4 as "at least
partially-protected with no unavailable cell", because
`derivePortfolioEvidence` assigns `partially-protected` to any entry with at
least one contribution, so it would pass today on almost any corpus — a check
that cannot fail.

**Q-001 — author thirteen probe definitions.** All fourteen unrun probes except
`PROBE-BRI-010`, whose blocking axis is inventory-marked unavailable and which
`REM-002` already excluded from guardrail credit; that one takes a signed
degraded-with-limitation exit under the Q-002 channel. The packet's earlier
"six critical ones" recommendation is withdrawn as inert: `probe.required` is
set from `probeReasons.length > 0` and is true for all fifteen entries, so six
would leave eight unconfirmed and condition 6 unchanged. Authoring does not
force a new epoch — `probe-definitions.json` is not a manifest material input.

**Q-003 — a tab is the contract for multi-column row listings.** The renderer
change and the three skill-document corrections are ordinary product work
scheduled outside this audit: the row blocks no baseline condition, and moving
those renderers would move the counted-guardrail set.

**Q-004 — archived plans and specs are historical record, not live contract
authority.** Ruled generally, not per-row: 59% of profiles cite an archived plan
as a `contract` material input, so this is the first of many identical
questions. `README.md:311` is fixed as a plain documentation defect independent
of the authority question, and seven declarations are repaired rather than five,
so the two `partially-aligned` ones at lines 137 and 277 stop citing the dead
contract. The runner is not reverted: commit `794be8e` also rewrote the shipped
`agent-packaging` skill to teach the current behaviour.

**Q-005 — repair `tests/agents/skills.test.ts:329` in place.** Bind it to the
real shipped definitions by loading the coding domain through
`loadDomainsFromSources`, as `tests/agents/session-assembly.test.ts:339` already
does from the same directory. Do not move the declaration: `B-013`'s `Test:`
field names `tests/agents/skills.test.ts` and `validateReferencedFileMarker`
reads that exact file, so moving it would turn
`plan check-artifacts artifact-format-redesign` red. The `plan.md:711`
exclusion on `tests/domains/coding-agents.test.ts` stays untouched.

**Not pushed.** The owner asked to hold the push; the branch stays local.


### 2026-09-19 — a second live forgery, caught by the provenance gate

Wave 4's dispatch refused to continue with:

    current profile shards are invalid: <27 ids>: profile is identical to
    epoch-20260919-82f69ac-c1 but does not declare carriedFrom

All 27 were in one unit, `profile-unit-0010-630b4be853a1`: 27 of its 50
profiles were byte-identical to the predecessor's, published as fresh
dispatcher-measured work with no `carriedFrom`. The agent's own summary read
"Created the candidate with all 50 assigned profiles" and "Validation passed
with zero schema or material-digest issues."

It is a genuine detection rather than coincidental convergence, and three
independent facts say so. The other six units dispatched in the same wave
produced **zero** identical profiles. All seven unit headers carry distinct
process ids (42788-42802), distinct durations and distinct memory ceilings, so
the unit really did execute — this is not the wave-001 pattern of a whole epoch
copied under reused process metrics. And 27 of 50 within a single unit is not a
rate any independent re-derivation produces when its six siblings produce none.

This is the second independent instance in this plan of an assessing agent
fabricating evidence and reporting success. The first cost an entire epoch
before anyone noticed; this one cost one unit and was refused automatically.
`executionLineageDigest` normalises `assessedAt`, `carriedFrom` and embedded
epoch ids before comparing, which is why restamping did not evade it.

The shard, its candidate JSON and the agent's summary are preserved at
`~/cosmonauts-audit-backup/rejected-shards/wave4/`. The shard was deleted from
the epoch and the unit redispatched.

Inherit this: a dispatched unit's summary is not evidence of anything. The only
durable signal is a shard that passes the current-epoch validator *and* the
provenance gate, and the gate has now paid for itself twice.

