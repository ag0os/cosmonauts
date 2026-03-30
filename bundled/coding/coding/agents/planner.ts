import type { AgentDefinition } from "../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "planner",
	description:
		"Designs solutions by exploring the codebase and proposing approaches. Never writes code or creates tasks.",
	capabilities: [
		"core",
		"engineering-discipline",
		"architectural-design",
		"coding-readonly",
		"spawning",
	],
	model: "anthropic/claude-opus-4-6",
	tools: "readonly",
	extensions: ["plans", "orchestration"],
	skills: ["pi", "plan", "engineering-principles"],
	subagents: ["task-manager", "coordinator", "worker"],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "high",
};

export default definition;
