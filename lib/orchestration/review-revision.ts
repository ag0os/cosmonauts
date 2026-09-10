import {
	assessPlanReviewRound,
	type BlockedPlanReviewRound,
	type PlanReviewRoundBlockReason,
} from "../plans/index.ts";
import { validateSlug } from "../plans/plan-manager.ts";
import { hasExactKeys, isRecord } from "./record-shape.ts";

export const PLAN_REVIEW_REPORT_TOKEN = "COSMO_PLAN_REVIEW";
export const REVIEW_REVISION_REPORT_TOKEN = "COSMO_REVIEW_REVISION";

export interface PlanReviewTarget {
	planSlug: string;
	reviewRound: number;
}

type ReviewRoundBlockReason =
	| "missing-review-report"
	| "malformed-review-report"
	| "multiple-review-reports"
	| "nonterminal-review-report"
	| "missing-review-target"
	| "mismatched-review-target"
	| "ambiguous-review-target"
	| "revision-reported-unaddressed"
	| "missing-addressed-evidence"
	| "mismatched-addressed-evidence"
	| "nonpreceding-addressed-evidence"
	| "stale-addressed-evidence"
	| PlanReviewRoundBlockReason;

export interface ReviewRoundBlock {
	reason: ReviewRoundBlockReason;
	planSlug?: string;
	reviewRound?: number;
	expectedPlanSlug?: string;
	latestReviewRound?: number;
	addressedReviewRound?: number;
	addressedAtTopologyIndex?: number;
	taskManagerTopologyIndex?: number;
	findingIds?: readonly string[];
	reportedReason?: string;
}

interface TaskManagerReviewEvidence {
	target: PlanReviewTarget;
	addressedAtTopologyIndex?: number;
	addressedReviewRound?: number;
}

export type ReviewCheck =
	| { status: "accepted"; target: PlanReviewTarget }
	| { status: "unaddressed"; block: ReviewRoundBlock };

interface ValidatePlanReviewReportOptions {
	assistantText: string;
	projectRoot: string;
	expectedPlanSlug?: string;
}

interface ValidateReviewRevisionReportOptions {
	assistantText: string;
	projectRoot: string;
	expectedTarget?: PlanReviewTarget;
}

type ReviewReport =
	| { kind: "plan-review"; target: PlanReviewTarget }
	| {
			kind: "review-revision";
			target: PlanReviewTarget;
			status: "addressed";
	  }
	| {
			kind: "review-revision";
			target: PlanReviewTarget;
			status: "unaddressed";
			reason: string;
	  };

export function parsePlanReviewTarget(
	value: unknown,
): PlanReviewTarget | undefined {
	return parseTarget(value, ["planSlug", "reviewRound"]);
}

/** Parse one exact report line using the grammar shared by prompt producers. */
export function parseReviewReportLine(line: string): ReviewReport | undefined {
	const planReviewPayload = parseTokenPayload(line, PLAN_REVIEW_REPORT_TOKEN);
	if (planReviewPayload !== undefined) {
		const target = parsePlanReviewTarget(planReviewPayload);
		return target ? { kind: "plan-review", target } : undefined;
	}

	const revisionPayload = parseTokenPayload(line, REVIEW_REVISION_REPORT_TOKEN);
	if (!isRecord(revisionPayload)) return undefined;
	const status = revisionPayload.status;
	if (status === "addressed") {
		const target = parseTarget(revisionPayload, [
			"planSlug",
			"reviewRound",
			"status",
		]);
		return target
			? { kind: "review-revision", target, status: "addressed" }
			: undefined;
	}
	if (status !== "unaddressed" || typeof revisionPayload.reason !== "string") {
		return undefined;
	}
	const reason = revisionPayload.reason.trim();
	const target = parseTarget(revisionPayload, [
		"planSlug",
		"reviewRound",
		"status",
		"reason",
	]);
	return target && reason
		? { kind: "review-revision", target, status: "unaddressed", reason }
		: undefined;
}

type TerminalReviewReportCheck =
	| { status: "accepted"; report: ReviewReport }
	| { status: "unaddressed"; block: ReviewRoundBlock };

/** Parse one sole report of the requested kind from the last nonblank line. */
export function parseTerminalReviewReport(
	assistantText: string,
	expectedKind: ReviewReport["kind"],
): TerminalReviewReportCheck {
	const token =
		expectedKind === "plan-review"
			? PLAN_REVIEW_REPORT_TOKEN
			: REVIEW_REVISION_REPORT_TOKEN;
	const lines = assistantText.split(/\r?\n/u);
	const reportIndexes = lines.flatMap((line, index) =>
		line.startsWith(`${token}:`) ? [index] : [],
	);
	if (reportIndexes.length === 0) {
		return blockReport("missing-review-report");
	}
	if (reportIndexes.length > 1) {
		return blockReport("multiple-review-reports");
	}

	const reportIndex = reportIndexes[0];
	const reportLine = reportIndex === undefined ? undefined : lines[reportIndex];
	if (reportLine === undefined) {
		return blockReport("missing-review-report");
	}
	const report = parseReviewReportLine(reportLine);
	if (report?.kind !== expectedKind) {
		return blockReport("malformed-review-report");
	}

	const lastNonblankIndex = lines.findLastIndex(
		(line) => line.trim().length > 0,
	);
	if (reportIndex !== lastNonblankIndex) {
		return blockReport("nonterminal-review-report", report.target);
	}

	return { status: "accepted", report };
}

/** Validate one terminal plan-review report against current plan artifacts. */
export async function validatePlanReviewReport(
	options: ValidatePlanReviewReportOptions,
): Promise<ReviewCheck> {
	const parsed = parseTerminalReviewReport(
		options.assistantText,
		"plan-review",
	);
	if (parsed.status === "unaddressed") return parsed;
	const target = parsed.report.target;

	const assessment = await assessPlanReviewRound({
		projectRoot: options.projectRoot,
		planSlug: target.planSlug,
		reviewRound: target.reviewRound,
		assessment: "target",
	});
	if (assessment.status === "blocked") {
		return blockAssessment(assessment);
	}

	if (
		options.expectedPlanSlug !== undefined &&
		target.planSlug !== options.expectedPlanSlug
	) {
		return {
			status: "unaddressed",
			block: {
				reason: "mismatched-review-target",
				planSlug: target.planSlug,
				reviewRound: target.reviewRound,
				expectedPlanSlug: options.expectedPlanSlug,
			},
		};
	}

	return { status: "accepted", target };
}

/** Validate one terminal revision report against the bound target and artifacts. */
export async function validateReviewRevisionReport(
	options: ValidateReviewRevisionReportOptions,
): Promise<ReviewCheck> {
	const parsed = parseTerminalReviewReport(
		options.assistantText,
		"review-revision",
	);
	if (parsed.status === "unaddressed") return parsed;
	if (parsed.report.kind !== "review-revision") {
		return blockReport("malformed-review-report");
	}
	const { report } = parsed;
	const target = report.target;

	if (options.expectedTarget === undefined) {
		return blockReport("missing-review-target", target);
	}
	if (
		target.planSlug !== options.expectedTarget.planSlug ||
		target.reviewRound !== options.expectedTarget.reviewRound
	) {
		return {
			status: "unaddressed",
			block: {
				reason: "mismatched-review-target",
				planSlug: target.planSlug,
				reviewRound: target.reviewRound,
				expectedPlanSlug: options.expectedTarget.planSlug,
				latestReviewRound: options.expectedTarget.reviewRound,
			},
		};
	}
	if (report.status === "unaddressed") {
		return {
			status: "unaddressed",
			block: {
				reason: "revision-reported-unaddressed",
				planSlug: target.planSlug,
				reviewRound: target.reviewRound,
				reportedReason: report.reason,
			},
		};
	}

	const assessment = await assessPlanReviewRound({
		projectRoot: options.projectRoot,
		planSlug: target.planSlug,
		reviewRound: target.reviewRound,
		assessment: "addressed",
	});
	if (assessment.status === "blocked") {
		return blockAssessment(assessment);
	}

	return { status: "accepted", target };
}

/** Apply the task-decomposition freshness rule shared by inline and durable runs. */
export async function assessTaskManagerReviewGate(options: {
	activePlanReview?: TaskManagerReviewEvidence;
	taskManagerTopologyIndex: number;
	projectRoot: string;
}): Promise<ReviewRoundBlock | undefined> {
	const { activePlanReview, taskManagerTopologyIndex } = options;
	if (!activePlanReview) {
		return { reason: "missing-review-target", taskManagerTopologyIndex };
	}
	if (
		activePlanReview.addressedAtTopologyIndex === undefined ||
		activePlanReview.addressedReviewRound === undefined
	) {
		return {
			reason: "missing-addressed-evidence",
			...activePlanReview.target,
			taskManagerTopologyIndex,
		};
	}
	if (
		activePlanReview.addressedReviewRound !==
		activePlanReview.target.reviewRound
	) {
		return {
			reason: "mismatched-addressed-evidence",
			...activePlanReview.target,
			addressedReviewRound: activePlanReview.addressedReviewRound,
			addressedAtTopologyIndex: activePlanReview.addressedAtTopologyIndex,
			taskManagerTopologyIndex,
		};
	}
	if (activePlanReview.addressedAtTopologyIndex >= taskManagerTopologyIndex) {
		return {
			reason: "nonpreceding-addressed-evidence",
			...activePlanReview.target,
			addressedReviewRound: activePlanReview.addressedReviewRound,
			addressedAtTopologyIndex: activePlanReview.addressedAtTopologyIndex,
			taskManagerTopologyIndex,
		};
	}

	const assessment = await assessPlanReviewRound({
		projectRoot: options.projectRoot,
		planSlug: activePlanReview.target.planSlug,
		reviewRound: activePlanReview.addressedReviewRound,
		assessment: "addressed",
	});
	if (assessment.status === "accepted") return undefined;

	return {
		reason:
			assessment.reason === "stale-review-round"
				? "stale-addressed-evidence"
				: assessment.reason,
		planSlug: assessment.planSlug,
		reviewRound: activePlanReview.target.reviewRound,
		addressedReviewRound: activePlanReview.addressedReviewRound,
		addressedAtTopologyIndex: activePlanReview.addressedAtTopologyIndex,
		taskManagerTopologyIndex,
		...(assessment.latestReviewRound !== undefined && {
			latestReviewRound: assessment.latestReviewRound,
		}),
		...(assessment.findingIds !== undefined && {
			findingIds: assessment.findingIds,
		}),
	};
}

export function formatReviewRoundBlockError(block: ReviewRoundBlock): string {
	const identity = block.planSlug
		? ` for ${block.planSlug}${block.reviewRound ? ` round ${block.reviewRound}` : ""}`
		: "";
	return `Plan review target${identity} blocked: ${block.reason}`;
}

const REVIEW_ROUND_BLOCK_REASONS = new Set<ReviewRoundBlockReason>([
	"missing-review-report",
	"malformed-review-report",
	"multiple-review-reports",
	"nonterminal-review-report",
	"missing-review-target",
	"mismatched-review-target",
	"ambiguous-review-target",
	"revision-reported-unaddressed",
	"missing-addressed-evidence",
	"mismatched-addressed-evidence",
	"nonpreceding-addressed-evidence",
	"stale-addressed-evidence",
	"invalid-plan-slug",
	"plan-not-found",
	"unsafe-plan-directory",
	"plan-artifact-io",
	"plan-status-indeterminate",
	"inactive-plan",
	"review-artifact-io",
	"unsafe-review-entry",
	"invalid-review-name",
	"duplicate-review-round",
	"review-round-gap",
	"no-assessable-review-round",
	"malformed-review",
	"stale-review-round",
	"missing-review-reference",
]);

/** Narrow persisted chain-local block payloads before projecting them. */
const BLOCK_ALLOWED_KEYS = new Set([
	"reason",
	"planSlug",
	"reviewRound",
	"expectedPlanSlug",
	"latestReviewRound",
	"addressedReviewRound",
	"addressedAtTopologyIndex",
	"taskManagerTopologyIndex",
	"findingIds",
	"reportedReason",
]);

const BLOCK_ROUND_KEYS = [
	"reviewRound",
	"latestReviewRound",
	"addressedReviewRound",
] as const;

const BLOCK_INDEX_KEYS = [
	"addressedAtTopologyIndex",
	"taskManagerTopologyIndex",
] as const;

/** Every optional round and topology-index field holds a well-formed number. */
function hasValidBlockNumbers(value: Record<string, unknown>): boolean {
	return (
		BLOCK_ROUND_KEYS.every((key) => optionalPositiveInteger(value[key])) &&
		BLOCK_INDEX_KEYS.every((key) => optionalTopologyIndex(value[key]))
	);
}

/** Absent, or an array of nonempty finding ids. */
function isValidFindingIds(value: unknown): boolean {
	if (value === undefined) return true;
	return (
		Array.isArray(value) &&
		value.every(
			(findingId) => typeof findingId === "string" && findingId.length > 0,
		)
	);
}

/** Absent, or a nonblank reported reason. */
function isValidReportedReason(value: unknown): boolean {
	if (value === undefined) return true;
	return typeof value === "string" && value.trim().length > 0;
}

export function parseReviewRoundBlock(
	value: unknown,
): ReviewRoundBlock | undefined {
	if (!isRecord(value) || !isReviewRoundBlockReason(value.reason)) {
		return undefined;
	}
	if (Object.keys(value).some((key) => !BLOCK_ALLOWED_KEYS.has(key))) {
		return undefined;
	}
	if (!optionalSlug(value.planSlug) || !optionalSlug(value.expectedPlanSlug)) {
		return undefined;
	}
	if (!hasValidBlockNumbers(value)) return undefined;
	if (!isValidFindingIds(value.findingIds)) return undefined;
	if (!isValidReportedReason(value.reportedReason)) return undefined;
	return value as unknown as ReviewRoundBlock;
}

function isReviewRoundBlockReason(
	value: unknown,
): value is ReviewRoundBlockReason {
	return (
		typeof value === "string" &&
		REVIEW_ROUND_BLOCK_REASONS.has(value as ReviewRoundBlockReason)
	);
}

function optionalSlug(value: unknown): boolean {
	if (value === undefined) return true;
	if (typeof value !== "string") return false;
	try {
		validateSlug(value);
		return true;
	} catch {
		return false;
	}
}

function optionalPositiveInteger(value: unknown): boolean {
	return (
		value === undefined ||
		(typeof value === "number" && Number.isInteger(value) && value > 0)
	);
}

function optionalTopologyIndex(value: unknown): boolean {
	return (
		value === undefined ||
		(typeof value === "number" && Number.isInteger(value) && value >= 0)
	);
}

function blockAssessment(
	assessment: BlockedPlanReviewRound,
): Extract<ReviewCheck, { status: "unaddressed" }> {
	return {
		status: "unaddressed",
		block: {
			reason: assessment.reason,
			planSlug: assessment.planSlug,
			...(assessment.reviewRound !== undefined && {
				reviewRound: assessment.reviewRound,
			}),
			...(assessment.latestReviewRound !== undefined && {
				latestReviewRound: assessment.latestReviewRound,
			}),
			...(assessment.findingIds !== undefined && {
				findingIds: assessment.findingIds,
			}),
		},
	};
}

function blockReport(
	reason: ReviewRoundBlockReason,
	target?: PlanReviewTarget,
): Extract<TerminalReviewReportCheck, { status: "unaddressed" }> {
	return {
		status: "unaddressed",
		block: {
			reason,
			...(target !== undefined && {
				planSlug: target.planSlug,
				reviewRound: target.reviewRound,
			}),
		},
	};
}

function parseTokenPayload(line: string, token: string): unknown {
	const prefix = `${token}: `;
	if (!line.startsWith(prefix)) return undefined;
	try {
		return JSON.parse(line.slice(prefix.length));
	} catch {
		return undefined;
	}
}

function parseTarget(
	value: unknown,
	expectedKeys: readonly string[],
): PlanReviewTarget | undefined {
	if (!isRecord(value) || !hasExactKeys(value, expectedKeys)) return undefined;
	if (
		typeof value.planSlug !== "string" ||
		typeof value.reviewRound !== "number" ||
		!Number.isInteger(value.reviewRound) ||
		value.reviewRound <= 0
	) {
		return undefined;
	}
	try {
		validateSlug(value.planSlug);
	} catch {
		return undefined;
	}
	return { planSlug: value.planSlug, reviewRound: value.reviewRound };
}
