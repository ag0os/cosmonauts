# `execution-liveness` — ruling packet before the re-plan

Drafted by the doer session, 2026-09-21. Nothing here is decided. Each question
is a collision inside the spec's ratified ground, found by the plan-reviewer
(`review-1.md` PR-001, PR-002, PR-004). Options are the doer's; recommendations
are marked and are opinions. The human's choice is recorded at the end of each
question, dated, and then carried into a revised `spec.md`.

## Q1 — Does "never runs forever" hold in shadow mode? (PR-001)

The spec says both:

> Every in-scope durable node attempt must either complete normally or reach an
> honest durable terminal or blocked state under an explicit liveness policy.
> — Intent

> In shadow mode, the same deadline produces durable `would-cancel` evidence
> without changing execution. — User Experience

> A hard deadline is optional and has no universal default — INV-004

Shadow is the default and heartbeat renews independently of useful work, so a
silent attempt that keeps its lease never expires and is never cancelled. The
slice could ship complete and still leave the state its Purpose names.

| Option | What changes | Cost |
|---|---|---|
| **A. Always-enforced hard ceiling (recommended)** | Only the *idle* deadline is shadowable. Every in-scope attempt also has a hard ceiling that is enforced in both modes; frontends may set it, and a generous default applies when they do not. INV-004's "no universal default" is amended. | A default number has to be chosen. A ceiling set too low kills legitimate long work; set generously it is a backstop, not a tuning knob. |
| B. Enforce idle by default | Shadow becomes opt-in. | Idle cancellation goes live before there is any activity evidence to tune it; false cancellations of quiet-but-healthy work are the likely failure. This is why shadow was chosen. |
| C. Narrow the Intent | Bounded termination is promised only under enforce; the slice ships observation-only by default. | Honest, but the forever-`running` state survives by default until a later decision. |

Ruling: _pending_

## Q2 — How does anyone select the mode, and what happens to Drive's cap? (PR-002)

Behaviors speak of "an operator who enabled shadow mode" and "the liveness mode
setting". No CLI flag, config key or file is named anywhere in the spec, and
`grep` finds none in `cli/` or `lib/config/`. Separately:

> Drive's current task cap is mapped to explicit `hardTimeoutMs` scheduler
> policy — AC-010

> Drive task policy … remain[s] unchanged — AC-013

Under shadow-by-default a hard deadline would not cancel, so Drive's existing
cap would silently stop being enforced.

| Option | What changes | Cost |
|---|---|---|
| **A. Project config only (recommended)** | One `liveness` block in `.cosmonauts/config.json` (mode for the idle deadline, idle window, hard ceiling). The resolved policy and its source are recorded on the run. No CLI flags. | Changing mode for one run means editing config. |
| B. Config plus a per-run CLI override | As A, plus a flag on `run chain` and `run drive`. | Two sources to reconcile and document; more surface to test. |
| C. No selection surface in this slice | Mode is a constant; the operator-facing behaviors are withdrawn. | Shadow evidence can be gathered, but nobody can turn enforcement on without a code change. |

Under every option, if Q1 is answered A, Drive's cap needs no special case: it
is a hard deadline and hard deadlines are always enforced.

Ruling: _pending_

## Q3 — A suspended live owner meets another scheduler. Who wins? (PR-004)

One invariant says both:

> Expiry is loss-of-health evidence; it does not itself revoke the token …
> [the current token may] renew or reacquire its lease — INV-001

> a scheduler pass that observes an expired lease it does not hold, carrying no
> settlement evidence and surviving any clock-discontinuity rebase, quarantines
> the attempt into terminal-blocked and revokes its token — INV-001, AC-014

A laptop sleeps past the lease; a second `cosmonauts` invocation on the same
run takes the step lock first and quarantines a holder that is alive. The
holder wakes, cannot reacquire, and its result is rejected. The clock rebase
cannot help: a fresh process has no earlier monotonic reading to compare.
The quarantine rule exists for a real reason — a crashed holder otherwise
leaves the step `running` forever.

| Option | What changes | Cost |
|---|---|---|
| **A. Check the holder before quarantining (recommended)** | The persisted holder identity (host, process, start time) is already required by INV-007. A foreign scheduler on the same host that finds the holder process alive does not quarantine; it reports the lease as expired-but-held. A dead or unverifiable holder (other host) is quarantined after one further lease period. | Same-host only; process identity must include start time to survive pid reuse. Cross-host still falls to B after the grace. |
| B. Safety wins, stated plainly | Quarantine stands as written. "Reacquire after expiry" is amended to "unless another scheduler quarantined first". The woken owner's work is kept as rejected evidence and an operator starts a replacement. | A sleep longer than the lease while anything else touches the run loses that step's work. Simple and already matches the spec's stated ranking (INV-001 and INV-003 over availability). |
| C. Report, do not quarantine | Foreign expired leases only surface in `run status`; an operator decides. | Reopens the crashed-holder gap the quarantine rule was ratified to close. |

Ruling: _pending_

## After the rulings

The doer drafts a revised `spec.md` for ratification in which the invariants
are stated as outcomes an operator or coordinator can observe, and tokens,
leases, rebasing and quarantine mechanics move to where the planner may choose
them. Then `plan.md`, and TASK-677 to TASK-685 are removed (recoverable from
git; all nine are To Do), `review-1.md` stays beside the spec as the list the
new plan must answer, and the planner → plan-reviewer chain runs on the revised
spec in the current format. The trial branch for TASK-683 stays unmerged as
evidence.
