/**
 * Tests for renderPrBody.
 * A golden body for a full input, plus the empty-section fallbacks and cell
 * escaping.
 */

import { describe, expect, test } from "vitest";
import type { BlastRadius } from "../../../lib/lean-run/graph/blast-radius.ts";
import {
	type PrBodyOptions,
	renderPrBody,
} from "../../../lib/lean-run/graph/pr-body.ts";

const RADIUS: BlastRadius = {
	changed: ["lib/a.ts"],
	dependents: ["lib/b.ts"],
	tests: ["tests/a.test.ts", "tests/b.test.ts"],
	hubs: ["lib/types.ts"],
	truncated: true,
};

const FULL: PrBodyOptions = {
	title: "Add the blast radius",
	diagram: 'graph LR\n  f_lib_a_ts["lib/a.ts"]\n',
	verification: [
		{
			kind: "verify",
			status: "pass",
			summary: "tests, lint, typecheck",
			data: null,
			reenter: false,
		},
		{
			kind: "mutation",
			status: "fail",
			summary: "2 survivors | in walk()",
			data: null,
			reenter: true,
		},
	],
	blastRadius: RADIUS,
	planVersusActual: {
		planned: ["lib/a.ts"],
		unplanned: ["lib/extra.ts"],
		untouched: [],
	},
	findings: [
		{
			id: "F-1",
			severity: "medium",
			file: "lib/a.ts:12",
			summary: "Cap is\nnot asserted",
			fix: "Add a test",
			disposition: "fixed",
		},
		{
			id: "F-2",
			severity: "low",
			file: "lib/b.ts:3",
			summary: "Naming",
			fix: "Rename",
			disposition: "accepted",
		},
	],
};

describe("renderPrBody", () => {
	test("renders the golden body for a full input", () => {
		expect(renderPrBody(FULL)).toBe(`# Add the blast radius

## Change diagram
\`\`\`mermaid
graph LR
  f_lib_a_ts["lib/a.ts"]
\`\`\`

## Verification

| Kind | Status | Summary |
| --- | --- | --- |
| verify | pass | tests, lint, typecheck |
| mutation | fail | 2 survivors \\| in walk() |

## Blast radius

1 changed, 1 dependents, 2 tests.

Truncated. Hubs not expanded transitively: \`lib/types.ts\`.

Tests:

- \`tests/a.test.ts\`
- \`tests/b.test.ts\`

## Plan versus actual

**Planned** (1)

- \`lib/a.ts\`

**Unplanned** (1)

- \`lib/extra.ts\`

**Untouched** (0)

- none

## Findings

| ID | Severity | Disposition | File | Summary |
| --- | --- | --- | --- | --- |
| F-1 | medium | fixed | \`lib/a.ts:12\` | Cap is not asserted |
| F-2 | low | accepted | \`lib/b.ts:3\` | Naming |
`);
	});

	test("says so when there are no signals or findings", () => {
		const body = renderPrBody({ ...FULL, verification: [], findings: [] });
		expect(body).toContain("## Verification\n\nNo verification signals.");
		expect(body).toContain("## Findings\n\nNo findings.\n");
	});

	test("says there was no plan instead of listing three empty sets", () => {
		const body = renderPrBody({
			...FULL,
			noPlan: "No plan (direct tier).",
		});
		expect(body).toContain(
			"## Plan versus actual\n\nNo plan (direct tier).\n\n## Findings",
		);
		expect(body).not.toContain("**Planned**");
	});

	test("omits the truncation line when the walk was complete", () => {
		const body = renderPrBody({
			...FULL,
			blastRadius: { ...RADIUS, hubs: [], truncated: false },
		});
		expect(body).not.toContain("Truncated.");
	});

	test("says the blast radius did not run when there is none", () => {
		const { blastRadius: _, ...withoutRadius } = FULL;
		const body = renderPrBody(withoutRadius);
		expect(body).toContain(
			"## Blast radius\n\nThe blast-radius signal did not run for this change.\n\n## Plan versus actual",
		);
	});
});
