import type { AgentDefinition } from "../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "coordinator",
	description:
		"Delegates tasks to workers, monitors progress, and verifies completion. Loops until all tasks are done.",
	capabilities: ["core", "tasks", "spawning"],
	model: "anthropic/claude-opus-4-6",
	tools: "none",
	extensions: ["tasks", "orchestration", "observability"],
	skills: [],
	subagents: ["worker"],
	projectContext: false,
	session: "ephemeral",
	loop: true,
};

export default definition;
