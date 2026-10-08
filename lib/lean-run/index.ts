export {
	createExternalBuilderBackend,
	type ExternalBackendKind,
	type ExternalBuilderBackendOptions,
	leanPackageResolver,
	type ProcessOutcome,
	type ProcessRequest,
	type ProcessRunner,
} from "./backends/external.ts";
export {
	clearRunBaseSha,
	readRunBaseSha,
	writeRunBaseSha,
} from "./base-sha.ts";
export {
	type BuildContextPackOptions,
	buildContextPack,
	readVerificationCommands,
} from "./context-pack.ts";
export { parseStageEnvelope } from "./envelope.ts";
export { builderTaskId } from "./git.ts";
export {
	type BlastRadius,
	blastRadius,
	isSpecFile,
	SPEC_FILE_PATTERN,
} from "./graph/blast-radius.ts";
export { renderChangeDiagram } from "./graph/mermaid.ts";
export {
	type PlanVersusActual,
	planVersusActual,
} from "./graph/plan-vs-actual.ts";
export {
	type DispositionedFinding,
	type FindingDisposition,
	renderPrBody,
} from "./graph/pr-body.ts";
export { parsePlan } from "./plan.ts";
export { createBlastRadiusProvider } from "./providers/blast-radius.ts";
export { createBlastTestsProvider } from "./providers/blast-tests.ts";
export { createDefaultProviders } from "./providers/default.ts";
export { createHealthProvider } from "./providers/health.ts";
export { createMutationProvider } from "./providers/mutation.ts";
export { planVersusActualProvider } from "./providers/plan-vs-actual.ts";
export { createVerifyProvider } from "./providers/verify.ts";
export {
	createRunRecord,
	loadRunRecord,
	type RunLocation,
	runRecordDir,
	saveEnvelope,
	saveFacts,
	saveManifest,
	saveStats,
} from "./record.ts";
export {
	DEFAULT_RUN_BUDGET,
	defaultReviewBase,
	MAX_RUN_TIME_MS,
	type RunBuildOptions,
	type RunReviewOptions,
	runBuild,
	runReview,
} from "./run-build.ts";
export { summarizeRun } from "./summary.ts";
export * from "./types.ts";
