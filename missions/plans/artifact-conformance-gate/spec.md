## Purpose

Add a lightweight artifact-conformance gate that mechanically validates behavior/test traceability in Cosmonauts plans. The first version should make the existing `B-###` and `@cosmo-behavior` contract checkable without introducing a full quality-gate engine or language-specific test parsing.

## Users

- Planners and plan-reviewers who need fast feedback that planned behaviors are ready for tasking.
- Workers, verifiers, and quality managers who need concrete evidence that behavior markers exist in tests.
- Humans running Drive or CLI postflight checks who need deterministic pass/fail output.

## User Experience

- A checker reads a plan's `## Behaviors` section and reports actionable failures for missing behavior entries, missing fields, malformed markers, unsafe test paths, missing test files, and missing marker text.
- The checker is usable as a TypeScript library in tests and automation.
- A small CLI entry point can be used in postflight or verifier workflows and exits non-zero when conformance fails.
- The checker remains language-agnostic: it uses root-relative file paths and exact marker text, not test framework ASTs.

## Acceptance Criteria

- [ ] AC-001 - A planned `## Behaviors` section is parsed into `B-###` behavior entries with behavior IDs plus Source, Context, Action, Expected, Seam, Test, and Marker fields.
- [ ] AC-002 - A missing `## Behaviors` section, a present-but-empty section, or a section with no parseable `### B-###` entries produces an actionable conformance failure.
- [ ] AC-003 - A behavior missing a required field produces an actionable failure naming the behavior and field.
- [ ] AC-004 - A marker must exactly match `@cosmo-behavior plan:<slug>#B-###`; wrong slug, wrong behavior ID, or malformed syntax fails.
- [ ] AC-005 - Test references must be non-empty project-root-relative file paths; absolute paths, traversal outside the project, and symlink escapes fail before file contents are read.
- [ ] AC-006 - The checker verifies that each safe referenced test file exists relative to the project root.
- [ ] AC-007 - The checker verifies that each referenced test file contains the exact marker text, without parsing framework-specific ASTs.
- [ ] AC-008 - Results are structured enough for Drive, quality-manager, or verifier evidence: pass/fail, behavior IDs, issue kinds, messages, and file paths where relevant.
- [ ] AC-009 - A CLI entry point reports success and failure in human/plain/JSON output and returns a non-zero exit code on invalid slug, missing plan, or conformance failure.
- [ ] AC-010 - The first version does not implement a full Quality Contract runner, concrete gate bindings, marker proximity checks, HTML rendering, memory ingestion, back-migration, or framework-specific test parsing; legacy plans without the current behavior-spine fields fail by design if checked.

## Scope

Included:

- Parser/checker for planned behavior entries in markdown plan bodies.
- Structured result and diagnostic types.
- Safe root-relative test-path validation before reading plan-authored paths.
- Filesystem checks for referenced test file existence and exact marker presence.
- Unit and CLI tests with valid and invalid fixtures.
- Minimal work-artifact guidance updates so agents know the mechanical check exists and older plans may need migration before using it.

Excluded:

- Full Quality Contract gate runner.
- `.cosmonauts` gate-binding schema.
- Test framework AST parsing or marker proximity analysis.
- Back-migration of active or archived plans.
- HTML rendering or memory ingestion.
- Enforcing all workflow-tier rules mechanically.

## Assumptions

- The checker targets plans authored under the current `work-artifacts` behavior-spine shape.
- Older active or archived plans that lack required behavior fields are not made compatible in this plan; if checked, they produce conformance failures by design.
- Test paths in conforming behavior entries are repository-root-relative, matching current examples such as `tests/prompts/...`.
- A marker's exact presence anywhere in the referenced test file is sufficient for v1.
- Existing project verification remains `bun run test`, `bun run lint`, and `bun run typecheck`.

## Open Questions

- None blocking for v1. Marker proximity, legacy-plan migration, arbitrary archived-plan paths, and deeper Quality Contract enforcement are intentionally deferred.