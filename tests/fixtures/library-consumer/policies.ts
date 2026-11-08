import type { CosmonautsRuntime, NamedChain } from "cosmonauts";
import type { normalizeChain } from "cosmonauts/chains";
import type { SpawnConfig } from "cosmonauts/orchestration/types";

// These roles are synthetic test vocabulary. No coding/QM policy or resource is
// loaded: the consumer chooses classification and the library carries it.
type ChainAdapter = NonNullable<
	Parameters<typeof normalizeChain>[0]["chainAdapter"]
>;
type ChainStage = Parameters<
	NonNullable<ChainAdapter["classifyStage"]>
>[0]["stage"];
type ChainStep = Parameters<
	NonNullable<ChainAdapter["classifyStage"]>
>[0]["steps"][number];
type SessionPolicy = NonNullable<SpawnConfig["sessionPolicy"]>;
type SessionPolicies = NonNullable<
	Parameters<typeof CosmonautsRuntime.create>[0]["sessionPolicies"]
>;

const leaves = (steps: readonly ChainStep[]) =>
	steps.flatMap((step) => ("kind" in step ? step.stages : [step]));
const identity = (stage: ChainStage) =>
	stage.agentReference?.resolved.qualifiedId ?? stage.name;
const role = (stage: ChainStage) => identity(stage).split("/").at(-1);

interface FixturePurpose {
	kind: "default" | "plan-review" | "revision";
	authorIdentity?: string;
	reviewKind?: "plan" | "generic";
}

/** Test classification uses the nearest earlier producer and intervening review. */
export function deriveStagePromptPurpose(
	steps: readonly ChainStep[],
	index: number,
	stage: ChainStage,
): FixturePurpose {
	const before = leaves(steps.slice(0, index));
	const author = before.findLast(
		(candidate) => identity(candidate) === identity(stage),
	);
	if (role(stage) === "plan-reviewer") {
		const repeated = leaves(steps.slice(index + 1)).find((candidate) =>
			before.some((prior) => identity(prior) === identity(candidate)),
		);
		return repeated
			? { kind: "plan-review", authorIdentity: identity(repeated) }
			: leaves(steps.slice(index)).some(
						(candidate) => role(candidate) === "task-manager",
					)
				? { kind: "plan-review" }
				: { kind: "default" };
	}
	if (!author) return { kind: "default" };
	const between = before.slice(before.lastIndexOf(author) + 1);
	const reviewers = between.filter((candidate) =>
		role(candidate)?.endsWith("reviewer"),
	);
	return reviewers.length
		? {
				kind: "revision",
				authorIdentity: identity(stage),
				reviewKind: reviewers.some(
					(candidate) => role(candidate) === "plan-reviewer",
				)
					? "plan"
					: "generic",
			}
		: { kind: "default" };
}

export function getDefaultStagePrompt(name: string): string {
	return `Fixture stage: ${name.split("/").at(-1)}.`;
}

export function buildStagePrompt(
	stage: ChainStage,
	options: { completionLabel?: string; purpose?: FixturePurpose } = {},
): string {
	const base = getDefaultStagePrompt(stage.name);
	let prompt =
		stage.prompt === undefined
			? base
			: stage.prompt.startsWith("User request:")
				? `${base}\n\n${stage.prompt}`
				: stage.prompt;
	const purpose = options.purpose;
	if (purpose?.kind === "plan-review")
		prompt +=
			'\n\nPlan-review purpose: COSMO_PLAN_REVIEW: {"planSlug":"<slug>","reviewRound":<positive integer>}.';
	if (purpose?.kind === "revision")
		prompt +=
			purpose.reviewKind === "plan"
				? '\n\nRevision purpose: COSMO_REVIEW_REVISION: {"planSlug":"<slug>","reviewRound":<positive integer>,"status":"addressed"}.'
				: "\n\nRevision purpose: respond to the earlier review.";
	if (role(stage) === "coordinator" && options.completionLabel)
		prompt += `\n\nFixture scope: ${options.completionLabel}`;
	return prompt;
}

type StageContext = Parameters<NonNullable<ChainAdapter["classifyStage"]>>[0];

function classifiedPurpose(
	purpose: FixturePurpose,
	targetStageIds: string[],
): ChainStage["purpose"] {
	if (purpose.kind === "plan-review")
		return { kind: "plan-review", targetStageIds };
	if (purpose.kind === "revision" && purpose.reviewKind === "plan")
		return { kind: "plan-revision", targetStageIds };
	return { kind: "default" };
}

function roleOverrides(context: StageContext): Partial<ChainStage> {
	const key = role(context.stage)?.replace(/-([a-z])/g, (_, letter: string) =>
		letter.toUpperCase(),
	);
	return key
		? { model: context.models?.[key], thinkingLevel: context.thinking?.[key] }
		: {};
}

export const consumerChainAdapter: ChainAdapter = {
	defaultEpisodes: true,
	defaultModel: "test/model",
	classifyStage(context) {
		const purpose = deriveStagePromptPurpose(
			context.steps,
			context.topologyIndex,
			context.stage,
		);
		const before = leaves(context.steps.slice(0, context.topologyIndex));
		const targetStageIds = before
			.filter((candidate) => identity(candidate) === purpose.authorIdentity)
			.flatMap((candidate) => (candidate.stageId ? [candidate.stageId] : []));
		const requiresPlanReviewTarget =
			role(context.stage) === "task-manager" &&
			leaves(context.steps.slice(0, context.topologyIndex + 1)).some(
				(candidate) => role(candidate) === "plan-reviewer",
			);
		const producerStageIds = context.steps
			.slice(0, context.topologyIndex)
			.flatMap((step, index) =>
				leaves([step])
					.filter((candidate) => {
						const prior = deriveStagePromptPurpose(
							context.steps,
							index,
							candidate,
						);
						return prior.kind === "revision" && prior.reviewKind === "plan";
					})
					.flatMap((candidate) =>
						candidate.stageId ? [candidate.stageId] : [],
					),
			);
		return {
			purpose: classifiedPurpose(purpose, targetStageIds),
			requiresPlanReviewTarget,
			...(context.stage.loop || context.definition.loop
				? {
						completionPolicy: {
							kind: "state" as const,
							evaluate: async () => ({ status: "pending" as const }),
						},
					}
				: {}),
			...(requiresPlanReviewTarget
				? {
						reviewTarget: {
							source: "active-plan-review",
							producerStageIds,
						},
					}
				: {}),
			...roleOverrides(context),
			...(role(context.stage) === "checkpoint"
				? { terminalGate: "fixture" }
				: {}),
		};
	},
	buildStagePrompt(context) {
		return buildStagePrompt(context.stage, {
			completionLabel: context.completionLabel,
			purpose: deriveStagePromptPurpose(
				context.steps,
				context.topologyIndex,
				context.stage,
			),
		});
	},
	terminalGates: {
		fixture: async (context) => ({
			success: !context.refusalReason,
			iterations: context.refusalReason ? 0 : 1,
			durationMs: 0,
			summary: context.refusalReason ?? "Consumer checkpoint accepted",
			...(context.refusalReason ? { error: context.refusalReason } : {}),
		}),
	},
	async refuse(_config, errors) {
		if (!errors.some((error) => error.code === "terminal")) return undefined;
		return {
			success: false,
			stageResults: [],
			totalDurationMs: 0,
			errors: errors.map((error) => `Consumer refused: ${error.message}`),
		};
	},
};

/** All hooks are explicit consumer input, including transcript and tool policy. */
export function createConsumerSessionPolicy(
	options: SessionPolicy = {},
): SessionPolicy {
	return {
		toolPreset: "readonly",
		filterTools: (tools) => tools.filter((tool) => tool === "read"),
		...options,
	};
}

export const consumerSessionPolicies: SessionPolicies = {
	forAgent: (definition) =>
		definition.id === "policy-reader"
			? createConsumerSessionPolicy()
			: undefined,
	spawnPolicy: () => ({
		authorize: (request) =>
			request.resolvedTargetRole === "visitor/forbidden"
				? "Consumer delegation denied"
				: undefined,
	}),
	interactiveDenial: (definition) =>
		definition.id === "policy-reader"
			? "Consumer requires a controlled launch"
			: undefined,
};

export const consumerChains: NamedChain[] = [
	{
		name: "review-cycle",
		description: "Consumer review and revision",
		episodes: true,
		chain: "planner -> plan-reviewer -> planner -> task-manager",
	},
	{
		name: "loop",
		description: "Consumer loop",
		episodes: true,
		chain: "planner -> coordinator",
	},
	{
		name: "checkpoint",
		description: "Consumer terminal gate",
		episodes: true,
		chain: "checkpoint",
	},
];
