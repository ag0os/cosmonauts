import type { AgentDefinition } from "../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	memory: {},
	id: "verifier",
	description:
		"Validates explicit claims against the codebase with structured pass/fail evidence. Runs checks but never writes code.",
	capabilities: [
		"framework-base",
		"healthy-codebase-harness",
		"coding-readonly",
	],
	model: "openai-codex/gpt-5.6-sol",
	tools: "verification",
	extensions: ["project-tools"],
	skills: ["*"],
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "high",
};

export default definition;
