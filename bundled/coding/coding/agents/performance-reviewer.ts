import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "performance-reviewer",
	description:
		"Performance-focused plan review. Looks for algorithmic hotspots, N+1 queries, missing indexes, unbounded memory, chatty I/O, and scaling cliffs. Does not redesign.",
	capabilities: [
		"core",
		"engineering-discipline",
		"architectural-design",
		"coding-readonly",
	],
	model: "openai-codex/gpt-5.5",
	tools: "coding",
	extensions: ["plans"],
	skills: ["pi", "plan", "engineering-principles"],
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "high",
};

export default definition;
