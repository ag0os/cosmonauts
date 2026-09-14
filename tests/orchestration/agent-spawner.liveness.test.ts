import { describe, test } from "vitest";

describe("Pi spawn liveness and evidence", () => {
	// @cosmo-behavior plan:execution-liveness#B-008
	test.todo("persists an attempt-scoped session without a plan slug");

	// @cosmo-behavior plan:execution-liveness#B-009
	test.todo(
		"normalizes streaming and descendant activity for the owning attempt",
	);

	// @cosmo-behavior plan:execution-liveness#B-010
	test.todo("propagates parent cancellation through detached descendants");

	// @cosmo-behavior plan:execution-liveness#B-011
	test.todo("removes abandoned waiters without cancelling healthy children");
});
