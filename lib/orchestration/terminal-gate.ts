import type { ChainStage, TerminalGateContext } from "./types.ts";

/** Both execution paths forward the same raw prompt and host plan context. */
export function buildTerminalGateContext(options: {
	stage: ChainStage;
	projectRoot: string;
	terminalGateContext?: unknown;
	completionLabel?: string;
	planSlug?: string;
	signal?: AbortSignal;
}): TerminalGateContext {
	return {
		hostContext: options.terminalGateContext,
		stage: options.stage,
		prompt: options.stage.prompt,
		projectRoot: options.projectRoot,
		planSlug: options.stage.expectedPlanSlug ?? options.planSlug,
		completionLabel: options.completionLabel,
		configuredPlanSlug: options.planSlug,
		signal: options.signal,
	};
}
