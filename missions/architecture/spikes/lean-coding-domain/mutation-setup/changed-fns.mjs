// Usage: node changed-fns.mjs <commit> [pathspec...]
// Prints Stryker mutate ranges (file:start-end) for the innermost named
// function-like declaration enclosing each changed (new-side) line.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const [commit, ...specs] = process.argv.slice(2);
const diff = execFileSync(
	"git",
	[
		"diff",
		"-U0",
		`${commit}^`,
		commit,
		"--",
		...(specs.length ? specs : ["lib", "cli"]),
	],
	{ encoding: "utf8" },
);
const changed = new Map();
let file;
for (const line of diff.split("\n")) {
	if (line.startsWith("+++ ")) {
		file = line === "+++ /dev/null" ? undefined : line.slice(6);
		continue;
	}
	const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
	if (!m || !file || !file.endsWith(".ts")) continue;
	const start = Number(m[1]);
	const count = m[2] === undefined ? 1 : Number(m[2]);
	// pure deletion: attribute to the line where it happened
	const lines =
		count === 0
			? [Math.max(start, 1)]
			: Array.from({ length: count }, (_, i) => start + i);
	if (!changed.has(file)) changed.set(file, new Set());
	for (const l of lines) changed.get(file).add(l);
}
const out = [];
for (const [f, lines] of changed) {
	const text = readFileSync(f, "utf8");
	const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true);
	const fnRanges = [];
	const visit = (node) => {
		const isFn =
			ts.isFunctionDeclaration(node) ||
			ts.isMethodDeclaration(node) ||
			ts.isConstructorDeclaration(node) ||
			ts.isGetAccessor(node) ||
			ts.isSetAccessor(node) ||
			((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
				(ts.isVariableDeclaration(node.parent) ||
					ts.isPropertyAssignment(node.parent)));
		if (isFn) {
			const s = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
			const e = sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
			fnRanges.push([s, e]);
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
	const picked = new Set();
	for (const l of lines) {
		// innermost enclosing named function
		const hits = fnRanges
			.filter(([s, e]) => s <= l && l <= e)
			.sort((a, b) => a[1] - a[0] - (b[1] - b[0]));
		if (hits.length) picked.add(`${hits[0][0]}-${hits[0][1]}`);
	}
	// merge nested/overlapping ranges
	const rs = [...picked]
		.map((r) => r.split("-").map(Number))
		.sort((a, b) => a[0] - b[0]);
	const merged = [];
	for (const r of rs) {
		const last = merged.at(-1);
		if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
		else merged.push([...r]);
	}
	for (const [s, e] of merged) out.push(`${f}:${s}-${e}`);
}
console.log(out.join(","));
