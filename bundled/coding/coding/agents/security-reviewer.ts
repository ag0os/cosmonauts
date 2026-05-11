import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "security-reviewer",
	description:
		"Security-lens review of code diffs — input validation, auth/authz, injection surfaces, secret handling, risky dependencies, blast radius. Part of the quality-manager's review panel. Does not redesign or implement fixes.",
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
