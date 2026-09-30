/**
 * Tests for lib/code-health/diff-hunks.ts: `git diff -U0` parsing, hunk and
 * function-range intersection, and new-to-old line mapping, on literal diffs.
 */

import { describe, expect, test } from "vitest";
import {
	type DiffHunk,
	mapNewLineToOld,
	parseHunkHeader,
	parseUnifiedDiff,
	rangeIntersectsHunks,
	unquoteGitPath,
} from "../../lib/code-health/diff-hunks.ts";

const MODIFIED_AND_ADDED = [
	"diff --git a/src/sample.ts b/src/sample.ts",
	"index 1111111..2222222 100644",
	"--- a/src/sample.ts",
	"+++ b/src/sample.ts",
	"@@ -12 +12,4 @@ export function simple(value: number): number {",
	"-\treturn value + 1;",
	"+\tif (value > 10) {",
	"+\t\treturn value;",
	"+\t}",
	"+\treturn value + 1;",
	"@@ -13,0 +17,4 @@ export function simple(value: number): number {",
	"+",
	"+export function added(flag: boolean): string {",
	'+\treturn flag ? "yes" : "no";',
	"+}",
	"diff --git a/src/new.ts b/src/new.ts",
	"new file mode 100644",
	"index 0000000..3333333",
	"--- /dev/null",
	"+++ b/src/new.ts",
	"@@ -0,0 +1,3 @@",
	"+export function fresh(): number {",
	"+\treturn 1;",
	"+}",
	"",
].join("\n");

describe("parseUnifiedDiff", () => {
	test("returns each changed file with its hunks", () => {
		expect(parseUnifiedDiff(MODIFIED_AND_ADDED)).toEqual([
			{
				oldPath: "src/sample.ts",
				newPath: "src/sample.ts",
				hunks: [
					{ oldStart: 12, oldCount: 1, newStart: 12, newCount: 4 },
					{ oldStart: 13, oldCount: 0, newStart: 17, newCount: 4 },
				],
			},
			{
				oldPath: undefined,
				newPath: "src/new.ts",
				hunks: [{ oldStart: 0, oldCount: 0, newStart: 1, newCount: 3 }],
			},
		]);
	});

	test("does not mistake a removed line starting with dashes for a file header", () => {
		const diff = [
			"--- a/notes.ts",
			"+++ b/notes.ts",
			"@@ -3,2 +3,0 @@",
			"-- a list item",
			"--- not a header",
			"@@ -9 +7 @@",
			"-old",
			"+new",
		].join("\n");

		expect(parseUnifiedDiff(diff)).toEqual([
			{
				oldPath: "notes.ts",
				newPath: "notes.ts",
				hunks: [
					{ oldStart: 3, oldCount: 2, newStart: 3, newCount: 0 },
					{ oldStart: 9, oldCount: 1, newStart: 7, newCount: 1 },
				],
			},
		]);
	});

	test("keeps the old path of a renamed and edited file", () => {
		const diff = [
			"diff --git a/src/old-name.ts b/src/new-name.ts",
			"similarity index 90%",
			"rename from src/old-name.ts",
			"rename to src/new-name.ts",
			"--- a/src/old-name.ts",
			"+++ b/src/new-name.ts",
			"@@ -2 +2 @@",
			"-a",
			"+b",
		].join("\n");

		expect(parseUnifiedDiff(diff)[0]).toMatchObject({
			oldPath: "src/old-name.ts",
			newPath: "src/new-name.ts",
		});
	});

	test("marks a deleted file with no new path", () => {
		const diff = [
			"--- a/gone.ts",
			"+++ /dev/null",
			"@@ -1,2 +0,0 @@",
			"-export const x = 1;",
			"-export const y = 2;",
		].join("\n");

		expect(parseUnifiedDiff(diff)[0]?.newPath).toBeUndefined();
	});

	test("omits files whose change touches no lines", () => {
		const diff = [
			"diff --git a/a.ts b/b.ts",
			"similarity index 100%",
			"rename from a.ts",
			"rename to b.ts",
			"diff --git a/run.sh b/run.sh",
			"old mode 100644",
			"new mode 100755",
		].join("\n");

		expect(parseUnifiedDiff(diff)).toEqual([]);
	});

	test("ignores the no-newline marker inside a hunk", () => {
		const diff = [
			"--- a/end.ts",
			"+++ b/end.ts",
			"@@ -1 +1 @@",
			"-export const a = 1;",
			"\\ No newline at end of file",
			"+export const a = 2;",
			"\\ No newline at end of file",
		].join("\n");

		expect(parseUnifiedDiff(diff)[0]?.hunks).toEqual([
			{ oldStart: 1, oldCount: 1, newStart: 1, newCount: 1 },
		]);
	});

	test("unquotes paths git quoted", () => {
		const diff = [
			'--- "a/dir/tab\\there.ts"',
			'+++ "b/dir/tab\\there.ts"',
			"@@ -1 +1 @@",
			"-x",
			"+y",
		].join("\n");

		expect(parseUnifiedDiff(diff)[0]?.newPath).toBe("dir/tab\there.ts");
	});
});

describe("parseHunkHeader", () => {
	test("defaults omitted counts to one", () => {
		expect(parseHunkHeader("@@ -7 +9 @@ context")).toEqual({
			oldStart: 7,
			oldCount: 1,
			newStart: 9,
			newCount: 1,
		});
	});

	test("returns undefined for a line that is not a hunk header", () => {
		expect(parseHunkHeader("index 1111111..2222222")).toBeUndefined();
	});
});

describe("unquoteGitPath", () => {
	test("decodes octal UTF-8 bytes and escaped quotes", () => {
		expect(unquoteGitPath('"caf\\303\\251 \\"x\\".ts"')).toBe('café "x".ts');
	});
});

describe("rangeIntersectsHunks", () => {
	const fn = { startLine: 10, endLine: 20 };
	const hunk = (partial: Partial<DiffHunk>): DiffHunk => ({
		oldStart: 1,
		oldCount: 1,
		newStart: 1,
		newCount: 1,
		...partial,
	});

	test.each([
		["an added line inside the function", { newStart: 15, newCount: 1 }, true],
		["an added line on the first line", { newStart: 10, newCount: 1 }, true],
		["an added line on the last line", { newStart: 20, newCount: 1 }, true],
		["a hunk straddling the start", { newStart: 8, newCount: 3 }, true],
		[
			"a hunk ending just before the function",
			{ newStart: 7, newCount: 3 },
			false,
		],
		[
			"a hunk starting just after the function",
			{ newStart: 21, newCount: 2 },
			false,
		],
		[
			"a deletion between two function lines",
			{ newStart: 10, newCount: 0 },
			true,
		],
		[
			"a deletion just before the function",
			{ newStart: 9, newCount: 0 },
			false,
		],
		[
			"a deletion just after the function",
			{ newStart: 20, newCount: 0 },
			false,
		],
	] as const)("%s → %s", (_label, partial, expected) => {
		expect(rangeIntersectsHunks(fn, [hunk(partial)])).toBe(expected);
	});
});

describe("mapNewLineToOld", () => {
	const hunks: DiffHunk[] = [
		{ oldStart: 3, oldCount: 0, newStart: 4, newCount: 2 },
		{ oldStart: 10, oldCount: 3, newStart: 11, newCount: 0 },
		{ oldStart: 20, oldCount: 2, newStart: 19, newCount: 1 },
	];
	const line = (n: number) => ({ startLine: n, endLine: n });

	test("keeps lines before any hunk", () => {
		expect(mapNewLineToOld(2, hunks)).toEqual(line(2));
	});

	test("shifts lines after an addition back by the added count", () => {
		expect(mapNewLineToOld(8, hunks)).toEqual(line(6));
	});

	test("shifts lines after a deletion forward by the deleted count", () => {
		expect(mapNewLineToOld(12, hunks)).toEqual(line(13));
	});

	test("maps a rewritten line to the lines its hunk removed", () => {
		expect(mapNewLineToOld(19, hunks)).toEqual({ startLine: 20, endLine: 21 });
	});

	test("returns undefined for a purely added line", () => {
		expect(mapNewLineToOld(5, hunks)).toBeUndefined();
	});
});
