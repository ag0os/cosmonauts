import type { AgentDefinition } from "../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "cosmo",
	description:
		"Personal assistant — helps with the user's files, email, calendar, notes, and general work; aware of other Cosmonauts domains and can pull in specialists when the work warrants it.",
	capabilities: ["tasks", "spawning", "todo", "drive"],
	model: "anthropic/claude-opus-4-7",
	tools: "none",
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
		"coding/coordinator",
		"coding/distiller",
		"coding/explorer",
		"coding/fixer",
		"coding/integration-verifier",
		"coding/performance-reviewer",
		"coding/plan-reviewer",
		"coding/planner",
		"coding/quality-manager",
		"coding/refactorer",
		"coding/reviewer",
		"coding/security-reviewer",
		"coding/spec-writer",
		"coding/task-manager",
		"coding/ux-reviewer",
		"coding/verifier",
		"coding/worker",
	],
	projectContext: true,
	session: "persistent",
	loop: false,
};

export default definition;
