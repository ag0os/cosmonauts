// @vitest-environment jsdom
/**
 * Parses renderChangeDiagram output with the real Mermaid parser, so the
 * diagrams are checked as Mermaid itself reads them rather than by shape.
 * Mermaid needs a DOM in Node; the jsdom environment above provides it.
 */

import mermaid from "mermaid";
import { beforeAll, describe, expect, test } from "vitest";
import {
	type ChangeDiagramOptions,
	renderChangeDiagram,
} from "../../../lib/lean-run/graph/mermaid.ts";

const SAMPLE: ChangeDiagramOptions = {
	planned: ["lib/a.ts", "lib/new.ts"],
	unplanned: ["lib/extra-file.ts"],
	untouched: ["lib/later.ts"],
	impacted: ["lib/b.ts"],
	tests: ["tests/a.test.ts"],
	classes: { "lib/new.ts": "added" },
	edges: [
		{ from: "tests/a.test.ts", to: "lib/a.ts" },
		{ from: "lib/b.ts", to: "lib/a.ts" },
	],
};

const PLAN_DIAGRAM = [
	"```mermaid",
	"flowchart TD",
	'  A[lib/a.ts] --> B["lib/new.ts"]',
	"  B --> R[lib/gone.ts]",
	"  B --> L[lib/later.ts]",
	"  classDef added fill:#000",
	"```",
].join("\n");

const LABEL_CASE: ChangeDiagramOptions = {
	planned: ["lib/a.ts"],
	unplanned: [],
	untouched: [],
	impacted: [],
	tests: [],
};

const DIAGRAMS: readonly (readonly [name: string, text: string])[] = [
	["the synthesized diagram", renderChangeDiagram(SAMPLE)],
	[
		"a restyled plan diagram",
		renderChangeDiagram({
			...SAMPLE,
			planned: [...SAMPLE.planned, "lib/gone.ts"],
			classes: { "lib/new.ts": "added", "lib/gone.ts": "removed" },
			planDiagram: PLAN_DIAGRAM,
		}),
	],
	[
		"a restyled plan diagram with YAML front matter",
		renderChangeDiagram({
			...LABEL_CASE,
			planDiagram: "---\ntitle: P\n---\nflowchart TD\n  A[lib/a.ts]",
		}),
	],
	[
		"a restyled plan diagram with an annotated label",
		renderChangeDiagram({
			...LABEL_CASE,
			planDiagram: 'flowchart TD\n  A["lib/a.ts (the parser)"] --> B[lib/b.ts]',
		}),
	],
];

beforeAll(() => {
	mermaid.initialize({ startOnLoad: false });
});

describe("renderChangeDiagram output under the real Mermaid parser", () => {
	test.each(DIAGRAMS)("parses %s", async (_, text) => {
		await expect(mermaid.parse(text)).resolves.toMatchObject({
			diagramType: expect.stringMatching(/^flowchart/),
		});
	});

	test("rejects a broken diagram", async () => {
		await expect(
			mermaid.parse('graph LR\n  a["x" --> b\n  end'),
		).rejects.toThrow(/Parse error/);
	});
});
