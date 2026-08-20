import type { AgentDefinition } from "../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "distiller",
	description:
		"Reads plan artifacts and manifest-referenced transcripts, then writes attributable OKF proposals for human review.",
	capabilities: ["healthy-codebase-harness", "coding-readonly"],
	model: "openai-codex/gpt-5.6-sol",
	tools: "coding",
	extensions: [],
	skills: ["*"],
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "medium",
};

export default definition;
