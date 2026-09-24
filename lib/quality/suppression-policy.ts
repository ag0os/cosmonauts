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
] as const;

function fingerprint(value: string): string {
	return createHash("sha256")
		.update(value.trim().replace(/\s+/g, " "))
		.digest("hex");
}

export function scanSuppressions(
	path: string,
	source: string,
	equivalents: Readonly<Record<string, string>> = {},
): Suppression[] {
	const lines = source.split(/\r?\n/);
	const results: Suppression[] = [];
	const scanner = ts.createScanner(
		ts.ScriptTarget.Latest,
		false,
		/\.[cm]?[jt]sx$/.test(path)
			? ts.LanguageVariant.JSX
			: ts.LanguageVariant.Standard,
		source,
	);
	const comments: Array<{ pos: number; end: number }> = [];
	for (
		let token = scanner.scan();
		token !== ts.SyntaxKind.EndOfFileToken;
		token = scanner.scan()
	) {
		if (
			token === ts.SyntaxKind.SingleLineCommentTrivia ||
			token === ts.SyntaxKind.MultiLineCommentTrivia
		)
			comments.push({ pos: scanner.getTokenPos(), end: scanner.getTextPos() });
	}
	for (const range of comments) {
		const index = source.slice(0, range.pos).split(/\r?\n/).length - 1;
		const line = lines[index] ?? "";
		const comment = source
			.slice(range.pos, range.end)
			.replace(/^\/\/+|^\/\*+/, "")
			.replace(/\*\/$/, "")
			.trim();
		if (!comment) continue;
		const family = [...families, ...Object.keys(equivalents)].find((name) =>
			comment.startsWith(name),
		);
		if (!family) continue;
		const canonical = equivalents[family] ?? family;
		const directive = comment
			.replace(family, canonical)
			.replace(/\*\/\s*$/, "");
		const target = /-file\b/.test(directive)
			? "<file>"
			: /-line\b/.test(directive) && !/-next-line\b/.test(directive)
				? line.replace(/\/\/.*$/, "")
				: (lines[index + 1] ?? "");
		results.push({
			family: canonical,
			path,
			directive: fingerprint(directive),
			target: fingerprint(target),
			line: index + 1,
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
