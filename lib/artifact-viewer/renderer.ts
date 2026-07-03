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

		if (line.startsWith("```")) {
			flushPending(html, pending);
			pending = undefined;
			const codeLines: string[] = [];
			index += 1;
			while (index < lines.length && !lines[index]?.startsWith("```")) {
				codeLines.push(lines[index] ?? "");
				index += 1;
			}
			if (index < lines.length) index += 1;
			html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
			continue;
		}

		if (line.trim() === "") {
			flushPending(html, pending);
			pending = undefined;
			index += 1;
			continue;
		}

		const heading = line.match(HEADING_PATTERN);
		if (heading?.[1] && heading[2]) {
			flushPending(html, pending);
			pending = undefined;
			const level = heading[1].length;
			html.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
			index += 1;
			continue;
		}

		if (UNORDERED_LIST_PATTERN.test(line)) {
			flushPending(html, pending);
			pending = undefined;
			const items: string[] = [];
			while (index < lines.length) {
				const match = lines[index]?.match(UNORDERED_LIST_PATTERN);
				if (!match?.[1]) break;
				items.push(`<li>${renderInline(match[1])}</li>`);
				index += 1;
			}
			html.push(`<ul>\n${items.join("\n")}\n</ul>`);
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
