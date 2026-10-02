import {
	type ExtensionContext,
	parseSkillBlock,
	type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { HANDOFF_BRIEF_PREFIX } from "../../../../lib/interactive/agent-switch.ts";
import { SPAWN_COMPLETION_PREFIX } from "../../../../lib/orchestration/spawn-completion-loop.ts";

/**
 * The text of the user messages on the session's current branch since the
 * last lean_build that ended done (its patch landed; earlier requests are
 * built), oldest first, as the session recorded it. A lean_build that threw,
 * was blocked or failed applied nothing, so its request stays open. Custom
 * messages, tool results and compaction summaries are other entry types or
 * roles; spawn completions and a /handoff brief arrive as user messages and
 * are left out by their prefix. An expanded skill command reads as the
 * command typed. Empty without a session.
 */
export function sessionUserMessages(ctx: ExtensionContext): string[] {
	const branch: readonly SessionEntry[] = ctx.sessionManager?.getBranch() ?? [];
	let messages: string[] = [];
	for (const entry of branch) {
		if (entry.type !== "message") continue;
		const message = entry.message;
		if (message.role === "toolResult" && landedBuild(message)) messages = [];
		if (message.role !== "user") continue;
		const text = messageText(message.content);
		if (
			text.startsWith(SPAWN_COMPLETION_PREFIX) ||
			text.startsWith(HANDOFF_BRIEF_PREFIX)
		)
			continue;
		messages.push(typedSkillCommand(text));
	}
	return messages;
}

/**
 * Pi records the tool's `details` on the toolResult entry; lean_build's carry
 * its status, and a call that threw records `{}`.
 */
function landedBuild(message: {
	toolName: string;
	details?: unknown;
}): boolean {
	const { details } = message;
	return (
		message.toolName === "lean_build" &&
		typeof details === "object" &&
		details !== null &&
		"status" in details &&
		details.status === "done"
	);
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
	const skill = parseSkillBlock(text);
	if (!skill) return text;
	return skill.userMessage
		? `/skill:${skill.name} ${skill.userMessage}`
		: `/skill:${skill.name}`;
}
