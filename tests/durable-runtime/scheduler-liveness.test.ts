import { describe, test } from "vitest";

describe("durable scheduler liveness contract", () => {
	// @cosmo-behavior plan:execution-liveness#B-001
	test.todo("rejects terminal writes from an attempt that lost ownership");

	// @cosmo-behavior plan:execution-liveness#B-002
	test.todo("renews and reclaims only the current unsuperseded token");

	// @cosmo-behavior plan:execution-liveness#B-003
	test.todo("keeps ownership heartbeat separate from useful activity");

	// @cosmo-behavior plan:execution-liveness#B-004
	test.todo("cancels a silent attempt after its idle deadline");

	// @cosmo-behavior plan:execution-liveness#B-005
	test.todo("keeps an active attempt alive beyond the idle window");

	// @cosmo-behavior plan:execution-liveness#B-006
	test.todo("blocks safely when bounded cancellation cannot be confirmed");

	// @cosmo-behavior plan:execution-liveness#B-013
	test.todo("claims attempts atomically under a crash-safe step lock");

	// @cosmo-behavior plan:execution-liveness#B-014
	test.todo("keeps terminal step states absorbing after late results");

	// @cosmo-behavior plan:execution-liveness#B-015
	test.todo("allocates unique event sequences across store instances");

	// @cosmo-behavior plan:execution-liveness#B-016
	test.todo("confirms cancellation only after the attempt result settles");

	// @cosmo-behavior plan:execution-liveness#B-017
	test.todo("rebases idle time after a recorded host clock discontinuity");

	// @cosmo-behavior plan:execution-liveness#B-018
	test.todo("terminalizes a run when no remaining step can become runnable");

	// @cosmo-behavior plan:execution-liveness#B-020
	test.todo("reports shadow deadline outcomes without cancelling attempts");

	// @cosmo-behavior plan:execution-liveness#B-021
	test.todo(
		"quarantines an expired unowned attempt without starting a replacement",
	);
});
