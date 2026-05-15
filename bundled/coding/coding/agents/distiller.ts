import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "distiller",
	description:
		"Reads plan artifacts and session transcripts, then produces structured KnowledgeBundle JSONL files for future SQLite + vector embedding ingestion.",
	capabilities: ["healthy-codebase-harness", "coding-readonly"],
	model: "openai-codex/gpt-5.5",
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
