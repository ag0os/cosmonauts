import { validateSlug } from "../plans/plan-manager.ts";

export const PLAN_REVIEW_REPORT_TOKEN = "COSMO_PLAN_REVIEW";
export const REVIEW_REVISION_REPORT_TOKEN = "COSMO_REVIEW_REVISION";

export interface PlanReviewTarget {
	planSlug: string;
	reviewRound: number;
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

function hasExactKeys(
	value: Record<string, unknown>,
	expectedKeys: readonly string[],
): boolean {
	const actualKeys = Object.keys(value).sort();
	const sortedExpectedKeys = [...expectedKeys].sort();
	return (
		actualKeys.length === sortedExpectedKeys.length &&
		actualKeys.every((key, index) => key === sortedExpectedKeys[index])
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
