import type { SignalProvider } from "../types.ts";
import { createBlastRadiusProvider } from "./blast-radius.ts";
import { createDupesProvider } from "./dupes.ts";
import { createHealthProvider } from "./health.ts";
import { createMutationProvider } from "./mutation.ts";
import { planVersusActualProvider } from "./plan-vs-actual.ts";
import { createVerifyProvider } from "./verify.ts";

/**
 * The host's providers in the order the completion loop runs them
 * (brief section 4.7B): verification commands first, then the diff-scoped
 * facts the reviewer reads, and scoped mutation last so it can take its
 * test list from the blast-radius signal through `priorSignals`.
 */
export function createDefaultProviders(): SignalProvider[] {
	return [
		createVerifyProvider(),
		createHealthProvider(),
		createDupesProvider(),
		createBlastRadiusProvider(),
		planVersusActualProvider,
		createMutationProvider(),
	];
}
