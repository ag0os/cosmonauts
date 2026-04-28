import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "tdd-coordinator",
	description:
		"Orchestrates dependency-linked TDD phase tasks and dispatches each phase to the correct specialist agent.",
	capabilities: ["core", "tasks", "spawning"],
	model: "anthropic/claude-sonnet-4-6",
	tools: "none",
	extensions: ["tasks", "orchestration", "observability"],
	skills: ["tdd"],
	subagents: ["test-writer", "verifier", "implementer", "refactorer"],
	projectContext: false,
	session: "ephemeral",
	loop: true,
};

export default definition;
