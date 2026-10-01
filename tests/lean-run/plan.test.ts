/**
 * Tests for parsePlan: the plan.md contract read by its headings.
 */
import { describe, expect, test } from "vitest";
import { parsePlan, requestPaths } from "../../lib/lean-run/plan.ts";

const FULL_PLAN = `# Add retry to the fetcher

## Approach
Wrap the fetch call in a bounded retry
and surface the last error.

## Touches
- \`lib/fetch/client.ts\` — add the retry loop
- lib/fetch/errors.ts: new error type
- \`tests/fetch/client.test.ts\`

## Reuses
- \`withBackoff\` from \`lib/util/backoff.ts\`
- See also \`lib/util/clock.ts\` for the fake clock.

## Behaviors
- B-1: a caller of fetchJson / fetchJson("x") on a flaky server / returns the body after two failures
- **B-2**: the CLI user / \`cosmonauts fetch\` / sees one error line after three failures

## Risks
- Retries could hide a permanent failure.
- Slower tests.

## Diagram
\`\`\`mermaid
graph LR
  client --> backoff
\`\`\`
`;

describe("parsePlan on the full template", () => {
	const plan = parsePlan(FULL_PLAN);

	test("reads the title from the first-level heading", () => {
		expect(plan.title).toBe("Add retry to the fetcher");
	});

	test("keeps the approach paragraph", () => {
		expect(plan.approach).toBe(
			"Wrap the fetch call in a bounded retry\nand surface the last error.",
		);
	});

	test("reads touched paths from backticks or the bullet's first word", () => {
		expect(plan.touches).toEqual([
			"lib/fetch/client.ts",
			"lib/fetch/errors.ts",
			"tests/fetch/client.test.ts",
		]);
	});

	test("reads reused paths and skips backticked names that are not paths", () => {
		expect(plan.reuses).toEqual(["lib/util/backoff.ts", "lib/util/clock.ts"]);
	});

	test("splits behaviors into observer, entry point and outcome", () => {
		expect(plan.behaviors).toEqual([
			{
				id: "B-1",
				observer: "a caller of fetchJson",
				entryPoint: 'fetchJson("x") on a flaky server',
				outcome: "returns the body after two failures",
			},
			{
				id: "B-2",
				observer: "the CLI user",
				entryPoint: "`cosmonauts fetch`",
				outcome: "sees one error line after three failures",
			},
		]);
	});

	test("lists risks from bullets", () => {
		expect(plan.risks).toEqual([
			"Retries could hide a permanent failure.",
			"Slower tests.",
		]);
	});

	test("returns the mermaid block without its fences", () => {
		expect(plan.diagram).toBe("graph LR\n  client --> backoff");
	});

	test("keeps the raw markdown", () => {
		expect(plan.raw).toBe(FULL_PLAN);
	});
});

describe("parsePlan on a partial plan", () => {
	const plan = parsePlan(
		"# Fix typo\n\n## Approach\nOne word.\n\n## Risks\nNone worth naming.\n",
	);

	test("leaves missing list sections empty", () => {
		expect(plan).toMatchObject({
			touches: [],
			reuses: [],
			behaviors: [],
		});
	});

	test("omits the diagram when there is none", () => {
		expect(plan).not.toHaveProperty("diagram");
	});

	test("falls back to plain lines when risks have no bullets", () => {
		expect(plan.risks).toEqual(["None worth naming."]);
	});

	test("returns an empty title when the plan has no first-level heading", () => {
		expect(parsePlan("## Approach\nx\n").title).toBe("");
	});
});

describe("parsePlan heading handling", () => {
	test("ignores headings inside fenced blocks", () => {
		const plan = parsePlan(
			"# T\n## Approach\n```md\n## Touches\n- lib/fake.ts\n```\n",
		);
		expect(plan.touches).toEqual([]);
		expect(plan.approach).toContain("## Touches");
	});

	test("matches template headings that keep their description", () => {
		const plan = parsePlan("# T\n## Touches — modules to change\n- lib/a.ts\n");
		expect(plan.touches).toEqual(["lib/a.ts"]);
	});

	test("skips sections it does not know", () => {
		const plan = parsePlan(
			"# T\n## Notes\n- lib/a.ts\n## Touches\n- lib/b.ts\n",
		);
		expect(plan.touches).toEqual(["lib/b.ts"]);
	});

	test("accepts a behavior with fewer than three parts", () => {
		expect(
			parsePlan("## Behaviors\nB-1: only an observer\n").behaviors,
		).toEqual([
			{ id: "B-1", observer: "only an observer", entryPoint: "", outcome: "" },
		]);
	});

	test("reads an unclosed mermaid block to the end of the section", () => {
		expect(parsePlan("## Diagram\n```mermaid\ngraph TD\n").diagram).toBe(
			"graph TD",
		);
	});
});

describe("requestPaths", () => {
	test("reads backticked paths by the plan's rule", () => {
		expect(
			requestPaths(
				"Fix `linkDependencies` in `lib/code-health/changed-functions.ts` and `README.md`.",
			),
		).toEqual(["lib/code-health/changed-functions.ts", "README.md"]);
	});

	test("reads a bare path with a directory and an extension, without its punctuation", () => {
		expect(
			requestPaths("Update lib/x.ts, then (tests/x.test.ts). Keep it small."),
		).toEqual(["lib/x.ts", "tests/x.test.ts"]);
	});

	test("ignores prose that only looks path-like", () => {
		expect(
			requestPaths("Use one and/or the other, e.g. a 1.5 s delay."),
		).toEqual([]);
	});
});
