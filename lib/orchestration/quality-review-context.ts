import { join } from "node:path";
import type { SnapshotAnalysisAuthorization } from "../../domains/shared/extensions/project-tools/analysis-consent.ts";
import type { QualityReviewArtifactSink } from "./quality-review-artifacts.ts";

export interface QualityReviewSessionContext {
	readonly runId: string;
	readonly analysisConsent?: SnapshotAnalysisAuthorization;
	readonly workspaceRoot: string;
	readonly sourceRoot?: string;
	readonly materialsRoot: string;
	readonly base: string;
	readonly changedFiles: readonly string[];
	readonly hostRunStoreRoot: string;
	readonly artifactSink: QualityReviewArtifactSink;
	readonly activeSpawns: Set<string>;
	readonly allowedLenses: ReadonlySet<string>;
	readonly attemptedLenses: Set<string>;
	readonly integrityFailures: string[];
	assessmentActive?: boolean;
}

export function buildQualityReviewPanelPrompt(
	context: QualityReviewSessionContext,
	requestedPrompt: string,
): string {
	return `Host captured review scope for run ${context.runId}:\n- Base: ${context.base}\n- Changed files: ${JSON.stringify(context.changedFiles)}\n- Full diff: ${join(context.materialsRoot, "full.diff")}\nReview this captured scope. Do not substitute another base or checkout.\n\n${requestedPrompt}`;
}

export function assertQualityReviewModelIdentity(
	resolved: { provider: string; id: string },
	observed: { provider: string; id: string } | undefined,
): void {
	if (
		!observed ||
		observed.provider !== resolved.provider ||
		observed.id !== resolved.id
	)
		throw new Error("Reviewer model changed after host resolution");
}

const qualitySessions = new Map<string, QualityReviewSessionContext>();

export function registerQualityReviewSession(
	sessionId: string,
	context: QualityReviewSessionContext,
): void {
	if (qualitySessions.has(sessionId))
		throw new Error(`Duplicate quality review session: ${sessionId}`);
	qualitySessions.set(sessionId, context);
}

export function getQualityReviewSession(
	sessionId: string,
): QualityReviewSessionContext | undefined {
	return qualitySessions.get(sessionId);
}

export function removeQualityReviewSession(sessionId: string): void {
	qualitySessions.delete(sessionId);
}
