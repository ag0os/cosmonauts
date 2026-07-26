# Deviation Protocol

The plan is the thing you amend on the record — never the thing you silently
route around. Deviation is not the failure; unrecorded deviation is. This
reference owns the rules for handling any collision between recorded ground
(spec, plan, tasks) and reality. Role skills and prompts apply these rules at
their own decision points and route here instead of restating them.

## Mutability

Every piece of recorded ground is either `ratified` or `derived`:

- `ratified` — changing it requires a human decision. Agents may draft the
  change; they never approve it. The escalation deliverable is a drafted
  decision entry, not applied code.
- `derived` — an implementing agent may amend it on the record without
  escalation, provided intent is preserved and the amendment is written down.

Defaults derive from the Decision-Log `Decided by:` provenance:

| `Decided by:` says | Default |
|---|---|
| the human (`human`, `user-directed`, `user-chose-among-options`, human-approved) | ratified |
| an agent (`planner-proposed`, `implementer, amend-on-record`, a review source) | derived |
| nothing — provenance absent | ratified |

An explicit `(ratified)` / `(derived)` marker on the entry title overrides
the default; write it only when overriding.

Always ratified, regardless of markers:

- Spec `## Intent` invariants (`INV-###`), by definition.
- The letter of spec acceptance criteria (`AC-###`). Narrowing one is human
  ground. A behavior that merely restates an AC's letter inherits its
  ratification; a behavior that adds mechanism around it is derived.
- Scope exclusions and default-state declarations (for example, a feature
  gate that stays off by default).
- Anything a decision entry names as a stop-and-redesign condition.

## The Classifier

Run this whenever recorded ground and reality diverge — you want to deviate,
implementation contradicts a behavior, or a review finding contradicts plan
text. Four routes: **snap back / amend-on-record / halt-and-escalate / record**.

1. **Locate the ground.** Find the exact `AC-###` / `INV-###` / `D-###` /
   behavior / design text the change touches, and read it as it stands now —
   never work from memory of the plan.
2. **Apply the discriminator.** (a) Does the change serve the Intent goal and
   invariants better than the current text? (b) Does it survive being written
   as a dated decision with the original text as an honestly rejected
   alternative? Genuine learning wants to be recorded; a corner-cut wants to
   stay quiet.
3. **Route:**
   - **snap back** — the change breaks an invariant, fails the discriminator,
     or needs a test's expected behavior changed to go green. You are
     drifting; restore the recorded behavior.
   - **amend-on-record** — the plan's text collides with intent or reality (a
     false assumption, a self-contradiction, an unsatisfiable mechanism) and
     the colliding text is derived. Follow Amend-On-Record below, then build.
   - **halt-and-escalate** — the colliding text is ratified, or two ratified
     pieces collide with each other; an agent never picks which ratified
     promise to break. Stop and deliver a drafted decision entry presenting
     the options. No code.
   - **record** — the plan is silent and the decision is genuinely new. If it
     moves scope, defaults, or ratified ground, halt-and-escalate instead.
     Otherwise decide, record a dated decision entry with
     `Decided by: <role>-proposed`, proceed, and surface it.

## Amend-On-Record

1. **Stop building** at the point of deviation. Code written against an
   unamended plan is drift even when the idea is right.
2. **Write the decision first.** Add a new dated `D-###` entry where
   `Alternatives:` includes the superseded text as an honestly rejected alternative
   with the reason it fails, `Why:` names the `INV-###` or goal served (no
   nameable invariant means you are drifting, not amending), `Decided by:` is
   `<role>, amend-on-record, <date>`, and `Supersedes:` names the exact
   ground replaced.
3. **Mark the superseded text in place** with a dated pointer —
   "*(superseded by D-###, <date>)*" — never delete it. The trail is the
   legibility.
4. **Build to the amendment.**
5. **Surface it.** Implementation notes and the completion report name every
   amend-on-record decision by ID, so reviewers see amendments without
   diffing the plan.

## Findings And Remediation

For any agent routing or applying review findings:

- A finding is evidence; its suggested fix is an alternative to weigh, not a
  mandate. Classify each remediation against the plan before routing or
  applying it.
- A remediation that would supersede ratified ground is an escalation, not a
  fix: route it to a decision-needed item for the human, never to an
  automated fix path.
- Split compound findings: fix the part whose ground is derived, escalate the
  part whose ground is ratified. A correct defect report does not authorize a
  remediation that tramples ratified ground.

## Red Flags

Any of these means snap back or escalate — never proceed:

- Changing a test's expected behavior to make the change green. A test
  asserting planned behavior is evidence; it changes only after the plan text
  it proves, citing the decision that changed it.
- The `Why:` cannot name an invariant or goal served.
- The rejected-alternatives paragraph reads as a justification for less work.
- The change makes a gate pass rather than an outcome better.
