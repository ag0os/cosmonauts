/**
 * Skills extension — discovers skills at session start, injects the skill
 * index into the system prompt, and provides a `skill_read` tool for
 * on-demand content loading.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { SkillInfo } from "../../lib/skills/index.ts";
import {
	discoverSkills,
	formatSkillIndex,
	readSkillContent,
	SKILLS_DIR,
} from "../../lib/skills/index.ts";

export default function skillsExtension(pi: ExtensionAPI): void {
	const skillMap = new Map<string, SkillInfo>();
	let indexText = "";

	// Discover skills when the session starts
	pi.on("session_start", async () => {
		try {
			const skills = await discoverSkills(SKILLS_DIR);
			for (const skill of skills) {
				skillMap.set(skill.name, skill);
			}
			indexText = formatSkillIndex(skills);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			console.error(`[skills] Failed to discover skills: ${message}`);
		}
	});

	// Inject skill index into the system prompt
	pi.on("before_agent_start", async (event) => {
		if (!indexText) return;
		return {
			systemPrompt: `${event.systemPrompt}\n\n${indexText}`,
		};
	});

	// skill_read tool — load full skill content on demand
	pi.registerTool({
		name: "skill_read",
		label: "Read Skill",
		description:
			"Load the full content of a skill by name. Use the skill index in your system prompt to see available skills.",
		parameters: Type.Object({
			name: Type.String({ description: "The skill name to load" }),
		}),
		execute: async (_toolCallId, params) => {
			const skill = skillMap.get(params.name);
			if (!skill) {
				const available = [...skillMap.keys()].sort().join(", ");
				return {
					content: [
						{
							type: "text" as const,
							text: `Unknown skill: "${params.name}". Available skills: ${available || "none"}`,
						},
					],
					details: undefined,
				};
			}

			const content = await readSkillContent(skill.filePath);
			return {
				content: [{ type: "text" as const, text: content }],
				details: undefined,
			};
		},
	});
}
