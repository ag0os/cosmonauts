import { qualifyAgentId } from "../agents/runtime-identity.ts";
import type { SessionPolicy } from "../agents/session-policy.ts";
import type { AgentDefinition } from "../agents/types.ts";
import { ANALYSIS_TOOL_NAMES } from "../analysis/types.ts";

export type QualityReviewProfile = "manager" | "reviewer";

const reviewTools = new Set(["read", "grep", "find", "ls"]);
const managerTools = new Set([
	...reviewTools,
	...ANALYSIS_TOOL_NAMES,
	"spawn_agent",
]);

/** Host-owned allowlist applied after extensions and definition tools resolve. */
export function enforceQualityReviewProfile(
	resolvedTools: readonly string[],
	profile: QualityReviewProfile,
): string[] {
	const allowed = profile === "manager" ? managerTools : reviewTools;
	const effective = resolvedTools.filter((name) => allowed.has(name));
	for (const name of effective) {
		if (/^(bash|edit|write|chain_run|drive_|task_|plan_)/.test(name))
			throw new Error(`Unsafe quality review tool: ${name}`);
	}
	return effective;
}

/** The existing coding review policy, selected by the host rather than by library identity checks. */
export function qualityReviewPolicyFor(
	def: AgentDefinition,
	child = false,
): SessionPolicy | undefined {
	const profile: QualityReviewProfile | undefined =
		qualifyAgentId(def.id, def.domain) === "coding/quality-manager"
			? "manager"
			: child
				? "reviewer"
				: undefined;
	if (
		child &&
		![
			"reviewer",
			"security-reviewer",
			"performance-reviewer",
			"ux-reviewer",
		].includes(def.id)
	)
		throw new Error(`Quality review child role is forbidden: ${def.id}`);
	return profile
		? {
				toolPreset: "readonly",
				filterTools: (tools) => enforceQualityReviewProfile(tools, profile),
			}
		: undefined;
}
