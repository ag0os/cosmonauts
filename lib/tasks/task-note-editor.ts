const HEADING = "## Implementation Notes";

interface SectionSpan {
	start: number;
	contentStart: number;
	end: number;
}

// Markdown ATX headings may be indented by at most three spaces.
const SECTION_HEADING = /^ {0,3}##[ \t]+([^\r\n]*?)[ \t]*(?:\r\n|\n|\r|$)/gim;

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
	const headings = [...source.matchAll(SECTION_HEADING)];
	const matches = headings.filter(
		(match) => match[1]?.trim().toLowerCase() === "implementation notes",
	);
	if (matches.length > 1)
		throw new Error("Duplicate Implementation Notes sections");
	const match = matches[0];
	if (!match || match.index === undefined) return undefined;
	const next = headings.find((heading) => (heading.index ?? 0) > match.index);
	return {
		start: match.index,
		contentStart: match.index + match[0].length,
		end: next?.index ?? source.length,
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

/** Preserve the original section, including its boundary whitespace, across serialization. */
export function preserveTaskNotes(
	original: string,
	serialized: string,
	append?: string,
): string {
	if (append !== undefined && !append.trim())
		throw new Error("Cannot append empty implementation notes");
	const old = taskNoteSection(original);
	const canonical = taskNoteSection(serialized);
	const lineEnding = old
		? (original.slice(old.start, old.end).match(/\r\n|\n|\r/)?.[0] ??
			original.match(/\r\n|\n|\r/)?.[0] ??
			"\n")
		: (original.match(/\r\n|\n|\r/)?.[0] ?? "\n");
	let section = old ? original.slice(old.start, old.end) : "";
	if (append !== undefined) {
		const block = append.replace(/\r\n|\r|\n/g, lineEnding);
		if (!containsCompleteBlock(section, block, lineEnding)) {
			if (!section) section = `${HEADING}${lineEnding}${lineEnding}`;
			else if (!section.endsWith(`${lineEnding}${lineEnding}`))
				section += section.endsWith(lineEnding)
					? lineEnding
					: `${lineEnding}${lineEnding}`;
			section += block;
		}
	}
	if (canonical)
		return (
			serialized.slice(0, canonical.start) +
			section +
			serialized.slice(canonical.end)
		);
	if (!section) return serialized;
	return `${serialized.trimEnd()}\n\n${section}`;
}
