export interface MarkdownScan {
	lines: string[];
	fenceMaskedLines: string[];
	quotedMaskedLines: string[];
}

interface MarkdownFence {
	character: "`" | "~";
	length: number;
}

export function scanMarkdown(markdown: string): MarkdownScan {
	const lines = markdown.replace(/\r\n/g, "\n").split("\n");
	const fenceMaskedLines: string[] = [];
	let fence: MarkdownFence | undefined;

	for (const line of lines) {
		if (fence) {
			fenceMaskedLines.push(" ".repeat(line.length));
			if (isFenceClosingLine(line, fence)) fence = undefined;
			continue;
		}

		const openingFence = parseOpeningFence(line);
		if (openingFence) {
			fence = openingFence;
			fenceMaskedLines.push(" ".repeat(line.length));
			continue;
		}

		fenceMaskedLines.push(line);
	}

	const quotedMaskedLines = maskInlineCodeSpansByBlock(fenceMaskedLines);
	return { lines, fenceMaskedLines, quotedMaskedLines };
}

function parseOpeningFence(line: string): MarkdownFence | undefined {
	const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
	const run = match?.[1];
	if (!run) return undefined;
	if (run[0] === "`" && match[2]?.includes("`")) return undefined;

	return {
		character: run[0] as "`" | "~",
		length: run.length,
	};
}

function isFenceClosingLine(line: string, fence: MarkdownFence): boolean {
	const match = line.match(/^ {0,3}(`+|~+)[ \t]*$/);
	const run = match?.[1];
	return (
		run !== undefined &&
		run[0] === fence.character &&
		run.length >= fence.length
	);
}

/**
 * Inline code spans cannot cross Markdown block boundaries: blank lines,
 * headings, and new list items end the inline context, so a stray backtick
 * in one block must never pair with a backtick in another and mask the
 * real content between them. Spans may still continue across soft line
 * breaks within one block.
 */
function maskInlineCodeSpansByBlock(lines: readonly string[]): string[] {
	const masked: string[] = [];
	let block: string[] = [];
	const flush = () => {
		if (block.length === 0) return;
		masked.push(...maskInlineCodeSpans(block.join("\n")).split("\n"));
		block = [];
	};

	for (const line of lines) {
		if (/^\s*$/.test(line)) {
			flush();
			masked.push(line);
			continue;
		}
		if (/^#{1,6}\s/.test(line)) {
			flush();
			masked.push(maskInlineCodeSpans(line));
			continue;
		}
		// A new list item interrupts the inline context: a stray backtick in
		// one item must never pair into a later item and mask the content
		// between them. Continuation lines of the same item stay in-block.
		if (/^\s*(?:[-*+]|\d+[.)])\s/.test(line)) {
			flush();
		}
		block.push(line);
	}
	flush();
	return masked;
}

function maskInlineCodeSpans(content: string): string {
	let masked = "";
	let cursor = 0;
	while (cursor < content.length) {
		if (content[cursor] !== "`") {
			masked += content[cursor];
			cursor += 1;
			continue;
		}

		const openerEnd = endOfRun(content, cursor, "`");
		const runLength = openerEnd - cursor;
		const closingStart = findMatchingRun(content, openerEnd, runLength);
		if (closingStart === -1) {
			masked += content.slice(cursor, openerEnd);
			cursor = openerEnd;
			continue;
		}

		const closingEnd = closingStart + runLength;
		masked += content.slice(cursor, closingEnd).replaceAll(/[^\n]/g, " ");
		cursor = closingEnd;
	}
	return masked;
}

function findMatchingRun(
	line: string,
	start: number,
	runLength: number,
): number {
	let cursor = start;
	while (cursor < line.length) {
		const next = line.indexOf("`", cursor);
		if (next === -1) return -1;
		const end = endOfRun(line, next, "`");
		if (end - next === runLength) return next;
		cursor = end;
	}
	return -1;
}

function endOfRun(line: string, start: number, character: string): number {
	let end = start;
	while (line[end] === character) end += 1;
	return end;
}
