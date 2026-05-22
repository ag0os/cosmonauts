import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
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
			"// valid test file\n",
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
