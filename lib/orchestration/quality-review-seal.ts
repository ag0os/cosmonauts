import type { QualityReviewArtifactSink } from "./quality-review-artifacts.ts";

/** Correlate each required lens with one persisted reviewer session. */
export function reviewerEvidenceModels(
	sink: QualityReviewArtifactSink,
	requiredLenses: readonly string[],
): string[] {
	const persistedLensIds = new Set(
		sink.references().map((artifact) => artifact.id),
	);
	const missingLenses = requiredLenses.filter(
		(lens) => !persistedLensIds.has(`qm/reviewers/${lens}.md`),
	);
	if (missingLenses.length > 0)
		throw new Error(`Missing reviewer evidence: ${missingLenses.join(", ")}`);
	const seenSpawns = new Set<string>();
	const seenSessions = new Set<string>();
	return requiredLenses.map((lens) =>
		reviewerModelLine(sink, lens, seenSpawns, seenSessions),
	);
}

function reviewerModelLine(
	sink: QualityReviewArtifactSink,
	lens: string,
	seenSpawns: Set<string>,
	seenSessions: Set<string>,
): string {
	const artifact = sink
		.references()
		.find((item) => item.id === `qm/reviewers/${lens}.md`);
	const metadata = artifact?.metadata;
	const model = metadata?.resolvedModel;
	if (
		!hasReviewerSession(metadata, lens) ||
		!hasReviewerModel(model) ||
		seenSpawns.has(metadata.spawnId) ||
		seenSessions.has(metadata.sessionId)
	)
		throw new Error(`Reviewer evidence correlation failed: ${lens}`);
	seenSpawns.add(metadata.spawnId);
	seenSessions.add(metadata.sessionId);
	return `${lens}: ${model.provider}/${model.id}`;
}

function hasReviewerSession(
	metadata: Record<string, unknown> | undefined,
	lens: string,
): metadata is Record<string, unknown> & {
	spawnId: string;
	sessionId: string;
} {
	return (
		metadata?.resolvedRole === `coding/${lens}` &&
		typeof metadata.spawnId === "string" &&
		typeof metadata.sessionId === "string" &&
		typeof metadata.finalTextDigest === "string"
	);
}

function hasReviewerModel(
	model: unknown,
): model is { provider: string; id: string } {
	return (
		typeof model === "object" &&
		model !== null &&
		"provider" in model &&
		"id" in model &&
		typeof model.provider === "string" &&
		typeof model.id === "string"
	);
}
