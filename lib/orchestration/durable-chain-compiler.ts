import type { AgentRegistry } from "../agents/resolver.ts";
import type {
	BackendSpec,
	RunGraph,
	RunGraphStep,
} from "../durable-runtime/index.ts";
import { isParallelGroupStep } from "./chain-steps.ts";
import { getModelForRole, getThinkingForRole } from "./model-resolution.ts";
import { buildStagePrompt, resolvePlanSlug } from "./stage-prompts.ts";
import type {
	ChainStage,
	ChainStep,
	CompactionConfig,
	ModelConfig,
	ParallelGroupStep,
	ThinkingConfig,
} from "./types.ts";

export interface CompileChainToGraphOptions {
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
	stepIndex: number;
	memberIndex?: number;
	syntax?: ParallelGroupStep["syntax"];
}

export interface CompiledChainGraph {
	graph: RunGraph;
	steps: ChainCompilerStepMetadata[];
	frontier: string[];
}

export interface ShouldRunChainInlineOptions {
	completionLabel?: string;
}

export interface DurableChainStageOptions {
	name: string;
	loop: boolean;
	prompt?: string;
}

export interface DurableChainStageSpawnOptions {
	role: string;
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
	stepIndex: number;
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
	const graphSteps: RunGraphStep[] = [];
	const metadata: ChainCompilerStepMetadata[] = [];
	let frontier: string[] = [];
	const planSlug = resolvePlanSlug({
		completionLabel: options.completionLabel,
		planSlug: options.planSlug,
	});

	options.steps.forEach((step, index) => {
		const stepIndex = index + 1;

		if (isParallelGroupStep(step)) {
			const siblings = step.stages.map((stage, memberIndex) =>
				compileStage({
					runId: options.runId,
					stage,
					stepIndex,
					memberIndex: memberIndex + 1,
					syntax: step.syntax,
					frontier,
					domainContext: options.domainContext,
					models: options.models,
					thinking: options.thinking,
					projectRoot: options.projectRoot,
					projectSkills: options.projectSkills,
					skillPaths: options.skillPaths,
					completionLabel: options.completionLabel,
					planSlug,
					compaction: options.compaction,
					registry: options.registry,
				}),
			);

			graphSteps.push(...siblings.map((sibling) => sibling.graphStep));
			metadata.push(...siblings.map((sibling) => sibling.metadata));
			frontier = siblings.map((sibling) => sibling.graphStep.id);
			return;
		}

		const compiled = compileStage({
			runId: options.runId,
			stage: step,
			stepIndex,
			frontier,
			domainContext: options.domainContext,
			models: options.models,
			thinking: options.thinking,
			projectRoot: options.projectRoot,
			projectSkills: options.projectSkills,
			skillPaths: options.skillPaths,
			completionLabel: options.completionLabel,
			planSlug,
			compaction: options.compaction,
			registry: options.registry,
		});
		graphSteps.push(compiled.graphStep);
		metadata.push(compiled.metadata);
		frontier = [compiled.graphStep.id];
	});

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
	const stage = durableStageOptions(options.stage);
	const stepId = chainStepId({
		stageName: stage.name,
		stepIndex: options.stepIndex,
		memberIndex: options.memberIndex,
	});

	const backend = chainAgentBackend({
		stage,
		spawn: durableStageSpawnOptions(options.stage, options),
		stepIndex: options.stepIndex,
		memberIndex: options.memberIndex,
		syntax: options.syntax,
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
			stepIndex: options.stepIndex,
			...(options.memberIndex !== undefined && {
				memberIndex: options.memberIndex,
			}),
			...(options.syntax !== undefined && { syntax: options.syntax }),
		},
	};
}

function chainAgentBackend(options: {
	stage: DurableChainStageOptions;
	spawn: DurableChainStageSpawnOptions;
	stepIndex: number;
	memberIndex?: number;
	syntax?: ParallelGroupStep["syntax"];
	domainContext?: string;
}): BackendSpec {
	return {
		name: "cosmonauts-subagent",
		options: {
			source: "chain",
			stage: options.stage,
			spawn: options.spawn,
			stepIndex: options.stepIndex,
			...(options.memberIndex !== undefined && {
				memberIndex: options.memberIndex,
			}),
			...(options.syntax !== undefined && { syntax: options.syntax }),
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
	return {
		role: stage.name,
		...(options.domainContext !== undefined && {
			domainContext: options.domainContext,
		}),
		cwd: options.projectRoot,
		model: getModelForRole(
			stage.name,
			options.models,
			options.registry,
			options.domainContext,
		),
		prompt: buildStagePrompt(stage, {
			completionLabel: options.completionLabel,
		}),
		...(options.projectSkills !== undefined && {
			projectSkills: [...options.projectSkills],
		}),
		...(options.skillPaths !== undefined && {
			skillPaths: [...options.skillPaths],
		}),
		...withDefined(
			"thinkingLevel",
			getThinkingForRole(
				stage.name,
				options.thinking,
				options.registry,
				options.domainContext,
			),
		),
		...(options.compaction !== undefined && {
			compaction: { ...options.compaction },
		}),
		...(options.planSlug !== undefined && { planSlug: options.planSlug }),
	};
}

function durableStageOptions(stage: ChainStage): DurableChainStageOptions {
	return {
		name: stage.name,
		loop: stage.loop,
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
	return stage.completionCheck !== undefined;
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
