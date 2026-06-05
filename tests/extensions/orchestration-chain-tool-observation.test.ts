import { beforeEach, describe, expect, test, vi } from "vitest";
import { registerChainTool } from "../../domains/shared/extensions/orchestration/chain-tool.ts";
import type {
	ChainConfig,
	ChainResult,
	ChainStep,
} from "../../lib/orchestration/types.ts";
import { createMockPi } from "./orchestration-helpers.ts";

const chainMocks = vi.hoisted(() => ({
	parseChain: vi.fn(),
	runChain: vi.fn(),
	runDurableChain: vi.fn(),
}));

vi.mock("../../lib/orchestration/chain-parser.ts", () => ({
	parseChain: chainMocks.parseChain,
}));

vi.mock("../../lib/orchestration/chain-runner.ts", () => ({
	runChain: chainMocks.runChain,
}));

vi.mock("../../lib/orchestration/durable-chain-runner.ts", () => ({
	runDurableChain: chainMocks.runDurableChain,
}));

interface ChainRunToolDetails {
	lines: string[];
	run?: ChainResult["run"];
	result: ChainResult;
}

const PROJECT_ROOT = "/tmp/orchestration-chain-tool-observation";

describe("chain_run observation surface", () => {
	beforeEach(() => {
		chainMocks.parseChain.mockReset();
		chainMocks.runChain.mockReset();
		chainMocks.runDurableChain.mockReset();
	});

	// @cosmo-behavior plan:orchestration-surface-consolidation#B-005
	test("returns runId and scope for durable chain_run without changing blocking result semantics", async () => {
		const durableSteps: ChainStep[] = [{ name: "planner", loop: false }];
		const durableResult = chainResult({
			runId: "chain-test-run",
			scope: "chain",
		});
		chainMocks.parseChain.mockReturnValue(durableSteps);
		chainMocks.runDurableChain.mockResolvedValue(durableResult);
		const pi = createMockPi(PROJECT_ROOT);
		registerChainTool(pi as never, runtimeFor());

		const response = (await pi.callTool("chain_run", {
			expression: "planner",
			prompt: "plan it",
		})) as {
			content: { type: "text"; text: string }[];
			details: ChainRunToolDetails;
		};

		expect(response.content[0]?.text).toContain("Chain completed");
		expect(response.details.lines.at(-1)).toContain("Chain completed");
		expect(response.details.run).toEqual(durableResult.run);
		expect(response.details.result).toEqual(durableResult);
		expect(chainMocks.runDurableChain).toHaveBeenCalledWith(
			expect.objectContaining({
				steps: durableSteps,
				projectRoot: PROJECT_ROOT,
			}) satisfies Partial<ChainConfig>,
		);
		expect(chainMocks.runChain).not.toHaveBeenCalled();
	});

	// @cosmo-behavior plan:orchestration-surface-consolidation#B-005
	test("leaves loop and completion chain_run results inline and non-durable", async () => {
		const inlineSteps: ChainStep[] = [{ name: "coordinator", loop: true }];
		const inlineResult = chainResult();
		chainMocks.parseChain.mockReturnValue(inlineSteps);
		chainMocks.runChain.mockResolvedValue(inlineResult);
		const pi = createMockPi(PROJECT_ROOT);
		registerChainTool(pi as never, runtimeFor());

		const response = (await pi.callTool("chain_run", {
			expression: "coordinator*",
			completionLabel: "plan:surface",
		})) as {
			details: ChainRunToolDetails;
		};

		expect(response.details.run).toBeUndefined();
		expect(response.details.result.run).toBeUndefined();
		expect(chainMocks.runChain).toHaveBeenCalledTimes(1);
		expect(chainMocks.runDurableChain).not.toHaveBeenCalled();
	});
});

function runtimeFor() {
	return async () =>
		({
			agentRegistry: {},
			domainResolver: {},
			domainsDir: PROJECT_ROOT,
			domainContext: "coding",
			projectSkills: [],
			skillPaths: [],
		}) as never;
}

function chainResult(run?: ChainResult["run"]): ChainResult {
	return {
		run,
		success: true,
		stageResults: [
			{
				stage: { name: "planner", loop: false },
				success: true,
				iterations: 1,
				durationMs: 1,
				summary: "planner complete",
			},
		],
		totalDurationMs: 1,
		errors: [],
	};
}
