import { readFile } from "node:fs/promises";
import { describe, expect, test, vi } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";
import { injectUserPrompt } from "../../lib/orchestration/chain-steps.ts";
import {
	compileChainToGraph,
	shouldRunChainInline,
} from "../../lib/orchestration/durable-chain-compiler.ts";
import type { ChainStep } from "../../lib/orchestration/types.ts";

const registry = new AgentRegistry([
	agent("planner", false),
	agent("coordinator", true),
	agent("task-manager", false),
	agent("reviewer", false),
	agent("quality-manager", false),
]);

describe("chain durable routing", () => {
	// @cosmo-behavior plan:durable-frontend-migration#B-005
	test("keeps loop and completion-check chains on the legacy inline runner", async () => {
		const durableGraphWriter = vi.fn();
		const runChain = vi.fn();

		const loopRoute = routeChainForTest({
			steps: parseChain("planner -> coordinator", registry),
			prompt: "Ship unsupported chain semantics inline.",
			runChain,
			durableGraphWriter,
		});
		expect(loopRoute).toBe("inline");
		expect(runChain).toHaveBeenCalledTimes(1);
		expect(durableGraphWriter).not.toHaveBeenCalled();

		const completionCheckSteps = parseChain("planner -> reviewer", registry);
		const completionStage = completionCheckSteps[1];
		if (!completionStage || "kind" in completionStage) {
			throw new Error("expected a sequential completion-check stage");
		}
		completionStage.completionCheck = async () => true;

		const completionCheckRoute = routeChainForTest({
			steps: completionCheckSteps,
			prompt: "Wait for completion checks inline.",
			runChain,
			durableGraphWriter,
		});
		expect(completionCheckRoute).toBe("inline");
		expect(runChain).toHaveBeenCalledTimes(2);
		expect(durableGraphWriter).not.toHaveBeenCalled();

		const completionLabelRoute = routeChainForTest({
			steps: parseChain("planner -> reviewer", registry),
			prompt: "Use caller completion labels inline.",
			completionLabel: "plan:durable-frontend-migration",
			runChain,
			durableGraphWriter,
		});
		expect(completionLabelRoute).toBe("inline");
		expect(runChain).toHaveBeenCalledTimes(3);
		expect(durableGraphWriter).not.toHaveBeenCalled();

		for (const expression of [
			"planner -> reviewer -> quality-manager",
			"planner -> [task-manager, reviewer] -> quality-manager",
			"planner -> reviewer[2] -> quality-manager",
		]) {
			const route = routeChainForTest({
				steps: parseChain(expression, registry),
				prompt: "Keep supported loop-free chains durable.",
				runChain,
				durableGraphWriter,
			});
			expect(route).toBe("durable");
		}

		expect(runChain).toHaveBeenCalledTimes(3);
		expect(durableGraphWriter).toHaveBeenCalledTimes(3);
		expect(
			durableGraphWriter.mock.calls.map(([graph]) => graph.steps.length),
		).toEqual([3, 4, 4]);

		const compilerSource = await readFile(
			new URL(
				"../../lib/orchestration/durable-chain-compiler.ts",
				import.meta.url,
			),
			"utf-8",
		);
		expect(compilerSource).toContain(
			"const hasLoop = steps.some((s) => !isParallelGroupStep(s) && s.loop);",
		);
	});
});

function routeChainForTest(options: {
	steps: ChainStep[];
	prompt: string;
	completionLabel?: string;
	runChain: () => void;
	durableGraphWriter: (
		graph: ReturnType<typeof compileChainToGraph>["graph"],
	) => void;
}): "inline" | "durable" {
	injectUserPrompt(options.steps, options.prompt);

	if (
		shouldRunChainInline(options.steps, {
			completionLabel: options.completionLabel,
		})
	) {
		options.runChain();
		return "inline";
	}

	const compiled = compileChainToGraph({
		runId: "run-chain-routing-test",
		steps: options.steps,
		projectRoot: "/tmp/cosmonauts/project",
		registry,
		completionLabel: options.completionLabel,
	});
	options.durableGraphWriter(compiled.graph);
	return "durable";
}

function agent(id: string, loop: boolean): AgentDefinition {
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
