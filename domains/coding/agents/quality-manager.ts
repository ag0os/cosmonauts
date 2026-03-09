import type { AgentDefinition } from "../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "quality-manager",
	description:
		"Runs quality gates and clean-context review, then orchestrates fixes until changes are merge-ready.",
	capabilities: ["core", "coding-readwrite", "tasks", "spawning"],
	model: "openai-codex/gpt-5.3-codex",
	tools: "coding",
	extensions: ["tasks", "orchestration"],
	skills: undefined,
	subagents: ["reviewer", "fixer", "coordinator"],
	projectContext: true,
	session: "ephemeral",
	loop: false,
};

export default definition;
