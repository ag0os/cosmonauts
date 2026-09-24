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
