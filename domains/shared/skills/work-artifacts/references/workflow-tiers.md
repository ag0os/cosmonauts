# Workflow Tiers

Use the lightest workflow that preserves behavior, handoff, and review quality.

## Direct Fix

Use for very small, self-contained fixes where the code path and expected behavior are clear.

- No `spec.md`, no `plan.md`, no `architecture.md`.
- Use implementation TDD or a characterization test first.
- The regression test is the behavior record.
- No behavior marker is required unless the fix belongs to an active plan.
- Do not force direct fixes through the full artifact stack.

## Tactical Bugfix

Use for small bugfixes or patch tasks that need persistence, handoff, or acceptance criteria but not full planning.

- `spec.md` is optional and normally unnecessary.
- A tiny plan or task may name the regression behavior.
- The regression test carries the durable behavior proof.
- No architecture record unless the bug exposes a durable boundary decision.

## Planned Feature / Refactor

Use for larger changes that need design, tasking, or multi-step verification.

- Requires `spec.md` for the product/user side.
- Requires `plan.md` for the technical side.
- The plan is behavior-first and includes a Quality Contract ladder.
- Planned behaviors use stable `B-###` IDs and tests carry matching markers.

## Architectural / Multi-Plan Work

Use when the work establishes durable decisions, dependency rules, boundary models, or umbrella context that multiple plans must obey.

- Create `missions/architecture/<slug>.md` only when it changes implementation or review.
- Child implementation plans include `Architecture Context` naming relevant decisions and boundary rules.
- Keep implementation details in child plans; keep durable boundaries in the architecture record.

## Routing Checks

- If the only durable record needed is a regression test, choose Direct Fix.
- If handoff is needed but product/design discovery is not, choose Tactical Bugfix.
- If acceptance criteria need decomposition into tested behaviors, choose Planned Feature / Refactor.
- If multiple plans need the same boundary decisions, choose Architectural / Multi-Plan Work.
