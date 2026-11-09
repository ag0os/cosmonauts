interface AssistantMessageLike {
	role?: string;
	content?: unknown;
}

function ownText(message: AssistantMessageLike): string {
	if (!Array.isArray(message.content)) return "";
	const textBlocks: string[] = [];
	for (const block of message.content) {
		const candidate = block as { type?: string; text?: string };
		if (
			candidate.type === "text" &&
			typeof candidate.text === "string" &&
			candidate.text.trim()
		) {
			textBlocks.push(candidate.text.trim());
		}
	}
	return textBlocks.join("\n\n");
}

/**
 * Extract the text content of the last assistant message in a completed
 * session's message list. Returns `<role> completed` when no text content is
 * found (e.g. the agent ended on a tool call).
 */
export function extractAssistantText(
	messages: unknown[],
	role: string,
): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i] as AssistantMessageLike;
		if (message.role !== "assistant") continue;
		const text = ownText(message);
		if (text) return text;
	}
	return `${role} completed`;
}

const DEFAULT_SUMMARY_LENGTH = 200;

/** Condense agent text into a single short summary line. */
export function summarizeAssistantText(
	text: string,
	role: string,
	maxLength = DEFAULT_SUMMARY_LENGTH,
): string {
	const collapsed = text.trim().replace(/\s+/g, " ");
	if (collapsed.length === 0) return `${role} completed`;
	if (collapsed.length <= maxLength) return collapsed;
	return `${collapsed.slice(0, maxLength - 1)}…`;
}
