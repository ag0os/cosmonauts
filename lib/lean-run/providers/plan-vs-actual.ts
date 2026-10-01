import { normalizeRepoPaths } from "../graph/paths.ts";
import { planVersusActual } from "../graph/plan-vs-actual.ts";
import type { Signal, SignalContext, SignalProvider } from "../types.ts";

/**
 * Informs the reviewer (ruling D-4: never re-enters); unplanned files are
 * input, not failure. Without a plan document (a direct request, a review)
 * there is nothing to compare: every list is empty and `changed` lists the
 * changed files.
 */
export const planVersusActualProvider: SignalProvider = {
	kind: "plan-vs-actual",
	async run(ctx: SignalContext): Promise<Signal> {
		const touched = ctx.envelope.touched ?? [];
		if (ctx.tier !== undefined && ctx.tier !== "plan") {
			const changed = normalizeRepoPaths([...touched, ...ctx.changedFiles]);
			return info(
				`Plan versus actual: ${ctx.tier} tier: no plan; ${changed.length} changed.`,
				{ planned: [], unplanned: [], untouched: [], changed },
			);
		}
		const result = planVersusActual({
			plan: ctx.plan,
			touched,
			diffFiles: ctx.changedFiles,
		});
		return info(
			`Plan versus actual: ${result.planned.length} planned, ${result.unplanned.length} unplanned, ${result.untouched.length} untouched.`,
			result,
		);
	},
};

function info(summary: string, data: object): Signal {
	return {
		kind: "plan-vs-actual",
		status: "info",
		summary,
		data,
		reenter: false,
	};
}
