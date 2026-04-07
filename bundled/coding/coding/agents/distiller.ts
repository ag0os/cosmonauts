import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "distiller",
	description:
		"Reads plan artifacts and session transcripts, then produces structured KnowledgeBundle JSONL files for future SQLite + vector embedding ingestion.",
	capabilities: ["core", "coding-readonly"],
	model: "anthropic/claude-sonnet-4-6",
	tools: "coding",
	extensions: [],
	skills: ["archive"],
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
};

export default definition;
