import type { AgentDefinition } from "../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "quality-manager",
	description:
		"Runs one review-only quality pass and reports findings for caller-owned remediation.",
	capabilities: [
		"healthy-codebase-harness",
		"engineering-discipline",
		"spawning",
	],
	model: "openai-codex/gpt-5.6-sol",
	tools: "readonly",
	extensions: ["orchestration", "project-tools"],
	skills: ["*"],
	subagents: [
		"reviewer",
		"security-reviewer",
		"performance-reviewer",
		"ux-reviewer",
	],
	projectContext: true,
	session: "ephemeral",
	loop: false,
	thinkingLevel: "high",
};

export default definition;
