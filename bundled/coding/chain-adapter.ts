import { unqualifyRole } from "../../lib/agents/qualified-role.ts";
import { isParallelGroupStep } from "../../lib/orchestration/chain-steps.ts";
import { misplacedQualityReviewResult } from "../../lib/orchestration/quality-review-chain.ts";
import {
	launchQualityReview,
	qualityReviewPlacement,
	qualityReviewPlanSlug,
} from "../../lib/orchestration/quality-review-launch.ts";
import type { QualityReviewRunOptions } from "../../lib/orchestration/quality-review-run.ts";
import type {
	ChainAdapter,
	ChainStage,
	ChainStageContext,
	ChainStep,
} from "../../lib/orchestration/types.ts";
import { evaluateDefaultCompletionState } from "./chain-completion.ts";
import {
	buildStagePrompt,
	deriveStagePromptPurpose,
	requiresPlanReviewTarget,
	stageIdentity,
} from "./chain-prompts.ts";

const configKeys: Readonly<Record<string, string>> = {
	planner: "planner",
	"task-manager": "taskManager",
	coordinator: "coordinator",
	worker: "worker",
	"quality-manager": "qualityManager",
	"integration-verifier": "integrationVerifier",
	reviewer: "reviewer",
	fixer: "fixer",
};
export function roleToConfigKey(role: string): string | undefined {
	return configKeys[unqualifyRole(role)];
}
const leaves = (steps: readonly ChainStep[]) =>
	steps.flatMap((step) => (isParallelGroupStep(step) ? step.stages : [step]));
function legacyStage(stage: ChainStage): ChainStage {
	const reference = stage.agentReference;
	return reference &&
		reference.binding.source === "default" &&
		reference.requested.qualifiedId === reference.resolved.qualifiedId
		? { ...stage, agentReference: undefined }
		: stage;
}
function legacyTopology(steps: readonly ChainStep[]): ChainStep[] {
	return steps.map((step) =>
		isParallelGroupStep(step)
			? { ...step, stages: step.stages.map(legacyStage) as typeof step.stages }
			: legacyStage(step),
	);
}
const legacyPurpose = (context: ChainStageContext) =>
	deriveStagePromptPurpose(
		legacyTopology(context.steps),
		context.topologyIndex,
		legacyStage(context.stage),
	);

function codingPurpose(
	context: ChainStageContext,
): NonNullable<ChainStage["purpose"]> {
	const legacy = legacyPurpose(context);
	const author = legacy.kind === "default" ? undefined : legacy.authorIdentity;
	const targetStageIds = leaves(context.steps.slice(0, context.topologyIndex))
		.filter((stage) => stageIdentity(legacyStage(stage)) === author)
		.flatMap((stage) => (stage.stageId ? [stage.stageId] : []));
	if (legacy.kind === "plan-review")
		return { kind: "plan-review", targetStageIds };
	return legacy.kind === "revision" && legacy.reviewKind === "plan"
		? { kind: "plan-revision", targetStageIds }
		: { kind: "default" };
}
function codingReviewTarget(
	context: ChainStageContext,
): ChainStage["reviewTarget"] {
	if (
		!requiresPlanReviewTarget(
			context.steps,
			context.topologyIndex,
			context.stage,
		)
	)
		return undefined;
	const producerStageIds = context.steps
		.slice(0, context.topologyIndex)
		.flatMap((step, index) =>
			leaves([step])
				.filter((candidate) => {
					const purpose = legacyPurpose({
						...context,
						stage: candidate,
						topologyIndex: index,
					});
					return purpose.kind === "revision" && purpose.reviewKind === "plan";
				})
				.flatMap((stage) => (stage.stageId ? [stage.stageId] : [])),
		);
	return { source: "active-plan-review", producerStageIds };
}
function codingRoleOverrides(context: ChainStageContext): Partial<ChainStage> {
	const key = roleToConfigKey(
		context.stage.agentReference?.resolved.qualifiedId ?? context.stage.name,
	);
	return key
		? { model: context.models?.[key], thinkingLevel: context.thinking?.[key] }
		: {};
}
function codingTerminalGate(context: ChainStageContext): Partial<ChainStage> & {
	errors?: readonly import("../../lib/orchestration/types.ts").ChainNormalizationError[];
} {
	const placement = qualityReviewPlacement({
		steps: [context.stage],
		registry: context.registry,
	});
	return {
		...(placement !== "absent" ? { terminalGate: "quality-review" } : {}),
		...(placement === "refused"
			? {
					errors: [
						{
							code: "terminal" as const,
							message: "Quality Manager stage binding is invalid.",
						},
					],
				}
			: {}),
	};
}

/** Current coding content translates its conventions into the library protocol. */
export const codingChainAdapter: ChainAdapter = {
	defaultEpisodes: true,
	defaultModel: "anthropic/claude-opus-4-7",
	classifyStage(context) {
		return {
			purpose: codingPurpose(context),
			requiresPlanReviewTarget: requiresPlanReviewTarget(
				context.steps,
				context.topologyIndex,
				context.stage,
			),
			reviewTarget: codingReviewTarget(context),
			...codingRoleOverrides(context),
			...codingTerminalGate(context),
			...(context.stage.loop
				? {
						completionPolicy: {
							kind: "state" as const,
							evaluate: (root: string) =>
								evaluateDefaultCompletionState(root, context.completionLabel),
						},
					}
				: {}),
		};
	},
	buildStagePrompt(context) {
		return buildStagePrompt(legacyStage(context.stage), {
			completionLabel: context.completionLabel,
			purpose: legacyPurpose(context),
		});
	},
	terminalGates: {
		"quality-review": async (context) => {
			const review = await launchQualityReview({
				...qualityOptions(context.hostContext),
				projectRoot: context.projectRoot,
				operatorNote: context.prompt,
				signal: context.signal,
				planSlug: qualityReviewPlanSlug({
					planSlug: context.configuredPlanSlug ?? context.planSlug,
					completionLabel: context.completionLabel,
				}),
				refusalReason: context.refusalReason,
			});
			return {
				success: review.stepResult.outcome === "success",
				outcome: review.stepResult.outcome,
				nextAction: review.stepResult.nextAction,
				iterations: context.refusalReason ? 0 : 1,
				durationMs: 0,
				summary: review.stepResult.summary,
				run: review.ref,
				artifacts: review.stepResult.artifacts,
				...(review.stepResult.outcome === "success"
					? {}
					: { error: review.stepResult.summary }),
			};
		},
	},
	async refuse(config) {
		return misplacedQualityReviewResult(
			config,
			qualityOptions(config.terminalGateContext),
		);
	},
};

function qualityOptions(
	value: unknown,
): Pick<QualityReviewRunOptions, "execute"> {
	if (
		value &&
		typeof value === "object" &&
		"execute" in value &&
		typeof value.execute === "function"
	)
		return {
			execute: value.execute as NonNullable<QualityReviewRunOptions["execute"]>,
		};
	return {};
}
