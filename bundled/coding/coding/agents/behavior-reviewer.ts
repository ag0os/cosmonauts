import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "behavior-reviewer",
	description:
		"Adversarial review of the active plan's ## Behaviors section. Verifies behavioral specifications against the architecture plan and codebase, then writes structured findings for TDD revision.",
	capabilities: [
		"core",
		"engineering-discipline",
		"architectural-design",
		"coding-readwrite",
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
