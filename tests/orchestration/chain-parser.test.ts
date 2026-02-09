/**
 * Tests for chain-parser.ts
 * Covers pipeline parsing, loop detection from role lifecycle,
 * unknown roles, whitespace handling, error cases, and completionCheck absence.
 */

import { describe, expect, test } from "vitest";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";

describe("parseChain", () => {
	describe("pipeline parsing", () => {
		test("parses a single stage", () => {
			const stages = parseChain("planner");

			expect(stages).toEqual([{ name: "planner", loop: false }]);
		});

		test("parses two stages separated by ->", () => {
			const stages = parseChain("planner -> worker");

			expect(stages).toEqual([
				{ name: "planner", loop: false },
				{ name: "worker", loop: false },
			]);
		});

		test("parses three stages separated by ->", () => {
			const stages = parseChain("planner -> task-manager -> coordinator");

			expect(stages).toEqual([
				{ name: "planner", loop: false },
				{ name: "task-manager", loop: false },
				{ name: "coordinator", loop: true },
			]);
		});

		test("lowercases stage names", () => {
			const stages = parseChain("Planner -> WORKER -> Task-Manager");

			expect(stages).toEqual([
				{ name: "planner", loop: false },
				{ name: "worker", loop: false },
				{ name: "task-manager", loop: false },
			]);
		});
	});

	describe("loop detection from role", () => {
		test("coordinator gets loop: true", () => {
			const stages = parseChain("coordinator");

			expect(stages).toEqual([{ name: "coordinator", loop: true }]);
		});

		test("planner gets loop: false", () => {
			const stages = parseChain("planner");

			expect(stages).toEqual([{ name: "planner", loop: false }]);
		});

		test("worker gets loop: false", () => {
			const stages = parseChain("worker");

			expect(stages).toEqual([{ name: "worker", loop: false }]);
		});

		test("task-manager gets loop: false", () => {
			const stages = parseChain("task-manager");

			expect(stages).toEqual([{ name: "task-manager", loop: false }]);
		});
	});

	describe("unknown roles", () => {
		test("unknown role gets loop: false", () => {
			const stages = parseChain("custom-agent");

			expect(stages).toEqual([{ name: "custom-agent", loop: false }]);
		});

		test("unknown role in pipeline gets loop: false", () => {
			const stages = parseChain("planner -> reviewer -> coordinator");

			expect(stages).toEqual([
				{ name: "planner", loop: false },
				{ name: "reviewer", loop: false },
				{ name: "coordinator", loop: true },
			]);
		});
	});

	describe("whitespace handling", () => {
		test("handles extra whitespace around stages and arrows", () => {
			const stages = parseChain("  planner  ->  coordinator  ");

			expect(stages).toEqual([
				{ name: "planner", loop: false },
				{ name: "coordinator", loop: true },
			]);
		});

		test("handles no spaces around arrows", () => {
			const stages = parseChain("planner->coordinator");

			expect(stages).toEqual([
				{ name: "planner", loop: false },
				{ name: "coordinator", loop: true },
			]);
		});
	});

	describe("error cases", () => {
		test("throws on empty string", () => {
			expect(() => parseChain("")).toThrow();
		});

		test("throws on whitespace-only string", () => {
			expect(() => parseChain("   ")).toThrow();
		});

		test("throws on empty first stage (leading ->)", () => {
			expect(() => parseChain("-> planner")).toThrow();
		});

		test("throws on empty last stage (trailing ->)", () => {
			expect(() => parseChain("planner ->")).toThrow();
		});

		test("rejects deprecated role:count syntax", () => {
			expect(() => parseChain("coordinator:20")).toThrow(
				/role:count.*no longer supported/,
			);
		});

		test("rejects role:count syntax in pipeline", () => {
			expect(() =>
				parseChain("planner -> coordinator:5 -> worker"),
			).toThrow(/role:count.*no longer supported/);
		});
	});

	describe("completionCheck", () => {
		test("parser does not set completionCheck on stages", () => {
			const stages = parseChain("planner -> coordinator");

			for (const stage of stages) {
				expect(stage.completionCheck).toBeUndefined();
			}
		});
	});
});
