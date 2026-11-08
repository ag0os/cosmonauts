import { createHash } from "node:crypto";
import type {
	ChildSessionEvidence,
	SessionSpawnPolicy,
	SpawnPolicyRequest,
} from "../agents/session-policy.ts";
import { finalAssistantEvidence } from "./assistant-text.ts";
import {
	assertQualityReviewModelIdentity,
	buildQualityReviewPanelPrompt,
	type QualityReviewSessionContext,
} from "./quality-review-context.ts";
import { qualityReviewPanelModel } from "./quality-review-models.ts";

export function qualityReviewSpawnPolicy(
	qualityContext?: QualityReviewSessionContext,
	childPolicy?: () => import("../agents/session-policy.ts").SessionPolicy,
): SessionSpawnPolicy {
	return {
		...(qualityContext && {
			runtime: () => {
				if (!qualityContext.baseRuntime)
					throw new Error("Quality review base runtime is missing");
				return qualityContext.baseRuntime;
			},
		}),
		authorize: (request) => {
			if (request.callerRole === "coding/quality-manager" && !qualityContext)
				return "quality review context missing";
			if (!qualityContext) return undefined;
			const { resolvedTargetRole } = request;
			if (forbiddenPanelTarget(request, qualityContext))
				return "quality panel permits only configured reviewer lenses";
			const lens = resolvedTargetRole.replace(/^coding\//, "");
			if (qualityContext.attemptedLenses.has(lens)) {
				qualityContext.integrityFailures.push(
					`Duplicate reviewer spawn: ${lens}`,
				);
				return `duplicate reviewer ${lens}`;
			}
			return undefined;
		},
		...(qualityContext && {
			prepare: (request: SpawnPolicyRequest) => ({
				cwd: qualityContext.workspaceRoot,
				prompt: buildQualityReviewPanelPrompt(qualityContext, request.prompt),
				model: qualityReviewPanelModel(
					request.resolvedTargetRole,
					qualityContext.reviewerModel,
				),
				sessionPolicy: requiredChildPolicy(childPolicy),
			}),
			onRegistered: (spawnId: string, resolvedRole: string) => {
				qualityContext.activeSpawns.add(spawnId);
				qualityContext.attemptedLenses.add(
					resolvedRole.replace(/^coding\//, ""),
				);
			},
			onFailure: (message: string) => {
				qualityContext.integrityFailures.push(message);
			},
			onSettled: (spawnId: string) => {
				qualityContext.activeSpawns.delete(spawnId);
			},
			onCompleted: (params: ChildSessionEvidence) =>
				recordReviewerResult(params, qualityContext),
		}),
	};
}

async function recordReviewerResult(
	params: ChildSessionEvidence,
	qualityContext: QualityReviewSessionContext,
): Promise<void> {
	const { session, resolvedRole, resolvedModel } = params;
	if (
		!qualityContext ||
		qualityContext.assessmentActive === false ||
		!qualityContext.artifactSink.reviewersOpen()
	)
		return;
	if (!resolvedRole || !resolvedModel)
		throw new Error("Missing reviewer host correlation");
	assertQualityReviewModelIdentity(resolvedModel, session.model);
	const lens = resolvedRole.replace(/^coding\//, "");
	// The spawn summary may fall back to earlier or synthesized text; evidence may not.
	const evidence = finalAssistantEvidence([...session.messages]);
	if ("failure" in evidence)
		throw new Error(`Reviewer ${lens} evidence rejected: ${evidence.failure}`);
	await qualityContext.artifactSink.writeReviewer({
		runId: qualityContext.runId,
		lens,
		spawnId: params.spawnId,
		sessionId: session.sessionId,
		resolvedRole,
		resolvedModel,
		outcome: "success",
		digest: createHash("sha256").update(evidence.text).digest("hex"),
		fullText: evidence.text,
	});
	qualityContext.activeSpawns.delete(params.spawnId);
}

function requiredChildPolicy(
	factory:
		| (() => import("../agents/session-policy.ts").SessionPolicy)
		| undefined,
) {
	if (!factory) throw new Error("Quality review child policy is missing");
	return factory();
}

function forbiddenPanelTarget(
	request: SpawnPolicyRequest,
	qualityContext: QualityReviewSessionContext,
): boolean {
	const { callerRole, resolvedTargetRole, model, thinkingLevel } = request;
	return (
		callerRole !== "coding/quality-manager" ||
		![
			"coding/reviewer",
			"coding/security-reviewer",
			"coding/performance-reviewer",
			"coding/ux-reviewer",
		].includes(resolvedTargetRole) ||
		!qualityContext.allowedLenses.has(
			resolvedTargetRole.replace(/^coding\//, ""),
		) ||
		model !== undefined ||
		thinkingLevel !== undefined
	);
}
