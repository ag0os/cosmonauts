import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
	checkBehaviorConformance,
	parseBehaviorSection,
} from "../../lib/artifacts/index.ts";

describe("behavior conformance", () => {
	let tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(
			tempDirs.map((tempDir) => rm(tempDir, { recursive: true, force: true })),
		);
		tempDirs = [];
	});

	// @cosmo-behavior plan:artifact-conformance-gate#B-001
	test("parses behavior entries from the Behaviors section", () => {
		const markdown = `# Artifact Conformance Gate

### B-999 — Outside the behavior section

## Overview

Introductory text is ignored.

## Behaviors

### B-001 - Parses hyphen headings

- Source: AC-001
- Context: a plan has behavior entries
- Action: the parser reads the plan markdown
- Expected result: it extracts normalized fields
- Seam: \`lib/artifacts/behavior-conformance.ts\`
- Test: \`tests/artifacts/behavior-conformance.test.ts\` > \`parses behavior entries from the Behaviors section\`
- Marker: \`@cosmo-behavior plan:artifact-conformance-gate#B-001\`

### B-002 – Parses en dash headings

- Source: AC-002
- Context: another behavior entry exists
- Action: the parser reads the next entry
- Expected: it preserves the behavior title
- Seam: \`lib/artifacts/behavior-conformance.ts\`
- Test: \`tests/artifacts/behavior-conformance.test.ts\` > \`second named test\`
- Marker: \`@cosmo-behavior plan:artifact-conformance-gate#B-002\`

### B-003 — Parses em dash headings

- Source: AC-003
- Context: dash variants are supported
- Action: the parser reads the heading
- Expected: it preserves this behavior too
- Seam: \`lib/artifacts/behavior-conformance.ts\`
- Test: \`tests/artifacts/behavior-conformance.test.ts\` > \`third named test\`
- Marker: \`@cosmo-behavior plan:artifact-conformance-gate#B-003\`

## Tasks

### B-004 — Not part of the behaviors section
`;

		const section = parseBehaviorSection(markdown);

		expect(section.present).toBe(true);
		expect(section.issues).toEqual([]);
		expect(section.behaviors).toHaveLength(3);

		const first = section.behaviors[0];
		expect(first).toBeDefined();
		expect(first?.id).toBe("B-001");
		expect(first?.title).toBe("Parses hyphen headings");
		expect(first?.heading).toBe("### B-001 - Parses hyphen headings");
		expect(first?.fields.source?.value).toBe("AC-001");
		expect(first?.fields.context?.value).toBe("a plan has behavior entries");
		expect(first?.fields.action?.line).toBe(
			"- Action: the parser reads the plan markdown",
		);
		expect(first?.fields.expected?.label).toBe("Expected result");
		expect(first?.fields.expected?.value).toBe("it extracts normalized fields");
		expect(first?.fields.seam?.value).toBe(
			"`lib/artifacts/behavior-conformance.ts`",
		);
		expect(first?.testReferenceText).toBe(
			"`tests/artifacts/behavior-conformance.test.ts` > `parses behavior entries from the Behaviors section`",
		);
		expect(first?.fields.marker?.value).toBe(
			"`@cosmo-behavior plan:artifact-conformance-gate#B-001`",
		);
		expect(first?.fieldLines.map((field) => field.name)).toEqual([
			"source",
			"context",
			"action",
			"expected",
			"seam",
			"test",
			"marker",
		]);

		expect(section.behaviors.map((behavior) => behavior.title)).toEqual([
			"Parses hyphen headings",
			"Parses en dash headings",
			"Parses em dash headings",
		]);
	});

	// @cosmo-behavior plan:artifact-conformance-gate#B-002
	test("reports missing or empty behavior sections as conformance failures", () => {
		const cases = [
			{
				name: "missing",
				markdown: "## Overview\n\nNo behavior section.\n",
				kind: "missing-behavior-section",
			},
			{
				name: "empty",
				markdown: "## Behaviors\n\n## Tasks\n\n- TASK-001\n",
				kind: "missing-behavior-entry",
			},
			{
				name: "unparseable",
				markdown: "## Behaviors\n\n### Behavior one\n\n- Source: AC-001\n",
				kind: "missing-behavior-entry",
			},
		] as const;

		for (const testCase of cases) {
			const result = checkBehaviorConformance({
				planMarkdown: testCase.markdown,
				planSlug: "artifact-conformance-gate",
			});

			expect(result.ok, testCase.name).toBe(false);
			expect(result.behaviors, testCase.name).toEqual([]);
			expect(result.issues, testCase.name).toHaveLength(1);
			expect(result.issues[0], testCase.name).toMatchObject({
				kind: testCase.kind,
			});
			expect(result.issues[0]?.behaviorId, testCase.name).toBeUndefined();
		}
	});

	// @cosmo-behavior plan:artifact-conformance-gate#B-003
	test("reports the behavior id and field when a required field is missing", () => {
		const requiredFieldLines = {
			source: "- Source: AC-003",
			context: "- Context: a behavior omits one required field",
			action: "- Action: the checker validates parsed behavior fields",
			expected: "- Expected: it returns missing field evidence",
			seam: "- Seam: `lib/artifacts/behavior-conformance.ts`",
			test: "- Test: `tests/artifacts/behavior-conformance.test.ts` > `reports the behavior id and field when a required field is missing`",
			marker:
				"- Marker: `@cosmo-behavior plan:artifact-conformance-gate#B-003`",
		} as const;
		const fieldDisplayNames = {
			source: "Source",
			context: "Context",
			action: "Action",
			expected: "Expected",
			seam: "Seam",
			test: "Test",
			marker: "Marker",
		} as const;

		for (const field of Object.keys(requiredFieldLines) as Array<
			keyof typeof requiredFieldLines
		>) {
			const behaviorFields = Object.entries(requiredFieldLines)
				.filter(([name]) => name !== field)
				.map(([, line]) => line)
				.join("\n");
			const result = checkBehaviorConformance({
				planSlug: "artifact-conformance-gate",
				planMarkdown: `# Artifact Conformance Gate

## Behaviors

### B-003 - Requires all behavior fields

${behaviorFields}
`,
			});

			expect(result.ok, field).toBe(false);
			expect(result.issues, field).toEqual([
				{
					kind: "missing-behavior-field",
					message: `Behavior B-003 is missing required ${fieldDisplayNames[field]} field.`,
					behaviorId: "B-003",
					field,
					line: 5,
				},
			]);
		}
	});

	// @cosmo-behavior plan:artifact-conformance-gate#B-004
	test("rejects markers with the wrong slug behavior id or syntax", () => {
		const cases = [
			{
				name: "wrong slug",
				behaviorId: "B-004",
				marker: "`@cosmo-behavior plan:other-plan#B-004`",
			},
			{
				name: "wrong behavior id",
				behaviorId: "B-004",
				marker: "`@cosmo-behavior plan:artifact-conformance-gate#B-999`",
			},
			{
				name: "malformed syntax",
				behaviorId: "B-004",
				marker: "`cosmo-behavior artifact-conformance-gate B-004`",
			},
		] as const;

		for (const testCase of cases) {
			const result = checkBehaviorConformance({
				planSlug: "artifact-conformance-gate",
				planMarkdown: `# Artifact Conformance Gate

## Behaviors

### ${testCase.behaviorId} - Validates marker syntax

- Source: AC-004
- Context: a behavior marker is invalid
- Action: the checker validates the behavior marker field
- Expected: it returns marker evidence
- Seam: \`lib/artifacts/behavior-conformance.ts\`
- Test: \`tests/artifacts/behavior-conformance.test.ts\` > \`rejects markers with the wrong slug behavior id or syntax\`
- Marker: ${testCase.marker}
`,
			});

			expect(result.ok, testCase.name).toBe(false);
			expect(result.issues, testCase.name).toEqual([
				{
					kind: "invalid-marker",
					message:
						"Behavior B-004 marker must exactly match @cosmo-behavior plan:artifact-conformance-gate#B-004.",
					behaviorId: "B-004",
					field: "marker",
					line: 13,
					expected: "@cosmo-behavior plan:artifact-conformance-gate#B-004",
					actual: testCase.marker.slice(1, -1),
				},
			]);
		}

		const valid = checkBehaviorConformance({
			planSlug: "artifact-conformance-gate",
			planMarkdown: `# Artifact Conformance Gate

## Behaviors

### B-004 - Validates marker syntax

- Source: AC-004
- Context: a behavior marker is wrapped in optional backticks
- Action: the checker validates the behavior marker field
- Expected: it accepts the exact marker text after trimming backticks
- Seam: \`lib/artifacts/behavior-conformance.ts\`
- Test: \`tests/artifacts/behavior-conformance.test.ts\` > \`rejects markers with the wrong slug behavior id or syntax\`
- Marker: \`@cosmo-behavior plan:artifact-conformance-gate#B-004\`
`,
		});

		expect(valid.ok).toBe(true);
		expect(valid.issues).toEqual([]);
	});

	// @cosmo-behavior plan:artifact-conformance-gate#B-005
	test("rejects empty absolute traversal and symlink-escape test references before reading files", async () => {
		const projectRoot = await createTempDir("behavior-conformance-root-");
		const outsideRoot = await createTempDir("behavior-conformance-outside-");
		await mkdir(join(projectRoot, "tests", "artifacts"), { recursive: true });
		await writeFile(
			join(projectRoot, "tests", "artifacts", "behavior-conformance.test.ts"),
			"// @cosmo-behavior plan:artifact-conformance-gate#B-005\n",
			"utf-8",
		);
		await writeFile(
			join(outsideRoot, "escaped.test.ts"),
			"// outside\n",
			"utf-8",
		);
		await symlink(
			join(outsideRoot, "escaped.test.ts"),
			join(projectRoot, "tests", "artifacts", "escaped.test.ts"),
		);

		const invalidCases = [
			{
				name: "empty",
				value: "",
				path: undefined,
				message:
					"Behavior B-005 Test field must include a project-root-relative path.",
			},
			{
				name: "empty inline code",
				value: "`   ` > `named test`",
				path: undefined,
				message:
					"Behavior B-005 Test field must include a project-root-relative path.",
			},
			{
				name: "malformed inline code",
				value: "`tests/artifacts/behavior-conformance.test.ts > `named test`",
				path: undefined,
				message:
					"Behavior B-005 Test field must include a project-root-relative path.",
			},
			{
				name: "posix absolute",
				value: "`/tmp/behavior-conformance.test.ts`",
				path: "/tmp/behavior-conformance.test.ts",
				message:
					"Behavior B-005 Test field path must be relative to the project root.",
			},
			{
				name: "windows absolute",
				value: "`C:\\tmp\\behavior-conformance.test.ts`",
				path: "C:\\tmp\\behavior-conformance.test.ts",
				message:
					"Behavior B-005 Test field path must be relative to the project root.",
			},
			{
				name: "nul byte",
				value: "`tests/artifacts/behavior-conformance.test.ts\u0000.md`",
				path: "tests/artifacts/behavior-conformance.test.ts\u0000.md",
				message: "Behavior B-005 Test field path must not contain NUL bytes.",
			},
			{
				name: "traversal",
				value: "`../outside.test.ts`",
				path: "../outside.test.ts",
				message:
					"Behavior B-005 Test field path must stay inside the project root.",
			},
			{
				name: "symlink escape",
				value: "`tests/artifacts/escaped.test.ts` > `outside marker`",
				path: "tests/artifacts/escaped.test.ts",
				message:
					"Behavior B-005 Test field path resolves outside the project root.",
			},
		] as const;

		for (const testCase of invalidCases) {
			const result = checkBehaviorConformance({
				planSlug: "artifact-conformance-gate",
				projectRoot,
				planMarkdown: behaviorMarkdown(testCase.value),
			});

			expect(result.ok, testCase.name).toBe(false);
			expect(result.issues, testCase.name).toEqual([
				{
					kind: "invalid-test-reference",
					message: testCase.message,
					behaviorId: "B-005",
					field: "test",
					line: 12,
					path: testCase.path,
					actual: testCase.value,
				},
			]);
		}

		const inlineCodeReference = checkBehaviorConformance({
			planSlug: "artifact-conformance-gate",
			projectRoot,
			planMarkdown: behaviorMarkdown(
				"`tests/artifacts/behavior-conformance.test.ts` > `named test evidence`",
			),
		});
		expect(inlineCodeReference.ok).toBe(true);
		expect(inlineCodeReference.issues).toEqual([]);

		const textBeforeNamedTestReference = checkBehaviorConformance({
			planSlug: "artifact-conformance-gate",
			projectRoot,
			planMarkdown: behaviorMarkdown(
				"tests/artifacts/behavior-conformance.test.ts > `named test evidence`",
			),
		});
		expect(textBeforeNamedTestReference.ok).toBe(true);
		expect(textBeforeNamedTestReference.issues).toEqual([]);
	});

	// @cosmo-behavior plan:artifact-conformance-gate#B-006
	test("reports missing test files using project root relative paths", async () => {
		const projectRoot = await createTempDir("behavior-conformance-root-");
		await mkdir(join(projectRoot, "tests", "artifacts"), { recursive: true });
		await writeFile(
			join(projectRoot, "tests", "artifacts", "existing.test.ts"),
			"// @cosmo-behavior plan:artifact-conformance-gate#B-006\n",
			"utf-8",
		);

		const existingFile = checkBehaviorConformance({
			planSlug: "artifact-conformance-gate",
			projectRoot,
			planMarkdown: behaviorMarkdownFor({
				behaviorId: "B-006",
				source: "AC-006",
				testReference:
					"`tests/artifacts/existing.test.ts` > `reports missing test files using project root relative paths`",
				marker: "@cosmo-behavior plan:artifact-conformance-gate#B-006",
			}),
		});
		expect(existingFile.ok).toBe(true);
		expect(existingFile.issues).toEqual([]);

		const missingFile = checkBehaviorConformance({
			planSlug: "artifact-conformance-gate",
			projectRoot,
			planMarkdown: behaviorMarkdownFor({
				behaviorId: "B-006",
				source: "AC-006",
				testReference:
					"`tests/artifacts/missing.test.ts` > `reports missing test files using project root relative paths`",
				marker: "@cosmo-behavior plan:artifact-conformance-gate#B-006",
			}),
		});

		expect(missingFile.ok).toBe(false);
		expect(missingFile.issues).toEqual([
			{
				kind: "missing-test-file",
				message:
					"Behavior B-006 referenced Test file does not exist: tests/artifacts/missing.test.ts.",
				behaviorId: "B-006",
				field: "test",
				line: 12,
				path: "tests/artifacts/missing.test.ts",
			},
		]);
	});

	// @cosmo-behavior plan:artifact-conformance-gate#B-007
	test("checks exact marker text in any referenced file type without parsing test ASTs", async () => {
		const projectRoot = await createTempDir("behavior-conformance-root-");
		await mkdir(join(projectRoot, "docs", "evidence"), { recursive: true });
		await writeFile(
			join(projectRoot, "docs", "evidence", "behavior.notes"),
			[
				"plain text evidence",
				"@cosmo-behavior plan:artifact-conformance-gate#B-007",
				"",
			].join("\n"),
			"utf-8",
		);
		await writeFile(
			join(projectRoot, "docs", "evidence", "wrong-marker.anything"),
			"@cosmo-behavior plan:artifact-conformance-gate#B-999\n",
			"utf-8",
		);

		const arbitraryFileType = checkBehaviorConformance({
			planSlug: "artifact-conformance-gate",
			projectRoot,
			planMarkdown: behaviorMarkdownFor({
				behaviorId: "B-007",
				source: "AC-007, AC-010",
				testReference:
					"`docs/evidence/behavior.notes` > `checks exact marker text in any referenced file type without parsing test ASTs`",
				marker: "@cosmo-behavior plan:artifact-conformance-gate#B-007",
			}),
		});
		expect(arbitraryFileType.ok).toBe(true);
		expect(arbitraryFileType.issues).toEqual([]);

		const missingMarker = checkBehaviorConformance({
			planSlug: "artifact-conformance-gate",
			projectRoot,
			planMarkdown: behaviorMarkdownFor({
				behaviorId: "B-007",
				source: "AC-007",
				testReference:
					"`docs/evidence/wrong-marker.anything` > `checks exact marker text in any referenced file type without parsing test ASTs`",
				marker: "@cosmo-behavior plan:artifact-conformance-gate#B-007",
			}),
		});

		expect(missingMarker.ok).toBe(false);
		expect(missingMarker.issues).toEqual([
			{
				kind: "missing-marker",
				message:
					"Behavior B-007 referenced Test file does not contain marker @cosmo-behavior plan:artifact-conformance-gate#B-007.",
				behaviorId: "B-007",
				field: "marker",
				line: 13,
				path: "docs/evidence/wrong-marker.anything",
				marker: "@cosmo-behavior plan:artifact-conformance-gate#B-007",
			},
		]);
	});

	// @cosmo-behavior plan:artifact-conformance-gate#B-008
	test("returns structured evidence for passing and failing behaviors", async () => {
		const projectRoot = await createTempDir("behavior-conformance-root-");
		await mkdir(join(projectRoot, "tests", "artifacts"), { recursive: true });
		await writeFile(
			join(projectRoot, "tests", "artifacts", "passing.txt"),
			"@cosmo-behavior plan:artifact-conformance-gate#B-008\n",
			"utf-8",
		);
		await writeFile(
			join(projectRoot, "tests", "artifacts", "failing.txt"),
			"missing the expected marker\n",
			"utf-8",
		);

		const result = checkBehaviorConformance({
			planSlug: "artifact-conformance-gate",
			planPath: "missions/plans/artifact-conformance-gate/plan.md",
			projectRoot,
			planMarkdown: `# Artifact Conformance Gate

## Behaviors

### B-008 - Passing behavior evidence

- Source: AC-008
- Context: one behavior has complete evidence
- Action: the checker validates the referenced file
- Expected: it returns passing behavior evidence
- Seam: \`lib/artifacts/behavior-conformance.ts\`
- Test: \`tests/artifacts/passing.txt\` > \`returns structured evidence for passing and failing behaviors\`
- Marker: \`@cosmo-behavior plan:artifact-conformance-gate#B-008\`

### B-099 - Failing behavior evidence

- Source: AC-008
- Context: one behavior has incomplete evidence
- Action: the checker validates the referenced file
- Expected: it returns failing behavior evidence and top-level aggregation
- Seam: \`lib/artifacts/behavior-conformance.ts\`
- Test: \`tests/artifacts/failing.txt\` > \`returns structured evidence for passing and failing behaviors\`
- Marker: \`@cosmo-behavior plan:artifact-conformance-gate#B-099\`
`,
		});

		expect(result).toMatchObject({
			ok: false,
			planSlug: "artifact-conformance-gate",
			planPath: "missions/plans/artifact-conformance-gate/plan.md",
			behaviors: [
				{
					behaviorId: "B-008",
					marker: "@cosmo-behavior plan:artifact-conformance-gate#B-008",
					testFile: "tests/artifacts/passing.txt",
					issues: [],
				},
				{
					behaviorId: "B-099",
					marker: "@cosmo-behavior plan:artifact-conformance-gate#B-099",
					testFile: "tests/artifacts/failing.txt",
					issues: [
						{
							kind: "missing-marker",
							message:
								"Behavior B-099 referenced Test file does not contain marker @cosmo-behavior plan:artifact-conformance-gate#B-099.",
							behaviorId: "B-099",
							field: "marker",
							line: 23,
							path: "tests/artifacts/failing.txt",
							marker: "@cosmo-behavior plan:artifact-conformance-gate#B-099",
						},
					],
				},
			],
			issues: [
				{
					kind: "missing-marker",
					message:
						"Behavior B-099 referenced Test file does not contain marker @cosmo-behavior plan:artifact-conformance-gate#B-099.",
					behaviorId: "B-099",
					field: "marker",
					line: 23,
					path: "tests/artifacts/failing.txt",
					marker: "@cosmo-behavior plan:artifact-conformance-gate#B-099",
				},
			],
		});
	});

	// @cosmo-behavior plan:planning-system-hardening#B-011
	test("flags unresolved decision citations and undated supersession pointers", () => {
		const result = checkBehaviorConformance({
			planSlug: "planning-system-hardening",
			planMarkdown: `# Planning system hardening

## Decision Log

- **D-001 - Original decision**
  - Decision: choose the original path
  - Decided by: planner-proposed, 2026-07-28

- **D-002 - Undated amendment**
  - Decision: replace part of the original path
  - Decided by: planner-proposed
  - Supersedes: D-001

- **D-003 - Dated annotation** *(superseded by D-001, 2026-07-28)*
  - Decision: preserve dated heading annotations
  - Decided by: planner-proposed, 2026-07-28

## Overview

The implementation still cites D-001, but this pointer to D-099 is unresolved.

## Behaviors

### B-011 - Checker resolves decisions

- Source: AC-010
- Context: decision citations and supersession pointers appear in a plan
- Action: the checker resolves and dates them
- Expected: unresolved citations and undated pointers are distinct issues
- Seam: \`lib/artifacts/behavior-conformance.ts\`
- Test: \`tests/artifacts/behavior-conformance.test.ts\` > \`flags unresolved decision citations and undated supersession pointers\`
- Marker: \`@cosmo-behavior plan:planning-system-hardening#B-011\`
`,
		});

		expect(result.issues).toEqual([
			expect.objectContaining({
				kind: "unresolved-decision-citation",
				actual: "D-099",
			}),
			expect.objectContaining({
				kind: "undated-supersession",
				actual: "Supersedes: D-001",
			}),
		]);
	});

	// @cosmo-behavior plan:planning-system-hardening#B-011
	test("checks real decision citations when the Decision Log is absent", () => {
		const conformingPlan = behaviorMarkdownFor({
			behaviorId: "B-011",
			source: "AC-010",
			testReference:
				"`tests/artifacts/behavior-conformance.test.ts` > `checks real decision citations when the Decision Log is absent`",
			marker: "@cosmo-behavior plan:planning-system-hardening#B-011",
		});

		const noCitation = checkBehaviorConformance({
			planSlug: "planning-system-hardening",
			planMarkdown: conformingPlan,
		});
		expect(noCitation.ok).toBe(true);
		expect(noCitation.issues).toEqual([]);

		const unresolvedCitation = checkBehaviorConformance({
			planSlug: "planning-system-hardening",
			planMarkdown: `${conformingPlan}\n## Overview\n\nThe implementation relies on D-404.\n`,
		});
		expect(unresolvedCitation.issues).toContainEqual(
			expect.objectContaining({
				kind: "unresolved-decision-citation",
				actual: "D-404",
			}),
		);
	});

	test("ignores citations and annotations quoted as code", () => {
		const result = checkBehaviorConformance({
			planSlug: "planning-system-hardening",
			planMarkdown: `# Planning system hardening

## Decision Log

- **D-001 - Only decision**
  - Decision: keep it
  - Decided by: planner-proposed, 2026-07-28

## Overview

Another plan's \`D-098\`/\`D-099\` are mentions, not citations, and so are the
annotation grammar template \`*(withdrawn by D-###, <date>)*\` and the undated
example \`*(superseded by D-097, <date>)*\`.

\`\`\`ts
// D-096 inside a fenced block is also a mention
// *(withdrawn by D-095)*
\`\`\`

## Behaviors

### B-011 - Checker resolves decisions

- Source: AC-010
- Context: quoted citations appear in prose spans and fenced blocks
- Action: the checker scans the plan
- Expected: quoted mentions produce no citation or supersession issues
- Seam: \`lib/artifacts/behavior-conformance.ts\`
- Test: \`tests/artifacts/behavior-conformance.test.ts\` > \`ignores citations and annotations quoted as code\`
- Marker: \`@cosmo-behavior plan:planning-system-hardening#B-011\`
`,
		});

		expect(result.issues).toEqual([]);
	});

	// @cosmo-behavior plan:planning-system-hardening#B-012
	test("keeps a behavior active when its withdrawal annotation is quoted as code", () => {
		const result = checkBehaviorConformance({
			planSlug: "planning-system-hardening",
			planMarkdown: `# Planning system hardening

## Decision Log

- **D-001 - Withdrawal ground**
  - Decision: withdraw the second behavior
  - Decided by: planner-proposed, 2026-07-28

## Behaviors

### B-012 - Documents the grammar \`*(withdrawn by D-001, 2026-07-28)*\`

- Source: AC-010
- Context: a heading quotes the exact dated withdrawal grammar as a syntax example
- Action: the checker classifies the behavior
- Expected: the behavior stays active and receives normal evidence validation
- Seam: \`lib/artifacts/behavior-conformance.ts\`
- Test: \`tests/artifacts/behavior-conformance.test.ts\` > \`keeps a behavior active when its withdrawal annotation is quoted as code\`
- Marker: \`@cosmo-behavior plan:planning-system-hardening#B-012\`

### B-002 - Actually withdrawn *(withdrawn by D-001, 2026-07-28)*
`,
		});

		expect(result.withdrawn).toBe(1);
		expect(
			result.behaviors.map((behavior) => [
				behavior.behaviorId,
				behavior.withdrawn,
			]),
		).toEqual([
			["B-012", false],
			["B-002", true],
		]);
		expect(result.issues).toEqual([]);
	});

	// @cosmo-behavior plan:planning-system-hardening#B-011
	test("masks same-paragraph multiline spans but never across block boundaries", () => {
		const result = checkBehaviorConformance({
			planSlug: "planning-system-hardening",
			planMarkdown: `# Planning system hardening

## Decision Log

- **D-001 - Only decision**
  - Decision: keep it
  - Decided by: planner-proposed, 2026-07-28

## Overview

A valid span may continue \`across a soft
line break mentioning D-097\` without creating a citation.

A stray backtick \` sits in this paragraph.

This paragraph cites D-099 and must still be flagged.

Another stray backtick \` sits here.

- first bullet holds a stray backtick \`
- second bullet cites D-098 and must be flagged
- third bullet holds another stray backtick \`

## Behaviors

### B-011 - Checker resolves decisions

- Source: AC-010
- Context: multiline spans and stray backticks appear in prose
- Action: the checker scans the plan
- Expected: same-paragraph spans mask; block-crossing pairs never mask
- Seam: \`lib/artifacts/behavior-conformance.ts\`
- Test: \`tests/artifacts/behavior-conformance.test.ts\` > \`masks same-paragraph multiline spans but never across block boundaries\`
- Marker: \`@cosmo-behavior plan:planning-system-hardening#B-011\`
`,
		});

		expect(result.issues).toEqual([
			expect.objectContaining({
				kind: "unresolved-decision-citation",
				actual: "D-099",
			}),
			expect.objectContaining({
				kind: "unresolved-decision-citation",
				actual: "D-098",
			}),
		]);
	});

	// @cosmo-behavior plan:planning-system-hardening#B-012
	test("does not withdraw a heading with trailing text after the annotation", () => {
		for (const trailing of ["trailing garbage", "`trailing code`"]) {
			const result = checkBehaviorConformance({
				planSlug: "planning-system-hardening",
				planMarkdown: `# Planning system hardening

## Behaviors

### B-001 - Sample *(withdrawn by D-001, 2026-07-28)* ${trailing}
`,
			});

			expect(result.withdrawn, trailing).toBe(0);
			expect(result.issues.length, trailing).toBeGreaterThan(0);
		}
	});

	// @cosmo-behavior plan:planning-system-hardening#B-011
	test("keeps the entry date visible when a fenced decision example splits the entry", () => {
		const result = checkBehaviorConformance({
			planSlug: "planning-system-hardening",
			planMarkdown: `# Planning system hardening

## Decision Log

- **D-001 - Original**
  - Decision: keep the original ground
  - Decided by: planner-proposed, 2026-07-28

- **D-002 - Amendment quoting an example entry**
  - Decision: document the entry grammar
  - Decided by: planner-proposed, 2026-07-28

\`\`\`md
- **D-999 - Example**
\`\`\`

  - Supersedes: the original descriptive ground
`,
		});

		expect(
			result.issues.filter((issue) => issue.kind === "undated-supersession"),
		).toEqual([]);
	});

	// @cosmo-behavior plan:planning-system-hardening#B-011
	test("flags a descriptive Supersedes ground whose decision entry carries no date", () => {
		const result = checkBehaviorConformance({
			planSlug: "planning-system-hardening",
			planMarkdown: `# Planning system hardening

## Decision Log

- **D-001 - Original**
  - Decision: keep the original ground
  - Decided by: planner-proposed, 2026-07-28

- **D-002 - Undated amendment**
  - Decision: replace it
  - Decided by: planner-proposed
  - Supersedes: D-001 because it changed
`,
		});

		expect(result.issues).toContainEqual(
			expect.objectContaining({
				kind: "undated-supersession",
				actual: "Supersedes: D-001 because it changed",
			}),
		);
	});

	test("masks Markdown code spans and fences before decision declaration and citation scans", () => {
		const result = checkBehaviorConformance({
			planSlug: "markdown-masking",
			planMarkdown: `# Markdown masking

\`\`\`md
## Decision Log
- **D-777 - Fenced fake decision section**
\`\`\`

## Decision Log

- **D-001 - Real decision**
  - Decision: keep the real declaration
  - Decided by: user-directed, 2026-07-28

\`\`- **D-097 - Inline quoted declaration**\`\`

\`\`\`\`md
- **D-098 - Backtick-fenced declaration**
  - Supersedes: D-001
\`\`\`
## Fake section inside the outer fence
\`\`\`\`

~~~~md
- **D-099 - Tilde-fenced declaration** *(withdrawn by D-001)*
~~~
## Another fake section
~~~~

## Overview

Real citations D-097, D-098, and D-099 must remain unresolved.

## Behaviors
### B-001 - Withdrawn evidence *(withdrawn by D-001, 2026-07-28)*

## Appendix

\`\`\`
D-096 and *(withdrawn by D-095)* remain masked through an unmatched fence.

## Decision Log
- **D-096 - Also masked**
`,
		});

		expect(result.issues.map((issue) => [issue.kind, issue.actual])).toEqual([
			["unresolved-decision-citation", "D-097"],
			["unresolved-decision-citation", "D-098"],
			["unresolved-decision-citation", "D-099"],
		]);
	});

	test("preserves inline code span delimiters across lines", () => {
		const quotedDeclaration = checkBehaviorConformance({
			planSlug: "multiline-code-span",
			planMarkdown: `## Decision Log

The quoted declaration sits in a fence:

\`\`\`md
- **D-097 - Quoted declaration**
\`\`\`

## Overview

The real citation D-097 remains unresolved.

## Behaviors
### B-001 - Withdrawn evidence *(withdrawn by D-097, 2026-07-28)*
`,
		});
		expect(
			quotedDeclaration.issues.filter(
				(issue) => issue.kind === "unresolved-decision-citation",
			),
		).toEqual([
			expect.objectContaining({
				actual: "D-097",
			}),
		]);

		const quotedCitation = checkBehaviorConformance({
			planSlug: "multiline-code-span",
			planMarkdown: `## Decision Log

- **D-001 - Real declaration**
  - Decision: preserve multiline quoting
  - Decided by: user-directed, 2026-07-28

## Overview

The quoted citation starts here: \`\`
D-099 is only sample text
and closes here.\`\`

## Behaviors
### B-001 - Withdrawn evidence *(withdrawn by D-001, 2026-07-28)*
`,
		});
		expect(quotedCitation.issues).toEqual([]);
	});

	test("uses only second-level headings outside fences to discover sections", () => {
		const section = parseBehaviorSection(`\`\`\`md
## Behaviors
### B-999 - Fenced fake behavior
\`\`\`

## Behaviors
### B-001 - Real behavior
- Source: AC-001
- Context: fenced headings occur around artifact sections
- Action: the parser discovers the real section
- Expected: fenced headings do not start or end sections
- Seam: lib/artifacts/behavior-conformance.ts
- Test: tests/artifacts/behavior-conformance.test.ts
- Marker: @cosmo-behavior plan:section-scan#B-001

\`\`\`md
## Files to Change
\`\`\`

### B-002 - Still in the real behavior section
- Source: AC-001
- Context: a fenced second-level heading appears in Behaviors
- Action: the parser continues scanning
- Expected: both real behavior entries are parsed
- Seam: lib/artifacts/behavior-conformance.ts
- Test: tests/artifacts/behavior-conformance.test.ts
- Marker: @cosmo-behavior plan:section-scan#B-002

## Files to Change
`);

		expect(section.behaviors.map((behavior) => behavior.id)).toEqual([
			"B-001",
			"B-002",
		]);
	});

	test("requires the supersession pointer itself to carry an ISO date", () => {
		const result = checkBehaviorConformance({
			planSlug: "supersession-pointer",
			planMarkdown: `## Decision Log

- **D-001 - Original**
  - Decision: original path
  - Decided by: user-directed, 2026-07-27

- **D-002 - Replacement**
  - Decision: replacement path
  - Decided by: user-directed, 2026-07-28
  - Supersedes: D-001

## Behaviors
### B-001 - Withdrawn evidence *(withdrawn by D-001, 2026-07-28)*
`,
		});

		expect(result.issues).toContainEqual(
			expect.objectContaining({
				kind: "undated-supersession",
				actual: "Supersedes: D-001",
			}),
		);
	});

	test("validates dates on structured multi-decision Supersedes pointers", () => {
		const undatedPointers = [
			"D-001 and D-002",
			"D-001/D-002",
			"D-001,D-002",
		] as const;

		for (const pointer of undatedPointers) {
			const result = checkBehaviorConformance({
				planSlug: "supersession-pointer",
				planMarkdown: supersessionPlan(pointer),
			});
			expect(result.issues, pointer).toContainEqual(
				expect.objectContaining({
					kind: "undated-supersession",
					actual: `Supersedes: ${pointer}`,
				}),
			);
		}

		for (const pointer of undatedPointers) {
			const datedPointer = `${pointer}, 2026-07-28`;
			const result = checkBehaviorConformance({
				planSlug: "supersession-pointer",
				planMarkdown: supersessionPlan(datedPointer),
			});
			expect(
				result.issues.filter((issue) => issue.kind === "undated-supersession"),
				datedPointer,
			).toEqual([]);
		}
	});

	test("accepts descriptive legacy Supersedes grounds without pointer dates", () => {
		for (const pointer of [
			"D-005 and Design's `pi.exec` mechanism",
			"prior provider-discovery-error unbound reason",
			"B-013/B-016/Design delegation through Verifier",
		]) {
			const result = checkBehaviorConformance({
				planSlug: "supersession-pointer",
				planMarkdown: supersessionPlan(pointer),
			});
			expect(
				result.issues.filter((issue) => issue.kind === "undated-supersession"),
				pointer,
			).toEqual([]);
		}
	});

	test("only exact dated decision-pointer withdrawals bypass active behavior checks", () => {
		const valid = checkBehaviorConformance({
			planSlug: "withdrawal-grammar",
			planMarkdown: withdrawalPlan("*(withdrawn by D-001, 2026-07-28)*"),
		});
		expect(valid.withdrawn).toBe(1);
		expect(valid.behaviors[0]).toMatchObject({ withdrawn: true, issues: [] });

		for (const annotation of [
			"*(withdrawn by D-001)*",
			"*(withdrawn pending D-001, 2026-07-28)*",
		]) {
			const result = checkBehaviorConformance({
				planSlug: "withdrawal-grammar",
				planMarkdown: withdrawalPlan(annotation),
			});
			const evidence = result.behaviors[0];
			expect(evidence?.withdrawn, annotation).toBe(false);
			expect(
				evidence?.issues.map((issue) => issue.field),
				annotation,
			).toEqual(
				expect.arrayContaining([
					"source",
					"context",
					"action",
					"expected",
					"seam",
					"test",
					"marker",
				]),
			);
		}
	});

	test("bounds wildcard pairing while exact references remain indexed", async () => {
		const projectRoot = await createTempDir("behavior-conformance-bounded-");
		await mkdir(join(projectRoot, "tests"), { recursive: true });
		const behaviorCount = 80;
		await writeFile(
			join(projectRoot, "tests", "bounded.test.ts"),
			Array.from(
				{ length: behaviorCount },
				(_, index) =>
					`// @cosmo-behavior plan:bounded-pairing#B-${String(index + 1).padStart(3, "0")}`,
			).join("\n"),
			"utf-8",
		);
		const behaviors = Array.from({ length: behaviorCount }, (_, index) => {
			const behaviorId = `B-${String(index + 1).padStart(3, "0")}`;
			return `### ${behaviorId} - Bounded wildcard pairing

- Source: AC-001
- Context: many behavior references share a wildcard seam
- Action: the checker pairs changed files without an unbounded Cartesian scan
- Expected: wildcard work fails closed at its bound while exact tests stay paired
- Seam: \`lib/*/target-${index}.ts\`
- Test: \`tests/bounded.test.ts\` > \`bounded wildcard pairing\`
- Marker: \`@cosmo-behavior plan:bounded-pairing#${behaviorId}\``;
		}).join("\n\n");
		const changedPaths = [
			...Array.from(
				{ length: behaviorCount },
				(_, index) => `- \`lib/decoy-${index}.ts\``,
			),
			...Array.from(
				{ length: behaviorCount },
				(_, index) => `- \`lib/deep/target-${index}.ts\``,
			),
			"- `tests/bounded.test.ts`",
		].join("\n");

		const result = checkBehaviorConformance({
			planSlug: "bounded-pairing",
			projectRoot,
			planMarkdown: `## Behaviors\n\n${behaviors}\n\n## Files to Change\n\n${changedPaths}\n`,
		});
		const pairingIssues = result.issues.filter(
			(issue) => issue.kind === "unpaired-behavior-file",
		);
		expect(pairingIssues.length).toBeGreaterThan(0);
		expect(pairingIssues.every((issue) => issue.field === "seam")).toBe(true);
	});

	test("pairs repeated wildcard seams without backtracking and rejects a long nonmatch", async () => {
		const projectRoot = await createTempDir("behavior-conformance-wildcard-");
		await mkdir(join(projectRoot, "tests"), { recursive: true });
		await writeFile(
			join(projectRoot, "tests", "wildcard.test.ts"),
			"@cosmo-behavior plan:wildcard-pairing#B-001\n",
			"utf-8",
		);
		const behavior = behaviorMarkdownFor({
			behaviorId: "B-001",
			source: "AC-001",
			testReference: "`tests/wildcard.test.ts` > `wildcard pairing`",
			marker: "@cosmo-behavior plan:wildcard-pairing#B-001",
		}).replace(
			"`lib/artifacts/behavior-conformance.ts`",
			"lib/**/generated-**.ts",
		);

		const paired = checkBehaviorConformance({
			planSlug: "wildcard-pairing",
			projectRoot,
			planMarkdown: `${behavior}\n## Files to Change\n\n- \`lib/a/b/generated-output.ts\`\n- \`tests/wildcard.test.ts\`\n`,
		});
		expect(paired.issues).toEqual([]);

		const longNonmatch = checkBehaviorConformance({
			planSlug: "wildcard-pairing",
			projectRoot,
			planMarkdown: `${behavior}\n## Files to Change\n\n- \`lib/${"a".repeat(20_000)}.js\`\n- \`tests/wildcard.test.ts\`\n`,
		});
		expect(longNonmatch.issues).toContainEqual(
			expect.objectContaining({
				kind: "unpaired-behavior-file",
				field: "seam",
				path: "lib/**/generated-**.ts",
			}),
		);
	});

	test("pairs unquoted file seams and ignores non-file seam names", async () => {
		const projectRoot = await createTempDir("behavior-conformance-seams-");
		await mkdir(join(projectRoot, "tests"), { recursive: true });
		await writeFile(
			join(projectRoot, "tests", "seam.test.ts"),
			"@cosmo-behavior plan:unquoted-seam#B-001\n",
			"utf-8",
		);
		const behavior = behaviorMarkdownFor({
			behaviorId: "B-001",
			source: "AC-001",
			testReference: "tests/seam.test.ts > `unquoted seam`",
			marker: "@cosmo-behavior plan:unquoted-seam#B-001",
		}).replace(
			"`lib/artifacts/behavior-conformance.ts`",
			"lib/unquoted.ts validateConformance",
		);
		const result = checkBehaviorConformance({
			planSlug: "unquoted-seam",
			projectRoot,
			planMarkdown: `${behavior}\n## Files to Change\n\n- lib/unquoted.ts\n\`\`\`md\n## Risks\n\`\`\`\n- tests/seam.test.ts\n\n## Real next section\n`,
		});

		expect(result.issues).toEqual([]);
	});

	test("reports the Test pairing evidence when the Seam alone is paired", async () => {
		const projectRoot = await createTempDir("behavior-conformance-test-pair-");
		await mkdir(join(projectRoot, "tests"), { recursive: true });
		await writeFile(
			join(projectRoot, "tests", "missing-pair.test.ts"),
			"@cosmo-behavior plan:test-pairing#B-006\n",
			"utf-8",
		);
		const result = checkBehaviorConformance({
			planSlug: "test-pairing",
			projectRoot,
			planMarkdown: `${behaviorMarkdownFor({
				behaviorId: "B-006",
				source: "AC-006",
				testReference: "`tests/missing-pair.test.ts` > `missing test pair`",
				marker: "@cosmo-behavior plan:test-pairing#B-006",
			})}\n## Files to Change\n\n- \`lib/artifacts/behavior-conformance.ts\`\n`,
		});

		expect(result.issues).toEqual([
			expect.objectContaining({
				kind: "unpaired-behavior-file",
				field: "test",
				behaviorId: "B-006",
				path: "tests/missing-pair.test.ts",
			}),
		]);
	});

	// @cosmo-behavior plan:planning-system-hardening#B-012
	test("checks pairing, marker uniqueness, withdrawn behaviors, and size advisory", async () => {
		const projectRoot = await createTempDir("behavior-conformance-extended-");
		await mkdir(join(projectRoot, "tests"), { recursive: true });
		await writeFile(
			join(projectRoot, "tests", "evidence.test.ts"),
			Array.from(
				{ length: 12 },
				(_, index) =>
					`// @cosmo-behavior plan:pairing-check#B-${String(index + 1).padStart(3, "0")}`,
			).join("\n"),
			"utf-8",
		);

		const activeBehaviors = Array.from({ length: 12 }, (_, index) => {
			const number = String(index + 1).padStart(3, "0");
			const behaviorId = `B-${number}`;
			const seam =
				behaviorId === "B-012" ? "lib/unpaired.ts" : "lib/evidence.ts";
			const markerId = behaviorId === "B-002" ? "B-001" : behaviorId;
			return `### ${behaviorId} - Extended check ${number}

- Source: AC-010
- Context: an active behavior has conformance evidence
- Action: the extended checker validates it
- Expected: blocking and advisory evidence stays distinct
- Seam: \`${seam}\`
- Test: \`tests/evidence.test.ts\` > \`extended check ${number}\`
- Marker: \`@cosmo-behavior plan:pairing-check#${markerId}\``;
		}).join("\n\n");

		const result = checkBehaviorConformance({
			planSlug: "pairing-check",
			projectRoot,
			planMarkdown: `# Pairing check

## Decision Log

- **D-001 - Withdraw removed behavior**
  - Decision: retain the removed behavior as dated evidence
  - Decided by: planner-proposed, 2026-07-28

## Behaviors

${activeBehaviors}

### B-013 - Removed behavior *(withdrawn by D-001, 2026-07-28 — no test ships)*

## Files to Change

- \`lib/evidence.ts\`
- \`tests/evidence.test.ts\`
`,
		});

		expect(result.ok).toBe(false);
		expect(result.withdrawn).toBe(1);
		expect(
			result.behaviors.find((behavior) => behavior.behaviorId === "B-013"),
		).toMatchObject({
			withdrawn: true,
			issues: [],
		});
		expect(result.issues.map((issue) => issue.kind).sort()).toEqual([
			"duplicate-marker",
			"invalid-marker",
			"unpaired-behavior-file",
		]);
		expect(result.advisories).toEqual([
			{
				kind: "behavior-count-guidance",
				message:
					"Plan has 13 behaviors, exceeding the guidance of 12; consider splitting it along a real boundary.",
				count: 13,
				guidance: 12,
			},
		]);

		const advisoryOnly = checkBehaviorConformance({
			planSlug: "pairing-check",
			projectRoot,
			planMarkdown: `# Pairing check

## Decision Log

- **D-001 - Withdraw removed behavior**
  - Decision: retain the removed behavior as dated evidence
  - Decided by: planner-proposed, 2026-07-28

## Behaviors

${activeBehaviors
	.replace(
		"- Test: `tests/evidence.test.ts` > `extended check 002`\n- Marker: `@cosmo-behavior plan:pairing-check#B-001`",
		"- Test: `tests/evidence.test.ts` > `extended check 002`\n- Marker: `@cosmo-behavior plan:pairing-check#B-002`",
	)
	.replace("lib/unpaired.ts", "lib/evidence.ts")}

### B-013 - Removed behavior *(withdrawn by D-001, 2026-07-28 — no test ships)*

## Files to Change

- \`lib/evidence.ts\`
- \`tests/evidence.test.ts\`
`,
		});
		expect(advisoryOnly.ok).toBe(true);
		expect(advisoryOnly.issues).toEqual([]);
		expect(advisoryOnly.advisories).toHaveLength(1);
	});

	// @cosmo-behavior plan:planning-system-hardening#B-013
	test("keeps the analysis-capabilities artifacts passing under extended checks", async () => {
		// The parent plan was split into three delivery slices (its own D-024), so
		// the artifacts this guards now live in three plans. Their withdrawn
		// entries still total the parent's two: B-032 in the runtime slice and
		// B-020 in the investigation slice.
		//
		// Slices archive one at a time as they ship, so each is resolved from
		// missions/plans/ or missions/archive/plans/. Following the family across
		// both locations keeps the guard whole instead of breaking at every
		// archive and shrinking the withdrawn total.
		const planSlugs = [
			"analysis-capability-runtime",
			"analysis-gate-rewiring",
			"analysis-investigation-procedures",
		];
		const extendedBlockingKinds = new Set([
			"unresolved-decision-citation",
			"undated-supersession",
			"unpaired-behavior-file",
			"duplicate-marker",
		]);

		let withdrawn = 0;
		for (const planSlug of planSlugs) {
			const candidates = [
				join("missions", "plans", planSlug, "plan.md"),
				join("missions", "archive", "plans", planSlug, "plan.md"),
			];
			let planPath: string | undefined;
			let planMarkdown: string | undefined;
			for (const candidate of candidates) {
				try {
					planMarkdown = await readFile(
						join(process.cwd(), candidate),
						"utf-8",
					);
					planPath = candidate;
					break;
				} catch {
					// Try the next lifecycle location.
				}
			}
			if (planPath === undefined || planMarkdown === undefined) {
				throw new Error(
					`Plan ${planSlug} was found in neither missions/plans/ nor missions/archive/plans/.`,
				);
			}
			const result = checkBehaviorConformance({
				planSlug,
				planPath,
				projectRoot: process.cwd(),
				planMarkdown,
			});

			expect(
				result.issues.filter((issue) => extendedBlockingKinds.has(issue.kind)),
			).toEqual([]);
			withdrawn += result.withdrawn;
		}

		expect(withdrawn).toBe(2);
	});

	async function createTempDir(prefix: string): Promise<string> {
		const path = await mkdtemp(join(tmpdir(), prefix));
		tempDirs.push(path);
		return path;
	}
});

function behaviorMarkdown(testReference: string): string {
	return `# Artifact Conformance Gate

## Behaviors

### B-005 - Validates behavior test references

- Source: AC-005
- Context: a behavior test reference can point at unsafe paths
- Action: the checker validates the behavior Test field path
- Expected: it returns actionable invalid test-reference evidence before reading files
- Seam: \`lib/artifacts/behavior-conformance.ts\`
- Test: ${testReference}
- Marker: \`@cosmo-behavior plan:artifact-conformance-gate#B-005\`
`;
}

function supersessionPlan(pointer: string): string {
	return `## Decision Log

- **D-001 - Original one**
  - Decision: preserve the first ground
  - Decided by: user-directed, 2026-07-26

- **D-002 - Original two**
  - Decision: preserve the second ground
  - Decided by: user-directed, 2026-07-27

- **D-003 - Amendment**
  - Decision: replace the exact named ground
  - Decided by: planner-proposed, amend-on-record, 2026-07-28
  - Supersedes: ${pointer}

## Behaviors
### B-001 - Withdrawn evidence *(withdrawn by D-003, 2026-07-28)*
`;
}

function withdrawalPlan(annotation: string): string {
	return `## Decision Log

- **D-001 - Withdrawal decision**
  - Decision: withdraw obsolete evidence
  - Decided by: planner-proposed, 2026-07-28

## Behaviors
### B-001 - Obsolete evidence ${annotation}
`;
}

function behaviorMarkdownFor({
	behaviorId,
	source,
	testReference,
	marker,
}: {
	behaviorId: string;
	source: string;
	testReference: string;
	marker: string;
}): string {
	return `# Artifact Conformance Gate

## Behaviors

### ${behaviorId} - Validates behavior test evidence

- Source: ${source}
- Context: a behavior references filesystem evidence
- Action: the checker validates the Test file and marker text
- Expected: it returns structured conformance evidence
- Seam: \`lib/artifacts/behavior-conformance.ts\`
- Test: ${testReference}
- Marker: \`${marker}\`
`;
}
