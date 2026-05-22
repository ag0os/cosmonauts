import { describe, expect, test } from "vitest";
import {
	checkBehaviorConformance,
	parseBehaviorSection,
} from "../../lib/artifacts/index.ts";

describe("behavior conformance", () => {
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
});
