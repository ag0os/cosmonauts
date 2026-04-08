import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "plan-reviewer",
	description:
		"Adversarial review of implementation plans. Verifies claims against the codebase and produces structured findings for the planner to address.",
	capabilities: [
		"core",
		"engineering-discipline",
		"architectural-design",
		"coding-readonly",
	],
	model: "anthropic/claude-opus-4-6",
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
