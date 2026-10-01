import type { AgentDefinition } from "../../../lib/agents/types.ts";
import { LEAN_SKILLS } from "../agent-skills.ts";

const definition: AgentDefinition = {
	id: "builder",
	description:
		"Implements one plan section or one direct fix test-first from a context pack, and hands back the diff with an envelope.",
	capabilities: [],
	model: "openai-codex/gpt-6-sol",
	thinkingLevel: "high",
	tools: "coding",
	extensions: ["health-hook", "role-guard"],
	skills: LEAN_SKILLS,
	subagents: [],
	projectContext: false,
	session: "ephemeral",
	loop: false,
};

export default definition;
