import type { AgentDefinition } from "../../../lib/agents/types.ts";
import { LEAN_SKILLS } from "../agent-skills.ts";

const definition: AgentDefinition = {
	id: "lead",
	description:
		"Lean-domain interactive engineer. Decides the tier (direct, plan, spec + plan), writes the contract documents with the user, and starts the build and review chains.",
	capabilities: [],
	model: "openai-codex/gpt-5.6-sol",
	thinkingLevel: "xhigh",
	tools: "coding",
	extensions: ["orchestration"],
	skills: LEAN_SKILLS,
	subagents: ["lean/builder", "lean/code-reviewer", "lean/checker"],
	projectContext: true,
	session: "persistent",
	loop: false,
};

export default definition;
