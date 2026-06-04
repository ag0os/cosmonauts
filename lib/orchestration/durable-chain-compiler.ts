import type {
	BackendSpec,
	RunGraph,
	RunGraphStep,
} from "../durable-runtime/index.ts";
import { isParallelGroupStep } from "./chain-steps.ts";
import type { ChainStage, ChainStep, ParallelGroupStep } from "./types.ts";

export interface CompileChainToGraphOptions {
	runId: string;
	steps: readonly ChainStep[];
	domainContext?: string;
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

interface CompileStageOptions {
	runId: string;
	stage: ChainStage;
	stepIndex: number;
	frontier: readonly string[];
	domainContext?: string;
	memberIndex?: number;
	syntax?: ParallelGroupStep["syntax"];
}

export function compileChainToGraph(
	options: CompileChainToGraphOptions,
): CompiledChainGraph {
	const graphSteps: RunGraphStep[] = [];
	const metadata: ChainCompilerStepMetadata[] = [];
	let frontier: string[] = [];

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
	if (options.completionLabel) return true;

	return steps.some((step) => {
		if (isParallelGroupStep(step)) {
			return step.stages.some(stageRequiresInline);
		}

		return stageRequiresInline(step);
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

function durableStageOptions(stage: ChainStage): DurableChainStageOptions {
	return {
		name: stage.name,
		loop: stage.loop,
		...(stage.prompt !== undefined && { prompt: stage.prompt }),
	};
}

function stageRequiresInline(stage: ChainStage): boolean {
	return stage.loop || stage.completionCheck !== undefined;
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
