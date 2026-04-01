import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "cosmo",
	description:
		"Main coding assistant with orchestration capabilities. Delegates to sub-agents for complex workflows.",
	capabilities: [
		"core",
		"engineering-discipline",
		"coding-readwrite",
		"tasks",
		"spawning",
		"todo",
	],
	model: "anthropic/claude-opus-4-6",
	tools: "coding",
	extensions: [
		"tasks",
		"plans",
		"orchestration",
		"todo",
		"init",
		"observability",
	],
	skills: undefined,
	subagents: [
		"planner",
		"adaptation-planner",
		"task-manager",
		"coordinator",
		"worker",
		"quality-manager",
		"reviewer",
		"fixer",
	],
	projectContext: true,
	session: "persistent",
	loop: false,
};

export default definition;
