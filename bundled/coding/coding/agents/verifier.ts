import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "verifier",
	description:
		"Validates explicit claims against the codebase with structured pass/fail evidence. Runs checks but never writes code.",
	capabilities: ["healthy-codebase-harness", "coding-readonly"],
	model: "openai-codex/gpt-5.5",
	tools: "verification",
	extensions: [],
	skills: ["*"],
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "medium",
};

export default definition;
