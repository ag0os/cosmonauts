import type { AgentDefinition } from "../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "quality-manager",
	description:
		"Runs quality gates and clean-context review, then orchestrates fixes until changes are merge-ready.",
	capabilities: [
		"healthy-codebase-harness",
		"engineering-discipline",
		"coding-readwrite",
		"tasks",
		"spawning",
	],
	model: "openai-codex/gpt-5.6-sol",
	tools: "coding",
	extensions: [
		"tasks",
		"orchestration",
		"project-tools",
		"architecture-memory",
	],
	skills: ["*"],
	subagents: [
		"reviewer",
		"security-reviewer",
		"performance-reviewer",
		"ux-reviewer",
		"fixer",
		"coordinator",
		"verifier",
		"integration-verifier",
	],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "high",
};

export default definition;
