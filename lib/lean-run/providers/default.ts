import type { SignalProvider } from "../types.ts";
import { createBlastRadiusProvider } from "./blast-radius.ts";
import { createHealthProvider } from "./health.ts";
import { planVersusActualProvider } from "./plan-vs-actual.ts";
import { createVerifyProvider } from "./verify.ts";

/**
 * The host's providers in the order the completion loop runs them
 * (brief section 4.7B): verification commands first, then the diff-scoped
 * facts the reviewer reads. Later providers see earlier signals through
 * `priorSignals`.
 */
export function createDefaultProviders(): SignalProvider[] {
	return [
		createVerifyProvider(),
		createHealthProvider(),
		createBlastRadiusProvider(),
		planVersusActualProvider,
	];
}
