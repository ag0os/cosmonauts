import type { AgentDefinition } from "../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "worker",
	description:
		"Implements a single task test-first. Loads relevant skills, writes code, checks off acceptance criteria.",
	capabilities: [
		"healthy-codebase-harness",
		"engineering-discipline",
		"coding-readwrite",
		"tasks",
	],
	model: "anthropic/claude-opus-5-5",
	tools: "coding",
	extensions: ["tasks", "project-tools", "architecture-memory"],
	skills: ["*"],
	subagents: [],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "high",
};

export default definition;
