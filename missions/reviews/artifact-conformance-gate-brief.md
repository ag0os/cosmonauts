# Mini Brief: Artifact Conformance Gate

Status: brief for future planning, not an approved implementation plan
Origin: `artifact-format-redesign` process follow-up
Related notes:

- `missions/reviews/artifact-format-redesign-process-followups.md`
- `missions/archive/plans/artifact-format-redesign/plan.md`
- `memory/artifact-format-redesign.md`
- `domains/shared/skills/work-artifacts/`

## Problem

The artifact format redesign established a behavior spine and marker contract, but conformance is still enforced mostly by prompt guidance and text-contract tests. A future plan can drift: `B-###` behaviors may omit required fields, point at missing tests, or name markers that do not appear in the referenced test files.

The format now exists; the weak point is mechanical verification.

## Goal

Add a lightweight artifact-conformance gate that validates planned behavior/test traceability without introducing language-specific test framework APIs or a full quality-gate engine.

The first version should be grep-oriented, deterministic, and safe to run in tests, Drive postflight, or quality-manager/verifier workflows.

## Desired Outcomes

- Planned `## Behaviors` entries can be parsed from a `plan.md` file.
- Each `B-###` behavior is checked for required fields: source AC, context, action, expected result, seam, test, and marker.
- Marker syntax is validated: `@cosmo-behavior plan:<slug>#B-###`.
- Referenced test files are checked for existence.
- Referenced test files are checked for the marker text.
- Failures produce actionable messages that identify the behavior ID, missing field, missing file, or missing marker.
- The gate remains language-agnostic and does not require framework-specific AST parsing.

## Candidate Behaviors

### B-001 — Parses behavior entries from plans

- Context: a planned feature/refactor plan has a `## Behaviors` section
- Action: the conformance checker reads the plan
- Expected: it extracts each `B-###` behavior with source, context, action, expected, seam, test, and marker fields

### B-002 — Rejects missing required behavior fields

- Context: a behavior entry omits a required field
- Action: the checker validates the behavior
- Expected: it reports a conformance failure naming the behavior and missing field

### B-003 — Validates marker syntax against plan slug and behavior ID

- Context: a behavior marker has the wrong slug, wrong behavior ID, or malformed marker syntax
- Action: the checker validates markers
- Expected: it reports the mismatch instead of silently accepting nearby marker-looking text

### B-004 — Verifies referenced test file and marker presence

- Context: a behavior names a test file and marker
- Action: the checker reads the test file
- Expected: it passes only when the file exists and contains the exact marker text

### B-005 — Stays language-agnostic

- Context: a project uses any test framework or language
- Action: the checker runs
- Expected: it relies on file paths and plain marker text, not test-framework AST APIs

### B-006 — Provides Drive/verifier-friendly output

- Context: Drive, quality-manager, or a verifier needs evidence
- Action: the checker reports results
- Expected: output is structured enough to cite pass/fail evidence per behavior

## Candidate Scope

Included:

- A parser/checker for behavior entries in markdown plans.
- Structured result types for pass/fail evidence.
- Tests using fixtures for valid and invalid plans/test files.
- A small CLI or command entry point only if it fits existing project conventions.
- Documentation/prompt updates only where needed to point to the checker.

Excluded for the first version:

- Full Quality Contract gate runner.
- Concrete `.cosmonauts` gate-binding schema.
- Test framework AST parsing.
- Back-migration of existing plans.
- HTML rendering.
- Automatic memory ingestion.
- Enforcing all workflow-tier rules mechanically.

## Open Design Questions

1. Where should the checker live: plan library, driver gate module, task/quality module, or a new artifact module?
2. Should it validate only active plans, archived plans, or arbitrary plan paths?
3. How should it resolve test paths: relative to repo root, plan directory, or explicit working directory?
4. Should marker proximity to the executable test be checked now, or should exact marker presence be the first version?
5. Should Drive call this as a postflight command, or should quality-manager/verifier call it as an explicit claim?
6. How strict should markdown parsing be before it becomes brittle?

## Planner Instructions

When turning this brief into a plan:

- Load `/skill:work-artifacts`, `/skill:plan`, and `/skill:tdd` to align with the new artifact contract.
- Prefer a small, testable library API first; add CLI/Drive integration only if the seam is clear.
- Keep the first version language-agnostic and marker-text based.
- Include negative/mutation-style tests for missing fields, wrong slug, wrong behavior ID, missing file, and missing marker.
- Do not smuggle in the full gate enforcement engine or project-specific tool bindings.

## Suggested Planner Prompt

Design an implementation plan for an `artifact-conformance-gate` follow-up. The plan should add a lightweight checker for planned behavior entries and `@cosmo-behavior` test markers, with structured evidence and tests, while keeping runtime gate binding, HTML rendering, memory ingestion, and framework-specific AST parsing out of scope.
