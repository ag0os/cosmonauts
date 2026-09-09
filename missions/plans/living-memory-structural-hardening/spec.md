## Purpose

The `living-memory-fidelity` plan spent eleven Drive runs and sixteen review
rounds closing eighteen findings in one property: whether the consolidation pass
reports the durable writes it actually made. Every one of those findings was
caught by a human-shaped process — a reviewer reading a diff, a Quality Manager
pass, an independent `codex exec` round — and several were caught only after ten
earlier reviews had passed over them.

Three structural changes would each have caught defects that run found late, or
found only by luck. This plan makes them mechanical, so the next durable write in
this subsystem cannot repeat the class:

1. **Collapse or parity-test the deterministic/judgment duplication** in
   `lib/memory/living-memory.ts`. The file carries two near-duplicate flows — a
   deterministic fast path guarded by `deterministic.length > 0 && !needsJudgment`
   and a judgment path. The SR-001 fix landed in the judgment path only. Ten fresh
   structural reviews passed before the post-implementation Quality Manager found
   the identical pre-fix slice still live in the deterministic path, reachable via
   the `--no-model` invocation the owner actually runs. SR-010 was the second-order
   cost of the same duplication. A third path would multiply it again.

2. **Make committed-write reporting structural rather than conventional.**
   `living-memory-fidelity` D-013 got the primitives to *return* the mutation fact
   they compute (`destinationLinked`, `removed`, `restored`), which closed
   SR-015..SR-018. Nothing yet forces a caller to *thread* it: a new durable write
   can still drop the bit silently, which is exactly how the class survived four
   components and five rounds. Omission should be a type error, not a review item.

3. **Bind the `duplication` gate.** The `living-memory-fidelity` Quality Contract
   declares five bindable structural gates — `mutation`, `duplication`,
   `complexity`, `boundary-conformance`, `dead-code` — and every one shipped
   **unbound/degraded**, with no executable evidence. The `duplication` gate
   already names "no second commit accumulator" as its criterion; two near-duplicate
   retirement-gating flows are precisely that, so binding it would have caught
   SR-010 mechanically rather than after ten rounds.

The unifying claim: thirteen findings cost eleven Drive runs, and a bound gate of
that shape is cheaper than a single review round.

## Users

Agents implementing durable writes in `lib/memory/`, and the reviewers asked to
verify them. Today both depend on a convention that has been violated in four
components; after this plan the compiler and the gate carry what review carried.

Indirectly, the owner: consolidation's `writesCommitted` is what decides whether a
failed pass left durable state behind, so its accuracy is what makes recovery
trustworthy.

## User Experience

Nothing changes at the CLI. The observable difference is in what fails, and when:

- Adding a durable write without threading its commit fact fails `typecheck`,
  naming the site — instead of passing review and surfacing three rounds later.
- Introducing a second commit accumulator or a third near-duplicate consolidation
  flow fails the bound `duplication` gate with a concrete location.
- The deterministic and judgment paths either share one implementation, or a
  parity test enumerates every behaviour across both and fails when they diverge.

## Acceptance Criteria

- `lib/memory/living-memory.ts` no longer carries two independently-maintained
  near-duplicate flows: either one implementation serves both the deterministic
  and judgment continuations, or a parity test enumerates each behaviour across
  both paths and fails when only one is changed. A deliberate one-path mutation
  of any behaviour is red.
- Omitting the commit fact at a new durable-write call site is a **type error**,
  demonstrated by a compile-failure fixture, not a review criterion. The existing
  `writesCommitted` accuracy in both directions is preserved: every regression in
  `tests/memory/living-memory-commit-interleavings.test.ts` stays green.
- The `duplication` gate is **bound and enforced** — it runs mechanically, reports
  a location, and its criterion covers "no second commit accumulator" and "no
  additional near-duplicate consolidation flow". Its status in a Quality Contract
  is `bound`, never `degraded/unbound`.
- The gate is demonstrated against the historical defect: a reconstruction of the
  pre-SR-010 duplication fails it. A green gate on unchanged `main` is not
  sufficient evidence that it works.
- Live `knowledge/` is never read for effect, moved, or written: the corpus digest
  is identical before and after every task.
- `lib/memory/retirement-store.ts` stays byte-identical and D-026 is not reopened.
- Full suite, lint, typecheck and `plan check-artifacts` pass.

## Scope

**In.** The deterministic/judgment duplication in `lib/memory/living-memory.ts`;
the commit-fact threading contract across `lib/memory/durable-files.ts` and its
callers; binding the `duplication` structural-analysis gate and demonstrating it
against a historical defect.

**Out.** The other four unbound gates (`mutation`, `complexity`,
`boundary-conformance`, `dead-code`) — binding them is the same shape of work and
should be its own decision, informed by what binding one costs. Any change to
D-026, retirement pathname sequencing, or `lib/memory/retirement-store.ts`. Any
change to what `writesCommitted` *means*; this plan makes the existing contract
mechanical, it does not redefine it. The three pre-existing defects escalated
separately (episode symlink escape, corpus body-admission starvation, rejected
knowledge directories) — each needs its own ruling and is not bundled here.

## Assumptions

- The analysis-capability runtime shipped by the `analysis-capability-runtime` and
  `analysis-gate-coverage` plans is the mechanism for binding a gate. This plan
  binds one gate on that runtime rather than building a second mechanism; if that
  runtime cannot express the criterion, that is a finding for the planner, not a
  licence to hand-roll.
- Collapsing the duplication is preferred to parity-testing it. Parity tests are
  the fallback if the two continuations turn out to differ for a reason the
  `living-memory-fidelity` reviews did not record.
- The commit-token design must not require every existing caller to change shape
  at once. A migration where un-threaded sites are a type error only in
  `lib/memory/` is acceptable and preferable to a repo-wide churn.
- Nothing here is on the critical path of any current capability track; this is
  debt paid down against a subsystem that has already demonstrated it will
  re-accrue the debt.

## Open Questions

- **Is a nominal commit token worth its ergonomic cost?** Making omission a type
  error means a branded value threaded through every durable write. The
  alternative is an AST/lint rule — "any `await durableFiles.<mutator>` is
  followed by a commit record before the next `await`" — which the improvements
  record notes "would have caught all instances mechanically" without changing any
  signature. The lint rule is cheaper and less invasive; the token is stronger and
  survives refactoring. This is the plan's central design decision and it is not
  yet made.
- **Do the deterministic and judgment paths differ for a real reason?** Sixteen
  review rounds treated the divergence as accidental, but none of them asked. If
  the fast path exists for a measured reason, collapsing it is a regression and
  the parity-test fallback becomes the primary route.
- **Does binding one gate justify binding all five?** The `living-memory-fidelity`
  Quality Contract shipped five bindable gates all unbound. If binding
  `duplication` proves cheap, the honest follow-up is to bind the rest rather than
  leave four permanently degraded; if it proves expensive, the ladder itself may be
  over-declared and should be trimmed rather than left aspirational.
