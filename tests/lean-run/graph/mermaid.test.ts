/**
 * Tests for renderChangeDiagram.
 * Covers the synthesized diagram, restyling a plan diagram (annotated and
 * markdown labels, comments, front matter), id safety, determinism, and the
 * emitted shape. tests/helpers/mermaid-shape.ts checks shape only;
 * mermaid-parse.test.ts parses the same label cases with the real parser.
 */

import { describe, expect, test } from "vitest";
import {
	type ChangeDiagramOptions,
	renderChangeDiagram,
} from "../../../lib/lean-run/graph/mermaid.ts";
import { mermaidShapeErrors } from "../../helpers/mermaid-shape.ts";
import {
	labelCaseOptions,
	RESTYLED_LABEL_CASES,
	WORD_LABEL_CASE,
} from "./mermaid-label-cases.ts";

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
		{ from: "lib/outside.ts", to: "lib/a.ts" },
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

describe("renderChangeDiagram without a plan diagram", () => {
	test("synthesizes subgraphs, edges and change classes from the file sets", () => {
		expect(renderChangeDiagram(SAMPLE)).toBe(
			[
				"graph LR",
				'  subgraph sg_changed["Changed"]',
				'    f_lib_a_ts["lib/a.ts"]',
				'    f_lib_extra_file_ts["lib/extra-file.ts (unplanned)"]',
				'    f_lib_new_ts["lib/new.ts"]',
				"  end",
				'  subgraph sg_impacted["Impacted"]',
				'    f_lib_b_ts["lib/b.ts"]',
				"  end",
				'  subgraph sg_tests["Tests"]',
				'    f_tests_a_test_ts["tests/a.test.ts"]',
				"  end",
				'  subgraph sg_untouched["Planned, not touched"]',
				'    f_lib_later_ts["lib/later.ts"]',
				"  end",
				"  f_lib_b_ts --> f_lib_a_ts",
				"  f_tests_a_test_ts --> f_lib_a_ts",
				"  classDef added fill:#dafbe1,stroke:#1a7f37,color:#1f2328",
				"  classDef modified fill:#fff8c5,stroke:#9a6700,color:#1f2328",
				"  classDef removed fill:#ffebe9,stroke:#cf222e,color:#1f2328,stroke-dasharray:4 3",
				"  classDef impacted fill:#ddf4ff,stroke:#0969da,color:#1f2328",
				"  class f_lib_new_ts added",
				"  class f_lib_a_ts,f_lib_extra_file_ts modified",
				"  class f_lib_b_ts,f_tests_a_test_ts impacted",
			].join("\n"),
		);
	});

	test("renders identically twice and regardless of input order", () => {
		const reordered: ChangeDiagramOptions = {
			...SAMPLE,
			planned: [...SAMPLE.planned].reverse(),
			edges: [...(SAMPLE.edges ?? [])].reverse(),
		};
		expect(renderChangeDiagram(SAMPLE)).toBe(renderChangeDiagram(SAMPLE));
		expect(renderChangeDiagram(reordered)).toBe(renderChangeDiagram(SAMPLE));
	});

	test("has the emitted Mermaid shape", () => {
		expect(mermaidShapeErrors(renderChangeDiagram(SAMPLE))).toEqual([]);
	});

	test("gives colliding sanitized paths distinct ids", () => {
		const diagram = renderChangeDiagram({
			planned: ["lib/a-b.ts", "lib/a_b.ts"],
			unplanned: [],
			untouched: [],
			impacted: [],
			tests: [],
		});
		expect(diagram).toContain('f_lib_a_b_ts["lib/a-b.ts"]');
		expect(diagram).toContain('f_lib_a_b_ts_2["lib/a_b.ts"]');
		expect(mermaidShapeErrors(diagram)).toEqual([]);
	});

	test("escapes double quotes in labels", () => {
		const diagram = renderChangeDiagram({
			planned: ['lib/"odd".ts'],
			unplanned: [],
			untouched: [],
			impacted: [],
			tests: [],
		});
		expect(diagram).toContain('["lib/#quot;odd#quot;.ts"]');
		expect(mermaidShapeErrors(diagram)).toEqual([]);
	});

	test("classes a removed file as removed", () => {
		const diagram = renderChangeDiagram({
			planned: ["lib/gone.ts"],
			unplanned: [],
			untouched: [],
			impacted: [],
			tests: [],
			classes: { "lib/gone.ts": "removed" },
		});
		expect(diagram).toContain("  class f_lib_gone_ts removed");
	});
});

const LABEL_CASE: ChangeDiagramOptions = {
	planned: ["lib/a.ts"],
	unplanned: [],
	untouched: [],
	impacted: [],
	tests: [],
};

describe("renderChangeDiagram with a plan diagram", () => {
	const withPlan: ChangeDiagramOptions = {
		...SAMPLE,
		planned: [...SAMPLE.planned, "lib/gone.ts"],
		classes: { "lib/new.ts": "added", "lib/gone.ts": "removed" },
		planDiagram: PLAN_DIAGRAM,
	};

	test("keeps the plan's nodes and edges, restyles them, and appends files it does not name", () => {
		expect(renderChangeDiagram(withPlan)).toBe(
			[
				"flowchart TD",
				'  A[lib/a.ts] --> B["lib/new.ts"]',
				"  B --> R[lib/gone.ts]",
				"  B --> L[lib/later.ts]",
				'  subgraph sg_changed["Changed, not in plan diagram"]',
				'    f_lib_extra_file_ts["lib/extra-file.ts (unplanned)"]',
				"  end",
				'  subgraph sg_impacted["Impacted"]',
				'    f_lib_b_ts["lib/b.ts"]',
				"  end",
				'  subgraph sg_tests["Tests"]',
				'    f_tests_a_test_ts["tests/a.test.ts"]',
				"  end",
				"  classDef added fill:#dafbe1,stroke:#1a7f37,color:#1f2328",
				"  classDef modified fill:#fff8c5,stroke:#9a6700,color:#1f2328",
				"  classDef removed fill:#ffebe9,stroke:#cf222e,color:#1f2328,stroke-dasharray:4 3",
				"  classDef impacted fill:#ddf4ff,stroke:#0969da,color:#1f2328",
				"  class B added",
				"  class A,f_lib_extra_file_ts modified",
				"  class R removed",
				"  class f_lib_b_ts,f_tests_a_test_ts impacted",
			].join("\n"),
		);
	});

	test("keeps the emitted Mermaid shape when restyling", () => {
		expect(mermaidShapeErrors(renderChangeDiagram(withPlan))).toEqual([]);
	});

	test("renders a restyled plan identically twice", () => {
		expect(renderChangeDiagram(withPlan)).toBe(renderChangeDiagram(withPlan));
	});

	test("classes a module node by the files beneath it, modified when mixed", () => {
		const diagram = renderChangeDiagram({
			planned: ["lib/mod/new.ts", "lib/mod/old.ts"],
			unplanned: [],
			untouched: [],
			impacted: ["lib/dep/user.ts"],
			tests: [],
			classes: { "lib/mod/new.ts": "added" },
			planDiagram: "graph LR\n  M[lib/mod] --> D[lib/dep]",
		});
		expect(diagram).toContain("  class M modified");
		expect(diagram).toContain("  class D impacted");
		expect(diagram).not.toContain("subgraph");
	});

	test.each(
		RESTYLED_LABEL_CASES,
	)("restyles a node with $name and does not append its file again", (labelCase) => {
		const diagram = renderChangeDiagram(labelCaseOptions(labelCase));
		expect(diagram).toContain("  class A modified");
		expect(diagram).not.toContain("Changed, not in plan diagram");
	});

	test("does not take a word in an annotated label as a path", () => {
		const diagram = renderChangeDiagram(labelCaseOptions(WORD_LABEL_CASE));
		expect(diagram).not.toContain("class A");
		expect(diagram).toContain('f_parser["parser"]');
	});

	test("ignores node declarations in %% comment lines", () => {
		const diagram = renderChangeDiagram({
			...LABEL_CASE,
			planDiagram: "flowchart TD\n  %% A[lib/ghost.ts]\n  A[lib/a.ts]",
		});
		expect(diagram).toContain("  %% A[lib/ghost.ts]");
		expect(diagram).toContain("  class A modified");
		expect(diagram).not.toContain("f_lib_a_ts");
	});

	test("keeps a plan diagram with YAML front matter and its front matter", () => {
		const diagram = renderChangeDiagram({
			...LABEL_CASE,
			planDiagram: "---\ntitle: P\n---\nflowchart TD\n  A[lib/a.ts]",
		});
		expect(diagram.split("\n").slice(0, 5)).toEqual([
			"---",
			"title: P",
			"---",
			"flowchart TD",
			"  A[lib/a.ts]",
		]);
		expect(diagram).toContain("  class A modified");
	});

	test("falls back to synthesis when the plan diagram is not a flowchart", () => {
		const diagram = renderChangeDiagram({
			...SAMPLE,
			planDiagram: "sequenceDiagram\n  A->>B: hi",
		});
		expect(diagram).toBe(renderChangeDiagram(SAMPLE));
	});
});

describe("mermaidShapeErrors", () => {
	test("rejects an unclosed subgraph", () => {
		expect(
			mermaidShapeErrors('graph LR\n  subgraph s["S"]\n    a["a"]'),
		).toEqual(["unclosed subgraphs: 1"]);
	});

	test("rejects a class target that was never declared", () => {
		expect(
			mermaidShapeErrors(
				'graph LR\n  a["a"]\n  classDef x fill:#fff\n  class a,b x',
			),
		).toEqual(["line 4: undeclared b"]);
	});

	test("rejects a class with no classDef", () => {
		expect(mermaidShapeErrors('graph LR\n  a["a"]\n  class a x')).toEqual([
			"line 3: class x has no classDef",
		]);
	});

	test("rejects an id with characters Mermaid does not accept bare", () => {
		expect(mermaidShapeErrors('graph LR\n  lib/a.ts["a"]')).toEqual([
			'line 2: unrecognized statement: lib/a.ts["a"]',
		]);
	});
});
