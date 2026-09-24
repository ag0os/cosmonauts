import { createHash } from "node:crypto";
import ts from "typescript";

export interface SuppressionKey {
	family: string;
	path: string;
	directive: string;
	target: string;
}

export interface Suppression extends SuppressionKey {
	line: number;
}

const families = [
	"fallow-ignore",
	"biome-ignore",
	"eslint-disable",
	"@ts-ignore",
	"@ts-expect-error",
	"@ts-nocheck",
] as const;

const scannedPath = /\.(?:[cm]?[jt]sx?|jsonc?)$/;

/** Whether the suppression gate scans a repository path. */
export function isSuppressionScanPath(path: string): boolean {
	return scannedPath.test(path);
}

interface DirectiveMatch {
	family: string;
	text: string;
	index: number;
}

function fingerprint(value: string): string {
	return createHash("sha256")
		.update(value.trim().replace(/\s+/g, " "))
		.digest("hex");
}

function commentRanges(path: string, source: string): ts.CommentRange[] {
	const sourceFile = ts.createSourceFile(
		path,
		source,
		ts.ScriptTarget.Latest,
		true,
		/\.jsonc?$/.test(path) ? ts.ScriptKind.JSON : undefined,
	);
	const comments = new Map<number, ts.CommentRange>();
	function collect(node: ts.Node): void {
		for (const position of [node.pos, node.end]) {
			for (const range of [
				...(ts.getLeadingCommentRanges(source, position) ?? []),
				...(ts.getTrailingCommentRanges(source, position) ?? []),
			])
				comments.set(range.pos, range);
		}
		for (const child of node.getChildren(sourceFile)) collect(child);
	}
	collect(sourceFile);
	return [...comments.values()].sort((a, b) => a.pos - b.pos);
}

function lineIndex(source: string, position: number): number {
	return source.slice(0, position).split(/\r?\n/).length - 1;
}

/** A comment's leading directive, or the last line of a block comment as `tsc` reads it. */
function matchDirective(
	source: string,
	range: ts.CommentRange,
	names: readonly string[],
): DirectiveMatch | undefined {
	const raw = source.slice(range.pos, range.end);
	const comment = raw
		.replace(/^\/\/+|^\/\*+/, "")
		.replace(/\*\/$/, "")
		.trim();
	const index = lineIndex(source, range.pos);
	const leading = names.find((name) => comment.startsWith(name));
	if (leading) return { family: leading, text: comment, index };
	const lines = raw.split(/\r?\n/);
	if (lines.length < 2) return undefined;
	const last = (lines.at(-1) ?? "")
		.replace(/^\s*[/*]*\s*/, "")
		.replace(/\*\/$/, "")
		.trim();
	const trailing = names.find((name) => last.startsWith(name));
	if (!trailing) return undefined;
	return { family: trailing, text: last, index: index + lines.length - 1 };
}

function directiveTarget(directive: string, lines: string[], index: number) {
	if (/-file\b|^@ts-nocheck\b|^biome-ignore-all\b/.test(directive))
		return "<file>";
	if (/-line\b/.test(directive) && !/-next-line\b/.test(directive))
		return (lines[index] ?? "").replace(/\/\/.*$/, "");
	return lines[index + 1] ?? "";
}

export function scanSuppressions(
	path: string,
	source: string,
	equivalents: Readonly<Record<string, string>> = {},
): Suppression[] {
	const lines = source.split(/\r?\n/);
	const names = [...families, ...Object.keys(equivalents)];
	const results: Suppression[] = [];
	for (const range of commentRanges(path, source)) {
		const match = matchDirective(source, range, names);
		if (!match) continue;
		const canonical = equivalents[match.family] ?? match.family;
		const directive = match.text
			.replace(match.family, canonical)
			.replace(/\*\/\s*$/, "");
		results.push({
			family: canonical,
			path,
			directive: fingerprint(directive),
			target: fingerprint(directiveTarget(directive, lines, match.index)),
			line: match.index + 1,
		});
	}
	return results;
}

export function checkSuppressions(
	base: readonly Suppression[],
	current: readonly Suppression[],
	registry: readonly SuppressionKey[],
): Suppression[] {
	const key = (item: SuppressionKey) =>
		`${item.family}\0${item.path}\0${item.directive}\0${item.target}`;
	const prior = new Map<string, number>();
	for (const item of base)
		prior.set(key(item), (prior.get(key(item)) ?? 0) + 1);
	const allowed = new Set(registry.map(key));
	return current.filter((item) => {
		const id = key(item);
		const count = prior.get(id) ?? 0;
		if (count > 0) {
			prior.set(id, count - 1);
			return false;
		}
		return !allowed.has(id);
	});
}
