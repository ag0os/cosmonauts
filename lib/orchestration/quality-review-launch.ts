import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentRegistry } from "../agents/resolver.ts";
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
import { derivePlanSlug } from "./stage-prompts.ts";
import type { ChainStep, SpawnEvent } from "./types.ts";

export const QUALITY_REVIEW_ROLE = "coding/quality-manager";

export function validateQualityReviewAnalysisCalls(
	events: readonly SpawnEvent[],
	base?: string,
): void {
	const counts = new Map<string, number>();
	for (const event of events) {
		if (
			base &&
			event.type === "tool_execution_start" &&
			event.toolName === "analysis_audit" &&
			(typeof event.args !== "object" ||
				event.args === null ||
				!("base" in event.args) ||
				event.args.base !== base)
		)
			throw new Error(
				"analysis_audit used a base other than the captured base",
			);
		if (
			event.type !== "tool_execution_end" ||
			!event.toolName.startsWith("analysis_")
		)
			continue;
		if (event.isError)
			throw new Error(`Analysis gate failed: ${event.toolName}`);
		counts.set(event.toolName, (counts.get(event.toolName) ?? 0) + 1);
	}
	if (counts.get("analysis_status") !== 1)
		throw new Error("analysis_status must complete exactly once");
	if (counts.get("analysis_audit") !== 1)
		throw new Error("analysis_audit must complete exactly once");
	for (const [name, count] of counts)
		if (count > 1) throw new Error(`${name} ran more than once`);
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
			const resolved = options.registry.resolveReference(
				stage.name,
				options.domainContext,
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
			if (!currentIsQualityReview) continue;
			if (
				isParallelGroupStep(step) ||
				index !== options.steps.length - 1 ||
				stage.loop
			)
				return "refused";
			terminal = true;
		}
	}
	return terminal ? "terminal" : "absent";
}

/** Shared framework launch boundary for CLI, spawn and both chain runners. */
export async function launchQualityReview(options: QualityReviewRunOptions) {
	if (options.refusalReason) return runQualityReview(options);
	if (options.execute)
		return runQualityReview({ ...options, hostChecks: true });
	return runQualityReview({
		...options,
		hostChecks: true,
		execute: async (context) => {
			if (!context.workspaceRoot || !context.materialsRoot || !context.base)
				throw new Error("Quality review snapshot is incomplete");
			const frameworkRoot = resolve(
				fileURLToPath(import.meta.url),
				"..",
				"..",
				"..",
			);
			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: join(frameworkRoot, "domains"),
				projectRoot: context.workspaceRoot,
				bundledDirs: await discoverFrameworkBundledPackageDirs(frameworkRoot),
			});
			const lenses = triageReviewLenses(
				context.changedFiles ?? [],
				await readFile(join(context.materialsRoot, "full.diff"), "utf8"),
			);
			const qualityContext = {
				runId: context.runId,
				workspaceRoot: context.workspaceRoot,
				materialsRoot: context.materialsRoot,
				base: context.base,
				changedFiles: context.changedFiles ?? [],
				hostRunStoreRoot: context.hostRunStoreRoot,
				artifactSink: context.artifactSink,
				activeSpawns: context.activeChildIds,
				allowedLenses: new Set(lenses),
				attemptedLenses: new Set<string>(),
				integrityFailures: [] as string[],
			};
			const spawner = createPiSpawner(
				runtime.agentRegistry,
				runtime.domainsDir,
				{ resolver: runtime.domainResolver },
			);
			const analysisEvents: SpawnEvent[] = [];
			try {
				const result = await spawner.spawn({
					role: "quality-manager",
					cwd: context.workspaceRoot,
					prompt: `Review the captured diff at ${context.materialsRoot}/full.diff, with base ${context.base}. Read the host check results from ${context.hostRunStoreRoot}/artifacts/qm/checks.md. Spawn exactly these reviewer lenses once each: ${lenses.join(", ")}. Synthesize their full final text and direct analysis gate results into a complete final report. Do not run commands or start remediation.`,
					qualityReviewContext: qualityContext,
					onEvent: (event) => {
						if (
							(event.type === "tool_execution_end" ||
								event.type === "tool_execution_start") &&
							event.toolName.startsWith("analysis_")
						)
							analysisEvents.push(event);
					},
					projectSkills: runtime.projectSkills,
					skillPaths: [...runtime.skillPaths],
				});
				if (!result.success)
					throw new Error(result.error ?? "Quality Manager session failed");
				validateQualityReviewAnalysisCalls(analysisEvents, context.base);
				if (qualityContext.integrityFailures.length > 0)
					throw new Error(qualityContext.integrityFailures.join("; "));
				return {
					markdown: extractAssistantText(result.messages, "quality-manager"),
					requiredLenses: lenses,
					liveChildIds: [...qualityContext.activeSpawns],
				};
			} finally {
				spawner.dispose();
			}
		},
	});
}

export function triageReviewLenses(
	files: readonly string[],
	diff = "",
): string[] {
	const lenses = ["reviewer"];
	const scope = `${files.join("\n")}\n${diff}`;
	if (/auth|security|permission|secret|token|login|session/i.test(scope))
		lenses.push("security-reviewer");
	if (/database|query|cache|performance|\.sql\b|fallow/i.test(scope))
		lenses.push("performance-reviewer");
	if (/\.(?:tsx|jsx|css|html|erb)\b|\/views\/|<form\b/i.test(scope))
		lenses.push("ux-reviewer");
	return lenses;
}
export type { QualityReviewRunOptions };
