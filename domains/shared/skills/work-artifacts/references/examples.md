# Examples

These are minimal templates. Load only the template for the current workflow tier.

## Direct Fix Template

Use when the fix is small and the regression test is enough durable behavior evidence.

```md
Change: Fix the observed failure in the smallest affected seam.

Behavior record:
- Regression test: `tests/path/file.test.ts` > `reproduces the failure`

Artifacts:
- No spec.
- No plan.
- No architecture record.
```

## Tactical Bugfix Template

Use when a small bugfix needs handoff or acceptance criteria.

```md
## Description

Fix the bug and preserve the existing public behavior around the affected path.

<!-- AC:BEGIN -->
- [ ] #1 The regression test reproduces the bug before the fix.
- [ ] #2 The affected behavior passes after the fix.
- [ ] #3 Existing neighboring behavior remains covered.
<!-- AC:END -->
```

## Planned Feature / Refactor Template

Use when the work needs `spec.md` plus behavior-first `plan.md`.

```md
# spec.md

## Acceptance Criteria

- [ ] AC-001 - User-visible outcome.

# plan.md

## Behaviors

### B-001 - Behavior name

- Source: AC-001
- Context: ...
- Action: ...
- Expected: ...
- Seam: `path/or/skill/section`
- Test: `tests/path/file.test.ts` > `test name`
- Marker: `@cosmo-behavior plan:<slug>#B-001`

## Design

Derived from behavior placement.

## Quality Contract

| Order | Gate kind | Tier | Binding state | Threshold | Degradation / notes |
|---:|---|---|---|---|---|
| 1 | `correctness` | universal | bound | project-native correctness evidence passes | hard fail |
```

## Architecture-Linked Multi-Plan Template

Use when durable architecture decisions govern more than one plan.

```md
# missions/architecture/<slug>.md

## Decision Log

- D-001 - Durable boundary rule
  - Decision: ...
  - Alternatives: ...
  - Why: ...
  - Decided-by: ...

## Boundary Model

- Zone A:
  - May depend on Zone B through the declared interface.

# child plan.md

## Architecture Context

This plan implements part of `missions/architecture/<slug>.md`.

Relevant decisions:
- D-001 - Durable boundary rule.

Boundary rules this plan must preserve:
- Zone A uses the declared interface.
```
