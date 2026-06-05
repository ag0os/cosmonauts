import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { handleWorkflowMode, parseCliArgs } from "../../cli/main.ts";
import type { CliOptions } from "../../cli/types.ts";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import type {
	ChainConfig,
	ChainResult,
} from "../../lib/orchestration/types.ts";
import type { CosmonautsRuntime } from "../../lib/runtime.ts";
import { useTempDir } from "../helpers/fs.ts";

const chainRunnerMocks = vi.hoisted(() => ({
	runChain: vi.fn(),
}));

const durableRunnerMocks = vi.hoisted(() => ({
	runDurableChain: vi.fn(),
}));

vi.mock("../../lib/orchestration/chain-runner.ts", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("../../lib/orchestration/chain-runner.ts")
		>();
	return {
		...actual,
		runChain: chainRunnerMocks.runChain,
	};
});

vi.mock("../../lib/orchestration/durable-chain-runner.ts", () => ({
	runDurableChain: durableRunnerMocks.runDurableChain,
}));

const temp = useTempDir("workflow-durable-routing-");
const registry = new AgentRegistry([
	agent("planner", false),
	agent("reviewer", false),
	agent("quality-manager", false),
	agent("coordinator", true),
]);

describe("workflow durable routing", () => {
	beforeEach(() => {
		chainRunnerMocks.runChain.mockReset();
		durableRunnerMocks.runDurableChain.mockReset();
		chainRunnerMocks.runChain.mockResolvedValue(chainResult("inline"));
		durableRunnerMocks.runDurableChain.mockResolvedValue(
			chainResult("durable"),
		);
		vi.spyOn(process.stderr, "write").mockImplementation(() => true);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// @cosmo-behavior plan:durable-frontend-migration#B-008
	test("routes loop-free -w workflows through the durable graph and loop workflows inline", async () => {
		const cwd = temp.path;
		const runtime = workflowRuntime(cwd);

		await handleWorkflowMode(
			runtime,
			cliOptions({
				workflow: "planner -> reviewer -> quality-manager",
				prompt: "Route raw DSL durably.",
				thinking: "low",
			}),
			cwd,
		);
		await handleWorkflowMode(
			runtime,
			cliOptions({
				workflow: "ship-and-check",
				prompt: "Route named workflow durably.",
			}),
			cwd,
		);

		expect(durableRunnerMocks.runDurableChain).toHaveBeenCalledTimes(2);
		expect(chainRunnerMocks.runChain).not.toHaveBeenCalled();
		expect(durableRunnerMocks.runDurableChain).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				projectRoot: cwd,
				thinking: { default: "low" },
				steps: [
					expect.objectContaining({
						name: "planner",
						loop: false,
						prompt: expect.stringContaining("Route raw DSL durably."),
					}),
					{ name: "reviewer", loop: false },
					{ name: "quality-manager", loop: false },
				],
			}),
		);
		expect(durableRunnerMocks.runDurableChain).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				projectRoot: cwd,
				steps: [
					expect.objectContaining({
						name: "planner",
						loop: false,
						prompt: expect.stringContaining("Route named workflow durably."),
					}),
					{ name: "reviewer", loop: false },
				],
			}),
		);

		await handleWorkflowMode(
			runtime,
			cliOptions({
				workflow: "plan-and-build",
				profile: true,
			}),
			cwd,
		);
		await handleWorkflowMode(
			runtime,
			cliOptions({
				workflow: "ship-and-check",
				completionLabel: "plan:durable-frontend-migration",
			}),
			cwd,
		);

		expect(chainRunnerMocks.runChain).toHaveBeenCalledTimes(2);
		expect(chainRunnerMocks.runChain).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				steps: [
					{ name: "planner", loop: false },
					{ name: "coordinator", loop: true },
				],
				onEvent: expect.any(Function),
			}),
		);
		expect(chainRunnerMocks.runChain).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				completionLabel: "plan:durable-frontend-migration",
				steps: [
					{ name: "planner", loop: false },
					{ name: "reviewer", loop: false },
				],
			}),
		);
		expect(durableRunnerMocks.runDurableChain).toHaveBeenCalledTimes(2);
		expect(() => parseCliArgs(["--chain", "planner"])).toThrow(
			"unknown option '--chain'",
		);

		const durableConfigs = durableRunnerMocks.runDurableChain.mock
			.calls as Array<[ChainConfig]>;
		const inlineConfigs = chainRunnerMocks.runChain.mock.calls as Array<
			[ChainConfig]
		>;
		expect(
			durableConfigs.every(([config]) => config.steps.every(isLoopFree)),
		).toBe(true);
		expect(inlineConfigs.some(([config]) => config.steps.some(hasLoop))).toBe(
			true,
		);
	});
});

function workflowRuntime(cwd: string): CosmonautsRuntime {
	return {
		agentRegistry: registry,
		domainContext: "coding",
		chains: [
			{
				name: "ship-and-check",
				description: "Loop-free named workflow",
				chain: "planner -> reviewer",
			},
			{
				name: "plan-and-build",
				description: "Loop workflow",
				chain: "planner -> coordinator",
			},
		],
		projectSkills: ["testing"],
		skillPaths: [join(cwd, "skills")],
		domainsDir: join(cwd, "domains"),
		domainResolver: undefined,
	} as unknown as CosmonautsRuntime;
}

function cliOptions(overrides: Partial<CliOptions>): CliOptions {
	return {
		print: false,
		init: false,
		listWorkflows: false,
		listAgents: false,
		listDomains: false,
		dumpPrompt: false,
		json: false,
		plain: false,
		piFlags: {},
		...overrides,
	};
}

function chainResult(kind: "durable" | "inline"): ChainResult {
	return {
		success: true,
		stageResults: [
			{
				stage: { name: kind, loop: false },
				success: true,
				iterations: 1,
				durationMs: 1,
				summary: `${kind} runner completed`,
			},
		],
		totalDurationMs: 1,
		errors: [],
	};
}

function isLoopFree(step: ChainConfig["steps"][number]): boolean {
	return !hasLoop(step);
}

function hasLoop(step: ChainConfig["steps"][number]): boolean {
	if ("kind" in step) {
		return step.stages.some((stage) => stage.loop);
	}
	return step.loop;
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
