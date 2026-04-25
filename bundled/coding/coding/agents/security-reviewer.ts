import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "security-reviewer",
	description:
		"Security-focused plan review. Looks for input validation gaps, auth/authz weaknesses, injection surfaces, secret handling issues, and risky new dependencies. Does not redesign.",
	capabilities: [
		"core",
		"engineering-discipline",
		"architectural-design",
		"coding-readonly",
	],
	model: "openai-codex/gpt-5.5",
	tools: "coding",
	extensions: ["plans"],
	skills: ["pi", "plan", "engineering-principles"],
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "high",
};

export default definition;
