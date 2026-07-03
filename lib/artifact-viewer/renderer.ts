export interface RenderMarkdownOptions {
	readonly title?: string;
}

type BlockKind = "paragraph" | "unsupported";

interface PendingBlock {
	readonly kind: BlockKind;
	readonly lines: string[];
}

const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/u;
const UNORDERED_LIST_PATTERN = /^-\s+(.+)$/u;
const ORDERED_LIST_PATTERN = /^\d+\.\s+/u;

export function renderArtifactMarkdown(
	markdown: string,
	options: RenderMarkdownOptions = {},
): string {
	const body = renderMarkdownBlocks(markdown);
	const title = options.title ? `<h1>${escapeHtml(options.title)}</h1>` : "";
	return title ? `${title}\n${body}` : body;
}

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function renderMarkdownBlocks(markdown: string): string {
	const lines = markdown.replace(/\r\n/g, "\n").split("\n");
	const html: string[] = [];
	let pending: PendingBlock | undefined;
	let index = 0;

	while (index < lines.length) {
		const line = lines[index] ?? "";

		const specialBlock = renderSpecialMarkdownBlock({
			lines,
			index,
			line,
			html,
			pending,
		});
		if (specialBlock) {
			pending = undefined;
			index = specialBlock.nextIndex;
			continue;
		}

		const kind = isUnsupportedMarkdownLine(line) ? "unsupported" : "paragraph";
		if (pending && pending.kind !== kind) {
			flushPending(html, pending);
			pending = undefined;
		}
		pending = {
			kind,
			lines: [...(pending?.lines ?? []), line],
		};
		index += 1;
	}

	flushPending(html, pending);
	return html.join("\n");
}

function renderSpecialMarkdownBlock(options: {
	readonly lines: readonly string[];
	readonly index: number;
	readonly line: string;
	readonly html: string[];
	readonly pending: PendingBlock | undefined;
}): { readonly nextIndex: number } | undefined {
	if (options.line.startsWith("```")) {
		flushPending(options.html, options.pending);
		return {
			nextIndex: renderFencedCodeBlock(
				options.lines,
				options.index,
				options.html,
			),
		};
	}

	if (options.line.trim() === "") {
		flushPending(options.html, options.pending);
		return { nextIndex: options.index + 1 };
	}

	const heading = options.line.match(HEADING_PATTERN);
	if (heading?.[1] && heading[2]) {
		flushPending(options.html, options.pending);
		renderHeading(heading, options.html);
		return { nextIndex: options.index + 1 };
	}

	if (UNORDERED_LIST_PATTERN.test(options.line)) {
		flushPending(options.html, options.pending);
		return {
			nextIndex: renderUnorderedList(
				options.lines,
				options.index,
				options.html,
			),
		};
	}

	return undefined;
}

function renderFencedCodeBlock(
	lines: readonly string[],
	start: number,
	html: string[],
): number {
	const codeLines: string[] = [];
	let index = start + 1;
	while (index < lines.length && !lines[index]?.startsWith("```")) {
		codeLines.push(lines[index] ?? "");
		index += 1;
	}
	if (index < lines.length) index += 1;
	html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
	return index;
}

function renderHeading(heading: RegExpMatchArray, html: string[]): void {
	const marker = heading[1] ?? "#";
	const text = heading[2] ?? "";
	const level = marker.length;
	html.push(`<h${level}>${renderInline(text.trim())}</h${level}>`);
}

function renderUnorderedList(
	lines: readonly string[],
	start: number,
	html: string[],
): number {
	const items: string[] = [];
	let index = start;
	while (index < lines.length) {
		const match = lines[index]?.match(UNORDERED_LIST_PATTERN);
		if (!match?.[1]) break;
		items.push(`<li>${renderInline(match[1])}</li>`);
		index += 1;
	}
	html.push(`<ul>\n${items.join("\n")}\n</ul>`);
	return index;
}

function flushPending(html: string[], pending: PendingBlock | undefined): void {
	if (!pending || pending.lines.length === 0) return;

	if (pending.kind === "unsupported") {
		html.push(
			`<pre><code>${escapeHtml(pending.lines.join("\n"))}</code></pre>`,
		);
		return;
	}

	html.push(`<p>${renderInline(pending.lines.join("\n"))}</p>`);
}

function isUnsupportedMarkdownLine(line: string): boolean {
	const trimmed = line.trimStart();
	return (
		trimmed.startsWith(">") ||
		trimmed.startsWith("|") ||
		trimmed.startsWith("<") ||
		trimmed.startsWith("\t") ||
		ORDERED_LIST_PATTERN.test(trimmed)
	);
}

function renderInline(value: string): string {
	const parts = value.split("`");
	return parts
		.map((part, index) => {
			const escaped = escapeHtml(part);
			return index % 2 === 1 ? `<code>${escaped}</code>` : escaped;
		})
		.join("");
}
