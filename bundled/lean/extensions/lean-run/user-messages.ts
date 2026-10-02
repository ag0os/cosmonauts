import type {
	ExtensionContext,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { SPAWN_COMPLETION_PREFIX } from "../../../../lib/orchestration/spawn-completion-loop.ts";

/**
 * Pi's expansion of `/skill:name args` in a user message: the skill file
 * wrapped in a `<skill>` block, then the arguments.
 */
const SKILL_BLOCK =
	/^<skill name="([^"]*)" location="[^"]*">\n[\s\S]*?\n<\/skill>(?:\n\n([\s\S]*))?$/u;

/**
 * The text of every user message on the session's current branch, oldest
 * first, as the session recorded it. Custom messages, tool results and
 * compaction summaries are other entry types or roles; spawn completions
 * arrive as user messages and are left out by their prefix. An expanded skill
 * command reads as the command typed. Empty without a session.
 */
export function sessionUserMessages(ctx: ExtensionContext): string[] {
	const branch: readonly SessionEntry[] = ctx.sessionManager?.getBranch() ?? [];
	return branch.flatMap((entry) => {
		if (entry.type !== "message" || entry.message.role !== "user") return [];
		const text = messageText(entry.message.content);
		if (text.trim() === "" || text.startsWith(SPAWN_COMPLETION_PREFIX))
			return [];
		return [typedSkillCommand(text)];
	});
}

function messageText(
	content: string | readonly { type: string; text?: string }[],
): string {
	if (typeof content === "string") return content;
	return content
		.flatMap((part) =>
			part.type === "text" && part.text !== undefined ? [part.text] : [],
		)
		.join("\n");
}

function typedSkillCommand(text: string): string {
	const match = SKILL_BLOCK.exec(text);
	if (!match) return text;
	const args = match[2] ? ` ${match[2]}` : "";
	return `/skill:${match[1]}${args}`;
}
