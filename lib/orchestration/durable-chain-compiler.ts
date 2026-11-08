import type { AgentRegistry } from "../agents/resolver.ts";
import type { ResolvedAgentReference } from "../domains/bindings.ts";
import type {
	BackendSpec,
	RunGraph,
	RunGraphStep,
} from "../durable-runtime/index.ts";
import {
	assertNormalizedStage,
	normalizeChain,
} from "./chain-normalization.ts";
import { isParallelGroupStep } from "./chain-steps.ts";
import type { getThinkingForRole } from "./model-resolution.ts";
import type { StagePromptPurpose } from "./stage-prompts.ts";
import { resolvePlanSlug } from "./stage-prompts.ts";
import type {
	ChainStage,
	ChainStep,
	CompactionConfig,
	ModelConfig,
	ParallelGroupStep,
	ThinkingConfig,
} from "./types.ts";

interface CompileChainToGraphOptions {
	chainAdapter?: import("./types.ts").ChainAdapter;
	defaultModel?: string;
	runId: string;
	steps: readonly ChainStep[];
	projectRoot: string;
	registry: AgentRegistry;
	domainContext?: string;
	models?: ModelConfig;
	thinking?: ThinkingConfig;
	projectSkills?: readonly string[];
	skillPaths?: readonly string[];
	completionLabel?: string;
	planSlug?: string;
	compaction?: CompactionConfig;
}

export interface ChainCompilerStepMetadata {
	stepId: string;
	stage: DurableChainStageOptions;
	topologyIndex: number;
	stepIndex: number;
	purpose: StagePromptPurpose;
	requiresPlanReviewTarget: boolean;
	expectedPlanSlug?: string;
	reviewProducerStepIds?: readonly string[];
	memberIndex?: number;
	syntax?: ParallelGroupStep["syntax"];
}

interface CompiledChainGraph {
	graph: RunGraph;
	steps: ChainCompilerStepMetadata[];
	frontier: string[];
}

interface ShouldRunChainInlineOptions {
	completionLabel?: string;
}

export interface DurableChainStageOptions {
	declarationId?: string;
	purpose?: StagePromptPurpose;
	reviewTarget?: ChainStage["reviewTarget"];
	expectedPlanSlug?: string;
	requiresPlanReviewTarget?: boolean;
	completionPolicy?: { kind: "once" };
	model?: string;
	thinkingLevel?: ChainStage["thinkingLevel"];
	stageId?: string;
	instruction?: string;
	terminalGate?: string;
	name: string;
	agentReference?: ResolvedAgentReference;
	loop: boolean;
	prompt?: string;
}

export interface DurableChainStageSpawnOptions {
	completionLabel?: string;
	role: string;
	agentReference?: ResolvedAgentReference;
	domainContext?: string;
	cwd: string;
	model: string;
	prompt: string;
	projectSkills?: string[];
	skillPaths?: string[];
	thinkingLevel?: ReturnType<typeof getThinkingForRole>;
	compaction?: CompactionConfig;
	planSlug?: string;
}

interface CompileStageOptions {
	runId: string;
	stage: ChainStage;
	topologyIndex: number;
	stepIndex: number;
	purpose: StagePromptPurpose;
	requiresPlanReviewTarget: boolean;
	expectedPlanSlug?: string;
	frontier: readonly string[];
	domainContext?: string;
	models?: ModelConfig;
	thinking?: ThinkingConfig;
	projectRoot: string;
	projectSkills?: readonly string[];
	skillPaths?: readonly string[];
	completionLabel?: string;
	planSlug?: string;
	compaction?: CompactionConfig;
	registry: AgentRegistry;
	memberIndex?: number;
	syntax?: ParallelGroupStep["syntax"];
}

export function compileChainToGraph(
	options: CompileChainToGraphOptions,
): CompiledChainGraph {
	const normalized = normalizeChain({ ...options, steps: [...options.steps] });
	if (!normalized.ok)
		throw new Error(normalized.errors.map((error) => error.message).join("\n"));
	options = { ...options, steps: normalized.stages };
	if (
		shouldRunChainInline(options.steps, {
			completionLabel: options.completionLabel,
		})
	)
		throw new Error("Cannot compile inline-only chain steps.");
	const graphSteps: RunGraphStep[] = [];
	const metadata: ChainCompilerStepMetadata[] = [];
	let frontier: string[] = [];
	const planSlug = resolvePlanSlug({
		completionLabel: options.completionLabel,
		planSlug: options.planSlug,
	});

	options.steps.forEach((step, topologyIndex) => {
		const stages = isParallelGroupStep(step) ? step.stages : [step];
		const promptContexts = stages.map((stage) => ({
			stage,
			purpose: stage.purpose ?? { kind: "default" as const },
			requiresPlanReviewTarget: stage.requiresPlanReviewTarget ?? false,
		}));
		const stepIndex = topologyIndex + 1;

		if (isParallelGroupStep(step)) {
			const siblings = promptContexts.map((promptContext, memberIndex) =>
				compileStage({
					...options,
					...promptContext,
					topologyIndex,
					stepIndex,
					memberIndex: memberIndex + 1,
					syntax: step.syntax,
					frontier,
					planSlug,
					expectedPlanSlug: promptContext.stage.expectedPlanSlug ?? planSlug,
				}),
			);

			graphSteps.push(...siblings.map((sibling) => sibling.graphStep));
			metadata.push(...siblings.map((sibling) => sibling.metadata));
			frontier = siblings.map((sibling) => sibling.graphStep.id);
			return;
		}

		const promptContext = promptContexts[0];
		if (!promptContext) {
			throw new Error(`Missing stage at topology index ${topologyIndex}.`);
		}
		const compiled = compileStage({
			...options,
			...promptContext,
			topologyIndex,
			stepIndex,
			frontier,
			planSlug,
			expectedPlanSlug: promptContext.stage.expectedPlanSlug ?? planSlug,
		});
		graphSteps.push(compiled.graphStep);
		metadata.push(compiled.metadata);
		frontier = [compiled.graphStep.id];
	});

	const stepIds = new Map(
		metadata.map((item) => [item.stage.stageId, item.stepId]),
	);
	for (const item of metadata) {
		const target = item.stage.reviewTarget;
		if (!target) continue;
		const producerStepIds = target.producerStageIds.map((id) => {
			const stepId = stepIds.get(id);
			if (!stepId) throw new Error(`Unknown producer stage "${id}".`);
			return stepId;
		});
		item.reviewProducerStepIds = producerStepIds;
		const backend = graphSteps.find((step) => step.id === item.stepId)?.backend;
		if (backend?.options)
			backend.options.reviewProducerStepIds = producerStepIds;
	}

	return {
		graph: {
			steps: graphSteps,
			edges: graphSteps.flatMap((step) =>
				step.dependsOn.map((dependency) => ({
					from: dependency,
					to: step.id,
				})),
			),
		},
		steps: metadata,
		frontier,
	};
}

export function shouldRunChainInline(
	steps: readonly ChainStep[],
	options: ShouldRunChainInlineOptions = {},
): boolean {
	if (options.completionLabel !== undefined) return true;

	const hasLoop = steps.some((s) => !isParallelGroupStep(s) && s.loop);
	if (hasLoop) return true;

	return steps.some((step) => {
		if (isParallelGroupStep(step)) {
			return step.stages.some(stageHasCompletionCheck);
		}

		return stageHasCompletionCheck(step);
	});
}

function compileStage(options: CompileStageOptions): {
	graphStep: RunGraphStep;
	metadata: ChainCompilerStepMetadata;
} {
	assertNormalizedStage(options.stage);
	const stage = durableStageOptions(options.stage);
	const promptMetadata = chainPromptMetadata(options);
	const stepId = chainStepId({
		stageName: stage.name,
		stepIndex: options.stepIndex,
		memberIndex: options.memberIndex,
	});

	const backend = chainAgentBackend({
		stage,
		spawn: durableStageSpawnOptions(options.stage, options),
		promptMetadata,
		domainContext: options.domainContext,
	});

	return {
		graphStep: {
			id: stepId,
			runId: options.runId,
			title: stage.name,
			kind: "agent",
			backend,
			dependsOn: [...options.frontier],
			inputArtifacts: [],
		},
		metadata: {
			stepId,
			stage,
			...promptMetadata,
		},
	};
}

type ChainPromptMetadata = Omit<ChainCompilerStepMetadata, "stepId" | "stage">;

function chainPromptMetadata(
	options: CompileStageOptions,
): ChainPromptMetadata {
	return {
		topologyIndex: options.topologyIndex,
		stepIndex: options.stepIndex,
		purpose: options.purpose,
		requiresPlanReviewTarget: options.requiresPlanReviewTarget,
		...(options.expectedPlanSlug !== undefined && {
			expectedPlanSlug: options.expectedPlanSlug,
		}),
		...(options.memberIndex !== undefined && {
			memberIndex: options.memberIndex,
		}),
		...(options.syntax !== undefined && { syntax: options.syntax }),
	};
}

function chainAgentBackend(options: {
	stage: DurableChainStageOptions;
	spawn: DurableChainStageSpawnOptions;
	promptMetadata: ChainPromptMetadata;
	domainContext?: string;
}): BackendSpec {
	return {
		name: "cosmonauts-subagent",
		options: {
			source: "chain",
			stage: options.stage,
			spawn: options.spawn,
			...options.promptMetadata,
			...(options.domainContext !== undefined && {
				domainContext: options.domainContext,
			}),
		},
	};
}

function durableStageSpawnOptions(
	stage: ChainStage,
	options: CompileStageOptions,
): DurableChainStageSpawnOptions {
	const agentReference = stage.agentReference;
	return {
		role: stage.name,
		...(agentReference !== undefined && { agentReference }),
		...(options.domainContext !== undefined && {
			domainContext: options.domainContext,
		}),
		cwd: options.projectRoot,
		model: stage.model ?? "",
		prompt: stage.instruction ?? "",
		...(options.projectSkills !== undefined && {
			projectSkills: [...options.projectSkills],
		}),
		...(options.skillPaths !== undefined && {
			skillPaths: [...options.skillPaths],
		}),
		...withDefined("thinkingLevel", stage.thinkingLevel),
		...(options.compaction !== undefined && {
			compaction: { ...options.compaction },
		}),
		...(options.planSlug !== undefined && { planSlug: options.planSlug }),
		completionLabel: options.completionLabel,
	};
}

function durableStageOptions(stage: ChainStage): DurableChainStageOptions {
	return {
		name: stage.name,
		...(stage.agentReference !== undefined && {
			agentReference: stage.agentReference,
		}),
		loop: stage.loop ?? false,
		stageId: stage.stageId,
		declarationId: stage.declarationId,
		purpose: stage.purpose,
		reviewTarget: stage.reviewTarget,
		expectedPlanSlug: stage.expectedPlanSlug,
		requiresPlanReviewTarget: stage.requiresPlanReviewTarget,
		completionPolicy: { kind: "once" },
		model: stage.model,
		thinkingLevel: stage.thinkingLevel,
		instruction: stage.instruction,
		terminalGate: stage.terminalGate,
		...(stage.prompt !== undefined && { prompt: stage.prompt }),
	};
}

function withDefined<Key extends string, Value>(
	key: Key,
	value: Value | undefined,
): { [K in Key]: Value } | Record<string, never> {
	return value === undefined ? {} : ({ [key]: value } as { [K in Key]: Value });
}

function stageHasCompletionCheck(stage: ChainStage): boolean {
	return (
		stage.completionCheck !== undefined ||
		stage.completionPolicy?.kind === "state"
	);
}

function chainStepId(options: {
	stageName: string;
	stepIndex: number;
	memberIndex?: number;
}): string {
	const parts = ["chain", String(options.stepIndex)];
	if (options.memberIndex !== undefined) {
		parts.push(String(options.memberIndex));
	}
	parts.push(slugForStepId(options.stageName));
	return parts.join("-");
}

function slugForStepId(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}
