import type { AgentDefinition } from "../../../lib/agents/types.ts";

const definition: AgentDefinition = {
	id: "cosmo",
	description:
		"Executive assistant and cross-domain orchestrator. Delegates directly to specialists and dispatches task fleets through driver primitives when available.",
	capabilities: ["core", "tasks", "spawning", "todo", "fleet"],
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
		"coding/adaptation-planner",
		"coding/behavior-reviewer",
		"coding/coordinator",
		"coding/distiller",
		"coding/explorer",
		"coding/fixer",
		"coding/implementer",
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
		"coding/tdd-coordinator",
		"coding/tdd-planner",
		"coding/test-writer",
		"coding/ux-reviewer",
		"coding/verifier",
		"coding/worker",
	],
	projectContext: true,
	session: "persistent",
	loop: false,
};

export default definition;
