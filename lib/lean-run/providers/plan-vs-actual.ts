import { planVersusActual } from "../graph/plan-vs-actual.ts";
import type { Signal, SignalContext, SignalProvider } from "../types.ts";

/** Informs the reviewer (ruling D-4: never re-enters); unplanned files are input, not failure. */
export const planVersusActualProvider: SignalProvider = {
	kind: "plan-vs-actual",
	async run(ctx: SignalContext): Promise<Signal> {
		const result = planVersusActual({
			plan: ctx.plan,
			touched: ctx.envelope.touched ?? [],
			diffFiles: ctx.changedFiles,
		});
		return {
			kind: "plan-vs-actual",
			status: "info",
			summary: `Plan versus actual: ${result.planned.length} planned, ${result.unplanned.length} unplanned, ${result.untouched.length} untouched.`,
			data: result,
			reenter: false,
		};
	},
};
