import {
	validateAgentDefinition,
	validateAgentId,
} from "../agents/declaration.ts";
import { splitRole } from "../agents/qualified-role.ts";
import { AgentRegistry, InternalAgentAccessError } from "../agents/resolver.ts";
import { qualifyAgentId } from "../agents/runtime-identity.ts";
import type { AgentDefinition } from "../agents/types.ts";
import type { ResolvedAgentReference } from "../domains/bindings.ts";
import { isParallelGroupStep, resolveStagePrompt } from "./chain-steps.ts";
import { resolvePlanSlug } from "./stage-prompts.ts";
import type {
	ChainCompletionPolicy,
	ChainConfig,
	ChainNormalizationError,
	ChainStage,
	ChainStageContext,
	ChainStep,
	NormalizedChainStage,
} from "./types.ts";

type AgentResolutionResult = ReturnType<
	AgentRegistry["resolveReferenceResult"]
>;

type ChainNormalizationResult =
	| { ok: true; stages: ChainStep[] }
	| { ok: false; errors: ChainNormalizationError[] };
class StageBindingError extends Error {}

interface BoundDeclaration {
	definition: AgentDefinition;
	reference?: ResolvedAgentReference;
	identity: string;
}
interface NormalizationRun {
	config: ChainConfig;
	errors: ChainNormalizationError[];
	ids: Set<string>;
	declarations: Map<string, BoundDeclaration>;
	requested: Map<string, AgentResolutionResult>;
	registry?: AgentRegistry;
	occurrences: Map<string, BoundDeclaration>;
	steps: ChainStep[];
	planSlug?: string;
}
/** Snapshot bindings used during classification; execution keeps its bound reference. */
class ChainDeclarationRegistry extends AgentRegistry {
	constructor(
		definitions: readonly AgentDefinition[],
		private readonly requested: ReadonlyMap<string, AgentResolutionResult>,
	) {
		super(definitions);
	}
	override resolveReferenceResult(
		id: string,
		domainContext?: string,
		requesterDomain = domainContext,
	): AgentResolutionResult {
		return (
			this.requested.get(id) ??
			super.resolveReferenceResult(id, domainContext, requesterDomain)
		);
	}
	override get(
		id: string,
		domainContext?: string,
	): AgentDefinition | undefined {
		const result = this.resolveReferenceResult(id, domainContext);
		return result.kind === "found" ? result.definition : undefined;
	}
	override has(id: string, domainContext?: string): boolean {
		return this.get(id, domainContext) !== undefined;
	}
	override resolve(id: string, domainContext?: string): AgentDefinition {
		const result = this.resolveReferenceResult(id, domainContext);
		if (result.kind === "found") return result.definition;
		if (result.kind === "internal")
			throw new InternalAgentAccessError({
				requestedId: id,
				domain: result.domain,
				agent: result.agent,
				requesterDomain: domainContext,
			});
		throw new Error(`Unknown agent ID "${id}".`);
	}
}
function requestedDeclaration(
	run: NormalizationRun,
	stage: ChainStage,
): AgentResolutionResult {
	const requestedId = stage.agentReference?.requested.qualifiedId ?? stage.name;
	const cached = run.requested.get(requestedId);
	if (cached) return cached;
	const result = run.config.registry.resolveReferenceResult(
		requestedId,
		run.config.domainContext,
		run.config.requesterDomain ?? run.config.domainContext,
	);
	const frozen =
		result.kind === "found"
			? {
					...result,
					reference:
						result.reference ?? defaultReference(stage, result.definition),
				}
			: result;
	run.requested.set(requestedId, frozen);
	return frozen;
}
// Only values produced by this module skip repeated consumer classification.
// Persisted projections are deliberately not executable normalized values.
const normalizedStages = new WeakSet<ChainStage>();

function stagesOf(step: ChainStep): ChainStage[] {
	return isParallelGroupStep(step) ? step.stages : [step];
}
function mapSteps(
	steps: readonly ChainStep[],
	map: (
		stage: ChainStage,
		index: number,
		member: number,
		parallel: boolean,
	) => ChainStage,
): ChainStep[] {
	return steps.map((step, index) =>
		isParallelGroupStep(step)
			? {
					...step,
					stages: step.stages.map((stage, member) =>
						map(stage, index, member, true),
					) as typeof step.stages,
				}
			: map(step, index, 0, false),
	);
}
function fail({
	run,
	stage,
	code,
	message,
}: {
	run: NormalizationRun;
	stage: ChainStage;
	code: ChainNormalizationError["code"];
	message: string;
}): void {
	run.errors.push({
		code,
		stageId: stage.stageId,
		stageName: stage.name,
		message,
	});
}
function defaultReference(
	stage: ChainStage,
	definition: AgentDefinition,
): ResolvedAgentReference | undefined {
	const resolved = splitRole(qualifyAgentId(definition.id, definition.domain));
	if (!resolved.domain) return undefined;
	const requestedRole = splitRole(stage.name).domain ?? resolved.domain;
	return {
		requested: {
			role: requestedRole,
			agentId: resolved.id,
			qualifiedId: `${requestedRole}/${resolved.id}`,
		},
		resolved: {
			role: resolved.domain,
			agentId: resolved.id,
			qualifiedId: `${resolved.domain}/${resolved.id}`,
		},
		binding: {
			role: requestedRole,
			domainId: resolved.domain,
			source: "default",
		},
	};
}
function resolveDeclaration(
	run: NormalizationRun,
	stage: ChainStage,
): BoundDeclaration {
	const { config } = run;
	const requester = config.requesterDomain ?? config.domainContext;
	const result = requestedDeclaration(run, stage);
	if (stage.agentReference) {
		const definition = config.registry.getResolvedTarget(
			stage.agentReference.resolved.qualifiedId,
			requester,
		);
		if (!definition)
			throw new Error(
				`Frozen declaration "${stage.agentReference.resolved.qualifiedId}" is unavailable or internal.`,
			);
		if (
			result.kind !== "found" ||
			result.reference?.resolved.qualifiedId !==
				stage.agentReference.resolved.qualifiedId
		)
			throw new StageBindingError(
				"Stage reference does not match the registry binding.",
			);
		validateAgentDefinition(definition);
		return {
			definition,
			reference: stage.agentReference,
			identity: stage.agentReference.resolved.qualifiedId,
		};
	}

	if (result.kind === "internal")
		throw new Error(
			`Agent "${stage.name}" is internal to domain "${result.domain}" and is not visible from domain "${requester}".`,
		);
	if (result.kind !== "found")
		throw new Error(`Unknown agent role "${stage.name}".`);
	validateAgentDefinition(result.definition);
	return {
		definition: result.definition,
		identity: qualifyAgentId(result.definition.id, result.definition.domain),
		reference: result.reference ?? defaultReference(stage, result.definition),
	};
}
function validateStageReference(stage: ChainStage): void {
	const ref = stage.agentReference;
	if (!ref) return;
	validateAgentId(ref.requested.qualifiedId, "Requested stage actor");
	validateAgentId(ref.resolved.qualifiedId, "Resolved stage actor");
	const requested = qualifyAgentId(ref.requested.agentId, ref.requested.role);
	const resolved = qualifyAgentId(ref.resolved.agentId, ref.resolved.role);
	if (
		requested !== ref.requested.qualifiedId ||
		resolved !== ref.resolved.qualifiedId ||
		ref.requested.agentId !== ref.resolved.agentId
	)
		throw new Error("Stage binding identities do not agree.");
}

interface StageBindingInput {
	run: NormalizationRun;
	input: ChainStage;
	index: number;
	member: number;
	parallel: boolean;
}
function occurrenceId({
	input,
	index,
	member,
	parallel,
}: Omit<StageBindingInput, "run">): string {
	return (
		input.stageId ??
		`chain-${index + 1}${parallel ? `-${member + 1}` : ""}-${input.name.replaceAll("/", "-")}`
	);
}

function assignStageId({
	run,
	input,
	index,
	member,
	parallel,
}: StageBindingInput): ChainStage & { stageId: string } {
	const stage = {
		...input,
		stageId: occurrenceId({ input, index, member, parallel }),
	};
	try {
		validateAgentId(stage.stageId, "Stage id");
		if (run.ids.has(stage.stageId))
			throw new Error(`Duplicate stage id "${stage.stageId}".`);
	} catch (error) {
		fail({ run: run, stage: stage, code: "stage-id", message: String(error) });
	}
	run.ids.add(stage.stageId);
	return stage;
}

function bindStage(options: StageBindingInput): ChainStage {
	const { run, input } = options;
	const stage = assignStageId(options);
	try {
		validateStageReference(stage);
	} catch (error) {
		fail({
			run,
			stage,
			code: "binding",
			message: error instanceof Error ? error.message : String(error),
		});
		return stage;
	}
	try {
		const key = input.agentReference
			? JSON.stringify(input.agentReference)
			: input.name;
		let bound = run.declarations.get(key);
		if (!bound) {
			bound = resolveDeclaration(run, input);
			run.declarations.set(key, bound);
		}
		run.occurrences.set(stage.stageId, bound);
		return {
			...stage,
			declarationId: bound.identity,
			agentReference: bound.reference,
		};
	} catch (error) {
		fail({
			run: run,
			stage: stage,
			code: error instanceof StageBindingError ? "binding" : "declaration",
			message: error instanceof Error ? error.message : String(error),
		});
		return stage;
	}
}
function completionPolicy(
	run: NormalizationRun,
	input: ChainStage,
): ChainCompletionPolicy {
	if (input.completionCheck && input.completionPolicy)
		fail({
			run: run,
			stage: input,
			code: "completion",
			message: "completionCheck and completionPolicy conflict.",
		});
	if (input.completionPolicy) return input.completionPolicy;
	const check = input.completionCheck;
	return check
		? {
				kind: "state",
				evaluate: async (root) => ({
					status: (await check(root)) ? "complete" : "pending",
				}),
			}
		: { kind: "once" };
}
function validateExecutionShape({
	run,
	stage,
	index,
	parallel,
}: {
	run: NormalizationRun;
	stage: ChainStage;
	index: number;
	parallel: boolean;
}): void {
	const policy = stage.completionPolicy;
	if (!policy) {
		fail({
			run: run,
			stage: stage,
			code: "completion",
			message: "Invalid completion policy.",
		});
		return;
	}
	if (!["once", "state"].includes(policy.kind))
		fail({
			run: run,
			stage: stage,
			code: "completion",
			message: "Invalid completion policy.",
		});
	if (policy.kind === "state" && typeof policy.evaluate !== "function")
		fail({
			run: run,
			stage: stage,
			code: "completion",
			message: "State completion requires an evaluator.",
		});
	if (stage.loop && policy.kind !== "state")
		fail({
			run: run,
			stage: stage,
			code: "completion",
			message: "A loop stage requires an explicit state completion policy.",
		});
	validateTerminalShape({
		run: run,
		stage: stage,
		index: index,
		parallel: parallel,
	});
}
function validateTerminalShape({
	run,
	stage,
	index,
	parallel,
}: {
	run: NormalizationRun;
	stage: ChainStage;
	index: number;
	parallel: boolean;
}): void {
	if (parallel && stage.loop)
		fail({
			run: run,
			stage: stage,
			code: "parallel-loop",
			message:
				"Loop stage cannot run in parallel; loop stages must run sequentially.",
		});
	const key = stage.terminalGate;
	if (!key) return;
	if (parallel || stage.loop || index !== run.steps.length - 1)
		fail({
			run: run,
			stage: stage,
			code: "terminal",
			message: "Terminal gate must be a terminal sequential non-loop stage.",
		});
	if (!run.config.chainAdapter?.terminalGates?.[key])
		fail({
			run: run,
			stage: stage,
			code: "terminal",
			message: `Unknown terminal gate "${key}".`,
		});
}

function validateTargets(run: NormalizationRun, stage: ChainStage): void {
	const purpose = stage.purpose;
	if (
		!purpose ||
		!["default", "plan-review", "plan-revision"].includes(purpose.kind)
	) {
		fail({
			run: run,
			stage: stage,
			code: "target",
			message: "Invalid stage purpose.",
		});
		return;
	}
	const targets = purpose.kind === "default" ? [] : purpose.targetStageIds;
	if (!Array.isArray(targets)) {
		fail({
			run: run,
			stage: stage,
			code: "target",
			message: "Purpose targetStageIds must be an array.",
		});
		return;
	}

	for (const id of [...targets, ...reviewTargetProducers(run, stage)])
		if (!run.ids.has(id))
			fail({
				run,
				stage,
				code: "target",
				message: `Unknown target stage "${id}".`,
			});
}
function reviewTargetProducers(
	run: NormalizationRun,
	stage: ChainStage,
): readonly string[] {
	const selector = stage.reviewTarget;
	if (!selector) return [];
	if (
		selector.source !== "active-plan-review" ||
		!Array.isArray(selector.producerStageIds)
	) {
		fail({
			run,
			stage,
			code: "target",
			message: "Invalid active plan-review selector.",
		});
		return [];
	}
	return selector.producerStageIds;
}

function firstDefined<T>(values: readonly (T | undefined)[]): T | undefined {
	return values.find((value) => value !== undefined && value !== null);
}
function assignedModel(
	{ stage, definition }: ChainStageContext,
	config: ChainConfig,
): string | undefined {
	const id = stage.declarationId ?? stage.name;
	return firstDefined([
		stage.model,
		config.models?.[id],
		config.models?.[stage.name],
		config.models?.[definition.id],
		definition.model,
		config.models?.default,
		config.defaultModel,
		config.chainAdapter?.defaultModel,
	]);
}
function assignedThinking(
	{ stage, definition }: ChainStageContext,
	config: ChainConfig,
): ChainStage["thinkingLevel"] {
	const id = stage.declarationId ?? stage.name;
	return firstDefined([
		stage.thinkingLevel,
		config.thinking?.[id],
		config.thinking?.[stage.name],
		config.thinking?.[definition.id],
		definition.thinkingLevel,
		config.thinking?.default,
		config.chainAdapter?.defaultThinkingLevel,
	]);
}
function modelAssignments(
	context: ChainStageContext,
	config: ChainConfig,
): Pick<ChainStage, "model" | "thinkingLevel"> {
	return {
		model: assignedModel(context, config),
		thinkingLevel: assignedThinking(context, config),
	};
}
function stageSemantics({
	input,
	classified,
	definition,
	planSlug,
}: {
	input: ChainStage;
	classified: Partial<ChainStage>;
	definition: AgentDefinition;
	planSlug?: string;
}): ChainStage {
	return {
		...classified,
		...input,
		loop: firstDefined([input.loop, classified.loop, definition.loop]),
		purpose: firstDefined([input.purpose, classified.purpose]) ?? {
			kind: "default",
		},
		requiresPlanReviewTarget: firstDefined([
			input.requiresPlanReviewTarget,
			classified.requiresPlanReviewTarget,
			false,
		]),
		expectedPlanSlug: input.expectedPlanSlug ?? planSlug,
	};
}
function stageInstruction(
	context: ChainStageContext,
	config: ChainConfig,
): string {
	return (
		context.stage.instruction ??
		config.chainAdapter?.buildStagePrompt?.(context) ??
		resolveStagePrompt(context.stage.prompt, "Execute your assigned role.")
	);
}

function classifyOccurrence({
	run,
	context,
	input,
}: {
	run: NormalizationRun;
	context: ChainStageContext;
	input: ChainStage;
}): Partial<ChainStage> {
	const { errors: classifierErrors, ...classified } =
		run.config.chainAdapter?.classifyStage?.(context) ?? {};
	for (const error of classifierErrors ?? [])
		run.errors.push({
			...error,
			stageId: input.stageId,
			stageName: input.name,
		});
	return classified;
}

function normalizeStage({
	run,
	input,
	index,
	parallel,
}: {
	run: NormalizationRun;
	input: ChainStage;
	index: number;
	parallel: boolean;
}): ChainStage {
	const bound = run.occurrences.get(input.stageId ?? "");
	if (!bound) throw new Error("Missing bound declaration.");
	const context: ChainStageContext = {
		stage: { ...input, loop: input.loop ?? bound.definition.loop },
		steps: run.steps,
		topologyIndex: index,
		definition: bound.definition,
		registry: run.registry ?? run.config.registry,
		completionLabel: run.config.completionLabel,
		models: run.config.models,
		thinking: run.config.thinking,
	};
	const classified = classifyOccurrence({
		run: run,
		context: context,
		input: input,
	});
	const stage = stageSemantics({
		input: input,
		classified: classified,
		definition: bound.definition,
		planSlug: run.planSlug,
	});
	// A caller's check is authoritative over the consumer's default policy.
	stage.completionPolicy = completionPolicy(run, {
		...stage,
		completionPolicy: input.completionCheck
			? input.completionPolicy
			: stage.completionPolicy,
	});
	validateExecutionShape({
		run: run,
		stage: stage,
		index: index,
		parallel: parallel,
	});
	validateTargets(run, stage);
	Object.assign(stage, modelAssignments({ ...context, stage }, run.config));
	if (!stage.model)
		fail({
			run: run,
			stage: stage,
			code: "model",
			message: `No model supplied for "${stage.declarationId}".`,
		});
	stage.instruction = stageInstruction({ ...context, stage }, run.config);
	stage.completionCheck = undefined;
	normalizedStages.add(stage);
	return stage;
}
/** Bind a run-scoped declaration collection before consumer classification or execution. */
export function normalizeChain(config: ChainConfig): ChainNormalizationResult {
	if (!config.steps.length)
		return {
			ok: false,
			errors: [
				{
					code: "declaration",
					message: "A chain requires at least one stage.",
				},
			],
		};
	if (
		config.steps.flatMap(stagesOf).every((stage) => normalizedStages.has(stage))
	)
		return { ok: true, stages: config.steps };
	const run: NormalizationRun = {
		config,
		errors: [],
		ids: new Set(),
		declarations: new Map(),
		requested: new Map(),
		occurrences: new Map(),
		steps: [],
	};
	try {
		run.planSlug = resolvePlanSlug(config);
	} catch (error) {
		return {
			ok: false,
			errors: [
				{
					code: "target",
					message: error instanceof Error ? error.message : String(error),
				},
			],
		};
	}
	run.steps = mapSteps(config.steps, (stage, index, member, parallel) =>
		bindStage({
			run: run,
			input: stage,
			index: index,
			member: member,
			parallel: parallel,
		}),
	);
	if (run.errors.length) return { ok: false, errors: run.errors };
	const classifierDeclarations = new Map(run.requested);
	for (const stage of config.steps.flatMap(stagesOf)) {
		const declaration = run.requested.get(
			stage.agentReference?.requested.qualifiedId ?? stage.name,
		);
		if (declaration) classifierDeclarations.set(stage.name, declaration);
	}
	run.registry = new ChainDeclarationRegistry(
		config.registry.listAll(config.requesterDomain ?? config.domainContext),
		classifierDeclarations,
	);
	// Make all occurrence ids and effective lifecycles visible to the classifier.
	run.steps = mapSteps(run.steps, (stage) => ({
		...stage,
		loop:
			stage.loop ??
			run.occurrences.get(stage.stageId ?? "")?.definition.loop ??
			false,
	}));
	const stages = mapSteps(run.steps, (stage, index, _member, parallel) =>
		normalizeStage({
			run: run,
			input: stage,
			index: index,
			parallel: parallel,
		}),
	);
	return run.errors.length
		? { ok: false, errors: run.errors }
		: { ok: true, stages };
}
export function assertNormalizedStage(
	stage: ChainStage,
): asserts stage is NormalizedChainStage {
	if (!normalizedStages.has(stage))
		throw new Error("Stage must be normalized before execution.");
}

/** Declaration failures are outcomes, never partially executed chains. */
function normalizationFailure(
	config: ChainConfig,
	errors: readonly ChainNormalizationError[],
): import("./types.ts").ChainResult {
	const messages = errors.map((error) => error.message);
	const failed = new Map(
		errors
			.filter((error) => error.stageName)
			.map((error) => [error.stageId, error]),
	);
	const stages = mapSteps(config.steps, (stage, index, member, parallel) => ({
		...stage,
		stageId: occurrenceId({ input: stage, index, member, parallel }),
	})).flatMap(stagesOf);
	return {
		success: false,
		totalDurationMs: 0,
		errors: messages,
		stageResults: [...failed.values()].flatMap((error) => {
			const stage = stages.find((stage) => stage.stageId === error.stageId);
			return stage
				? [
						{
							stage,
							success: false,
							iterations: 0,
							durationMs: 0,
							error: error.message,
						},
					]
				: [];
		}),
	};
}

/** Consumer refusals may persist their own content artifacts before returning the failure. */
export async function refuseNormalization(
	config: ChainConfig,
	errors: readonly ChainNormalizationError[],
): Promise<import("./types.ts").ChainResult> {
	return (
		(await config.chainAdapter?.refuse?.(config, errors)) ??
		normalizationFailure(config, errors)
	);
}
