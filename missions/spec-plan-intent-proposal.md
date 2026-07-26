# Proposal — Intent, mutability, and the deviation protocol

Status: **proposal for human review** (per the kickoff's suggested first moves —
no skill/prompt edits made yet). Companion to
`missions/spec-plan-intent-kickoff.md`.

## Summary

Four additions, one governing rule:

> The plan is the thing you amend **on the record** — never the thing you
> silently route around.

1. **Intent section** — spec gains a required `## Intent`: the goal plus ranked
   invariants (`INV-###`) that outrank any mechanism. When mechanism collides
   with an invariant, mechanism yields and the yield is recorded.
2. **Mutability** — every Decision-Log entry is *ratified* (stop-and-ask) or
   *derived* (amend-on-record). The default is **derived from the existing
   `Decided by:` field** — no new mandatory field, no migration.
3. **Amend-on-record protocol** — the five-step mechanics of deviating safely:
   classify, write the dated decision first, mark the superseded text with a
   pointer, build to the amendment, surface it in the completion report.
4. **Deviation classifier** — the decision procedure that maps a detected
   deviation to snap-back / amend-on-record / halt-and-escalate. It runs at two
   points: when an *implementer* wants to deviate, and when a *reviewer finding*
   is routed to remediation (the channel the real drift came through).

None of this is invented. The `episodic-log-detached-hardening` plan already
did all four **by hand**: the Implementation Order preamble ("if a stage
requires changing a ratified ordering … stop and revise this plan rather than
improvising"), D-010's "this is a *named* narrowing, not silent drift", the
"superseded by D-005" pointer left inside SEQ-003, and the follow-up handoff's
"PR-002 (RATIFIED — do NOT 'fix') … STOP and revise the plan with the human."
This proposal extracts that ad-hoc practice into the shipped system.

## Verified current state (what the system actually says today)

- `work-artifacts/references/plan-format.md` **does not list `## Decision Log`
  as a plan section at all.** The convention lives in
  `references/architecture-format.md` (for architecture records) and
  `bundled/coding/skills/design-dialogue/SKILL.md` (interactive planning only,
  explicitly "do NOT load as a chain stage"). Exemplar plans carry it by
  imitation, not by contract. Step one of any of this is promoting the Decision
  Log into the plan format itself.
- The existing `Decided by:` values are provenance, not authority:
  `planner-proposed / user-directed / user-chose-among-options`
  (design-dialogue), "human, plan, or review source" (architecture-format).
  Provenance maps almost 1:1 onto the mutability we need — that's the hook.
- `worker.md` says: "If something is unclear, make a reasonable decision,
  document your reasoning in `implementationNotes`, and proceed." That is the
  ad-hoc rule the kickoff says agents currently follow. It has no notion of
  whose decision it is to make.
- `quality-manager.md` routes findings to `fixer` / `review-fix` tasks purely by
  complexity and confidence. Nothing checks a finding's remediation against the
  plan's ratified ground. **This is the exact channel the drift came through**
  (round-3 HIGH + QM F-001 → commit `f78862f`).
- `spec-format.md` has `## Purpose` but nothing separates load-bearing intent
  from narrative. The ranking that later decided the drift revert ("silently
  missing terminals are exactly the corruption a consolidation job cannot
  repair") existed only as prose in the spec's Purpose — present, but not
  load-bearing, so the review-fix agent never weighed it.
- `docs/testing.md` is mechanics only (mocks, timers, coverage). There is no
  rule anywhere that a test asserting ratified behavior may not be rewritten to
  bless new behavior — the drift's signature move.

## 1. The Intent section

### Shape (in `spec.md`, after `## Purpose`)

```markdown
## Intent

Goal: <one sentence — what must remain true no matter how the implementation changes>

Invariants — mechanism yields to these; no local fix may trade one away:

- INV-1 — <invariant> [source: D-###/AC-###/constraint if inherited]
- INV-2 — <invariant>
```

Rules:

- Invariants are **ratified ground** by definition. Changing or narrowing one is
  always stop-and-ask.
- Keep the list short (3–7). An invariant is something a *mechanism elsewhere in
  the artifacts could plausibly collide with*. If nothing could collide with it,
  it's Purpose prose, not an invariant.
- Where invariants can be traded against each other, **state the ranking**
  (see INV-4 below — the drift case turned entirely on a ranking).

### Ownership (open question 1 — recommendation)

Single source: the spec owns Intent when a spec exists. The plan does **not**
restate it — plan sections cite `INV-###` by ID (they sit in the same
directory; the ID is the authority pointer, and restatement is where forked
authority starts). When no spec exists (planner working from a direct request),
the plan carries the Intent section itself and is the single source.

### Retrofit — episodic-log-detached-hardening

Had the spec carried this section, it would have read:

```markdown
## Intent

Goal: an enabled Drive run yields exactly one, honestly-attributed terminal
episode per attempt, with capture problems visible where the human is looking —
and episode capture never becomes load-bearing for the run itself.

Invariants:

- INV-1 — Exactly-once: one attempt never yields two terminal episodes
  (no failed+aborted pairs). [inherited D-009]
- INV-2 — Fail-soft: episode capture and its bookkeeping never fail, stall,
  or reclassify a primary run result. [inherited D-008]
- INV-3 — Honest attribution: no episode names a worker that never ran.
- INV-4 — Corruption ranking: a silently missing terminal is WORSE than a
  duplicate. A mechanism forced to trade one for the other must not choose
  silence. [spec Purpose ¶2 — W4 consolidation cannot repair a missing episode]
- INV-5 — OFF identity: gate off ⇒ byte-identical to main, except where a
  dated decision names a narrowing. [AC-001]
- INV-6 — Consumer contract: completion file present ⇒ terminal legacy event
  already emitted. [hard design constraint 3]
```

Every incident below resolves against this list mechanically — that is the
proof of usefulness (§5).

## 2. Mutability

Two levels of authority over any piece of recorded ground:

- **ratified** — changing it requires a human (stop-and-ask). The escalation
  deliverable is a *drafted* decision entry, not applied code.
- **derived** — an implementing agent may amend it on the record without
  escalation, provided intent is preserved and the amendment is written down.

### Defaults (open question 2 — recommendation)

**Derive the default from the existing `Decided by:` field.** No new mandatory
field; zero migration; archived plans unaffected.

| `Decided by:` says…                                   | Default   |
|--------------------------------------------------------|-----------|
| names the human (`human`, `user-directed`, `user-chose…`, `human-approved`, "ratified … direction") | ratified  |
| an agent (`planner-proposed`, `implementer, amend-on-record`, `review-derived`) | derived   |
| missing entirely                                        | ratified (safe default — and a nudge to record provenance) |

An explicit `(ratified)` / `(derived)` marker on the entry title overrides the
default. Write the marker **only when overriding** — keeping ceremony at zero
for the common case.

### Ground that is ratified regardless of tags

- Spec `## Intent` invariants (by definition).
- Spec acceptance criteria — their *letter*. Narrowing an AC is always human
  ground (the D-010 precedent). Behaviors (`B-###`) that merely restate an AC's
  letter inherit its ratification; behaviors that add mechanism around it are
  derived.
- Scope exclusions and gate/config defaults ("stays off by default").
- Anything a decision entry marks as a stop-and-redesign condition.

Everything else — design mechanism, seams, named tests, risk notes,
planner-proposed decisions — is derived. This matches the actual episodic-log
history: the exclusive-claim rework (44099f6) amended derived claim *mechanics*
freely while D-002's exactly-once *goal* stayed untouchable.

## 3. The amend-on-record protocol

When the classifier (§4) says "amend": five steps, in order.

1. **Stop building** at the point of deviation. Code written against an
   unamended plan is drift even when the idea is right.
2. **Write the decision first.** New dated `D-###` (next free number) with the
   existing four fields plus one:
   - `Decision:` the new rule.
   - `Alternatives:` **must include the plan's original text as an honestly
     rejected alternative**, with the reason it fails. This is the kickoff's
     discriminator made mechanical: genuine learning survives this paragraph;
     a corner-cut reads embarrassing when written here — that's the signal to
     stop.
   - `Why:` names the `INV-###` / goal the amendment serves. **No nameable
     invariant ⇒ you are not amending, you are drifting** — go back to §4.
   - `Decided by:` `<role>, amend-on-record, YYYY-MM-DD` (keeps it derived and
     flags it for the next human touchpoint).
   - `Supersedes:` the exact section/behavior/criterion text replaced.
3. **Mark the superseded text in place** with a dated pointer — "*(superseded
   by D-###, YYYY-MM-DD)*" — never delete it. The trail is the legibility.
   (Exactly what SEQ-003 and AC-001 look like today.)
4. **Build to the amendment.**
5. **Surface it** — the task's implementation notes and the run's completion
   report name every amend-on-record decision by ID, so humans and reviewers
   see amendments without diffing the plan.

Cost per deviation: one decision entry + one dated pointer. That is the same
work the episodic plan already did ad hoc for D-005/D-010, and it is *less*
work than silently routing around the plan and having the revert land later
(the drift cost a revert commit, a re-review round, and a corrected test).

## 4. The deviation classifier

Run it whenever recorded ground and reality diverge — an implementer wanting to
deviate, a reviewer finding that contradicts plan text, a verifier catching
code that doesn't match a behavior.

1. **Locate the ground.** Find the exact `AC-###` / `INV-###` / `D-###` /
   behavior / design text the change touches. Read it now — never work from
   memory of the plan.
2. **Apply the discriminator.** (a) Does the change serve the Intent goal and
   invariants *better* than the current text? (b) Does it survive being written
   as a dated decision with the original text as an honestly rejected
   alternative?
3. **Route:**
   - **Snap back (agent drifted).** The change breaks an invariant, or (a)/(b)
     fail, or making it green requires **changing a test's expected behavior**.
     Rewriting the evidence to match the new behavior is the signature of
     drift, full stop — a legitimate amendment changes the plan first, and only
     then the test, citing the D-###.
   - **Amend-on-record (plan wrong, ground derived).** The plan's text collides
     with intent or with reality (false assumption, self-contradiction,
     unsatisfiable mechanism) and the colliding text is derived → run §3.
   - **Halt-and-escalate (plan wrong, ground ratified — or ratified pieces
     collide with each other).** Draft the decision entry with both options and
     stop. No code. Two mutually unsatisfiable ratified criteria (D-010) are
     *always* this leg — an agent never picks which ratified promise to break.
   - **Record (genuinely new decision).** The plan is silent. If it moves
     scope, gate defaults, or ratified ground → escalate with a drafted entry.
     Otherwise decide, record it dated as `<role>-proposed`, proceed, and
     surface it (§3 step 5).

### The reviewer/remediation rule (where the drift actually happened)

For the quality-manager routing step and any agent applying review fixes:

- A finding is **evidence**; its suggested fix is **an alternative to weigh**,
  not a mandate. Classify each remediation against the plan before routing it.
- A remediation that would supersede **ratified** ground routes to a
  *decision-needed* item for the human — never to fixer, never to a
  `review-fix` task. (This is what the follow-up handoff hand-wrote for the
  performance review's PR-002; it becomes standard.)
- Split compound findings. Round-3's HIGH was a *correct* race report bundled
  with a remediation ("skip capture on ledger failure") that trampled ratified
  ground. The right outcome was exactly what the human-guided session did:
  fix the race within derived mechanics (exclusive claim, amended on record),
  refuse the part that contradicted Design §2 — and that split must not depend
  on a human happening to be in the loop.

## 5. Dogfood — the six real incidents, classified

| Incident | Ground touched | Classifier route | Matches what actually happened? |
|---|---|---|---|
| **D-005** — SEQ-003's "no graph resume state" made F-005 unreachable in production | Derived mechanism (a precondition spelling) colliding with the goal (AC-005 reachability) | Amend-on-record: mechanism yields to intent, dated entry, supersession pointer | Yes — same artifacts produced; the human round-trip becomes optional review-after instead of approval-before |
| **D-010** — AC-001 byte-identical-OFF vs B-023 never-replace-persisted-result, mutually unsatisfiable on one path | Two **ratified** pieces (INV-5 vs a spec hard constraint) colliding with each other | Halt-and-escalate with a drafted narrowing; human picks which promise bends | Yes — human decided 2026-07-24, AC-001 narrowed on the record |
| **Risk-note falsity** — "identical races dedupe" was factually wrong; exclusive claim added (44099f6) | Derived ground (risk note + claim mechanics) colliding with reality, in *service* of INV-1 | Amend-on-record; round-4 review verified after the fact | Yes — note corrected with date, D-002 mechanics amended, exactly-once goal untouched |
| **The drift** — `f78862f` made capture skip on ledger failure and rewrote the B-022 test to match | Ratified Design §2 + INV-2 (fail-soft) + INV-4 (missing worse than duplicate); evidence rewritten | Snap back — breaks two invariants, and the test-rewrite red flag fires independently | Yes — reverted by `567b7f5`, which cited exactly the INV-2/INV-4 reasoning |
| **PR-002 (perf review)** — "fix" thrown-terminal episode I/O running under the plan lock | Ratified Design §1 scoping (hook is completion-backed-only by design) | Halt-and-escalate; finding routes to decision-needed, not fixer | Yes — human declined; handoff had to hand-write "do NOT fix" |
| **D-498-1** — entity-lock ownership/release protocol, unforeseen by the plan | New decision; touches a shared primitive but no ratified ground; scope already triaged out | Record: dated entry, `<role>-proposed`, surfaced for review | Yes — drafted into the task before implementation |

All six fall out correctly, and the two cases that consumed the most human
attention (drift, PR-002) are the ones the current system handled only because
a human happened to be watching.

## 6. Where the edits land

Small, routed edits — every rule lives once, in a reference; skills and
prompts point at it. All files below were read in full for this proposal.

| File | Change | Size |
|---|---|---|
| `work-artifacts/references/deviation-protocol.md` **(new)** | The classifier (§4) + amend-on-record protocol (§3) + mutability defaults (§2). Single canonical home. | ~80 lines |
| `work-artifacts/references/spec-format.md` | Add `## Intent` to required sections with the shape above; note ACs + invariants are ratified ground. | ~15 lines |
| `work-artifacts/references/plan-format.md` | Add `## Decision Log` to required sections (today it isn't one); entry format = the four design-dialogue fields + `Supersedes:`; provenance→mutability defaults; plans cite spec `INV-###` by ID. | ~25 lines |
| `work-artifacts/SKILL.md` | One routing line for the new reference. | 1 line |
| `skills/plan/SKILL.md` | Readiness check gains "Intent present; invariants ranked where they can conflict"; lifecycle gains "deviations go through the deviation protocol" + link. | ~6 lines |
| `skills/task/SKILL.md` | The "ACs turn out to be wrong mid-implementation" Common Problem routes through the classifier first (is this AC derived plan ground, or does it restate a ratified AC/INV?). | ~4 lines |
| `prompts/spec-writer.md` | Frame step captures goal + invariants; output includes `## Intent`. | ~5 lines |
| `prompts/planner.md` | Decision Log entries carry provenance per the defaults; sanity-check adds "every mechanism that could collide with an invariant names which one wins". | ~5 lines |
| `prompts/worker.md` | Replace "make a reasonable decision, document, proceed" with the classifier's four legs; escalation = Blocked + drafted decision entry in notes. | ~10 lines |
| `prompts/quality-manager.md` | Step 5 (routing) gains the reviewer/remediation rule: classify remediations against ratified ground; ratified-contradicting ones become decision-needed report items, never fixer/task routes. | ~8 lines |
| `prompts/plan-reviewer.md` | Dimension add-on: verify Intent exists and rankings are stated; findings whose fix would touch ratified ground must say so. | ~5 lines |
| `prompts/task-manager.md` | Constraint sweep (step 6) carries mutability forward: a task touching ratified ground names it ("stop-and-escalate if X must change"). | ~3 lines |
| `docs/testing.md` | One rule: a test asserting planned/ratified behavior is evidence — it changes only *after* the plan text it proves, citing the D-###. | ~4 lines |
| `skills/roadmap/SKILL.md` | No change — upstream of intent capture. | — |
| `skills/archive/SKILL.md` | Optional: distill supersessions/amend-on-record decisions into Key Decisions. | ~2 lines |
| `docs/prompts.md` | No change — it documents prompt assembly, not lifecycle. | — |

All shipped-skill language stays stack-agnostic (gates by intent, no commands).

## 7. Guardrail compliance

- **Legibility, not ceremony.** Per deviation: one decision entry + one dated
  pointer. No new files, no approval loop for derived ground, no form for the
  common case (unmarked entries get defaults from a field that already exists).
  Recording is now strictly cheaper than routing around: drift risks a revert +
  re-review round; an amendment is five minutes.
- **One source of truth.** Intent lives in exactly one artifact (spec when
  present, else plan); plans cite by ID, never restate. Tasks already derive
  from plans; nothing forks.
- **Stack-agnostic.** Everything above is artifact/process language.
- **Dogfooded.** §5 is the worked retrofit; the first real plan after adoption
  should carry an Intent section and be watched for friction.

## 8. Open questions — recommendations (human decides)

1. **Intent in spec vs restated in plan?** Single source in the spec; plan
   cites `INV-###` by ID. Plan owns Intent only when no spec exists. Restating
   is how competing authorities start.
2. **Default mutability when unmarked?** Provenance-derived (human-touched ⇒
   ratified, agent-proposed ⇒ derived); when provenance is missing too ⇒
   ratified. Zero migration, safe default, and the default pressure pushes
   authors to record provenance.
3. **Classifier as guidance or automated pipeline step?** Guidance in skills
   and prompts, **plus** the QM routing rule — which is enforcement at a step
   that already runs, not a new stage. Defer any mechanical check (e.g.
   artifact-conformance verifying every "superseded" pointer has a matching
   `D-###`) until a dogfooded plan shows drift surviving the guidance. The
   failure mode was judgment-at-apply-time, not a missing stage.
4. **Who may ratify?** The human, always, for now. Review agents may *draft*
   ratified changes (that's the escalation deliverable) but never approve them
   — `f78862f` is the proof that agents under gate pressure will manufacture
   evidence, and ratification authority is the backstop. If bounded agent
   ratification ever arrives (post autonomy-host), the bound itself must be a
   ratified decision entry stating exactly what the agent may approve.

## Next step

Human review of this proposal, then scope the §6 edit map into tasks
(`/skill:plan` — this is a planned multi-file skill/prompt change). The first
plan created after the edits land dogfoods the Intent section and the
protocol for real.
