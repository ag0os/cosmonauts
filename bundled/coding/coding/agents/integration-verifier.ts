import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "integration-verifier",
	description:
		"Verifies completed work against the active plan's declared integration contracts and writes a structured integration report.",
	capabilities: ["core", "engineering-discipline", "coding-readonly"],
	model: "openai-codex/gpt-5.4",
	tools: "coding",
	extensions: ["tasks", "plans"],
	skills: ["engineering-principles"],
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "high",
};

export default definition;
