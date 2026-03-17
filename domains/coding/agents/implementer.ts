import type { AgentDefinition } from "../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "implementer",
	description:
		"GREEN phase: writes the minimum production code to make failing tests pass. No refactoring, no extras.",
	capabilities: ["core", "engineering-discipline", "coding-readwrite", "tasks"],
	model: "anthropic/claude-sonnet-4-6",
	tools: "coding",
	extensions: ["tasks"],
	skills: ["tdd", "engineering-principles"],
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
};

export default definition;
