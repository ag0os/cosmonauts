import { normalizeChain } from "../../lib/orchestration/chain-normalization.ts";
import { withCodingChain } from "../helpers/coding-chain.ts";
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
			const stages = parseChain("planner");

			expect(stages).toEqual([{ name: "planner" }]);
		});

		test("parses two stages separated by ->", () => {
			const stages = parseChain("planner -> worker");

			expect(stages).toEqual([{ name: "planner" }, { name: "worker" }]);
		});

		test("parses three stages separated by ->", () => {
			const stages = parseChain("planner -> task-manager -> coordinator");

			expect(stages).toEqual([
				{ name: "planner" },
				{ name: "task-manager" },
				{ name: "coordinator" },
			]);
		});

		test("lowercases stage names", () => {
			const stages = parseChain("Planner -> WORKER -> Task-Manager");

			expect(stages).toEqual([
				{ name: "planner" },
				{ name: "worker" },
				{ name: "task-manager" },
			]);
		});
	});

	describe("loop detection from role", () => {
		test("coordinator gets loop: true", () => {
			const stages = normalizeForTest("coordinator", defaultRegistry);

			expect(stages).toMatchObject([{ name: "coordinator", loop: true }]);
		});

		test("planner gets loop: false", () => {
			const stages = normalizeForTest("planner", defaultRegistry);

			expect(stages).toMatchObject([{ name: "planner", loop: false }]);
		});

		test("worker gets loop: false", () => {
			const stages = normalizeForTest("worker", defaultRegistry);

			expect(stages).toMatchObject([{ name: "worker", loop: false }]);
		});

		test("task-manager gets loop: false", () => {
			const stages = normalizeForTest("task-manager", defaultRegistry);

			expect(stages).toMatchObject([{ name: "task-manager", loop: false }]);
		});

		test("quality-manager gets loop: false", () => {
			const stages = normalizeForTest("quality-manager", defaultRegistry);

			expect(stages).toMatchObject([{ name: "quality-manager", loop: false }]);
		});

		test("reviewer gets loop: false", () => {
			const stages = normalizeForTest("reviewer", defaultRegistry);

			expect(stages).toMatchObject([{ name: "reviewer", loop: false }]);
		});

		test("fixer gets loop: false", () => {
			const stages = normalizeForTest("fixer", defaultRegistry);

			expect(stages).toMatchObject([{ name: "fixer", loop: false }]);
		});
	});

	describe("unknown roles", () => {
		test("unknown role gets loop: false", () => {
			const stages = parseChain("custom-agent");

			expect(stages).toEqual([{ name: "custom-agent" }]);
		});

		test("unknown role in pipeline gets loop: false", () => {
			const stages = parseChain("planner -> reviewer -> coordinator");

			expect(stages).toEqual([
				{ name: "planner" },
				{ name: "reviewer" },
				{ name: "coordinator" },
			]);
		});
	});

	describe("whitespace handling", () => {
		test("handles extra whitespace around stages and arrows", () => {
			const stages = parseChain("  planner  ->  coordinator  ");

			expect(stages).toEqual([{ name: "planner" }, { name: "coordinator" }]);
		});

		test("handles no spaces around arrows", () => {
			const stages = parseChain("planner->coordinator");

			expect(stages).toEqual([{ name: "planner" }, { name: "coordinator" }]);
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

		test("throws on missing closing bracket", () => {
			expect(() => parseChain("[planner, reviewer")).toThrow(
				/Unmatched opening bracket/,
			);
		});

		test("throws on stray closing bracket", () => {
			expect(() => parseChain("planner] -> worker")).toThrow(
				/Unmatched closing bracket/,
			);
		});
	});

	describe("qualified names", () => {
		test("parses qualified names preserving domain/agent format", () => {
			const stages = parseChain("coding/planner -> coding/worker");

			expect(stages).toEqual([
				{ name: "coding/planner" },
				{ name: "coding/worker" },
			]);
		});

		test("lowercases qualified names", () => {
			const stages = parseChain("Coding/Planner -> Coding/Worker");

			expect(stages).toEqual([
				{ name: "coding/planner" },
				{ name: "coding/worker" },
			]);
		});

		test("mixes qualified and unqualified names", () => {
			const stages = parseChain("coding/planner -> coordinator");

			expect(stages).toEqual([
				{ name: "coding/planner" },
				{ name: "coordinator" },
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

			const stages = normalizeForTest("alpha -> beta", registry);

			expect(stages).toMatchObject([
				{ name: "alpha", loop: true },
				{ name: "beta", loop: false },
			]);
		});

		test("resolves qualified names against custom registry", () => {
			const registry = new AgentRegistry([makeDef("runner", true, "ops")]);

			const stages = normalizeForTest("ops/runner", registry);

			expect(stages).toMatchObject([{ name: "ops/runner", loop: true }]);
		});

		test("uses domain context to resolve ambiguous unqualified names", () => {
			const registry = new AgentRegistry([
				makeDef("planner", false, "coding"),
				makeDef("planner", true, "docs"),
			]);

			const stages = normalizeForTest("planner", registry, "docs");

			expect(stages).toMatchObject([{ name: "planner", loop: true }]);
		});

		test("normalization refuses names absent from the declaration collection", () => {
			expect(() =>
				normalizeForTest("unknown-agent", new AgentRegistry([])),
			).toThrow("Unknown agent role");
		});

		test("uses requester domain separately from default context for internal visibility", () => {
			const registry = new AgentRegistry([makeDef("secret", false, "target")], {
				internalAgentsByDomain: new Map([["target", new Set(["secret"])]]),
			});

			expect(() =>
				normalizeForTest("secret", registry, "target", "main"),
			).toThrow(
				'Agent "secret" is internal to domain "target" and is not visible from domain "main".',
			);
		});

		test("allows same-domain requester to use internal stages through default context", () => {
			const registry = new AgentRegistry([makeDef("secret", true, "target")], {
				internalAgentsByDomain: new Map([["target", new Set(["secret"])]]),
			});

			const stages = normalizeForTest("secret", registry, "target", "target");

			expect(stages).toMatchObject([{ name: "secret", loop: true }]);
		});
	});

	describe("completionCheck", () => {
		test("parser does not set completionCheck on stages", () => {
			const stages = parseChain("planner -> coordinator");

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
			const steps = parseChain("reviewer[3]");

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
				expect(s.loop).toBeUndefined();
			}
		});

		test("fan-out with count 1 produces a ParallelGroupStep with 1 stage", () => {
			const steps = parseChain("reviewer[1]");

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
			expect(() => parseChain("reviewer[10]")).not.toThrow();
		});

		test("fan-out lowercases the role name", () => {
			const steps = parseChain("Reviewer[2]");

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
			const steps = parseChain("coordinator -> reviewer[3]");

			expect(steps).toHaveLength(2);
			expect(steps[0]).toEqual({ name: "coordinator" });
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
			expect(() => parseChain("reviewer[0]")).toThrow(
				/count.*between 1 and 10/,
			);
		});

		test("rejects fan-out with count 11", () => {
			expect(() => parseChain("reviewer[11]")).toThrow(
				/count.*between 1 and 10/,
			);
		});

		test("rejects loop stage in fan-out", () => {
			expect(() => normalizeForTest("coordinator[2]", defaultRegistry)).toThrow(
				/Loop stage/,
			);
		});
	});

	describe("bracket group parsing", () => {
		test("parses [a, b] into a ParallelGroupStep with syntax.kind='group'", () => {
			const steps = parseChain("[planner, reviewer]");

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
			const steps = parseChain("[planner, task-manager, reviewer]");

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
			const steps = parseChain("[Planner, Reviewer]");

			const step =
				steps[0] as import("../../lib/orchestration/types.ts").ParallelGroupStep;
			expect(step.stages.map((s) => s.name)).toEqual(["planner", "reviewer"]);
		});

		test("bracket group in a mixed chain", () => {
			const steps = parseChain(
				"planner -> [task-manager, reviewer] -> coordinator",
			);

			expect(steps).toHaveLength(3);
			expect(steps[0]).toEqual({ name: "planner" });
			const group =
				steps[1] as import("../../lib/orchestration/types.ts").ParallelGroupStep;
			expect(group.kind).toBe("parallel");
			expect(group.syntax).toEqual({ kind: "group" });
			expect(steps[2]).toEqual({ name: "coordinator" });
		});

		test("rejects empty bracket group []", () => {
			expect(() => parseChain("[]")).toThrow(/[Ee]mpty.*group/);
		});

		test("rejects single-member bracket group", () => {
			expect(() => parseChain("[planner]")).toThrow();
		});

		test("rejects loop stage inside bracket group", () => {
			expect(() =>
				normalizeForTest("[planner, coordinator]", defaultRegistry),
			).toThrow(/Loop stage.*parallel/i);
		});

		test("rejects nested bracket group", () => {
			expect(() => parseChain("[[planner, reviewer], task-manager]")).toThrow(
				/[Nn]ested/i,
			);
		});

		test("rejects fan-out inside bracket group", () => {
			expect(() => parseChain("[planner, reviewer[2]]")).toThrow(
				/[Ff]an-out.*bracket/i,
			);
		});

		test("rejects role:count inside bracket group", () => {
			expect(() => parseChain("[planner, reviewer:2]")).toThrow(
				/role:count.*no longer supported/i,
			);
		});
	});
});

function normalizeForTest(
	expression: string,
	registry: AgentRegistry,
	domainContext?: string,
	requesterDomain = domainContext,
) {
	const result = normalizeChain(
		withCodingChain({
			steps: parseChain(expression),
			projectRoot: "/tmp",
			registry,
			domainContext,
			requesterDomain,
		}),
	);
	if (!result.ok)
		throw new Error(result.errors.map((error) => error.message).join("\n"));
	return result.stages;
}
