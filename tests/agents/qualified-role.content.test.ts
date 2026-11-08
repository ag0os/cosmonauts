// Content acceptance retained until the corresponding deletion PR.
import { describe, expect, it } from "vitest";
import { roleToConfigKey } from "../../bundled/coding/chain-adapter.ts";

// ============================================================================
// qualifyRole
// ============================================================================

// ============================================================================
// unqualifyRole
// ============================================================================

// ============================================================================
// splitRole
// ============================================================================

// ============================================================================
// roleToConfigKey
// ============================================================================

describe("roleToConfigKey", () => {
	it.each([
		["planner", "planner"],
		["task-manager", "taskManager"],
		["coordinator", "coordinator"],
		["worker", "worker"],
		["quality-manager", "qualityManager"],
		["integration-verifier", "integrationVerifier"],
		["reviewer", "reviewer"],
		["fixer", "fixer"],
	])("maps unqualified '%s' to '%s'", (role, expected) => {
		expect(roleToConfigKey(role)).toBe(expected);
	});

	it("maps a qualified role by stripping the domain first", () => {
		expect(roleToConfigKey("alpha/task-manager")).toBe("taskManager");
		expect(roleToConfigKey("alpha/worker")).toBe("worker");
		expect(roleToConfigKey("alpha/integration-verifier")).toBe(
			"integrationVerifier",
		);
	});

	it("returns undefined for unknown roles", () => {
		expect(roleToConfigKey("unknown-agent")).toBeUndefined();
	});

	it("returns undefined for unknown qualified roles", () => {
		expect(roleToConfigKey("alpha/unknown-agent")).toBeUndefined();
	});
});
