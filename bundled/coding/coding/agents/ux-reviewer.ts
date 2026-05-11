import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "ux-reviewer",
	description:
		"UX-lens review of code diffs — end-to-end flow, data-loss scenarios, missing feedback, confusing states, inconsistency with existing patterns, accessibility. Part of the quality-manager's review panel. Does not redesign or implement fixes.",
	capabilities: ["engineering-discipline", "coding-readonly"],
	model: "openai-codex/gpt-5.5",
	tools: "coding",
	extensions: [],
	skills: ["*"],
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "high",
};

export default definition;
