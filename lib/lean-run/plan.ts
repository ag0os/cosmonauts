import type { ParsedPlan, PlanBehavior } from "./types.ts";

const SECTION_NAMES = {
	approach: "approach",
	touches: "touches",
	reuses: "reuses",
	behaviors: "behaviors",
	behaviours: "behaviors",
	risks: "risks",
	diagram: "diagram",
} as const;
type SectionName = (typeof SECTION_NAMES)[keyof typeof SECTION_NAMES];

interface PlanSections {
	title: string;
	sections: Partial<Record<SectionName, string[]>>;
}

const FENCE = /^\s*(```|~~~)/;
const MERMAID_FENCE = /^\s*(```|~~~)\s*mermaid\b/;
const HEADING = /^(#{1,2})\s+(.*)$/;
const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;
const BACKTICKED = /`([^`]+)`/g;
const BEHAVIOR = /^\s*(?:[-*+]\s+)?\**(B-\d+)\**\s*[:.)—–-]?\s*(.*)$/;

/**
 * Reads the plan.md contract (brief section 4.4) by its headings only.
 * Missing sections parse as empty; nothing here throws.
 */
export function parsePlan(markdown: string): ParsedPlan {
	const { title, sections } = splitSections(markdown);
	const diagram = mermaidBlock(sections.diagram ?? []);
	return {
		title,
		approach: (sections.approach ?? []).join("\n").trim(),
		touches: pathList(sections.touches ?? []),
		reuses: pathList(sections.reuses ?? []),
		behaviors: behaviorList(sections.behaviors ?? []),
		risks: itemList(sections.risks ?? []),
		...(diagram === undefined ? {} : { diagram }),
		raw: markdown,
	};
}

function splitSections(markdown: string): PlanSections {
	const result: PlanSections = { title: "", sections: {} };
	let current: string[] | undefined;
	let inFence = false;
	for (const line of markdown.split(/\r?\n/)) {
		if (FENCE.test(line)) inFence = !inFence;
		const heading = inFence ? null : HEADING.exec(line);
		if (heading?.[1] === "#" && !result.title) {
			result.title = (heading[2] ?? "").trim();
			current = undefined;
		} else if (heading?.[1] === "##") {
			current = startSection(result, heading[2] ?? "");
		} else {
			current?.push(line);
		}
	}
	return result;
}

function startSection(
	result: PlanSections,
	headingText: string,
): string[] | undefined {
	const key = (headingText.split(/\s+[—–-]\s+|:/)[0] ?? "")
		.trim()
		.toLowerCase();
	const name = SECTION_NAMES[key as keyof typeof SECTION_NAMES];
	if (!name) return undefined;
	const lines: string[] = [];
	result.sections[name] = lines;
	return lines;
}

function pathList(lines: readonly string[]): string[] {
	return [...new Set(lines.flatMap(linePaths))];
}

/** A bullet names one path (its first backticked path, else its first word); prose contributes backticked paths. */
function linePaths(line: string): string[] {
	const quoted = [...line.matchAll(BACKTICKED)]
		.map((match) => (match[1] ?? "").trim())
		.filter(looksLikePath);
	const bullet = BULLET.exec(line)?.[1];
	if (bullet === undefined) return quoted;
	if (quoted.length > 0) return quoted.slice(0, 1);
	const first = (bullet.trim().split(/\s+/)[0] ?? "").replace(/[:,;]+$/, "");
	return looksLikePath(first) ? [first] : [];
}

function looksLikePath(value: string): boolean {
	return !/\s/.test(value) && /\/|\.[A-Za-z0-9]+$/.test(value);
}

/** Punctuation prose puts around a bare path. */
const WRAPPING = /^[("'[{<]+|[)"'\]}>.,;:!?]+$/gu;

/** A `:line` or `:line:column` suffix, as in `src/x.ts:12`. */
const LINE_SUFFIX = /:\d+(?::\d+)?$/u;

/**
 * The paths a direct request names: every backticked span that looks like a
 * path, by the plan's rule, and every bare word that has both a directory
 * and an extension (`lib/x.ts`), so prose like "and/or" or "e.g." is not one.
 * A URL (`://`) is never a path, and a `:line` suffix is dropped.
 */
export function requestPaths(request: string): string[] {
	const quoted = [...request.matchAll(BACKTICKED)]
		.map((match) => (match[1] ?? "").trim().replace(LINE_SUFFIX, ""))
		.filter(isRequestPath);
	const bare = request
		.replace(BACKTICKED, " ")
		.split(/\s+/)
		.map((word) => word.replace(WRAPPING, "").replace(LINE_SUFFIX, ""))
		.filter((word) => /\/.*\.[A-Za-z0-9]+$/u.test(word) && isRequestPath(word));
	return [...new Set([...quoted, ...bare])];
}

function isRequestPath(token: string): boolean {
	return !token.includes("://") && looksLikePath(token);
}

function behaviorList(lines: readonly string[]): PlanBehavior[] {
	return lines.flatMap((line) => {
		const match = BEHAVIOR.exec(line);
		if (!match) return [];
		const [observer = "", entryPoint = "", ...outcome] = (match[2] ?? "")
			.trim()
			.split(/\s+\/\s+/);
		const id = match[1] ?? "";
		return [{ id, observer, entryPoint, outcome: outcome.join(" / ") }];
	});
}

function itemList(lines: readonly string[]): string[] {
	const bullets = lines.flatMap((line) => {
		const item = BULLET.exec(line)?.[1]?.trim();
		return item ? [item] : [];
	});
	if (bullets.length > 0) return bullets;
	return lines.map((line) => line.trim()).filter(Boolean);
}

function mermaidBlock(lines: readonly string[]): string | undefined {
	const start = lines.findIndex((line) => MERMAID_FENCE.test(line));
	if (start < 0) return undefined;
	const body = lines.slice(start + 1);
	const end = body.findIndex((line) => FENCE.test(line));
	return (end < 0 ? body : body.slice(0, end)).join("\n").trim();
}
