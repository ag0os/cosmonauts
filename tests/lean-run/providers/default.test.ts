import { describe, expect, test } from "vitest";
import { createDefaultProviders } from "../../../lib/lean-run/providers/default.ts";

describe("createDefaultProviders", () => {
	test("runs verification first and the diff-scoped facts after it", () => {
		expect(createDefaultProviders().map((provider) => provider.kind)).toEqual([
			"verify",
			"health",
			"dupes",
			"blast-radius",
			"blast-tests",
			"plan-vs-actual",
			"mutation",
		]);
	});
});
