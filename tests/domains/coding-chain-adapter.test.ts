import { beforeEach, expect, test, vi } from "vitest";
import { codingChainAdapter } from "../../bundled/coding/chain-adapter.ts";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { normalizeChain } from "../../lib/orchestration/chain-normalization.ts";
import type {
	ChainConfig,
	ChainStage,
	ChainStageContext,
} from "../../lib/orchestration/types.ts";

const host = vi.hoisted(() => ({
	launch: vi.fn(),
	refusal: vi.fn(),
	placement: vi.fn(),
}));
vi.mock(
	"../../lib/orchestration/quality-review-launch.ts",
	async (original) => ({
		...(await original<
			typeof import("../../lib/orchestration/quality-review-launch.ts")
		>()),
		launchQualityReview: host.launch,
		qualityReviewPlacement: host.placement,
	}),
);
vi.mock("../../lib/orchestration/quality-review-chain.ts", () => ({
	misplacedQualityReviewResult: host.refusal,
}));
const actors = [
	"planner",
	"plan-reviewer",
	"reviewer",
	"task-manager",
	"quality-manager",
];
const definitions: AgentDefinition[] = actors.map((id) => ({
	id,
	domain: "coding",
	description: id,
	model: "test/model",
	instructions: { kind: "inline", content: id },
	tools: "none",
	capabilities: [],
	extensions: [],
	skills: [],
	projectContext: false,
	session: "ephemeral",
	loop: false,
}));
const registry = new AgentRegistry(definitions);
const config = (steps: ChainConfig["steps"]): ChainConfig => ({
	steps,
	registry,
	projectRoot: "/tmp",
	domainContext: "coding",
	chainAdapter: codingChainAdapter,
});
function context(stage: ChainStage): ChainStageContext {
	return {
		stage,
		steps: [stage],
		topologyIndex: 0,
		definition: definitions.find((d) => d.id === "planner") as AgentDefinition,
		registry,
	};
}
beforeEach(() => {
	vi.clearAllMocks();
	host.placement.mockReturnValue("absent");
});

test("coding classification declares review authors, revision producers, and model aliases", () => {
	const result = normalizeChain({
		...config(
			actors
				.slice(0, 2)
				.concat(["planner", "task-manager"])
				.map((name, index) => ({ name, stageId: `stage-${index}` })),
		),
		models: { taskManager: "override/model" },
		thinking: { taskManager: "high" },
	});
	if (!result.ok) throw new Error(JSON.stringify(result.errors));
	expect(result.stages).toMatchObject([
		{ purpose: { kind: "default" } },
		{ purpose: { kind: "plan-review", targetStageIds: ["stage-0"] } },
		{ purpose: { kind: "plan-revision", targetStageIds: ["stage-0"] } },
		{
			purpose: { kind: "default" },
			requiresPlanReviewTarget: true,
			reviewTarget: {
				source: "active-plan-review",
				producerStageIds: ["stage-2"],
			},
			model: "override/model",
			thinkingLevel: "high",
		},
	]);
});

test("an alias uses resolved coding model keys without dropping its bound identity", () => {
	const reference = {
		requested: {
			role: "studio",
			agentId: "task-manager",
			qualifiedId: "studio/task-manager",
		},
		resolved: {
			role: "coding",
			agentId: "task-manager",
			qualifiedId: "coding/task-manager",
		},
		binding: { role: "studio", domainId: "coding", source: "project" as const },
	};
	const input = {
		...context({ name: "display", agentReference: reference }),
		models: { taskManager: "alias/model" },
		thinking: { taskManager: "low" as const },
	};
	expect(codingChainAdapter.classifyStage?.(input)).toMatchObject({
		model: "alias/model",
		thinkingLevel: "low",
	});
});

test("invalid quality bindings retain the consumer refusal diagnostic", () => {
	host.placement.mockReturnValue("refused");
	expect(
		codingChainAdapter.classifyStage?.(context({ name: "quality-manager" })),
	).toMatchObject({
		terminalGate: "quality-review",
		errors: [
			{
				code: "terminal",
				message: "Quality Manager stage binding is invalid.",
			},
		],
	});
});

test("all normalization errors consult consumer placement for a possible QM refusal", async () => {
	host.refusal.mockResolvedValue({ success: false });
	for (const code of [
		"target",
		"binding",
		"terminal",
		"declaration",
	] as const) {
		const result = await codingChainAdapter.refuse?.(
			config([{ name: "planner" }]),
			[
				{ code, message: "problem" },
				{ code: "model", message: "missing" },
			],
		);
		expect(result).toEqual({ success: false });
	}
	expect(host.refusal).toHaveBeenCalledTimes(4);
});

test("quality host execution retains configured plan, outcome, and supplied executor", async () => {
	const execute = vi.fn();
	for (const outcome of ["success", "failed"] as const) {
		host.launch.mockResolvedValue({
			stepResult: { outcome, summary: "report", artifacts: [] },
			ref: { scope: "quality-review", runId: "child" },
		});
		const result = await codingChainAdapter.terminalGates?.["quality-review"]?.(
			{
				stage: { name: "quality-manager" },
				projectRoot: "/tmp",
				prompt: "raw",
				configuredPlanSlug: "configured",
				planSlug: "derived",
				hostContext: { execute },
			},
		);
		expect(result).toMatchObject({
			success: outcome === "success",
			summary: "report",
			...(outcome === "failed" ? { error: "report" } : {}),
		});
		expect(host.launch).toHaveBeenLastCalledWith(
			expect.objectContaining({
				execute,
				planSlug: "configured",
				operatorNote: "raw",
			}),
		);
	}
});

test.each([
	"project",
	"default",
] as const)("a %s bound display alias retains its reviewer semantics", (source) => {
	const role = source === "project" ? "coding" : "studio";
	const reference = {
		requested: {
			role,
			agentId: "plan-reviewer",
			qualifiedId: `${role}/plan-reviewer`,
		},
		resolved: {
			role: "coding",
			agentId: "plan-reviewer",
			qualifiedId: "coding/plan-reviewer",
		},
		binding: { role, domainId: "coding", source },
	};
	const stage = {
		name: "display-alias",
		stageId: "review",
		agentReference: reference,
	};
	const input = {
		...context(stage),
		topologyIndex: 1,
		steps: [
			{ name: "planner", stageId: "draft" },
			stage,
			{ name: "planner", stageId: "revision" },
		],
	};
	expect(codingChainAdapter.classifyStage?.(input)).toMatchObject({
		purpose: { kind: "plan-review", targetStageIds: ["draft"] },
	});
});

test("review producers exclude future and generic revisions and unguarded stages have no selector", () => {
	const names = [
		"planner",
		"plan-reviewer",
		"planner",
		"reviewer",
		"planner",
		"task-manager",
		"plan-reviewer",
		"planner",
	];
	const result = normalizeChain(
		config(names.map((name, index) => ({ name, stageId: `stage-${index}` }))),
	);
	if (!result.ok) throw new Error(JSON.stringify(result.errors));
	expect(result.stages[5]).toMatchObject({
		reviewTarget: {
			source: "active-plan-review",
			producerStageIds: ["stage-2"],
		},
	});
	expect((result.stages[0] as ChainStage).reviewTarget).toBeUndefined();
	expect((result.stages[1] as ChainStage).reviewTarget).toBeUndefined();
});

test.each([
	null,
	42,
	{},
	{ execute: "invalid" },
])("invalid host context %j does not supply an executor", async (hostContext) => {
	host.launch.mockResolvedValue({
		stepResult: { outcome: "success", summary: "ok", artifacts: [] },
		ref: { scope: "quality-review", runId: "child" },
	});
	const result = await codingChainAdapter.terminalGates?.["quality-review"]?.({
		stage: { name: "quality-manager" },
		projectRoot: "/tmp",
		hostContext,
	});
	expect(result?.error).toBeUndefined();
	expect(host.launch.mock.calls[0]?.[0]).not.toHaveProperty("execute");
});

test("quality placement receives the bound occurrence and its registry", () => {
	const stage = { name: "quality-manager" };
	codingChainAdapter.classifyStage?.(context(stage));
	expect(host.placement).toHaveBeenCalledWith({ steps: [stage], registry });
});
