import type { SignalProvider } from "../types.ts";
import { createBlastRadiusProvider } from "./blast-radius.ts";
import { createBlastTestsProvider } from "./blast-tests.ts";
import { createDupesProvider } from "./dupes.ts";
import { createHealthProvider } from "./health.ts";
import { createMutationProvider } from "./mutation.ts";
import { planVersusActualProvider } from "./plan-vs-actual.ts";
import { createVerifyProvider } from "./verify.ts";

/**
 * The host's providers in the order the completion loop runs them
 * (brief section 4.7B): verification commands first, then the diff-scoped
 * facts the reviewer reads, the blast radius's tests right after the
 * blast radius, and scoped mutation last: both take their test list from
 * the blast-radius signal through `priorSignals`.
 */
export function createDefaultProviders(): SignalProvider[] {
	return [
		createVerifyProvider(),
		createHealthProvider(),
		createDupesProvider(),
		createBlastRadiusProvider(),
		createBlastTestsProvider(),
		planVersusActualProvider,
		createMutationProvider(),
	];
}
