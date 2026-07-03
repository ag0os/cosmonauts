import type { AgentDefinition } from "../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "plan-reviewer",
	description:
		"Adversarial review of implementation plans. Verifies claims against the codebase and produces structured findings for the planner to address.",
	capabilities: [
		"healthy-codebase-harness",
		"engineering-discipline",
		"architectural-design",
		"coding-readonly",
	],
	model: "openai-codex/gpt-5.5",
	tools: "coding",
	extensions: ["plans", "architecture-memory"],
	skills: [
		"pi",
		"plan",
		"work-artifacts",
		"architecture",
		"engineering-principles",
	],
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "xhigh",
};

export default definition;
