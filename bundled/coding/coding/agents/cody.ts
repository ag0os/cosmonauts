import type { AgentDefinition } from "../../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "cody",
	description:
		"Coding-domain interactive partner. Pairs on code, brainstorms architecture, or conducts drive runs — and delegates to coding specialists when the work warrants it.",
	capabilities: [
		"engineering-discipline",
		"coding-readwrite",
		"tasks",
		"spawning",
		"todo",
		"drive",
	],
	model: "anthropic/claude-opus-4-7",
	tools: "coding",
	extensions: [
		"tasks",
		"plans",
		"orchestration",
		"todo",
		"init",
		"observability",
	],
	skills: ["*"],
	subagents: [
		"coordinator",
		"distiller",
		"explorer",
		"fixer",
		"integration-verifier",
		"performance-reviewer",
		"plan-reviewer",
		"planner",
		"quality-manager",
		"refactorer",
		"reviewer",
		"security-reviewer",
		"spec-writer",
		"task-manager",
		"ux-reviewer",
		"verifier",
		"worker",
	],
	projectContext: true,
	session: "persistent",
	loop: false,
};

export default definition;
