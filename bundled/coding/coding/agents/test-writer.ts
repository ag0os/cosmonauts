import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "test-writer",
	description:
		"RED phase: writes failing tests that capture a behavior from the task's acceptance criteria. Never writes production code.",
	capabilities: ["core", "engineering-discipline", "coding-readwrite", "tasks"],
	model: "openai-codex/gpt-5.4",
	tools: "coding",
	extensions: ["tasks"],
	skills: ["tdd", "engineering-principles"],
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
};

export default definition;
