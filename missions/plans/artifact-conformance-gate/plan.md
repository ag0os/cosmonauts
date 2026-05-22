---
title: Artifact Conformance Gate
status: completed
createdAt: '2026-05-22T15:42:45.218Z'
updatedAt: '2026-05-22T18:42:47.328Z'
---

## Overview

Implement a lightweight artifact-conformance gate for behavior-first Cosmonauts plans. The gate parses planned `B-###` behavior entries, validates required fields and `@cosmo-behavior` marker syntax, checks safe root-relative test file references, and reports structured pass/fail evidence. This is not a full Quality Contract runner; it is the first mechanical enforcement layer for the behavior spine established by `artifact-format-redesign`.

## Scope

Included:

- Add a small TypeScript artifact-conformance library for parsing and validating planned behavior entries.
- Check required fields: Source, Context, Action, Expected, Seam, Test, and Marker.
- Validate exact marker shape against the active plan slug and behavior ID.
- Validate that behavior `Test` paths are non-empty project-root-relative file paths before reading them.
- Reject absolute paths, traversal outside the project root, and symlink escapes.
- Check referenced test file existence and exact marker text presence.
- Add a `cosmonauts plan check-artifacts <slug>` CLI command with human/plain/JSON success and failure output.
- Add focused tests for valid plans, missing/empty behavior sections, missing fields, malformed test references, marker mismatches, path escapes, missing files, missing markers, and CLI output.
- Update work-artifact guidance only enough to say field/file/marker conformance is now mechanically checkable and older plans may fail until migrated.

Excluded:

- Full Quality Contract execution engine.
- Concrete `.cosmonauts` gate bindings or Drive auto-wiring.
- Test-framework AST parsing and marker proximity checks.
- Back-migrating old active or archived plans.
- HTML rendering or memory ingestion.
- Mechanical enforcement of workflow-tier routing beyond behavior-marker conformance.

## Decision Log

- **D-001 — Put conformance in a new artifact library**
  - Decision: Add `lib/artifacts/behavior-conformance.ts` plus `lib/artifacts/index.ts` for the parser/checker contract.
  - Alternatives: Put the checker in `lib/plans/`, `lib/driver/`, or quality-manager prompt code.
  - Why: The behavior spine is a work-artifact contract, not plan CRUD, Drive execution, or a prompt-only concern. A small artifact library keeps dependencies reusable and shallow.
  - Decided by: planner-proposed

- **D-002 — Use exact marker presence for v1**
  - Decision: Validate that the referenced file contains the exact marker text; do not check marker proximity to a specific `it()` or `test()` block.
  - Alternatives: Parse test ASTs; grep for nearby test blocks; require framework-specific annotations.
  - Why: Exact text is deterministic, language-agnostic, and enough to catch the highest-risk drift without brittle framework coupling.
  - Decided by: planner-proposed

- **D-003 — Resolve test paths from project root and add a small plan CLI**
  - Decision: Treat behavior `Test` file paths as project-root-relative and expose `cosmonauts plan check-artifacts <slug>`.
  - Alternatives: Resolve relative to the plan directory; support arbitrary plan paths first; defer CLI until later.
  - Why: Current behavior-spine examples use repo-root paths, and a CLI makes the gate immediately usable in postflight or verifier workflows without Drive-specific integration.
  - Decided by: planner-proposed

- **D-004 — Structured diagnostics, not a gate engine**
  - Decision: Return issue objects with stable `kind`, behavior ID, message, and relevant field/path/marker data, while leaving Quality Contract ladder execution out of scope.
  - Alternatives: Build a general gate runner now; return only formatted strings.
  - Why: Structured evidence supports future Drive/quality-manager integration, while a full gate engine would mix this small enforcement step with broader binding design.
  - Decided by: planner-proposed

- **D-005 — Legacy plans fail by design instead of broadening parser compatibility**
  - Decision: The checker targets the current behavior-spine shape. Older active or archived plans that omit Source/Action/Seam/Test/Marker fields are not migrated or silently accepted in this plan.
  - Alternatives: Back-migrate existing plans now; accept old prose-only behavior shapes; skip active-plan CLI until all plans are migrated.
  - Why: The brief explicitly excludes back-migration and asks for conformance against the new contract. Treating legacy plans as failures preserves a clear gate and avoids scope creep.
  - Decided by: plan-reviewer finding accepted

## Behaviors

### B-001 — Parses planned behavior entries

- Source: AC-001
- Context: a plan body contains a `## Behaviors` section with `### B-###` entries and required bullet fields
- Action: the artifact conformance parser reads the markdown
- Expected: it extracts each behavior ID, title, field value, field line, and test reference without reading test files
- Seam: `lib/artifacts/behavior-conformance.ts`
- Test: `tests/artifacts/behavior-conformance.test.ts` > `parses behavior entries from the Behaviors section`
- Marker: `@cosmo-behavior plan:artifact-conformance-gate#B-001`

### B-002 — Rejects missing or empty behavior sections

- Source: AC-002
- Context: a plan has no `## Behaviors` section, has the section with no entries, or has headings inside the section that are not parseable `### B-###` behavior entries
- Action: the checker validates the parsed behavior section
- Expected: it returns a top-level issue identifying the missing behavior section or missing behavior entry instead of passing an empty behavior list
- Seam: `lib/artifacts/behavior-conformance.ts`
- Test: `tests/artifacts/behavior-conformance.test.ts` > `reports missing or empty behavior sections as conformance failures`
- Marker: `@cosmo-behavior plan:artifact-conformance-gate#B-002`

### B-003 — Reports missing required behavior fields

- Source: AC-003
- Context: a `B-###` entry omits one of Source, Context, Action, Expected, Seam, Test, or Marker
- Action: the checker validates parsed behavior fields
- Expected: it returns a conformance issue naming the behavior ID and missing field
- Seam: `lib/artifacts/behavior-conformance.ts`
- Test: `tests/artifacts/behavior-conformance.test.ts` > `reports the behavior id and field when a required field is missing`
- Marker: `@cosmo-behavior plan:artifact-conformance-gate#B-003`

### B-004 — Validates marker syntax against slug and behavior ID

- Source: AC-004
- Context: a behavior marker is malformed or points at a different plan slug or behavior ID
- Action: the checker validates the behavior marker field
- Expected: it returns an invalid-marker issue with the expected marker and actual marker text
- Seam: `lib/artifacts/behavior-conformance.ts`
- Test: `tests/artifacts/behavior-conformance.test.ts` > `rejects markers with the wrong slug behavior id or syntax`
- Marker: `@cosmo-behavior plan:artifact-conformance-gate#B-004`

### B-005 — Rejects unsafe or malformed test references before reading files

- Source: AC-005
- Context: a behavior Test field is empty, malformed, absolute, traverses outside the project root, or points through a symlink that resolves outside the project root
- Action: the checker parses and resolves the test reference against the project root
- Expected: it returns an invalid-test-reference issue and does not read the referenced file contents
- Seam: `lib/artifacts/behavior-conformance.ts`
- Test: `tests/artifacts/behavior-conformance.test.ts` > `rejects empty absolute traversal and symlink-escape test references before reading files`
- Marker: `@cosmo-behavior plan:artifact-conformance-gate#B-005`

### B-006 — Verifies referenced test files exist

- Source: AC-006
- Context: a behavior names a safe project-root-relative test file in its Test field
- Action: the checker checks that path under the supplied project root
- Expected: it passes only when the file exists and reports a missing-test-file issue when it does not
- Seam: `lib/artifacts/behavior-conformance.ts`
- Test: `tests/artifacts/behavior-conformance.test.ts` > `reports missing test files using project root relative paths`
- Marker: `@cosmo-behavior plan:artifact-conformance-gate#B-006`

### B-007 — Verifies exact marker text in referenced tests without AST parsing

- Source: AC-007, AC-010
- Context: a behavior names an existing safe test file and exact marker
- Action: the checker reads the file as text
- Expected: it passes only when the file contains the exact marker and does not depend on TypeScript, Vitest, or any framework-specific AST API
- Seam: `lib/artifacts/behavior-conformance.ts`
- Test: `tests/artifacts/behavior-conformance.test.ts` > `checks exact marker text in any referenced file type without parsing test ASTs`
- Marker: `@cosmo-behavior plan:artifact-conformance-gate#B-007`

### B-008 — Returns structured verifier-friendly evidence

- Source: AC-008
- Context: Drive, quality-manager, or a verifier needs evidence from the artifact-conformance gate
- Action: validation completes for a plan with passing and failing behaviors
- Expected: the result includes `ok`, `planSlug`, behavior evidence, issue kinds, messages, and relevant field/path/marker details
- Seam: `lib/artifacts/behavior-conformance.ts`
- Test: `tests/artifacts/behavior-conformance.test.ts` > `returns structured evidence for passing and failing behaviors`
- Marker: `@cosmo-behavior plan:artifact-conformance-gate#B-008`

### B-009 — CLI reports successful conformance in all output modes

- Source: AC-009
- Context: a human or automation checks an active plan whose behavior entries, test files, and markers conform
- Action: `cosmonauts plan check-artifacts <slug>` runs in human, plain, and JSON modes
- Expected: each mode reports success evidence, JSON emits the structured result, and the process exits zero
- Seam: `cli/plans/commands/check-artifacts.ts`; `cli/plans/index.ts`
- Test: `tests/cli/plans/commands/check-artifacts.test.ts` > `prints successful conformance output in human plain and json modes`
- Marker: `@cosmo-behavior plan:artifact-conformance-gate#B-009`

### B-010 — CLI reports conformance failures with non-zero exit

- Source: AC-009
- Context: an active plan has conformance issues such as missing required fields or missing marker text
- Action: `cosmonauts plan check-artifacts <slug>` runs in human, plain, and JSON modes
- Expected: each mode reports actionable issue evidence and the process exits non-zero
- Seam: `cli/plans/commands/check-artifacts.ts`
- Test: `tests/cli/plans/commands/check-artifacts.test.ts` > `prints conformance failures in human plain and json modes and exits non-zero`
- Marker: `@cosmo-behavior plan:artifact-conformance-gate#B-010`

### B-011 — CLI rejects invalid slugs and missing plans before conformance checking

- Source: AC-009
- Context: a command target is not a valid plan slug or no `missions/plans/<slug>/plan.md` file exists
- Action: the CLI command is invoked
- Expected: it prints normal CLI diagnostics in the requested output mode, performs no artifact scan, and exits non-zero
- Seam: `cli/plans/commands/check-artifacts.ts`; `lib/plans/plan-manager.ts`
- Test: `tests/cli/plans/commands/check-artifacts.test.ts` > `reports invalid slug and missing plan diagnostics before scanning artifacts`
- Marker: `@cosmo-behavior plan:artifact-conformance-gate#B-011`

### B-012 — Updates artifact guidance without expanding scope or hiding legacy failures

- Source: AC-010
- Context: agents read the work-artifact behavior-spine and gate guidance after the checker exists
- Action: they look for how conformance is enforced and where it applies
- Expected: guidance mentions mechanical field/file/marker checks, root-relative path expectations, no AST parsing or gate bindings, and that legacy plans lacking current behavior fields may fail until migrated separately
- Seam: `domains/shared/skills/work-artifacts/references/behavior-spine.md`; `domains/shared/skills/work-artifacts/references/gate-contracts.md`; `tests/prompts/work-artifacts-skill.test.ts`
- Test: `tests/prompts/work-artifacts-skill.test.ts` > `mentions mechanical behavior marker conformance without requiring AST parsing gate bindings or legacy migration`
- Marker: `@cosmo-behavior plan:artifact-conformance-gate#B-012`

## Design

### Module boundaries

- `lib/artifacts/behavior-conformance.ts` owns parsing behavior entries and checking artifact conformance against the filesystem. It exports the public API and types below. It must not import CLI code, Drive code, task code, prompt files, or plan manager code.
- `lib/artifacts/index.ts` re-exports the public conformance API for future consumers.
- `cli/plans/commands/check-artifacts.ts` owns command argument parsing, slug validation, reading `missions/plans/<slug>/plan.md`, output formatting, and exit status. It depends on `lib/artifacts` and existing plan slug validation, not the reverse.
- `domains/shared/skills/work-artifacts/references/*.md` remains markdown guidance. It may mention the mechanical conformance check conceptually, but must not become a concrete Drive or Quality Contract runner design.

Dependency direction:

```text
CLI plan command -> lib/plans slug validation + lib/artifacts checker -> Node fs/path
work-artifacts markdown -> describes contract only
Drive / quality-manager -> no direct changes in this plan
```

### Public checker contract

Implement the checker with these exported shapes. Names may be adjusted only if tests and CLI use the same contract.

```ts
export type BehaviorField =
	| "source"
	| "context"
	| "action"
	| "expected"
	| "seam"
	| "test"
	| "marker";

export interface BehaviorFieldValue {
	value: string;
	line: number;
}

export interface ParsedBehaviorEntry {
	id: string;
	title: string;
	line: number;
	fields: Partial<Record<BehaviorField, BehaviorFieldValue>>;
}

export interface ParsedBehaviorSection {
	found: boolean;
	line?: number;
	behaviors: ParsedBehaviorEntry[];
}

export interface BehaviorTestReference {
	raw: string;
	filePath: string;
	testName?: string;
	line: number;
}

export type ArtifactConformanceIssueKind =
	| "missing-behaviors-section"
	| "missing-behavior-entry"
	| "missing-required-field"
	| "invalid-test-reference"
	| "invalid-marker"
	| "missing-test-file"
	| "missing-marker";

export interface ArtifactConformanceIssue {
	kind: ArtifactConformanceIssueKind;
	message: string;
	behaviorId?: string;
	field?: BehaviorField;
	line?: number;
	filePath?: string;
	marker?: string;
	expected?: string;
	actual?: string;
}

export interface BehaviorConformanceEvidence {
	behaviorId: string;
	marker?: string;
	testFile?: string;
	issues: ArtifactConformanceIssue[];
}

export interface ArtifactConformanceResult {
	ok: boolean;
	planSlug: string;
	planPath?: string;
	behaviors: BehaviorConformanceEvidence[];
	issues: ArtifactConformanceIssue[];
}

export function parsePlanBehaviorSection(
	markdown: string,
): ParsedBehaviorSection;

export function parsePlanBehaviors(markdown: string): ParsedBehaviorEntry[];

export function parseBehaviorTestReference(
	value: BehaviorFieldValue,
): BehaviorTestReference | ArtifactConformanceIssue;

export async function checkBehaviorArtifactConformance(options: {
	projectRoot: string;
	planSlug: string;
	planMarkdown: string;
	planPath?: string;
}): Promise<ArtifactConformanceResult>;
```

Parsing rules:

- The parser looks for an exact `## Behaviors` section and stops at the next `## ` heading.
- If the section is missing, the checker reports `missing-behaviors-section`.
- If the section is present but no `### B-###` entries are parsed, the checker reports `missing-behavior-entry`.
- Behavior entries start with `### B-###` and may use `-`, `–`, or `—` before the title.
- Required fields are one-line bullets with labels `Source`, `Context`, `Action`, `Expected`, `Seam`, `Test`, and `Marker`. Accept `Expected result` as an alias for `Expected` because the artifact prose uses both terms.
- Strip surrounding backticks from `Test` file path and `Marker` values.
- Parse the `Test` field path from the first inline-code span, or from text before `>` when no inline-code span exists. The optional text after `>` is `testName` evidence only; v1 does not verify the named test.
- Marker validation expects exactly `@cosmo-behavior plan:<planSlug>#<behaviorId>` after trimming optional backticks.

Filesystem and path-safety rules:

- Test references must produce a non-empty file path. Empty values or values that cannot produce a path report `invalid-test-reference`.
- Test file paths must be project-root-relative. Reject POSIX or Windows absolute paths, including absolute paths that happen to point inside the project.
- Reject NUL bytes and traversal outside the project root before attempting to read file contents.
- Use the real project root for containment: resolve `projectRoot` with `realpath`, resolve the candidate path below it, and reject lexical escapes using `path.relative(realProjectRoot, candidatePath)`.
- For existing candidates, resolve the candidate with `realpath` before reading. Reject symlink escapes when the real candidate path is outside the real project root.
- If a candidate is safe lexically but does not exist, report `missing-test-file` without attempting content reads.
- Read safe existing test files as UTF-8 text and use `content.includes(marker)` for marker presence.
- Do not import or invoke Vitest, TypeScript compiler APIs, or any test-framework parser.

### CLI contract

Add `cli/plans/commands/check-artifacts.ts` and register it in `cli/plans/index.ts`.

Command shape:

```text
cosmonauts plan check-artifacts <slug>
cosmonauts plan --plain check-artifacts <slug>
cosmonauts plan --json check-artifacts <slug>
```

Behavior:

- Use `process.cwd()` as `projectRoot`.
- Validate the slug with `validateSlug()` from `lib/plans/plan-manager.ts` before constructing `missions/plans/<slug>/plan.md`.
- If the plan file does not exist, print a normal CLI error and exit `1`.
- The command targets `missions/plans/<slug>/plan.md` only. It does not scan archived plans or every active plan.
- On successful conformance, exit `0`.
- On conformance issues, print the issues and exit `1`.
- JSON mode prints the full `ArtifactConformanceResult` on successful scans; invalid slug and missing-plan errors use the existing CLI JSON error shape.
- Plain mode prints one stable line per issue, and `ok=true behaviors=<n> issues=0` on success.
- Human mode prints a compact summary plus bullet issues.
- Legacy plans without the current behavior-spine fields fail like any other non-conforming plan; the CLI must not broaden parser compatibility or migrate them.

### Artifact guidance update

Update the work-artifact references narrowly:

- `behavior-spine.md`: add a short “Mechanical Conformance” note saying v1 checks required behavior fields, root-relative test files, and exact marker presence, without AST parsing or proximity checks.
- `behavior-spine.md`: state that older plans missing the current behavior fields may fail this check until a separate migration updates them.
- `gate-contracts.md` and/or `plan-format.md`: replace future-tense “once enforcement exists” language for `artifact-conformance` with a statement that this gate is mechanically checkable for planned behavior field/file/marker evidence. Do not add concrete command columns or broader gate-binding rules.

## Files to Change

- `tests/artifacts/behavior-conformance.test.ts` — new library tests for B-001 through B-008, using temporary project roots and fixture plan markdown.
- `lib/artifacts/behavior-conformance.ts` — new parser/checker implementation and exported conformance types.
- `lib/artifacts/index.ts` — new public re-export for artifact utilities.
- `tests/cli/plans/commands/check-artifacts.test.ts` — new CLI rendering and command tests for B-009 through B-011 success/failure/error behavior.
- `tests/cli/plans/subcommand.test.ts` — update expected plan subcommands to include `check-artifacts`.
- `cli/plans/commands/check-artifacts.ts` — new plan CLI command.
- `cli/plans/index.ts` — register the new command.
- `tests/prompts/work-artifacts-skill.test.ts` — add B-012 text-contract coverage for mechanical conformance guidance and excluded scope.
- `domains/shared/skills/work-artifacts/references/behavior-spine.md` — add narrow mechanical conformance and legacy-plan notes.
- `domains/shared/skills/work-artifacts/references/gate-contracts.md` — update artifact-conformance row wording away from “once enforcement exists” while keeping abstract gate rules.
- `domains/shared/skills/work-artifacts/references/plan-format.md` — update the artifact-conformance Quality Contract example only if needed to match gate-contract wording.

## Risks

- **Markdown parser brittleness.** Mitigation: keep parsing limited to the canonical behavior shape; test accepted dash variants and `Expected result` alias; fail with actionable diagnostics when format is unsupported.
- **Unsafe file reads from plan-authored paths.** Mitigation: require root-relative paths; reject absolute, traversal, NUL, malformed, and symlink-escape references before content reads; test each case.
- **False confidence from marker presence anywhere in the file.** Mitigation: document exact presence as v1 scope; proximity/AST checks are explicitly deferred.
- **Legacy active plans look newly broken.** Mitigation: state that legacy plans fail by design if checked; do not auto-run the command against all active plans; defer migration to a separate follow-up.
- **Scope creep into a gate runner.** Mitigation: no Drive, quality-manager runtime, `.cosmonauts` binding, or Quality Contract execution changes in this plan.
- **CLI output brittleness.** Mitigation: put stable rendering helpers in the command module and assert concise plain/JSON output plus representative human summaries rather than full prose snapshots.
- **Guidance starts naming concrete commands in generic gate tables.** Mitigation: update markdown conceptually and keep tests that reject concrete command/tool columns in generic artifact references.

## Quality Contract

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | New artifact and CLI tests pass; existing tests remain green | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | This plan's behaviors name tests and markers; implemented tests carry matching `@cosmo-behavior` markers | artifact evidence | hard fail |
| 3 | `mutation` | bindable | unbound | Negative tests cover missing section, empty section, missing field, wrong slug, wrong behavior ID, malformed marker, empty/malformed test reference, absolute path, traversal path, symlink escape, missing file, missing marker, invalid slug, and missing plan | pending | unbound, not enforced; reviewer judgment required |
| 4 | `boundary-conformance` | bindable | unbound | `lib/artifacts` has no dependency on CLI, Drive, tasks, prompt runtime, or plan manager; CLI depends inward on the artifact checker and existing slug validation | pending | unbound, not enforced; reviewer judgment required |
| 5 | `complexity` | bindable | unbound | Parser stays line-oriented and deterministic; no AST/test-framework integration, migration engine, or gate-runner abstractions are introduced | pending | unbound, not enforced; reviewer judgment required |

## Implementation Order

1. **Library parser RED/GREEN.** Add `tests/artifacts/behavior-conformance.test.ts` for B-001 and B-002 using fixture markdown with valid entries plus missing/empty behavior sections. Implement `parsePlanBehaviorSection`, `parsePlanBehaviors`, and field normalization in `lib/artifacts/behavior-conformance.ts`.
2. **Required-field and marker validation RED/GREEN.** Add negative tests for B-003 and B-004: missing field, malformed marker, wrong slug, and wrong behavior ID. Implement structured issue generation and expected marker comparison.
3. **Safe test-reference RED/GREEN.** Add negative tests for B-005: empty/malformed Test value, POSIX absolute path, Windows absolute path, `..` traversal, and symlink escape. Implement root-relative parsing, lexical containment, realpath containment, and “do not read unsafe paths” behavior.
4. **Filesystem and marker checks RED/GREEN.** Add temp-directory tests for B-006 and B-007: existing marker file, missing test file, missing marker, and arbitrary file extension. Implement safe UTF-8 reads and exact text search.
5. **Structured evidence refactor.** Add/complete B-008 assertions for `ArtifactConformanceResult`, then refactor parser/checker internals so behavior evidence and issue aggregation are clear without adding unused abstraction.
6. **CLI command RED/GREEN.** Add `tests/cli/plans/commands/check-artifacts.test.ts` and update subcommand registration test for B-009 through B-011. Implement `cli/plans/commands/check-artifacts.ts`, register it, cover human/plain/JSON success and failure, and keep formatting helpers testable.
7. **Guidance update RED/GREEN.** Add B-012 prompt/skill text-contract assertions, then update work-artifact references narrowly. Preserve existing negative assertions against concrete `Tool`/`Command` columns and project-specific bindings.
8. **Coherence pass.** Verify public exports, dependency direction, path handling, issue messages, behavior markers, and legacy-plan scope language. Confirm no Drive integration, gate-runner schema, AST parser, back-migration, renderer, or memory ingestion slipped in.
9. **Final verification.** Run `bun run test`, `bun run lint`, and `bun run typecheck`.

## Assumptions

- The brief is authoritative product scope for this follow-up; no separate product spec pass is needed.
- The checker targets plans using the current `work-artifacts` behavior-spine shape. Older active or archived plans may fail by design and are not migrated here.
- `missions/plans/<slug>/plan.md` is the CLI's first target; arbitrary archived plan paths can be added later if needed.
- Drive can call the CLI as a postflight command later without this plan adding Drive-specific state or scheduling logic.
