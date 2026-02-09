/**
 * Tests for chain-parser.ts
 * Covers pipeline parsing, loop parsing, combined expressions,
 * whitespace handling, error cases, and completionCheck absence.
 */

import { describe, expect, test } from "vitest";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";

describe("parseChain", () => {
	describe("pipeline parsing", () => {
		test("parses a single stage with default maxIterations", () => {
			const stages = parseChain("planner");

			expect(stages).toEqual([{ name: "planner", maxIterations: 1 }]);
		});

		test("parses two stages separated by ->", () => {
			const stages = parseChain("planner -> worker");

			expect(stages).toEqual([
				{ name: "planner", maxIterations: 1 },
				{ name: "worker", maxIterations: 1 },
			]);
		});

		test("parses three stages separated by ->", () => {
			const stages = parseChain("planner -> task-manager -> coordinator");

			expect(stages).toEqual([
				{ name: "planner", maxIterations: 1 },
				{ name: "task-manager", maxIterations: 1 },
				{ name: "coordinator", maxIterations: 1 },
			]);
		});

		test("lowercases stage names", () => {
			const stages = parseChain("Planner -> WORKER -> Task-Manager");

			expect(stages).toEqual([
				{ name: "planner", maxIterations: 1 },
				{ name: "worker", maxIterations: 1 },
				{ name: "task-manager", maxIterations: 1 },
			]);
		});
	});

	describe("loop parsing", () => {
		test("parses iteration count after colon", () => {
			const stages = parseChain("coordinator:20");

			expect(stages).toEqual([{ name: "coordinator", maxIterations: 20 }]);
		});

		test("parses iteration count of 1", () => {
			const stages = parseChain("coordinator:1");

			expect(stages).toEqual([{ name: "coordinator", maxIterations: 1 }]);
		});

		test("parses large iteration count", () => {
			const stages = parseChain("worker:100");

			expect(stages).toEqual([{ name: "worker", maxIterations: 100 }]);
		});
	});

	describe("combined pipeline and loop", () => {
		test("parses pipeline with loop on last stage", () => {
			const stages = parseChain("planner -> coordinator:5");

			expect(stages).toEqual([
				{ name: "planner", maxIterations: 1 },
				{ name: "coordinator", maxIterations: 5 },
			]);
		});

		test("parses three stages with loop on last stage", () => {
			const stages = parseChain("planner -> task-manager -> coordinator:20");

			expect(stages).toEqual([
				{ name: "planner", maxIterations: 1 },
				{ name: "task-manager", maxIterations: 1 },
				{ name: "coordinator", maxIterations: 20 },
			]);
		});
	});

	describe("whitespace handling", () => {
		test("handles extra whitespace around stages and arrows", () => {
			const stages = parseChain("  planner  ->  coordinator  ");

			expect(stages).toEqual([
				{ name: "planner", maxIterations: 1 },
				{ name: "coordinator", maxIterations: 1 },
			]);
		});

		test("handles no spaces around arrows", () => {
			const stages = parseChain("planner->coordinator");

			expect(stages).toEqual([
				{ name: "planner", maxIterations: 1 },
				{ name: "coordinator", maxIterations: 1 },
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

		test("throws on colon with no name", () => {
			expect(() => parseChain(":5")).toThrow();
		});

		test("throws on non-numeric iteration count", () => {
			expect(() => parseChain("coordinator:abc")).toThrow();
		});

		test("throws on zero iteration count", () => {
			expect(() => parseChain("coordinator:0")).toThrow();
		});

		test("throws on negative iteration count", () => {
			expect(() => parseChain("coordinator:-1")).toThrow();
		});
	});

	describe("completionCheck", () => {
		test("parser does not set completionCheck on stages", () => {
			const stages = parseChain("planner -> coordinator:5");

			for (const stage of stages) {
				expect(stage.completionCheck).toBeUndefined();
			}
		});
	});
});
