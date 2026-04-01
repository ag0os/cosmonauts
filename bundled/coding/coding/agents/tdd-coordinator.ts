import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "tdd-coordinator",
	description:
		"Orchestrates the Red-Green-Refactor cycle per task. Spawns test-writer, implementer, and refactorer in sequence for each task.",
	capabilities: ["core", "tasks", "spawning"],
	model: "anthropic/claude-sonnet-4-6",
	tools: "none",
	extensions: ["tasks", "orchestration", "observability"],
	skills: ["tdd"],
	subagents: ["test-writer", "implementer", "refactorer"],
	projectContext: false,
	session: "ephemeral",
	loop: true,
};

export default definition;
