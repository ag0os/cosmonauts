import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "quality-manager",
	description:
		"Runs quality gates and clean-context review, then orchestrates fixes until changes are merge-ready.",
	capabilities: [
		"core",
		"engineering-discipline",
		"coding-readwrite",
		"tasks",
		"spawning",
	],
	model: "anthropic/claude-opus-4-7",
	tools: "coding",
	extensions: ["tasks", "orchestration"],
	skills: ["*"],
	subagents: [
		"reviewer",
		"security-reviewer",
		"performance-reviewer",
		"ux-reviewer",
		"fixer",
		"coordinator",
		"tdd-coordinator",
		"verifier",
		"integration-verifier",
	],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "high",
};

export default definition;
