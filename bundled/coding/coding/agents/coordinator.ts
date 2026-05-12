import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "coordinator",
	description:
		"Delegates tasks to workers, monitors progress, and verifies completion. Loops until all tasks are done.",
	capabilities: ["tasks", "spawning"],
	model: "openai-codex/gpt-5.5",
	tools: "none",
	extensions: ["tasks", "orchestration", "observability"],
	skills: [],
	subagents: ["worker"],
	projectContext: false,
	session: "ephemeral",
	loop: true,
	thinkingLevel: "medium",
};

export default definition;
