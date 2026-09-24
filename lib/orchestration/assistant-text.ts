interface AssistantMessageLike {
	role?: string;
	content?: unknown;
	stopReason?: string;
	errorMessage?: string;
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

/**
 * The session's final message text, only when that message is a completed
 * assistant turn with text of its own. Never falls back to earlier messages.
 */
export function finalAssistantEvidence(
	messages: unknown[],
): { text: string } | { failure: string } {
	const final = messages.at(-1) as AssistantMessageLike | undefined;
	if (final?.role !== "assistant")
		return { failure: "no final assistant message" };
	if (final.stopReason === "error" || final.stopReason === "aborted")
		return {
			failure: `final assistant message ${final.stopReason}${final.errorMessage ? `: ${final.errorMessage}` : ""}`,
		};
	const text = ownText(final);
	return text
		? { text }
		: { failure: "final assistant message has no text of its own" };
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
