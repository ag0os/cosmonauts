import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "integration-verifier",
	description:
		"Verifies completed work against the active plan's declared integration contracts and writes a structured integration report.",
	capabilities: ["coding-readonly"],
	model: "openai-codex/gpt-5.5",
	tools: "coding",
	extensions: ["tasks", "plans"],
	skills: ["*"],
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "high",
};

export default definition;
