import { describe, expect, test } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";
import { compileChainToGraph } from "../../lib/orchestration/durable-chain-compiler.ts";

const registry = new AgentRegistry([
	agent("planner"),
	agent("task-manager"),
	agent("quality-manager"),
	agent("reviewer"),
]);

describe("compileChainToGraph", () => {
	// @cosmo-behavior plan:durable-frontend-migration#B-001
	test("compiles sequential stages into a dependency chain", () => {
		const parsed = parseChain("planner -> reviewer", registry);

		const compiled = compileChainToGraph({
			runId: "run-chain-compiler-sequential",
			steps: parsed,
		});

		expect(compiled.graph.steps.map((step) => step.id)).toEqual([
			"chain-1-planner",
			"chain-2-reviewer",
		]);
		expect(compiled.graph.steps.map((step) => step.runId)).toEqual([
			"run-chain-compiler-sequential",
			"run-chain-compiler-sequential",
		]);
		expect(compiled.graph.steps.map((step) => step.dependsOn)).toEqual([
			[],
			["chain-1-planner"],
		]);
		expect(compiled.graph.edges).toEqual([
			{ from: "chain-1-planner", to: "chain-2-reviewer" },
		]);
		expectAgentSteps(compiled.graph.steps, ["planner", "reviewer"]);
	});

	// @cosmo-behavior plan:durable-frontend-migration#B-002
	test("compiles bracket groups as sibling steps and joins the next frontier", () => {
		const parsed = parseChain(
			"planner -> [task-manager, reviewer] -> quality-manager",
			registry,
		);

		const compiled = compileChainToGraph({
			runId: "run-chain-compiler-bracket",
			steps: parsed,
		});

		expect(compiled.graph.steps.map((step) => step.id)).toEqual([
			"chain-1-planner",
			"chain-2-1-task-manager",
			"chain-2-2-reviewer",
			"chain-3-quality-manager",
		]);
		expect(compiled.graph.steps.map((step) => step.dependsOn)).toEqual([
			[],
			["chain-1-planner"],
			["chain-1-planner"],
			["chain-2-1-task-manager", "chain-2-2-reviewer"],
		]);
		expect(compiled.graph.edges).toEqual([
			{ from: "chain-1-planner", to: "chain-2-1-task-manager" },
			{ from: "chain-1-planner", to: "chain-2-2-reviewer" },
			{ from: "chain-2-1-task-manager", to: "chain-3-quality-manager" },
			{ from: "chain-2-2-reviewer", to: "chain-3-quality-manager" },
		]);
		expectAgentSteps(compiled.graph.steps, [
			"planner",
			"task-manager",
			"reviewer",
			"quality-manager",
		]);
	});

	// @cosmo-behavior plan:durable-frontend-migration#B-003
	test("compiles fan-out as same-role sibling steps", () => {
		const parsed = parseChain(
			"planner -> reviewer[3] -> quality-manager",
			registry,
		);

		const compiled = compileChainToGraph({
			runId: "run-chain-compiler-fanout",
			steps: parsed,
		});

		expect(compiled.graph.steps.map((step) => step.id)).toEqual([
			"chain-1-planner",
			"chain-2-1-reviewer",
			"chain-2-2-reviewer",
			"chain-2-3-reviewer",
			"chain-3-quality-manager",
		]);
		expect(
			compiled.graph.steps
				.filter((step) => step.title === "reviewer")
				.map((step) => step.dependsOn),
		).toEqual([["chain-1-planner"], ["chain-1-planner"], ["chain-1-planner"]]);
		expect(compiled.graph.steps.at(-1)?.dependsOn).toEqual([
			"chain-2-1-reviewer",
			"chain-2-2-reviewer",
			"chain-2-3-reviewer",
		]);
		expectAgentSteps(compiled.graph.steps, [
			"planner",
			"reviewer",
			"reviewer",
			"reviewer",
			"quality-manager",
		]);
	});
});

function agent(id: string): AgentDefinition {
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
		loop: false,
		domain: "coding",
	};
}

function expectAgentSteps(
	steps: Array<{ kind: string; backend: { name: string; options?: unknown } }>,
	roles: string[],
): void {
	expect(
		steps.map((step) => ({
			kind: step.kind,
			backendName: step.backend.name,
			role: roleFromStepOptions(step.backend.options),
		})),
	).toEqual(
		roles.map((role) => ({
			kind: "agent",
			backendName: "cosmonauts-subagent",
			role,
		})),
	);
}

function roleFromStepOptions(options: unknown): string | undefined {
	if (!isRecord(options)) return undefined;
	const stage = options.stage;
	if (!isRecord(stage)) return undefined;
	return typeof stage.name === "string" ? stage.name : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
