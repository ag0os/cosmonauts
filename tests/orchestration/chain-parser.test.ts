/**
 * Tests for chain-parser.ts
 * Covers pipeline parsing, loop detection from role lifecycle,
 * unknown roles, whitespace handling, error cases, completionCheck absence,
 * fan-out expansion, bracket groups, and validation.
 */

import { describe, expect, test } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";

/** Build a minimal agent definition for testing. */
function makeCodingDef(id: string, loop: boolean): AgentDefinition {
	return {
		id,
		description: `Test ${id}`,
		capabilities: [],
		model: "test/model",
		tools: "none",
		extensions: [],
		skills: ["*"],
		projectContext: false,
		session: "ephemeral",
		loop,
		domain: "coding",
	};
}

/** Test registry with the coding domain agents used across chain-parser tests. */
const defaultRegistry = new AgentRegistry([
	makeCodingDef("cody", false),
	makeCodingDef("planner", false),
	makeCodingDef("task-manager", false),
	makeCodingDef("coordinator", true),
	makeCodingDef("worker", false),
	makeCodingDef("quality-manager", false),
	makeCodingDef("reviewer", false),
	makeCodingDef("fixer", false),
]);

describe("parseChain", () => {
	describe("pipeline parsing", () => {
		test("parses a single stage", () => {
			const stages = parseChain("planner", defaultRegistry);

			expect(stages).toEqual([{ name: "planner", loop: false }]);
		});

		test("parses two stages separated by ->", () => {
			const stages = parseChain("planner -> worker", defaultRegistry);

			expect(stages).toEqual([
				{ name: "planner", loop: false },
				{ name: "worker", loop: false },
			]);
		});

		test("parses three stages separated by ->", () => {
			const stages = parseChain(
				"planner -> task-manager -> coordinator",
				defaultRegistry,
			);

			expect(stages).toEqual([
				{ name: "planner", loop: false },
				{ name: "task-manager", loop: false },
				{ name: "coordinator", loop: true },
			]);
		});

		test("lowercases stage names", () => {
			const stages = parseChain(
				"Planner -> WORKER -> Task-Manager",
				defaultRegistry,
			);

			expect(stages).toEqual([
				{ name: "planner", loop: false },
				{ name: "worker", loop: false },
				{ name: "task-manager", loop: false },
			]);
		});
	});

	describe("loop detection from role", () => {
		test("coordinator gets loop: true", () => {
			const stages = parseChain("coordinator", defaultRegistry);

			expect(stages).toEqual([{ name: "coordinator", loop: true }]);
		});

		test("planner gets loop: false", () => {
			const stages = parseChain("planner", defaultRegistry);

			expect(stages).toEqual([{ name: "planner", loop: false }]);
		});

		test("worker gets loop: false", () => {
			const stages = parseChain("worker", defaultRegistry);

			expect(stages).toEqual([{ name: "worker", loop: false }]);
		});

		test("task-manager gets loop: false", () => {
			const stages = parseChain("task-manager", defaultRegistry);

			expect(stages).toEqual([{ name: "task-manager", loop: false }]);
		});

		test("quality-manager gets loop: false", () => {
			const stages = parseChain("quality-manager", defaultRegistry);

			expect(stages).toEqual([{ name: "quality-manager", loop: false }]);
		});

		test("reviewer gets loop: false", () => {
			const stages = parseChain("reviewer", defaultRegistry);

			expect(stages).toEqual([{ name: "reviewer", loop: false }]);
		});

		test("fixer gets loop: false", () => {
			const stages = parseChain("fixer", defaultRegistry);

			expect(stages).toEqual([{ name: "fixer", loop: false }]);
		});
	});

	describe("unknown roles", () => {
		test("unknown role gets loop: false", () => {
			const stages = parseChain("custom-agent", defaultRegistry);

			expect(stages).toEqual([{ name: "custom-agent", loop: false }]);
		});

		test("unknown role in pipeline gets loop: false", () => {
			const stages = parseChain(
				"planner -> reviewer -> coordinator",
				defaultRegistry,
			);

			expect(stages).toEqual([
				{ name: "planner", loop: false },
				{ name: "reviewer", loop: false },
				{ name: "coordinator", loop: true },
			]);
		});
	});

	describe("whitespace handling", () => {
		test("handles extra whitespace around stages and arrows", () => {
			const stages = parseChain(
				"  planner  ->  coordinator  ",
				defaultRegistry,
			);

			expect(stages).toEqual([
				{ name: "planner", loop: false },
				{ name: "coordinator", loop: true },
			]);
		});

		test("handles no spaces around arrows", () => {
			const stages = parseChain("planner->coordinator", defaultRegistry);

			expect(stages).toEqual([
				{ name: "planner", loop: false },
				{ name: "coordinator", loop: true },
			]);
		});
	});

	describe("error cases", () => {
		test("throws on empty string", () => {
			expect(() => parseChain("", defaultRegistry)).toThrow();
		});

		test("throws on whitespace-only string", () => {
			expect(() => parseChain("   ", defaultRegistry)).toThrow();
		});

		test("throws on empty first stage (leading ->)", () => {
			expect(() => parseChain("-> planner", defaultRegistry)).toThrow();
		});

		test("throws on empty last stage (trailing ->)", () => {
			expect(() => parseChain("planner ->", defaultRegistry)).toThrow();
		});

		test("rejects deprecated role:count syntax", () => {
			expect(() => parseChain("coordinator:20", defaultRegistry)).toThrow(
				/role:count.*no longer supported/,
			);
		});

		test("rejects role:count syntax in pipeline", () => {
			expect(() =>
				parseChain("planner -> coordinator:5 -> worker", defaultRegistry),
			).toThrow(/role:count.*no longer supported/);
		});

		test("throws on missing closing bracket", () => {
			expect(() => parseChain("[planner, reviewer", defaultRegistry)).toThrow(
				/Unmatched opening bracket/,
			);
		});

		test("throws on stray closing bracket", () => {
			expect(() => parseChain("planner] -> worker", defaultRegistry)).toThrow(
				/Unmatched closing bracket/,
			);
		});
	});

	describe("qualified names", () => {
		test("parses qualified names preserving domain/agent format", () => {
			const stages = parseChain(
				"coding/planner -> coding/worker",
				defaultRegistry,
			);

			expect(stages).toEqual([
				{ name: "coding/planner", loop: false },
				{ name: "coding/worker", loop: false },
			]);
		});

		test("lowercases qualified names", () => {
			const stages = parseChain(
				"Coding/Planner -> Coding/Worker",
				defaultRegistry,
			);

			expect(stages).toEqual([
				{ name: "coding/planner", loop: false },
				{ name: "coding/worker", loop: false },
			]);
		});

		test("mixes qualified and unqualified names", () => {
			const stages = parseChain(
				"coding/planner -> coordinator",
				defaultRegistry,
			);

			expect(stages).toEqual([
				{ name: "coding/planner", loop: false },
				{ name: "coordinator", loop: true },
			]);
		});

		test("does not reject / as deprecated syntax", () => {
			// "/" is not ":" — it should parse fine
			expect(() =>
				parseChain("coding/planner -> coding/worker", defaultRegistry),
			).not.toThrow();
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
				skills: ["*"],
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
			const stages = parseChain("planner -> coordinator", defaultRegistry);

			for (const step of stages) {
				// Only sequential ChainStage nodes have completionCheck
				if (!("kind" in step)) {
					expect(step.completionCheck).toBeUndefined();
				}
			}
		});
	});

	describe("fan-out expansion", () => {
		test("expands role[n] into a ParallelGroupStep", () => {
			const steps = parseChain("reviewer[3]", defaultRegistry);

			expect(steps).toHaveLength(1);
			const step =
				steps[0] as import("../../lib/orchestration/types.ts").ParallelGroupStep;
			expect(step.kind).toBe("parallel");
			expect(step.syntax).toEqual({
				kind: "fanout",
				role: "reviewer",
				count: 3,
			});
			expect(step.stages).toHaveLength(3);
			for (const s of step.stages) {
				expect(s.name).toBe("reviewer");
				expect(s.loop).toBe(false);
			}
		});

		test("fan-out with count 1 produces a ParallelGroupStep with 1 stage", () => {
			const steps = parseChain("reviewer[1]", defaultRegistry);

			const step =
				steps[0] as import("../../lib/orchestration/types.ts").ParallelGroupStep;
			expect(step.kind).toBe("parallel");
			expect(step.stages).toHaveLength(1);
			expect(step.syntax).toEqual({
				kind: "fanout",
				role: "reviewer",
				count: 1,
			});
		});

		test("fan-out with count 10 is accepted", () => {
			expect(() => parseChain("reviewer[10]", defaultRegistry)).not.toThrow();
		});

		test("fan-out lowercases the role name", () => {
			const steps = parseChain("Reviewer[2]", defaultRegistry);

			const step =
				steps[0] as import("../../lib/orchestration/types.ts").ParallelGroupStep;
			expect(step.syntax).toEqual({
				kind: "fanout",
				role: "reviewer",
				count: 2,
			});
			for (const s of step.stages) {
				expect(s.name).toBe("reviewer");
			}
		});

		test("fan-out in a mixed chain", () => {
			const steps = parseChain("coordinator -> reviewer[3]", defaultRegistry);

			expect(steps).toHaveLength(2);
			expect(steps[0]).toEqual({ name: "coordinator", loop: true });
			const step =
				steps[1] as import("../../lib/orchestration/types.ts").ParallelGroupStep;
			expect(step.kind).toBe("parallel");
			expect(step.syntax).toEqual({
				kind: "fanout",
				role: "reviewer",
				count: 3,
			});
		});

		test("rejects fan-out with count 0", () => {
			expect(() => parseChain("reviewer[0]", defaultRegistry)).toThrow(
				/count.*between 1 and 10/,
			);
		});

		test("rejects fan-out with count 11", () => {
			expect(() => parseChain("reviewer[11]", defaultRegistry)).toThrow(
				/count.*between 1 and 10/,
			);
		});

		test("rejects loop stage in fan-out", () => {
			expect(() => parseChain("coordinator[2]", defaultRegistry)).toThrow(
				/Loop stage/,
			);
		});
	});

	describe("bracket group parsing", () => {
		test("parses [a, b] into a ParallelGroupStep with syntax.kind='group'", () => {
			const steps = parseChain("[planner, reviewer]", defaultRegistry);

			expect(steps).toHaveLength(1);
			const step =
				steps[0] as import("../../lib/orchestration/types.ts").ParallelGroupStep;
			expect(step.kind).toBe("parallel");
			expect(step.syntax).toEqual({ kind: "group" });
			expect(step.stages).toHaveLength(2);
			expect(step.stages[0]?.name).toBe("planner");
			expect(step.stages[1]?.name).toBe("reviewer");
		});

		test("parses three-member bracket group", () => {
			const steps = parseChain(
				"[planner, task-manager, reviewer]",
				defaultRegistry,
			);

			const step =
				steps[0] as import("../../lib/orchestration/types.ts").ParallelGroupStep;
			expect(step.stages).toHaveLength(3);
			expect(step.stages.map((s) => s.name)).toEqual([
				"planner",
				"task-manager",
				"reviewer",
			]);
		});

		test("lowercases member names in bracket group", () => {
			const steps = parseChain("[Planner, Reviewer]", defaultRegistry);

			const step =
				steps[0] as import("../../lib/orchestration/types.ts").ParallelGroupStep;
			expect(step.stages.map((s) => s.name)).toEqual(["planner", "reviewer"]);
		});

		test("bracket group in a mixed chain", () => {
			const steps = parseChain(
				"planner -> [task-manager, reviewer] -> coordinator",
				defaultRegistry,
			);

			expect(steps).toHaveLength(3);
			expect(steps[0]).toEqual({ name: "planner", loop: false });
			const group =
				steps[1] as import("../../lib/orchestration/types.ts").ParallelGroupStep;
			expect(group.kind).toBe("parallel");
			expect(group.syntax).toEqual({ kind: "group" });
			expect(steps[2]).toEqual({ name: "coordinator", loop: true });
		});

		test("rejects empty bracket group []", () => {
			expect(() => parseChain("[]", defaultRegistry)).toThrow(
				/[Ee]mpty.*group/,
			);
		});

		test("rejects single-member bracket group", () => {
			expect(() => parseChain("[planner]", defaultRegistry)).toThrow();
		});

		test("rejects loop stage inside bracket group", () => {
			expect(() =>
				parseChain("[planner, coordinator]", defaultRegistry),
			).toThrow(/Loop stage.*parallel/i);
		});

		test("rejects nested bracket group", () => {
			expect(() =>
				parseChain("[[planner, reviewer], task-manager]", defaultRegistry),
			).toThrow(/[Nn]ested/i);
		});

		test("rejects fan-out inside bracket group", () => {
			expect(() =>
				parseChain("[planner, reviewer[2]]", defaultRegistry),
			).toThrow(/[Ff]an-out.*bracket/i);
		});

		test("rejects role:count inside bracket group", () => {
			expect(() =>
				parseChain("[planner, reviewer:2]", defaultRegistry),
			).toThrow(/role:count.*no longer supported/i);
		});
	});
});
