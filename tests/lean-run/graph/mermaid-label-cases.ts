/**
 * Plan-diagram label cases shared by mermaid.test.ts, which checks how they
 * restyle, and mermaid-parse.test.ts, which parses each rendered diagram with
 * the real Mermaid parser.
 */

import type { ChangeDiagramOptions } from "../../../lib/lean-run/graph/mermaid.ts";

export interface LabelCase {
	readonly name: string;
	/** Node `A`, as written in the plan diagram. */
	readonly node: string;
	/** The one planned file. */
	readonly file: string;
}

/** Labels that name their planned file, so node `A` is restyled. */
export const RESTYLED_LABEL_CASES: readonly LabelCase[] = [
	{
		name: "an annotated label",
		node: 'A["lib/a.ts (the parser)"]',
		file: "lib/a.ts",
	},
	{
		name: "an unquoted annotated label",
		node: "A[lib/a.ts the parser]",
		file: "lib/a.ts",
	},
	{ name: "a markdown label", node: 'A["`**lib/a.ts**`"]', file: "lib/a.ts" },
	{
		name: "a label with a line break",
		node: 'A["Parser<br/>lib/a.ts"]',
		file: "lib/a.ts",
	},
	{
		name: "a markdown label in another shape",
		node: 'A(["`lib/a.ts: parser`"])',
		file: "lib/a.ts",
	},
	{
		name: "a directory with a trailing slash",
		node: 'A["lib/ everything"]',
		file: "lib/a.ts",
	},
	{
		name: "a Windows-style path",
		node: 'A["lib\\mod the module"]',
		file: "lib/mod/a.ts",
	},
];

/** A label whose word beside the path must not be taken as a path. */
export const WORD_LABEL_CASE: LabelCase = {
	name: "an annotated label beside a planned word",
	node: 'A["lib/a.ts parser"]',
	file: "parser",
};

export function labelCaseOptions(labelCase: LabelCase): ChangeDiagramOptions {
	return {
		planned: [labelCase.file],
		unplanned: [],
		untouched: [],
		impacted: [],
		tests: [],
		planDiagram: `flowchart TD\n  ${labelCase.node} --> B[lib/b.ts]`,
	};
}
