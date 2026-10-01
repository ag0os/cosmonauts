import type { AgentDefinition } from "../../../lib/agents/types.ts";
import { LEAN_SKILLS } from "../agent-skills.ts";

const definition: AgentDefinition = {
	id: "code-reviewer",
	description:
		"Reviews a change through the lenses it is given (general, security, performance, ux) and reports findings. Never edits.",
	capabilities: [],
	model: "openai-codex/gpt-5.6-sol",
	thinkingLevel: "xhigh",
	tools: "readonly",
	extensions: [],
	skills: LEAN_SKILLS,
	subagents: [],
	projectContext: false,
	session: "ephemeral",
	loop: false,
};

export default definition;
