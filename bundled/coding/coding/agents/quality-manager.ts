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
	model: "openai-codex/gpt-5.4",
	tools: "coding",
	extensions: ["tasks", "orchestration"],
	skills: ["*"],
	subagents: [
		"reviewer",
		"fixer",
		"coordinator",
		"verifier",
		"integration-verifier",
	],
	projectContext: true,
	session: "ephemeral",
	loop: false,
};

export default definition;
