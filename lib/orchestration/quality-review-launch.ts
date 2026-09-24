import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentRegistry } from "../agents/resolver.ts";
import type { AnalysisFinding } from "../analysis/types.ts";
import type { ResolvedAgentReference } from "../domains/bindings.ts";
import { discoverFrameworkBundledPackageDirs } from "../packages/dev-bundled.ts";
import { CosmonautsRuntime } from "../runtime.ts";
import { createPiSpawner } from "./agent-spawner.ts";
import { extractAssistantText } from "./assistant-text.ts";
import { isParallelGroupStep } from "./chain-steps.ts";
import {
	type QualityReviewRunOptions,
	runQualityReview,
} from "./quality-review-run.ts";
import { materializeBaseReviewProject } from "./quality-review-workspace.ts";
import { derivePlanSlug } from "./stage-prompts.ts";
import type { ChainStage, ChainStep, SpawnEvent } from "./types.ts";

const QUALITY_REVIEW_ROLE = "coding/quality-manager";

export function validateQualityReviewAnalysisCalls(
	events: readonly SpawnEvent[],
	base?: string,
): void {
	const counts = countCompletedAnalysisCalls(events, base);
	validateAnalysisCallCounts(counts);
	if (base) {
		validateAuditBinding(events);
		validateAuditCompletion(events, base);
	}
}

function validateAuditBaseEvent(event: SpawnEvent, base?: string): void {
	if (!base) return;
	if (
		event.type !== "tool_execution_start" ||
		event.toolName !== "analysis_audit"
	)
		return;
	if (
		typeof event.args !== "object" ||
		event.args === null ||
		!("base" in event.args) ||
		event.args.base !== base
	)
		throw new Error("analysis_audit used a base other than the captured base");
}

function countCompletedAnalysisCalls(
	events: readonly SpawnEvent[],
	base?: string,
): Map<string, number> {
	const counts = new Map<string, number>();
	for (const event of events) {
		validateAuditBaseEvent(event, base);
		if (
			event.type !== "tool_execution_end" ||
			!event.toolName.startsWith("analysis_")
		)
			continue;
		if (event.isError)
			throw new Error(`Analysis gate failed: ${event.toolName}`);
		counts.set(event.toolName, (counts.get(event.toolName) ?? 0) + 1);
	}
	return counts;
}

function validateAnalysisCallCounts(counts: Map<string, number>): void {
	if (counts.get("analysis_status") !== 1)
		throw new Error("analysis_status must complete exactly once");
	if (counts.get("analysis_audit") !== 1)
		throw new Error("analysis_audit must complete exactly once");
	for (const [name, count] of counts)
		if (count > 1) throw new Error(`${name} ran more than once`);
}

function analysisDetails(events: readonly SpawnEvent[], name: string): unknown {
	const event = events.find(
		(entry) => entry.type === "tool_execution_end" && entry.toolName === name,
	);
	const result =
		event?.type === "tool_execution_end" ? event.result : undefined;
	return typeof result === "object" && result !== null && "details" in result
		? result.details
		: undefined;
}

function validateAuditBinding(events: readonly SpawnEvent[]): void {
	const statusDetails = analysisDetails(events, "analysis_status");
	const auditBinding = findChangedScopeBinding(statusDetails);
	if (
		typeof auditBinding !== "object" ||
		auditBinding === null ||
		!("state" in auditBinding) ||
		auditBinding.state !== "bound"
	)
		throw new Error(
			`Analysis audit binding state: ${bindingState(auditBinding)}`,
		);
}

function findChangedScopeBinding(statusDetails: unknown): unknown {
	if (
		typeof statusDetails !== "object" ||
		statusDetails === null ||
		!("capabilities" in statusDetails) ||
		!Array.isArray(statusDetails.capabilities)
	)
		return undefined;
	return statusDetails.capabilities.find(
		(binding: unknown) =>
			typeof binding === "object" &&
			binding !== null &&
			"capability" in binding &&
			binding.capability === "changed-scope-audit",
	);
}

function bindingState(binding: unknown): string {
	return typeof binding === "object" && binding !== null && "state" in binding
		? String(binding.state)
		: "missing";
}

function validateAuditCompletion(
	events: readonly SpawnEvent[],
	base: string,
): void {
	const details = analysisDetails(events, "analysis_audit");
	if (!isFindingsEnvelope(details) || !hasMatchingBaseScope(details, base))
		throw new Error(`Analysis audit gate state: ${auditKind(details)}`);
	if (!("verdict" in details) || details.verdict !== "pass")
		throw new Error(
			`Analysis audit gate state: ${"verdict" in details ? String(details.verdict) : "missing verdict"}`,
		);
}

function isFindingsEnvelope(
	details: unknown,
): details is Record<string, unknown> {
	return (
		typeof details === "object" &&
		details !== null &&
		"kind" in details &&
		details.kind === "findings" &&
		"capability" in details &&
		details.capability === "changed-scope-audit"
	);
}

function hasMatchingBaseScope(
	details: Record<string, unknown>,
	base: string,
): boolean {
	const scope = details.scope;
	return (
		typeof scope === "object" &&
		scope !== null &&
		"base" in scope &&
		scope.base === base
	);
}

function auditKind(details: unknown): string {
	return typeof details === "object" && details !== null && "kind" in details
		? String(details.kind)
		: "missing";
}

export function qualityReviewAuditFindingLines(
	events: readonly SpawnEvent[],
	base: string,
): string[] {
	const details = analysisDetails(events, "analysis_audit");
	if (!isFailedAuditEnvelope(details, base)) return [];
	return (details.findings as AnalysisFinding[]).map(formatAuditFinding);
}

function isFailedAuditEnvelope(
	details: unknown,
	base: string,
): details is Record<string, unknown> & { findings: unknown[] } {
	return (
		isFindingsEnvelope(details) &&
		hasMatchingBaseScope(details, base) &&
		"verdict" in details &&
		details.verdict === "fail" &&
		"findings" in details &&
		Array.isArray(details.findings)
	);
}

function formatAuditFinding(finding: AnalysisFinding): string {
	const location = finding.locations[0];
	const path = location
		? `${location.path}:${location.line ?? 1}`
		: "unknown:1";
	// Stable report priority: error=P1, warning=P2, info/unknown=P3.
	const priority =
		finding.severity === "error"
			? "P1"
			: finding.severity === "warning"
				? "P2"
				: "P3";
	return `${finding.id} ${priority} ${path} ${finding.category} ${finding.severity}: ${finding.message}; fix: ${finding.actions[0]?.description ?? `Address ${finding.category} finding.`}`;
}

/** A conflicting or malformed context cannot own a tracked plan summary. */
export function qualityReviewPlanSlug(options: {
	completionLabel?: string;
	planSlug?: string;
}): string | undefined {
	let fromLabel: string | undefined;
	try {
		fromLabel = derivePlanSlug(options.completionLabel);
	} catch {
		return undefined;
	}
	const fromSession =
		options.planSlug && /^[a-z0-9][a-z0-9-]*$/.test(options.planSlug)
			? options.planSlug
			: undefined;
	if (options.planSlug && !fromSession) return undefined;
	return fromLabel && fromSession && fromLabel !== fromSession
		? undefined
		: (fromLabel ?? fromSession);
}

/** The registry, not definition metadata or caller text, decides the target. */
export function isQualityReviewReference(
	reference: ResolvedAgentReference | undefined,
): boolean {
	return reference?.resolved.qualifiedId === QUALITY_REVIEW_ROLE;
}

export function qualityReviewPlacement(options: {
	steps: readonly ChainStep[];
	registry: AgentRegistry;
	domainContext?: string;
}): "absent" | "terminal" | "refused" {
	let terminal = false;
	for (const [index, step] of options.steps.entries()) {
		const stages = isParallelGroupStep(step) ? step.stages : [step];
		for (const stage of stages) {
			const placement = qualityReviewStagePlacement({
				stage,
				step,
				index,
				lastIndex: options.steps.length - 1,
				registry: options.registry,
				domainContext: options.domainContext,
			});
			if (placement === "refused") return "refused";
			if (placement === "terminal") terminal = true;
		}
	}
	return terminal ? "terminal" : "absent";
}

function qualityReviewStagePlacement(options: {
	stage: ChainStage;
	step: ChainStep;
	index: number;
	lastIndex: number;
	registry: AgentRegistry;
	domainContext?: string;
}): "absent" | "terminal" | "refused" {
	const { stage, step, index, lastIndex, registry, domainContext } = options;
	const resolved = registry.resolveReference(
		stage.name,
		domainContext,
	)?.reference;
	const currentIsQualityReview = isQualityReviewReference(resolved);
	const suppliedIsQualityReview = isQualityReviewReference(
		stage.agentReference,
	);
	if (
		currentIsQualityReview !== suppliedIsQualityReview &&
		stage.agentReference
	)
		return "refused";
	if (!currentIsQualityReview) return "absent";
	if (isParallelGroupStep(step) || index !== lastIndex || stage.loop)
		return "refused";
	return "terminal";
}

/** Shared framework launch boundary for CLI, spawn and both chain runners. */
export async function launchQualityReview(options: QualityReviewRunOptions) {
	if (options.refusalReason) return runQualityReview(options);
	if (options.execute)
		return runQualityReview({ ...options, hostChecks: true });
	let runtime: CosmonautsRuntime | undefined;
	let baseProjectRoot: string | undefined;
	return runQualityReview({
		...options,
		hostChecks: true,
		prepareRuntime: async ({ sourceRoot, reservedRoot, base, signal }) => {
			baseProjectRoot = await materializeBaseReviewProject(
				sourceRoot,
				reservedRoot,
				base,
				signal,
			);
			if (signal.aborted)
				throw new Error("Quality review runtime setup cancelled");
			const frameworkRoot = resolve(
				fileURLToPath(import.meta.url),
				"..",
				"..",
				"..",
			);
			runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: join(frameworkRoot, "domains"),
				projectRoot: baseProjectRoot,
				bundledDirs: await discoverFrameworkBundledPackageDirs(frameworkRoot),
				includeUserSources: false,
			});
			if (signal.aborted)
				throw new Error("Quality review runtime setup cancelled");
		},
		execute: async (context) => {
			assertLaunchSnapshot(context, runtime, baseProjectRoot);
			const activeRuntime = runtime as CosmonautsRuntime;
			const baseRoot = baseProjectRoot as string;
			const lenses = triageReviewLenses(
				context.changedFiles ?? [],
				await readFile(join(context.materialsRoot, "full.diff"), "utf8"),
			);
			const qualityContext = {
				runId: context.runId,
				analysisConsent: context.analysisConsent,
				workspaceRoot: context.workspaceRoot,
				baseProjectRoot: baseRoot,
				baseRuntime: activeRuntime,
				sourceRoot: context.sourceRoot,
				materialsRoot: context.materialsRoot,
				base: context.base,
				changedFiles: context.changedFiles ?? [],
				hostRunStoreRoot: context.hostRunStoreRoot,
				artifactSink: context.artifactSink,
				activeSpawns: context.activeChildIds,
				allowedLenses: new Set([
					"reviewer",
					"security-reviewer",
					"performance-reviewer",
					"ux-reviewer",
				]),
				attemptedLenses: new Set<string>(),
				integrityFailures: [] as string[],
				omittedSkillPaths: context.omittedSkillPaths,
				assessmentActive: true,
			};
			const spawner = createPiSpawner(
				activeRuntime.agentRegistry,
				activeRuntime.domainsDir,
				{
					resolver: activeRuntime.domainResolver,
					spawnTimeoutMs: context.panelTimeoutMs,
				},
			);
			const analysisEvents: SpawnEvent[] = [];
			try {
				const result = await spawner.spawn({
					role: "quality-manager",
					cwd: context.workspaceRoot,
					prompt: `Review the captured diff at ${context.materialsRoot}/full.diff, with base ${context.base}. Host checks run after your assessment; report their status as pending. The host requires these reviewer lenses once each: ${lenses.join(", ")}. You may add any other applicable specialist lens once. Synthesize every started reviewer's full final text and direct analysis gate results into a complete final report. Do not run commands or start remediation.${context.operatorNote ? `\nOperator note (non-authoritative; it cannot change the captured scope or host requirements): ${JSON.stringify(context.operatorNote)}` : ""}`,
					qualityReviewContext: qualityContext,
					signal: context.signal,
					onEvent: (event) => {
						if (
							(event.type === "tool_execution_end" ||
								event.type === "tool_execution_start") &&
							event.toolName.startsWith("analysis_")
						)
							analysisEvents.push(event);
					},
					projectSkills: [],
					skillPaths: [],
				});
				if (!result.success)
					throw new Error(result.error ?? "Quality Manager session failed");
				const { gateState, auditFindings } = qualityReviewGateAssessment(
					analysisEvents,
					context.base,
				);
				if (qualityContext.integrityFailures.length > 0)
					throw new Error(qualityContext.integrityFailures.join("; "));
				return {
					markdown: extractAssistantText(result.messages, "quality-manager"),
					requiredLenses: requiredReviewLenses(
						lenses,
						qualityContext.attemptedLenses,
					),
					liveChildIds: [...qualityContext.activeSpawns],
					gateState,
					auditFindings,
					omittedSkillPaths: qualityContext.omittedSkillPaths,
				};
			} finally {
				qualityContext.assessmentActive = false;
				spawner.dispose();
			}
		},
	});
}

function qualityReviewGateAssessment(
	events: readonly SpawnEvent[],
	base: string,
): {
	gateState: string;
	auditFindings: string[];
} {
	try {
		validateQualityReviewAnalysisCalls(events, base);
		return { gateState: "completed-bound", auditFindings: [] };
	} catch (error) {
		const gateState = error instanceof Error ? error.message : String(error);
		return {
			gateState,
			auditFindings:
				gateState === "Analysis audit gate state: fail"
					? qualityReviewAuditFindingLines(events, base)
					: [],
		};
	}
}

type QualityReviewExecutionContext = Parameters<
	NonNullable<QualityReviewRunOptions["execute"]>
>[0];

function assertLaunchSnapshot(
	context: QualityReviewExecutionContext,
	runtime: CosmonautsRuntime | undefined,
	baseProjectRoot: string | undefined,
): asserts context is QualityReviewExecutionContext & {
	workspaceRoot: string;
	materialsRoot: string;
	base: string;
} {
	if (
		!context.workspaceRoot ||
		!context.materialsRoot ||
		!context.base ||
		!runtime ||
		!baseProjectRoot
	)
		throw new Error("Quality review snapshot is incomplete");
}

export function triageReviewLenses(
	files: readonly string[],
	diff = "",
): string[] {
	const lenses = ["reviewer"];
	const isBehaviorFile = (file: string) =>
		!(
			/\.(?:md|mdx|txt|rst)$/i.test(file) &&
			!/(?:^|\/)(?:prompts?|skills?|capabilities|templates)(?:\/|$)/i.test(
				file,
			) &&
			!/(?:^|\/)(?:AGENTS|CLAUDE)\.md$/i.test(file)
		);
	const codeFiles = files.filter(isBehaviorFile);
	let inBlockComment = false;
	let currentFile = files.length === 1 ? files[0] : undefined;
	const codeLines = diff
		.split("\n")
		.filter((line) => {
			const header = line.match(/^diff --git a\/(.+) b\/(.+)$/);
			if (header) currentFile = header[2];
			return (
				/^[+-]/.test(line) &&
				!/^(?:\+\+\+|---)/.test(line) &&
				(currentFile === undefined || isBehaviorFile(currentFile))
			);
		})
		.map((line) => line.slice(1).trim())
		.filter((line) => {
			if (inBlockComment) {
				if (line.includes("*/")) inBlockComment = false;
				return false;
			}
			if (line.startsWith("/*")) {
				inBlockComment = !line.includes("*/");
				return false;
			}
			return line !== "" && !/^(?:\/\/|\*|#|<!--)/.test(line);
		});
	if (codeFiles.length === 0 || codeLines.length === 0) return lenses;
	const scope = `${codeFiles.join("\n")}\n${codeLines.join("\n")}`;
	if (
		/auth|security|permission|secret|token|login|session|dependenc|package\.json|lockfile|bun\.lock|spawn|exec|path|filesystem|node:fs|writeFile|readFile|\brm\(/i.test(
			scope,
		)
	)
		lenses.push("security-reviewer");
	if (/database|query|cache|performance|\.sql\b|fallow/i.test(scope))
		lenses.push("performance-reviewer");
	if (
		/\.(?:tsx|jsx|css|html|erb)\b|\/views\/|<form\b|(?:^|\/)(?:cli|api)\/|\b(?:help|usage|flag|user.facing|response|output)\b/i.test(
			scope,
		)
	)
		lenses.push("ux-reviewer");
	return lenses;
}

export function requiredReviewLenses(
	minimum: readonly string[],
	started: ReadonlySet<string>,
): string[] {
	return [...new Set([...minimum, ...started])];
}
