import { describe, expect, test } from "vitest";
import {
	checkSuppressions,
	scanSuppressions,
} from "../../lib/quality/suppression-policy.ts";

describe("suppression policy", () => {
	// @cosmo-behavior plan:qm-chain-safety#B-008
	test("rejects a new directive that is absent from the base registry", () => {
		const current = scanSuppressions(
			"lib/a.ts",
			"// @ts-expect-error reason\nunsafe();\n",
		);
		expect(checkSuppressions([], current, [])).toHaveLength(1);
	});

	test("accepts a registered directive moved to another line", () => {
		const base = scanSuppressions(
			"lib/a.ts",
			"// fallow-ignore-next-line complexity\nwork();\n",
		);
		const current = scanSuppressions(
			"lib/a.ts",
			"\n// fallow-ignore-next-line complexity\nwork();\n",
		);
		expect(checkSuppressions(base, current, base)).toEqual([]);
	});

	test("rejects a changed target when only the old target was registered", () => {
		const base = scanSuppressions(
			"lib/a.ts",
			"// biome-ignore lint/style: reason\nold();\n",
		);
		const current = scanSuppressions(
			"lib/a.ts",
			"// biome-ignore lint/style: reason\nnew();\n",
		);
		expect(checkSuppressions(base, current, base)).toHaveLength(1);
	});

	test("recognizes configured equivalent directives", () => {
		const current = scanSuppressions(
			"lib/a.ts",
			"// custom-ignore reason\nwork();\n",
			{ "custom-ignore": "fallow-ignore" },
		);
		expect(current[0]?.family).toBe("fallow-ignore");
		expect(checkSuppressions([], current, [])).toHaveLength(1);
	});

	test("rejects a changed target below an eslint disable directive", () => {
		const base = scanSuppressions(
			"lib/a.ts",
			"/* eslint-disable no-console */\nold();\n",
		);
		const current = scanSuppressions(
			"lib/a.ts",
			"/* eslint-disable no-console */\nnew();\n",
		);
		expect(checkSuppressions(base, current, base)).toHaveLength(1);
	});

	test("recognizes an inline eslint disable line directive", () => {
		const current = scanSuppressions(
			"lib/a.ts",
			"work(); // eslint-disable-line no-console\n",
		);
		expect(checkSuppressions([], current, [])).toHaveLength(1);
	});

	test("finds comments after template literals without treating string contents as directives", () => {
		const current = scanSuppressions(
			"lib/a.ts",
			"const text = `// @ts-ignore`;\n// fallow-ignore-next-line complexity\nwork();\n",
		);
		expect(current).toHaveLength(1);
		expect(current[0]?.family).toBe("fallow-ignore");
	});
});
