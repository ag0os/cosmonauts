/**
 * Tests for chain-parser.ts
 * Covers pipeline parsing, loop detection from role lifecycle,
 * unknown roles, whitespace handling, error cases, and completionCheck absence.
 */

import { describe, expect, test } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
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

		test("quality-manager gets loop: false", () => {
			const stages = parseChain("quality-manager");

			expect(stages).toEqual([{ name: "quality-manager", loop: false }]);
		});

		test("reviewer gets loop: false", () => {
			const stages = parseChain("reviewer");

			expect(stages).toEqual([{ name: "reviewer", loop: false }]);
		});

		test("fixer gets loop: false", () => {
			const stages = parseChain("fixer");

			expect(stages).toEqual([{ name: "fixer", loop: false }]);
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
			expect(() => parseChain("planner -> coordinator:5 -> worker")).toThrow(
				/role:count.*no longer supported/,
			);
		});
	});

	describe("qualified names", () => {
		test("parses qualified names preserving domain/agent format", () => {
			const stages = parseChain("coding/planner -> coding/worker");

			expect(stages).toEqual([
				{ name: "coding/planner", loop: false },
				{ name: "coding/worker", loop: false },
			]);
		});

		test("lowercases qualified names", () => {
			const stages = parseChain("Coding/Planner -> Coding/Worker");

			expect(stages).toEqual([
				{ name: "coding/planner", loop: false },
				{ name: "coding/worker", loop: false },
			]);
		});

		test("mixes qualified and unqualified names", () => {
			const stages = parseChain("coding/planner -> coordinator");

			expect(stages).toEqual([
				{ name: "coding/planner", loop: false },
				{ name: "coordinator", loop: true },
			]);
		});

		test("does not reject / as deprecated syntax", () => {
			// "/" is not ":" — it should parse fine
			expect(() => parseChain("coding/planner -> coding/worker")).not.toThrow();
		});
	});

	describe("custom registry", () => {
		function makeDef(
			id: string,
			loop: boolean,
			domain?: string,
		): AgentDefinition {
			return {
				id,
				description: `Test ${id}`,
				capabilities: [],
				model: "test/model",
				tools: "none",
				extensions: [],
				projectContext: false,
				session: "ephemeral",
				loop,
				domain,
			};
		}

		test("uses provided registry for loop resolution", () => {
			const registry = new AgentRegistry([
				makeDef("alpha", true, "custom"),
				makeDef("beta", false, "custom"),
			]);

			const stages = parseChain("alpha -> beta", registry);

			expect(stages).toEqual([
				{ name: "alpha", loop: true },
				{ name: "beta", loop: false },
			]);
		});

		test("resolves qualified names against custom registry", () => {
			const registry = new AgentRegistry([makeDef("runner", true, "ops")]);

			const stages = parseChain("ops/runner", registry);

			expect(stages).toEqual([{ name: "ops/runner", loop: true }]);
		});

		test("uses domain context to resolve ambiguous unqualified names", () => {
			const registry = new AgentRegistry([
				makeDef("planner", false, "coding"),
				makeDef("planner", true, "docs"),
			]);

			const stages = parseChain("planner", registry, "docs");

			expect(stages).toEqual([{ name: "planner", loop: true }]);
		});

		test("falls back to loop: false for names not in custom registry", () => {
			const registry = new AgentRegistry([]);

			const stages = parseChain("unknown-agent", registry);

			expect(stages).toEqual([{ name: "unknown-agent", loop: false }]);
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
