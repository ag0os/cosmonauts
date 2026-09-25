import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
	checkSuppressions,
	isSuppressionScanPath,
	type SuppressionKey,
	scanSuppressions,
} from "../../scripts/suppression-policy.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("suppression policy", () => {
	// @cosmo-behavior plan:qm-chain-safety#B-008
	test.each([
		[
			"triple-slash TypeScript",
			"lib/a.ts",
			"/// @ts-ignore\nunsafe();\n",
			"@ts-ignore",
		],
		[
			"JSDoc TypeScript",
			"lib/a.ts",
			"/** @ts-ignore */\nunsafe();\n",
			"@ts-ignore",
		],
		[
			"block TypeScript",
			"lib/a.ts",
			"/* @ts-expect-error */\nunsafe();\n",
			"@ts-expect-error",
		],
		[
			"JSX Biome",
			"lib/a.tsx",
			"const view = <div>{/* biome-ignore lint/style/noUnusedTemplateLiteral: reason */}text</div>;\n",
			"biome-ignore",
		],
		[
			"block ESLint",
			"lib/a.ts",
			"/* eslint-disable no-console */\nconsole.log(1);\n",
			"eslint-disable",
		],
	])("recognizes %s suppression directives", (_name, path, source, family) => {
		const current = scanSuppressions(path, source);
		expect(current).toHaveLength(1);
		expect(current[0]?.family).toBe(family);
		expect(checkSuppressions([], current, [])).toHaveLength(1);
	});

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

	test("finds directives after template substitutions", () => {
		const current = scanSuppressions(
			"lib/a.ts",
			`const a = \`x\${y}z\`;\n// @ts-ignore\nunsafe();\n`,
		);
		expect(current.map(({ family, line }) => ({ family, line }))).toEqual([
			{ family: "@ts-ignore", line: 2 },
		]);
	});

	test("finds directives after a regex literal containing slashes", () => {
		const current = scanSuppressions(
			"lib/a.ts",
			"const url = /https?:\\/\\/example/;\n// @ts-ignore\nunsafe();\n",
		);
		expect(current.map(({ family, line }) => ({ family, line }))).toEqual([
			{ family: "@ts-ignore", line: 2 },
		]);
	});

	test("reads a multi-line block comment's last line the way tsc does", () => {
		const current = scanSuppressions(
			"lib/a.ts",
			"/*\n * @ts-ignore\n */\nignored();\n/* why\n * @ts-ignore */\nunsafe();\n",
		);
		expect(current.map(({ family, line }) => ({ family, line }))).toEqual([
			{ family: "@ts-ignore", line: 6 },
		]);
		expect(current[0]?.target).toBe(
			scanSuppressions("lib/a.ts", "// @ts-ignore\nunsafe();\n")[0]?.target,
		);
	});

	test("tracked source directives exactly match the exception registry", () => {
		const paths = execFileSync("git", ["ls-files", "--cached", "-z"], {
			cwd: root,
			encoding: "utf8",
		})
			.split("\0")
			.filter(isSuppressionScanPath);
		const registry = JSON.parse(
			readFileSync(
				join(root, ".cosmonauts/suppression-exceptions.json"),
				"utf8",
			),
		) as { entries: SuppressionKey[]; equivalents?: Record<string, string> };
		const recognized = paths.flatMap((path) =>
			scanSuppressions(
				path,
				readFileSync(join(root, path), "utf8"),
				registry.equivalents,
			),
		);
		const key = ({ family, path, directive, target }: SuppressionKey) =>
			JSON.stringify([family, path, directive, target]);
		expect(recognized.map(key).sort()).toEqual(
			registry.entries.map(key).sort(),
		);
	});
});
