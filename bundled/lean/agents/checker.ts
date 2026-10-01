import type { AgentDefinition } from "../../../lib/agents/types.ts";
import { LEAN_SKILLS } from "../agent-skills.ts";

const definition: AgentDefinition = {
	id: "checker",
	description:
		"Checks explicit claims by running commands and reading code, and reports pass or fail with evidence. Never edits.",
	capabilities: [],
	model: "openai-codex/gpt-5.6-sol",
	thinkingLevel: "high",
	tools: "verification",
	extensions: ["role-guard"],
	skills: LEAN_SKILLS,
	subagents: [],
	projectContext: false,
	session: "ephemeral",
	loop: false,
};

export default definition;
