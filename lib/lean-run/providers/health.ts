import {
	type ChangedFunctionsReport,
	type ResolveChangedFunctionsOptions,
	resolveChangedFunctions,
} from "../../code-health/changed-functions.ts";
import type { Signal, SignalContext, SignalProvider } from "../types.ts";

interface HealthProviderOptions {
	readonly resolve?: (
		options: ResolveChangedFunctionsOptions,
	) => Promise<ChangedFunctionsReport>;
	readonly fallowExecutable?: string;
}

/**
 * Complexity of every function the diff touches, now and at the run's base.
 * Always `info`: complexity informs the reviewer and never re-enters the
 * builder (ruling D-4). An analysis failure is reported, never thrown.
 */
export function createHealthProvider(
	options: HealthProviderOptions = {},
): SignalProvider {
	const resolve = options.resolve ?? resolveChangedFunctions;
	return {
		kind: "health",
		async run(ctx: SignalContext): Promise<Signal> {
			try {
				const report = await resolve({
					cwd: ctx.worktree,
					base: ctx.baseSha,
					...(options.fallowExecutable === undefined
						? {}
						: { fallowExecutable: options.fallowExecutable }),
					...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
				});
				return healthSignal(summarize(report), report);
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				return healthSignal(`health unavailable: ${reason}`, { error: reason });
			}
		},
	};
}

function summarize(report: ChangedFunctionsReport): string {
	const regressed = report.functions.filter((fn) => fn.regressed).length;
	return `${report.functions.length} changed functions, ${regressed} regressed`;
}

function healthSignal(summary: string, data: unknown): Signal {
	return { kind: "health", status: "info", summary, data, reenter: false };
}
