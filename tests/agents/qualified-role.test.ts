import { describe, expect, it } from "vitest";
import {
	qualifyRole,
	splitRole,
	unqualifyRole,
} from "../../lib/agents/qualified-role.ts";

// ============================================================================
// qualifyRole
// ============================================================================

describe("qualifyRole", () => {
	it("qualifies an id with a domain", () => {
		expect(qualifyRole("worker", "alpha")).toBe("alpha/worker");
	});

	it("returns the id as-is when domain is omitted", () => {
		expect(qualifyRole("worker")).toBe("worker");
	});

	it("returns the id as-is when domain is undefined", () => {
		expect(qualifyRole("planner", undefined)).toBe("planner");
	});

	it("handles hyphenated ids", () => {
		expect(qualifyRole("task-manager", "alpha")).toBe("alpha/task-manager");
	});
});

// ============================================================================
// unqualifyRole
// ============================================================================

describe("unqualifyRole", () => {
	it("strips the domain prefix from a qualified role", () => {
		expect(unqualifyRole("alpha/worker")).toBe("worker");
	});

	it("returns an unqualified role unchanged", () => {
		expect(unqualifyRole("worker")).toBe("worker");
	});

	it("handles deeply nested paths by stripping up to the last slash", () => {
		expect(unqualifyRole("a/b/worker")).toBe("worker");
	});

	it("handles hyphenated roles", () => {
		expect(unqualifyRole("alpha/quality-manager")).toBe("quality-manager");
	});
});

// ============================================================================
// splitRole
// ============================================================================

describe("splitRole", () => {
	it("splits a qualified role into domain and id", () => {
		expect(splitRole("alpha/worker")).toEqual({
			domain: "alpha",
			id: "worker",
		});
	});

	it("returns undefined domain for an unqualified role", () => {
		expect(splitRole("worker")).toEqual({
			domain: undefined,
			id: "worker",
		});
	});

	it("splits on the first slash only", () => {
		expect(splitRole("alpha/sub/worker")).toEqual({
			domain: "alpha",
			id: "sub/worker",
		});
	});

	it("handles hyphenated ids", () => {
		expect(splitRole("alpha/task-manager")).toEqual({
			domain: "alpha",
			id: "task-manager",
		});
	});
});

// ============================================================================
// roleToConfigKey
// ============================================================================
