import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "planner",
	description:
		"Designs the technical architecture and testable behaviors for a feature — module structure, contracts, integration seams, behavior specs, implementation order. Test-first by default; adaptation mode studies a reference codebase. Never writes code or creates tasks.",
	capabilities: [
		"healthy-codebase-harness",
		"engineering-discipline",
		"architectural-design",
		"coding-readonly",
		"spawning",
	],
	model: "openai-codex/gpt-5.5",
	tools: "readonly",
	extensions: ["plans", "orchestration"],
	skills: [
		"pi",
		"plan",
		"engineering-principles",
		"design-dialogue",
		"tdd",
		"reference-adaptation",
	],
	subagents: [
		"task-manager",
		"plan-reviewer",
		"explorer",
		"verifier",
		"worker",
		"spec-writer",
	],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "xhigh",
};

export default definition;
