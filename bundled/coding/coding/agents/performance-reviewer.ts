import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "performance-reviewer",
	description:
		"Performance-lens review of code diffs — algorithmic hotspots, N+1 queries, missing indexes, unbounded memory, chatty I/O, scaling cliffs, missing instrumentation. Part of the quality-manager's review panel. Does not redesign or implement fixes.",
	capabilities: [
		"healthy-codebase-harness",
		"engineering-discipline",
		"coding-readonly",
	],
	model: "openai-codex/gpt-5.5",
	tools: "coding",
	extensions: [],
	skills: ["*"],
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "high",
};

export default definition;
