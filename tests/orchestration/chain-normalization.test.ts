import { describe, expect, test, vi } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { runConfiguredChain } from "../../lib/orchestration/chain-dispatch.ts";
import { createInlineChainEpisodeLifecycle } from "../../lib/orchestration/chain-episodes.ts";
import {
	assertNormalizedStage,
	normalizeChain,
	refuseNormalization,
} from "../../lib/orchestration/chain-normalization.ts";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";
import { runStage } from "../../lib/orchestration/chain-runner.ts";
import { selectChain } from "../../lib/orchestration/chain-selection.ts";
import { compileChainToGraph } from "../../lib/orchestration/durable-chain-compiler.ts";
import type { ChainConfig, ChainStage } from "../../lib/orchestration/types.ts";

const definition: AgentDefinition = {
	id: "spec-writer-pro",
	domain: "studio",
	description: "Independent consumer",
	instructions: { kind: "inline", content: "Write specifications." },
	model: "test/model",
	capabilities: [],
	tools: "none",
	extensions: [],
	skills: [],
	projectContext: false,
	session: "ephemeral",
	loop: false,
};
const registry = new AgentRegistry([definition]);
const config = (steps: ChainConfig["steps"]): ChainConfig => ({
	steps,
	projectRoot: "/tmp",
	registry,
	domainContext: "studio",
});

describe("declared chain normalization", () => {
	test("parses topology without knowing agents or lifecycles", () => {
		expect(parseChain("spec-writer-pro -> stranger[2]")).toEqual([
			{ name: "spec-writer-pro" },
			{
				kind: "parallel",
				stages: [{ name: "stranger" }, { name: "stranger" }],
				syntax: { kind: "fanout", role: "stranger", count: 2 },
			},
		]);
	});
	test("resolves a multi-hyphen declared agent and gives repeated occurrences unique ids", () => {
		const result = normalizeChain(
			config(selectChain("spec-writer-pro", []).steps),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("Unexpected failure");
		expect(result.stages[0]).toMatchObject({
			declarationId: "studio/spec-writer-pro",
			purpose: { kind: "default" },
			completionPolicy: { kind: "once" },
			model: "test/model",
		});
		const repeated = normalizeChain(config(parseChain("spec-writer-pro[2]")));
		if (!repeated.ok) throw new Error("Unexpected failure");
		const group = repeated.stages[0];
		if (!group || !("kind" in group)) throw new Error("Expected parallel step");
		expect(group.stages.map((stage) => stage.stageId)).toEqual([
			"chain-1-1-spec-writer-pro",
			"chain-1-2-spec-writer-pro",
		]);
	});
	test("reports duplicate, invalid and missing target ids as typed errors", () => {
		const result = normalizeChain(
			config([
				{ name: definition.id, stageId: "same" },
				{ name: definition.id, stageId: "same" },
			]),
		);
		expect(result).toMatchObject({ ok: false, errors: [{ code: "stage-id" }] });
		expect(
			normalizeChain(config([{ name: definition.id, stageId: "Invalid_id" }])),
		).toMatchObject({ ok: false, errors: [{ code: "stage-id" }] });
		expect(
			normalizeChain(
				config([
					{
						name: definition.id,
						purpose: { kind: "plan-revision", targetStageIds: ["missing"] },
					},
				]),
			),
		).toMatchObject({ ok: false, errors: [{ code: "target" }] });
	});
	test("binds repeated declarations once and classifies each occurrence once", () => {
		const lookup = vi.spyOn(registry, "resolveReferenceResult");
		const classifyStage = vi.fn(
			(
				context: import("../../lib/orchestration/types.ts").ChainStageContext,
			) => {
				expect(
					context.registry.resolveReference(context.stage.name, "studio")
						?.definition,
				).toBe(definition);
				expect(context.registry.get(context.stage.name, "studio")).toBe(
					definition,
				);
				expect(context.registry.has(context.stage.name, "studio")).toBe(true);
				expect(context.registry.resolve(context.stage.name, "studio")).toBe(
					definition,
				);
				expect(context.registry.has("absent", "studio")).toBe(false);
				expect(() => context.registry.resolve("absent", "studio")).toThrow(
					"Unknown agent ID",
				);
				return {};
			},
		);
		try {
			const input = {
				...config(parseChain("spec-writer-pro -> spec-writer-pro")),
				chainAdapter: { classifyStage },
			};
			const first = normalizeChain(input);
			if (!first.ok) throw new Error("Expected normalized stages");
			expect(lookup).toHaveBeenCalledTimes(1);
			expect(classifyStage).toHaveBeenCalledTimes(2);
			normalizeChain({ ...input, steps: first.stages });
			expect(lookup).toHaveBeenCalledTimes(1);
			expect(classifyStage).toHaveBeenCalledTimes(2);
		} finally {
			lookup.mockRestore();
		}
	});
	test("rejects empty input and malformed review selectors as typed values", () => {
		expect(normalizeChain(config([]))).toMatchObject({
			ok: false,
			errors: [{ code: "declaration" }],
		});
		const stage = {
			name: definition.id,
			reviewTarget: { source: "wrong", producerStageIds: [] },
		} as unknown as ChainStage;
		expect(normalizeChain(config([stage]))).toMatchObject({
			ok: false,
			errors: [{ code: "target" }],
		});
	});
	test.each([
		"spec_writer",
		"studio/agent/extra",
		"prefix spec-writer[2]",
		"spec-writer[2]suffix",
	])("rejects malformed topology actor %s", (expression) => {
		expect(() => parseChain(expression)).toThrow();
	});

	test("uses the declared identity grammar for numeric-start fan-out names", () => {
		expect(parseChain("9-scribe[2]")[0]).toMatchObject({
			kind: "parallel",
			stages: [{ name: "9-scribe" }, { name: "9-scribe" }],
		});
	});
	test("rejects an unknown declaration before execution", () => {
		expect(normalizeChain(config([{ name: "missing" }]))).toMatchObject({
			ok: false,
			errors: [{ code: "declaration" }],
		});
	});
	test("requires explicit loop policy including direct runStage", async () => {
		const stage = { name: definition.id, loop: true };
		expect(normalizeChain(config([stage]))).toMatchObject({
			ok: false,
			errors: [{ code: "completion" }],
		});
		const spawn = vi.fn();
		await expect(
			runStage(stage, config([stage]), { spawn, dispose() {} }),
		).resolves.toMatchObject({
			success: false,
			error: expect.stringContaining("explicit state completion policy"),
		});
		expect(spawn).not.toHaveBeenCalled();
	});
	test("direct stage validation preserves a host's durable refusal result before spawning", async () => {
		const stage = { name: definition.id, loop: true };
		const refuse = vi.fn().mockResolvedValue({
			success: false,
			totalDurationMs: 0,
			stageResults: [],
			errors: ["declared refusal"],
			run: { scope: "chain", runId: "refusal" },
		});
		const spawn = vi.fn();
		const result = await runStage(
			stage,
			{ ...config([stage]), chainAdapter: { refuse } },
			{ spawn, dispose() {} },
		);
		expect(result).toMatchObject({
			success: false,
			run: { scope: "chain", runId: "refusal" },
		});
		expect(refuse).toHaveBeenCalledWith(
			expect.objectContaining({ steps: [stage] }),
			expect.arrayContaining([expect.objectContaining({ code: "completion" })]),
		);
		expect(spawn).not.toHaveBeenCalled();
	});
	test("wraps boolean completion, preserves non-loop inline routing, and rejects conflicting policies", async () => {
		const check = vi
			.fn()
			.mockResolvedValueOnce(false)
			.mockResolvedValueOnce(true);
		const stage: ChainStage = {
			name: definition.id,
			loop: true,
			completionCheck: check,
		};
		const result = normalizeChain(config([stage]));
		if (!result.ok) throw new Error("Unexpected failure");
		const policy = (result.stages[0] as ChainStage).completionPolicy;
		if (policy?.kind !== "state") throw new Error("Expected state policy");
		expect(await policy.evaluate("/consumer")).toEqual({ status: "pending" });
		expect(await policy.evaluate("/consumer")).toEqual({ status: "complete" });
		expect(check).toHaveBeenCalledWith("/consumer");
		expect(
			normalizeChain(
				config([{ ...stage, completionPolicy: { kind: "once" } }]),
			),
		).toMatchObject({
			ok: false,
			errors: expect.arrayContaining([
				expect.objectContaining({
					code: "completion",
					message: "completionCheck and completionPolicy conflict.",
				}),
			]),
		});
	});
	test("keeps raw override separate from built instruction and persists occurrence id", () => {
		const input = {
			...config([
				{
					name: definition.id,
					stageId: "draft",
					prompt: "User request: example",
				},
			]),
			chainAdapter: { buildStagePrompt: () => "consumer instruction" },
		};
		const compiled = compileChainToGraph({ ...input, runId: "run" });
		expect(compiled.graph.steps[0]).toMatchObject({
			id: "chain-1-spec-writer-pro",
			backend: {
				options: {
					stage: {
						stageId: "draft",
						prompt: "User request: example",
						instruction: "consumer instruction",
					},
					spawn: { prompt: "consumer instruction", model: "test/model" },
				},
			},
		});
	});
	test("reports terminal placement before graph writes and passes raw prompt to direct executor", async () => {
		const gate = vi
			.fn()
			.mockResolvedValue({ success: true, iterations: 1, durationMs: 0 });
		const adapter = {
			terminalGates: { approval: gate },
			buildStagePrompt: () => "built",
		};
		const terminal = {
			name: definition.id,
			terminalGate: "approval",
			prompt: "raw",
		};
		expect(
			normalizeChain({
				...config([terminal, { name: definition.id }]),
				chainAdapter: adapter,
			}),
		).toMatchObject({ ok: false, errors: [{ code: "terminal" }] });
		await runStage(
			terminal,
			{ ...config([terminal]), chainAdapter: adapter },
			{ spawn: vi.fn(), dispose() {} },
		);
		expect(gate).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: "raw",
				stage: expect.objectContaining({ instruction: "built" }),
			}),
		);
	});
	test("domainless declarations execute without a fabricated domain reference", () => {
		const local = { ...definition, domain: undefined };
		const result = normalizeChain({
			...config([{ name: definition.id }]),
			registry: new AgentRegistry([local]),
			domainContext: undefined,
		});
		if (!result.ok) throw new Error("Expected domainless declaration");
		expect(result.stages[0]).toMatchObject({ declarationId: definition.id });
		expect((result.stages[0] as ChainStage).agentReference).toBeUndefined();
	});

	test.each([
		"requested-composition",
		"resolved-composition",
		"foreign-agent",
		"invalid-requested",
		"invalid-resolved",
		"unavailable",
	])("refuses a frozen binding with %s identity", (problem) => {
		const reference = {
			requested: {
				role: "studio",
				agentId: definition.id,
				qualifiedId: `studio/${definition.id}`,
			},
			resolved: {
				role: "studio",
				agentId: definition.id,
				qualifiedId: `studio/${definition.id}`,
			},
			binding: {
				role: "studio",
				domainId: "studio",
				source: "default" as const,
			},
		};
		if (problem === "requested-composition") reference.requested.role = "other";
		if (problem === "resolved-composition") reference.resolved.role = "other";
		if (problem === "foreign-agent")
			reference.resolved = {
				role: "studio",
				agentId: "other",
				qualifiedId: "studio/other",
			};
		if (problem === "invalid-requested")
			reference.requested.qualifiedId = "Invalid/id";
		if (problem === "invalid-resolved")
			reference.resolved.qualifiedId = "Invalid/id";
		if (problem === "unavailable")
			reference.resolved = {
				role: "missing",
				agentId: definition.id,
				qualifiedId: `missing/${definition.id}`,
			};
		expect(
			normalizeChain(
				config([{ name: definition.id, agentReference: reference }]),
			),
		).toMatchObject({
			ok: false,
			errors: expect.arrayContaining([
				expect.objectContaining({
					code: problem === "unavailable" ? "declaration" : "binding",
				}),
			]),
		});
	});

	test("validates the actual declaration before using live or frozen defaults", () => {
		const broken = {
			...definition,
			memory: { authored: "yes" },
		} as unknown as AgentDefinition;
		const badRegistry = new AgentRegistry([broken]);
		const valid = normalizeChain(config([{ name: definition.id }]));
		if (!valid.ok) throw new Error("Expected valid blueprint");
		for (const stage of [
			{ name: definition.id },
			{
				name: definition.id,
				agentReference: (valid.stages[0] as ChainStage).agentReference,
			},
		]) {
			expect(
				normalizeChain({ ...config([stage]), registry: badRegistry }),
			).toMatchObject({
				ok: false,
				errors: [
					expect.objectContaining({
						code: "declaration",
						message: expect.stringContaining("Invalid memory grant"),
					}),
				],
			});
		}
	});

	test.each([
		["unknown purpose", { purpose: { kind: "unknown" } }, "target"],
		["missing purpose targets", { purpose: { kind: "plan-review" } }, "target"],
		[
			"unknown review producer",
			{
				reviewTarget: {
					source: "active-plan-review",
					producerStageIds: ["absent"],
				},
			},
			"target",
		],
		[
			"non-array review producers",
			{
				reviewTarget: { source: "active-plan-review", producerStageIds: null },
			},
			"target",
		],
		[
			"unknown completion kind",
			{ completionPolicy: { kind: "unknown" } },
			"completion",
		],
		[
			"missing state evaluator",
			{ completionPolicy: { kind: "state" } },
			"completion",
		],
		["unavailable terminal executor", { terminalGate: "absent" }, "terminal"],
		["empty selected model", { model: "" }, "model"],
	])("returns a typed error for %s", (_label, fields, code) => {
		const stage = { name: definition.id, ...fields } as unknown as ChainStage;
		expect(normalizeChain(config([stage]))).toMatchObject({
			ok: false,
			errors: expect.arrayContaining([expect.objectContaining({ code })]),
		});
	});

	test("rejects parallel lifecycle and terminal gates before classification can execute them", () => {
		const result = normalizeChain({
			...config([
				{
					kind: "parallel",
					syntax: { kind: "group" },
					stages: [
						{
							name: definition.id,
							loop: true,
							completionPolicy: {
								kind: "state",
								evaluate: async () => ({ status: "complete" }),
							},
						},
						{ name: definition.id, terminalGate: "approval" },
					],
				},
			]),
			chainAdapter: { terminalGates: { approval: vi.fn() } },
		});
		expect(result).toMatchObject({
			ok: false,
			errors: expect.arrayContaining([
				expect.objectContaining({ code: "parallel-loop" }),
				expect.objectContaining({ code: "terminal" }),
			]),
		});
	});

	test("stage and declaration overrides win over host defaults while explicit instructions bypass the builder", () => {
		const buildStagePrompt = vi.fn(() => "built");
		const input = {
			...config([{ name: definition.id, instruction: "host instruction" }]),
			models: {
				"studio/spec-writer-pro": "declaration/override",
				default: "host/default",
			},
			thinking: {
				"studio/spec-writer-pro": "high" as const,
				default: "low" as const,
			},
			chainAdapter: { defaultModel: "adapter/default", buildStagePrompt },
			defaultModel: "runtime/default",
			planSlug: "consumer-plan",
		};
		const first = normalizeChain(input);
		if (!first.ok) throw new Error("Expected normalized stages");
		expect(first.stages[0]).toMatchObject({
			model: "declaration/override",
			thinkingLevel: "high",
			expectedPlanSlug: "consumer-plan",
			instruction: "host instruction",
		});
		expect(buildStagePrompt).not.toHaveBeenCalled();
		const override = normalizeChain({
			...input,
			steps: [
				{
					name: definition.id,
					model: "stage/override",
					thinkingLevel: "minimal",
					expectedPlanSlug: "stage-plan",
				},
			],
		});
		if (!override.ok) throw new Error("Expected stage override");
		expect(override.stages[0]).toMatchObject({
			model: "stage/override",
			thinkingLevel: "minimal",
			expectedPlanSlug: "stage-plan",
			instruction: "built",
		});
	});

	test("named declarations win by lookup and capture defaults off", () => {
		expect(
			selectChain("spec-writer-pro", [
				{
					name: "spec-writer-pro",
					description: "Named",
					stages: [{ name: "other" }],
					episodes: true,
				},
			]),
		).toEqual({ steps: [{ name: "other" }], episodes: true });
		expect(() =>
			selectChain("bad", [
				{
					name: "bad",
					description: "ambiguous",
					chain: "spec-writer-pro",
					stages: [],
				} as never,
			]),
		).toThrow("exactly one");
		expect(selectChain("spec-writer-pro", []).episodes).toBe(false);
		expect(selectChain("spec-writer-pro", [], true).episodes).toBe(true);
		expect(
			selectChain(
				"off",
				[
					{
						name: "off",
						description: "Explicit opt out",
						chain: "spec-writer-pro",
						episodes: false,
					},
				],
				true,
			).episodes,
		).toBe(false);
	});
});

test("normalization failures correlate repeated names by supplied or generated occurrence id", async () => {
	for (const supplied of [false, true]) {
		const steps: ChainStage[] = [
			{ name: definition.id, stageId: supplied ? "first" : undefined },
			{
				name: definition.id,
				stageId: supplied ? "second" : undefined,
				purpose: { kind: "plan-review", targetStageIds: ["missing"] },
			},
		];
		const input = config(steps);
		const normalized = normalizeChain(input);
		if (normalized.ok) throw new Error("Expected target refusal");
		const result = await refuseNormalization(input, normalized.errors);
		expect(result.stageResults).toHaveLength(1);
		expect(result.stageResults[0]).toMatchObject({
			stage: {
				...steps[1],
				stageId: supplied ? "second" : "chain-2-spec-writer-pro",
			},
			success: false,
			iterations: 0,
			durationMs: 0,
			error: 'Unknown target stage "missing".',
		});
	}
});

test("mixed normalized and raw stages still validate raw declarations", () => {
	const first = normalizeChain(config([{ name: definition.id }]));
	if (!first.ok) throw new Error("Expected normalized stage");
	expect(
		normalizeChain(config([...first.stages, { name: "missing" }])),
	).toMatchObject({ ok: false, errors: [{ code: "declaration" }] });
	expect(() => assertNormalizedStage({ name: definition.id })).toThrow(
		"Stage must be normalized before execution.",
	);
	expect(() =>
		assertNormalizedStage(first.stages[0] as ChainStage),
	).not.toThrow();
});

test("invalid plan slugs preserve the typed diagnostic through compilation", () => {
	const input = {
		...config([{ name: definition.id }]),
		planSlug: "Invalid_slug",
		completionLabel: "plan:two",
	};
	expect(normalizeChain(input)).toMatchObject({
		ok: false,
		errors: [
			{ code: "target", message: expect.stringContaining("Invalid_slug") },
		],
	});
	expect(() => compileChainToGraph({ ...input, runId: "run" })).toThrow(
		/Invalid_slug/,
	);
});

test("compiler preserves distinct per-stage slugs and persisted once policy in sequence and parallel", () => {
	const actor = (stageId: string): ChainStage => ({
		name: definition.id,
		stageId,
		expectedPlanSlug: stageId,
	});
	const compiled = compileChainToGraph({
		...config([
			actor("solo"),
			{
				kind: "parallel",
				syntax: { kind: "group" },
				stages: [actor("left"), actor("right")],
			},
		]),
		planSlug: "global",
		runId: "run",
	});
	expect(
		compiled.graph.steps.map((step) => step.backend.options),
	).toMatchObject(
		["solo", "left", "right"].map((expectedPlanSlug) => ({
			expectedPlanSlug,
			stage: {
				expectedPlanSlug,
				loop: false,
				completionPolicy: { kind: "once" },
			},
		})),
	);
});

test("classifier registry preserves a requested alias and only resolves it once across frozen occurrences", () => {
	const provider = { ...definition, domain: "vendor" };
	const source = new AgentRegistry([provider]);
	const reference = {
		requested: {
			role: "studio",
			agentId: definition.id,
			qualifiedId: `studio/${definition.id}`,
		},
		resolved: {
			role: "vendor",
			agentId: definition.id,
			qualifiedId: `vendor/${definition.id}`,
		},
		binding: { role: "studio", domainId: "vendor", source: "default" as const },
	};
	const lookup = vi
		.spyOn(source, "resolveReferenceResult")
		.mockReturnValue({ kind: "found", definition: provider, reference });
	const classifyStage = vi.fn(
		(context: import("../../lib/orchestration/types.ts").ChainStageContext) => {
			expect(
				context.registry.resolveReferenceResult(definition.id, "studio"),
			).toEqual({ kind: "found", definition: provider, reference });
			expect(context.registry.get(definition.id, "studio")).toBe(provider);
			return {};
		},
	);
	const result = normalizeChain({
		...config([
			{ name: definition.id, agentReference: reference },
			{
				name: definition.id,
				agentReference: {
					...reference,
					binding: { ...reference.binding, source: "project" as const },
				},
			},
		]),
		registry: source,
		chainAdapter: { classifyStage },
	});
	expect(result.ok).toBe(true);
	expect(classifyStage).toHaveBeenCalledTimes(2);
	expect(lookup).toHaveBeenCalledTimes(1);
});

test("frozen identity grammar is checked even when qualified components agree", () => {
	for (const side of ["requested", "resolved"] as const) {
		const ref = {
			requested: {
				role: "studio",
				agentId: definition.id,
				qualifiedId: `studio/${definition.id}`,
			},
			resolved: {
				role: "studio",
				agentId: definition.id,
				qualifiedId: `studio/${definition.id}`,
			},
			binding: {
				role: "studio",
				domainId: "studio",
				source: "default" as const,
			},
		};
		ref[side].role = "Invalid";
		ref[side].qualifiedId = `Invalid/${definition.id}`;
		expect(
			normalizeChain(config([{ name: definition.id, agentReference: ref }])),
		).toMatchObject({
			ok: false,
			errors: [
				{ code: "binding", message: expect.stringContaining("stage actor") },
			],
		});
	}
});

test("malformed purpose and unavailable frozen declarations retain actionable diagnostics", () => {
	expect(
		normalizeChain(
			config([{ name: definition.id, purpose: { kind: "bogus" } as never }]),
		),
	).toMatchObject({
		ok: false,
		errors: [{ message: "Invalid stage purpose." }],
	});
	const stage = { name: definition.id, terminalGate: "absent" };
	expect(
		normalizeChain({ ...config([stage]), chainAdapter: {} }),
	).toMatchObject({
		ok: false,
		errors: [{ message: 'Unknown terminal gate "absent".' }],
	});
	const ref = {
		requested: {
			role: "studio",
			agentId: definition.id,
			qualifiedId: `studio/${definition.id}`,
		},
		resolved: {
			role: "missing",
			agentId: definition.id,
			qualifiedId: `missing/${definition.id}`,
		},
		binding: {
			role: "studio",
			domainId: "missing",
			source: "default" as const,
		},
	};
	expect(
		normalizeChain(config([{ name: definition.id, agentReference: ref }])),
	).toMatchObject({
		ok: false,
		errors: [
			{
				message: `Frozen declaration "missing/${definition.id}" is unavailable or internal.`,
			},
		],
	});
});

test("direct stages honor the remaining iteration budget and absolute deadline", async () => {
	const stage: ChainStage = {
		name: definition.id,
		loop: true,
		completionPolicy: {
			kind: "state",
			evaluate: async () => ({ status: "pending" }),
		},
	};
	const spawn = vi
		.fn()
		.mockResolvedValue({ success: true, sessionId: "session", messages: [] });
	const spawner = { spawn, dispose() {} };
	const expired = await runStage(stage, config([stage]), spawner, {
		maxTotalIterations: 1,
		deadlineMs: Date.now() - 1,
	});
	expect(expired.success).toBe(false);
	expect(spawn).not.toHaveBeenCalled();
	const budget = await runStage(stage, config([stage]), spawner, {
		maxTotalIterations: 1,
		deadlineMs: Date.now() + 10000,
	});
	expect(budget.success).toBe(false);
	expect(budget.iterations).toBe(1);
	expect(spawn).toHaveBeenCalledTimes(1);
});

test("a synthesized binding preserves its requested and resolved identities", () => {
	const result = normalizeChain(config([{ name: `studio/${definition.id}` }]));
	if (!result.ok) throw new Error("Expected declaration");
	expect((result.stages[0] as ChainStage).agentReference).toEqual({
		requested: {
			role: "studio",
			agentId: definition.id,
			qualifiedId: `studio/${definition.id}`,
		},
		resolved: {
			role: "studio",
			agentId: definition.id,
			qualifiedId: `studio/${definition.id}`,
		},
		binding: { role: "studio", domainId: "studio", source: "default" },
	});
});

test("classification sees an explicit loop even when the declaration is one-shot", () => {
	const classifyStage = vi.fn(() => ({}));
	const result = normalizeChain({
		...config([
			{
				name: definition.id,
				loop: true,
				completionPolicy: {
					kind: "state",
					evaluate: async () => ({ status: "complete" }),
				},
			},
		]),
		chainAdapter: { classifyStage },
	});
	expect(result.ok).toBe(true);
	expect(classifyStage).toHaveBeenCalledWith(
		expect.objectContaining({ stage: expect.objectContaining({ loop: true }) }),
	);
});

test("the requester defaults to the domain context for binding and private classifier peers", () => {
	const peer = { ...definition, id: "private-peer" };
	const source = new AgentRegistry([definition, peer], {
		internalAgentsByDomain: new Map([["studio", new Set([peer.id])]]),
	});
	const resolve = vi.spyOn(source, "resolveReferenceResult");
	const classifyStage = vi.fn(
		(context: import("../../lib/orchestration/types.ts").ChainStageContext) => {
			expect(context.registry.get("private-peer", "studio")).toBe(peer);
			return {};
		},
	);
	const result = normalizeChain({
		...config([{ name: definition.id }]),
		registry: source,
		chainAdapter: { classifyStage },
	});
	expect(result.ok).toBe(true);
	expect(resolve).toHaveBeenCalledWith(definition.id, "studio", "studio");
});

test("public dispatch returns a typed failure before routing unknown declarations", async () => {
	const result = await runConfiguredChain(config([{ name: "unknown-actor" }]));
	expect(result).toMatchObject({
		success: false,
		totalDurationMs: 0,
		errors: ['Unknown agent role "unknown-actor".'],
		stageResults: [
			{
				stage: { name: "unknown-actor", stageId: "chain-1-unknown-actor" },
				success: false,
				iterations: 0,
			},
		],
	});
	expect(
		await refuseNormalization(config([{ name: definition.id }]), [
			{ code: "target", message: "global diagnostic" },
		]),
	).toMatchObject({
		success: false,
		stageResults: [],
		errors: ["global diagnostic"],
	});
});

test("compilation refuses a completion label even without a loop", () => {
	expect(() =>
		compileChainToGraph({
			...config([{ name: definition.id }]),
			runId: "run",
			completionLabel: "scope",
		}),
	).toThrow("Cannot compile inline-only chain steps.");
});

test("live binding output preserves the provider reference instead of reconstructing a default", () => {
	const provider = { ...definition, domain: "vendor" };
	const source = new AgentRegistry([provider]);
	const reference = {
		requested: {
			role: "studio",
			agentId: definition.id,
			qualifiedId: `studio/${definition.id}`,
		},
		resolved: {
			role: "vendor",
			agentId: definition.id,
			qualifiedId: `vendor/${definition.id}`,
		},
		binding: { role: "studio", domainId: "vendor", source: "project" as const },
	};
	vi.spyOn(source, "resolveReferenceResult").mockReturnValue({
		kind: "found",
		definition: provider,
		reference,
	});
	const result = normalizeChain({
		...config([{ name: definition.id }]),
		registry: source,
	});
	if (!result.ok) throw new Error("Expected live bound actor");
	expect((result.stages[0] as ChainStage).agentReference).toEqual(reference);
});

test("named parallel selection clones stages while preserving callbacks", () => {
	const evaluate = async () => ({ status: "complete" as const });
	const stages: ChainConfig["steps"] = [
		{
			kind: "parallel",
			syntax: { kind: "group" },
			stages: [
				{ name: definition.id, completionPolicy: { kind: "state", evaluate } },
				{ name: definition.id },
			],
		},
	];
	const selected = selectChain("declared", [
		{ name: "declared", description: "Parallel", stages },
	]);
	expect(selected.steps).toEqual(stages);
	expect(selected.steps[0]).not.toBe(stages[0]);
});

test("episode attribution preserves a domainless declaration and raw reference or name fallbacks", () => {
	for (const stage of [
		{ name: "display", declarationId: "local" },
		{
			name: "display",
			agentReference: {
				resolved: { qualifiedId: "vendor/actor" },
			} as ChainStage["agentReference"],
		},
		{ name: "local" },
	]) {
		expect(createInlineChainEpisodeLifecycle(config([stage])).source).toBe(
			stage.declarationId ??
				stage.agentReference?.resolved.qualifiedId ??
				stage.name,
		);
	}
});

test("consumer classification errors retain their occurrence and diagnostic", () => {
	expect(
		normalizeChain({
			...config([{ name: definition.id, stageId: "consumer-stage" }]),
			chainAdapter: {
				classifyStage: () => ({
					errors: [{ code: "model", message: "Consumer diagnostic" }],
				}),
			},
		}),
	).toEqual({
		ok: false,
		errors: [
			{
				code: "model",
				message: "Consumer diagnostic",
				stageId: "consumer-stage",
				stageName: definition.id,
			},
		],
	});
});

test("internal declaration refusals identify their owner and requester", () => {
	const source = new AgentRegistry([definition], {
		internalAgentsByDomain: new Map([["studio", new Set([definition.id])]]),
	});
	expect(
		normalizeChain({
			...config([{ name: `studio/${definition.id}` }]),
			registry: source,
			domainContext: "outsider",
		}),
	).toMatchObject({
		ok: false,
		errors: [
			{
				code: "declaration",
				message: `Agent "studio/${definition.id}" is internal to domain "studio" and is not visible from domain "outsider".`,
			},
		],
	});
});

test("frozen private declarations use the context as their default requester", () => {
	const source = new AgentRegistry([definition], {
		internalAgentsByDomain: new Map([["studio", new Set([definition.id])]]),
	});
	const first = normalizeChain(config([{ name: definition.id }]));
	if (!first.ok) throw new Error("Expected blueprint");
	expect(
		normalizeChain({
			...config([
				{
					name: definition.id,
					agentReference: (first.stages[0] as ChainStage).agentReference,
				},
			]),
			registry: source,
		}).ok,
	).toBe(true);
});

test("the classifier sees synthesized references even without a host binding resolver", () => {
	const classifyStage = vi.fn(
		(context: import("../../lib/orchestration/types.ts").ChainStageContext) => {
			expect(
				context.registry.resolveReferenceResult(definition.id, "studio"),
			).toMatchObject({
				kind: "found",
				reference: context.stage.agentReference,
			});
			return {};
		},
	);
	expect(
		normalizeChain({
			...config([{ name: definition.id }]),
			chainAdapter: { classifyStage },
		}).ok,
	).toBe(true);
	expect(classifyStage).toHaveBeenCalledTimes(1);
});

test("identical frozen references snapshot the provider before repeated occurrences", () => {
	const first = normalizeChain(config([{ name: definition.id }]));
	if (!first.ok) throw new Error("Expected blueprint");
	const reference = (first.stages[0] as ChainStage).agentReference;
	const source = new AgentRegistry([definition]);
	const lookup = vi
		.spyOn(source, "getResolvedTarget")
		.mockReturnValueOnce(definition)
		.mockReturnValue({ ...definition, model: "drift/model" });
	const result = normalizeChain({
		...config([
			{ name: definition.id, agentReference: reference },
			{ name: definition.id, agentReference: reference },
		]),
		registry: source,
	});
	if (!result.ok) throw new Error("Expected frozen declarations");
	expect(result.stages.map((stage) => (stage as ChainStage).model)).toEqual([
		definition.model,
		definition.model,
	]);
	expect(lookup).toHaveBeenCalledTimes(1);
});

test("an adapter without a refusal hook retains normal typed failures", async () => {
	const result = await runConfiguredChain({
		...config([{ name: "unknown-actor" }]),
		chainAdapter: {},
	});
	expect(result).toMatchObject({
		success: false,
		errors: ['Unknown agent role "unknown-actor".'],
	});
	expect(
		(
			await refuseNormalization(config([{ name: definition.id }]), [
				{
					code: "target",
					stageName: "ghost",
					stageId: "missing",
					message: "Absent occurrence",
				},
			])
		).stageResults,
	).toEqual([]);
});

test("a global diagnostic without an actor name does not invent a stage failure", async () => {
	const result = await refuseNormalization(
		config([{ name: definition.id, stageId: "known" }]),
		[{ code: "target", stageId: "known", message: "Global diagnostic" }],
	);
	expect(result).toMatchObject({
		success: false,
		errors: ["Global diagnostic"],
		stageResults: [],
	});
});

test("a supplied reference cannot replace a registered provider", () => {
	const ref = {
		requested: {
			role: "studio",
			agentId: definition.id,
			qualifiedId: `studio/${definition.id}`,
		},
		resolved: {
			role: "vendor",
			agentId: definition.id,
			qualifiedId: `vendor/${definition.id}`,
		},
		binding: { role: "studio", domainId: "vendor", source: "default" as const },
	};
	expect(
		normalizeChain({
			...config([{ name: definition.id, agentReference: ref }]),
			registry: new AgentRegistry([
				definition,
				{ ...definition, domain: "vendor" },
			]),
		}),
	).toMatchObject({
		ok: false,
		errors: [
			{
				code: "binding",
				message: "Stage reference does not match the registry binding.",
			},
		],
	});
});
