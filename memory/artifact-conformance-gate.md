---
source: archive
plan: artifact-conformance-gate
distilledAt: 2026-05-22T18:45:37Z
---

# Artifact Conformance Gate

## What Was Built
Cosmonauts now has a lightweight artifact-conformance gate for behavior-first plans. The checker parses a plan's exact `## Behaviors` section, validates required `B-###` fields and `@cosmo-behavior` markers, safely resolves root-relative test paths, and confirms the referenced file contains the exact marker text. A new `cosmonauts plan check-artifacts <slug>` command exposes the same evidence in human, plain, and JSON modes with non-zero exits for invalid slugs, missing plans, or conformance failures.

## Key Decisions
- Put the conformance logic in `lib/artifacts/behavior-conformance.ts` instead of plan CRUD, Drive, or prompts because behavior-marker validation is a reusable work-artifact contract, not a CLI-only or runtime-orchestration concern.
- Use exact marker text presence for v1 rather than AST parsing or marker proximity checks; this keeps the gate deterministic, language-agnostic, and cheap while still catching missing or drifted behavior/test links.
- Treat `Test` references as project-root-relative paths and expose a small plan CLI command; root-relative matches current behavior-spine examples and makes the gate usable in verifier/postflight workflows before deeper Drive integration exists.
- Return structured issue/evidence objects rather than formatted strings only, so future Drive, quality-manager, or verifier integrations can consume stable `kind`, behavior, field, path, marker, expected, and actual details.
- Let legacy plans fail by design if they lack the current behavior-spine fields; broad parser compatibility or back-migration was explicitly deferred to keep this gate crisp and avoid silently weakening the new contract.

## Patterns Established
- `lib/artifacts` is the inward-facing artifact utility layer: CLI commands may depend on it, but it must not depend on CLI, Drive, tasks, prompt runtime, or plan-manager code.
- Behavior conformance uses line-oriented markdown parsing: exact `## Behaviors`, `### B-###` headings with `-`, `–`, or `—`, one-line required bullet fields, and `Expected result` normalized as `Expected`.
- Plan-authored filesystem paths must be validated before reads: reject empty/malformed values, NUL bytes, POSIX/Windows absolutes, lexical traversal outside the real project root, and symlink escapes via `realpath` containment.
- CLI output should preserve the same structured result in JSON mode while keeping plain mode stable and grepable: one summary line plus one issue line per conformance failure.
- Work-artifact guidance should describe mechanical behavior field/file/marker conformance conceptually while avoiding concrete command/tool columns in generic gate-contract references.

## Files Changed
- `lib/artifacts/behavior-conformance.ts` — new parser/checker with exported behavior parsing types, issue kinds, safe path validation, file existence checks, exact marker checks, and structured `ArtifactConformanceResult` evidence.
- `lib/artifacts/index.ts` — public re-export for artifact utilities.
- `cli/plans/commands/check-artifacts.ts` and `cli/plans/index.ts` — new `cosmonauts plan check-artifacts <slug>` command, active-plan loading, slug validation, output rendering, and CLI registration.
- `tests/artifacts/behavior-conformance.test.ts` — library coverage for parsing, missing/empty sections, required fields, marker mismatches, unsafe paths, missing files, missing markers, arbitrary file types, and structured evidence.
- `tests/cli/plans/commands/check-artifacts.test.ts` and `tests/cli/plans/subcommand.test.ts` — CLI success/failure/error coverage in human, plain, and JSON modes plus subcommand registration.
- `domains/shared/skills/work-artifacts/references/behavior-spine.md` and `gate-contracts.md` — guidance updated to say behavior field/file/marker conformance is mechanically checkable, with v1 exclusions and legacy-plan failure caveats.
- `tests/prompts/work-artifacts-skill.test.ts` — text-contract coverage for the guidance update and for keeping generic gate references abstract.

## Gotchas & Lessons
- The implemented issue names are the durable contract future callers will see: `missing-behavior-section`, `missing-behavior-entry`, `missing-behavior-field`, `invalid-marker`, `invalid-test-reference`, `missing-test-file`, and `missing-marker`.
- Exact marker presence is intentionally weak evidence: a marker anywhere in the referenced file passes, even if it is not near the named test. Do not assume this v1 gate proves test proximity or test-framework execution.
- The CLI only reads `missions/plans/<slug>/plan.md`; it does not scan archived plans or all active plans. Archived or arbitrary-plan checks need a separate follow-up interface if required.
- Because the checker targets the current behavior-spine shape, older plans can newly fail if manually checked. That is expected and should be handled by migration work, not by loosening the checker.
- Final verification for the integrated plan included the planned behavior markers B-001 through B-012 and passed `bun run test`, `bun run lint`, and `bun run typecheck`.

## Follow-up Ideas
- Add optional marker proximity or framework-aware checks only after the exact-text contract has proven useful; keep them layered so language-agnostic conformance remains available.
- Add Drive or quality-manager integration that consumes `ArtifactConformanceResult` directly instead of scraping CLI text.
- Add an explicit archived-plan or arbitrary-plan-path check command if reviewers need to validate completed plans after archival.
- Plan a separate legacy-plan migration if old active plans should pass the new behavior-spine gate.
