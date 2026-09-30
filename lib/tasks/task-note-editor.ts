import type { SerializedTask } from "./task-serializer.ts";

const HEADING = "## Implementation Notes";

interface SectionSpan {
	start: number;
	contentStart: number;
	end: number;
}

interface SectionHeading {
	start: number;
	contentStart: number;
	title: string;
}

// Markdown ATX headings may be indented by at most three spaces.
const SECTION_HEADING = /^ {0,3}##[ \t]+(.*?)[ \t]*$/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const LINE = /[^\r\n]*(?:\r\n|\n|\r|$)/g;

function openedFence(text: string): string | undefined {
	const match = FENCE_OPEN.exec(text);
	if (!match?.[1]) return undefined;
	if (match[1].startsWith("`") && match[2]?.includes("`")) return undefined;
	return match[1];
}

function closesFence(text: string, fence: string): boolean {
	const close = FENCE_CLOSE.exec(text)?.[1];
	return (
		close !== undefined && close[0] === fence[0] && close.length >= fence.length
	);
}

/** The fence still open after `text`, whose first line starts outside any fence. */
function trailingOpenFence(text: string): string | undefined {
	let fence: string | undefined;
	for (const line of text.matchAll(LINE)) {
		if (!line[0]) break;
		const content = line[0].replace(/(?:\r\n|\n|\r)$/, "");
		if (!fence) fence = openedFence(content);
		else if (closesFence(content, fence)) fence = undefined;
	}
	return fence;
}

/** Terminate a fence the notes left open, so nothing after them is swallowed. */
function closeOpenFence(section: string, lineEnding: string): string {
	const fence = trailingOpenFence(section);
	if (!fence) return section;
	const separator = /(?:\r\n|\n|\r)$/.test(section) ? "" : lineEnding;
	return `${section}${separator}${fence}${lineEnding}`;
}

function isNotesTitle(title: string): boolean {
	return title.trim().toLowerCase() === "implementation notes";
}

/**
 * `## ` headings. From the notes heading on, where Drive records worker text,
 * a heading within a fenced code block is inert; earlier sections keep the
 * plain line grammar so existing task files parse as before.
 */
export function sectionHeadings(source: string): SectionHeading[] {
	const headings: SectionHeading[] = [];
	let inNotes = false;
	let fence: string | undefined;
	for (const line of source.matchAll(LINE)) {
		if (!line[0] || line.index === undefined) break;
		const text = line[0].replace(/(?:\r\n|\n|\r)$/, "");
		if (fence) {
			if (closesFence(text, fence)) fence = undefined;
			continue;
		}
		if (inNotes) fence = openedFence(text);
		const title = fence ? undefined : SECTION_HEADING.exec(text)?.[1];
		if (title === undefined) continue;
		headings.push({
			start: line.index,
			contentStart: line.index + line[0].length,
			title,
		});
		inNotes ||= isNotesTitle(title);
	}
	return headings;
}

function containsCompleteBlock(
	section: string,
	block: string,
	lineEnding: string,
): boolean {
	let index = section.indexOf(block);
	while (index !== -1) {
		const before = index === 0 || section.slice(0, index).endsWith(lineEnding);
		const end = index + block.length;
		const after = end === section.length || section.startsWith(lineEnding, end);
		if (before && after) return true;
		index = section.indexOf(block, index + 1);
	}
	return false;
}

export function taskNoteSection(source: string): SectionSpan | undefined {
	const headings = sectionHeadings(source);
	const matches = headings.filter((heading) => isNotesTitle(heading.title));
	if (matches.length > 1)
		throw new Error("Duplicate Implementation Notes sections");
	const match = matches[0];
	if (!match) return undefined;
	const next = headings.find((heading) => heading.start > match.start);
	return {
		start: match.start,
		contentStart: match.contentStart,
		end: next?.start ?? source.length,
	};
}

export function hasTaskNoteBlock(source: string, append: string): boolean {
	const span = taskNoteSection(source);
	if (!span) return false;
	const section = source.slice(span.start, span.end);
	const lineEnding = section.match(/\r\n|\n|\r/)?.[0] ?? "\n";
	return containsCompleteBlock(
		section,
		append.replace(/\r\n|\r|\n/g, lineEnding),
		lineEnding,
	);
}

function endWithBlankLine(text: string, lineEnding: string): string {
	if (text.endsWith(`${lineEnding}${lineEnding}`)) return text;
	return (
		text +
		(text.endsWith(lineEnding) ? lineEnding : `${lineEnding}${lineEnding}`)
	);
}

/**
 * Preserve the original section, including its boundary whitespace, across
 * serialization. The section replaces the span the serializer reports; when
 * anything follows it, an open fence is closed and a blank line ends it.
 */
export function preserveTaskNotes(
	original: string,
	serialized: SerializedTask,
	append?: string,
): string {
	if (append !== undefined && !append.trim())
		throw new Error("Cannot append empty implementation notes");
	const { text, notes: canonical } = serialized;
	const old = taskNoteSection(original);
	const lineEnding = old
		? (original.slice(old.start, old.end).match(/\r\n|\n|\r/)?.[0] ??
			original.match(/\r\n|\n|\r/)?.[0] ??
			"\n")
		: (original.match(/\r\n|\n|\r/)?.[0] ?? "\n");
	let section = old ? original.slice(old.start, old.end) : "";
	if (append !== undefined) {
		const block = append.replace(/\r\n|\r|\n/g, lineEnding);
		if (!containsCompleteBlock(section, block, lineEnding))
			section =
				endWithBlankLine(
					closeOpenFence(section || HEADING, lineEnding),
					lineEnding,
				) + block;
	}
	if (!canonical) return section ? `${text.trimEnd()}\n\n${section}` : text;
	const rest = text.slice(canonical.end);
	if (rest)
		section = endWithBlankLine(closeOpenFence(section, lineEnding), lineEnding);
	return text.slice(0, canonical.start) + section + rest;
}
