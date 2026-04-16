import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "tdd-planner",
	description:
		"Designs solutions as testable behaviors. Explores the codebase and produces a behavior-driven plan with expected test cases, not implementation details.",
	capabilities: [
		"core",
		"engineering-discipline",
		"architectural-design",
		"coding-readonly",
		"spawning",
	],
	model: "anthropic/claude-opus-4-7",
	tools: "readonly",
	extensions: ["tasks", "plans", "orchestration"],
	skills: ["pi", "plan", "tdd"],
	subagents: [
		"task-manager",
		"tdd-coordinator",
		"test-writer",
		"explorer",
		"verifier",
	],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "high",
};

export default definition;
