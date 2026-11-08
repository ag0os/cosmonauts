import { mkdir, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import type { SessionPolicy } from "../agents/session-policy.ts";
import type { AnalysisFinding } from "../analysis/types.ts";
import { loadProjectConfig } from "../config/loader.ts";
import { createProjectToolsExtension } from "../extensions/project-tools/index.ts";
import {
	type QualityReviewSessionContext,
	registerQualityReviewSession,
	removeQualityReviewSession,
} from "./quality-review-context.ts";
import {
	enforceQualityReviewProfile,
	type QualityReviewProfile,
	qualityReviewPolicyFor,
} from "./quality-review-profile.ts";

import { qualityReviewSpawnPolicy } from "./quality-review-spawn-policy.ts";

interface QualitySkillConfig {
	qualityReviewContext?: QualityReviewSessionContext;
	skillPaths?: string[];
}

function isInside(root: string, path: string): boolean {
	const suffix = relative(root, path);
	return (
		suffix === "" ||
		(suffix !== ".." && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix))
	);
}

function qualitySkillCandidate(
	path: string,
	canonicalPath: string,
	baseProjectRoot: string | undefined,
	canonicalSourceRoot: string | undefined,
	domainsDir: string,
): string | undefined {
	if (!isAbsolute(path))
		return baseProjectRoot ? resolve(baseProjectRoot, path) : undefined;
	if (
		canonicalSourceRoot &&
		baseProjectRoot &&
		isInside(canonicalSourceRoot, canonicalPath)
	)
		return resolve(
			baseProjectRoot,
			relative(canonicalSourceRoot, canonicalPath),
		);
	if (baseProjectRoot && isInside(baseProjectRoot, canonicalPath))
		return canonicalPath;
	return isInside(resolve(domainsDir, ".."), canonicalPath)
		? canonicalPath
		: undefined;
}

async function resolveQualitySkillPaths(
	config: QualitySkillConfig,
	domainsDir: string,
): Promise<string[] | undefined> {
	const sourceRoot = config.qualityReviewContext?.sourceRoot;
	const canonicalSourceRoot = sourceRoot
		? await realpath(sourceRoot).catch(() => sourceRoot)
		: undefined;
	if (!config.qualityReviewContext || !config.skillPaths)
		return config.skillPaths;
	const baseProjectRoot = config.qualityReviewContext.baseProjectRoot;
	const paths = await Promise.all(
		config.skillPaths.map(async (path) => {
			const canonicalPath = await realpath(path).catch(() => path);
			const candidate = qualitySkillCandidate(
				path,
				canonicalPath,
				baseProjectRoot,
				canonicalSourceRoot,
				domainsDir,
			);
			if (
				candidate &&
				(await stat(candidate).catch(() => undefined))?.isDirectory()
			)
				return candidate;
			config.qualityReviewContext?.omittedSkillPaths?.push(path);
			return undefined;
		}),
	);
	return paths.filter((path): path is string => path !== undefined);
}

async function baseAgentFiles(
	baseProjectRoot: string | undefined,
	projectContext: boolean,
) {
	if (!baseProjectRoot || !projectContext) return [];
	const files = await Promise.all(
		["AGENTS.md", "CLAUDE.md"].map(async (name) => {
			const path = join(baseProjectRoot, name);
			const content = await readFile(path, "utf8").catch(
				(error: NodeJS.ErrnoException) => {
					if (error.code === "ENOENT") return undefined;
					throw error;
				},
			);
			return content === undefined ? undefined : { path, content };
		}),
	);
	return files.filter(
		(file): file is { path: string; content: string } => file !== undefined,
	);
}

export function createQualityReviewSessionPolicy(
	context: QualityReviewSessionContext,
	child = false,
): SessionPolicy {
	const baseProjectRoot = context.baseProjectRoot;
	const profile: QualityReviewProfile = child ? "reviewer" : "manager";
	const settings = SettingsManager.inMemory();
	settings.setProjectTrusted(false);
	return {
		validateDefinition: (def) => {
			qualityReviewPolicyFor(def, child);
		},
		spawn: qualityReviewSpawnPolicy(context, () =>
			createQualityReviewSessionPolicy(context, true),
		),
		toolPreset: "readonly",
		filterTools: (tools) => enforceQualityReviewProfile(tools, profile),
		...(baseProjectRoot
			? { loadConfig: () => loadProjectConfig(baseProjectRoot) }
			: {}),
		prepareSkills: (skillPaths, domainsDir) =>
			resolveQualitySkillPaths(
				{ qualityReviewContext: context, skillPaths },
				domainsDir,
			),
		settingsManager: () => settings,
		resourceOptions: async (params, domainsDir) => {
			const files = await baseAgentFiles(
				context.baseProjectRoot,
				params.projectContext,
			);
			// Current coding content owns this compatibility provider path.
			const projectToolsPath = join(
				domainsDir,
				"shared",
				"extensions",
				"project-tools",
			);
			return {
				settingsManager: settings,
				appendSystemPrompt: [],
				...((!params.projectContext || context.baseProjectRoot) && {
					agentsFilesOverride: () => ({ agentsFiles: files }),
				}),
				...(context.analysisConsent && {
					additionalExtensionPaths: params.extensionPaths.filter(
						(path) => path !== projectToolsPath,
					),
					extensionFactories: [
						...params.extensionFactories,
						createProjectToolsExtension({
							snapshotAuthorization: context.analysisConsent,
						}),
					],
				}),
			};
		},
		transcriptPath: async () => {
			const directory = join(context.hostRunStoreRoot, "transcripts");
			await mkdir(directory, { recursive: true });
			return join(directory, `quality-session-${crypto.randomUUID()}.jsonl`);
		},
		retainTranscript: true,
		onCreated: (session) =>
			registerQualityReviewSession(session.sessionId, context),
		onDisposed: removeQualityReviewSession,
		onCompletionWait: (messages, timeoutMs) => {
			if (
				messages.some((message) =>
					message.includes(`Timed out after ${timeoutMs}ms`),
				)
			)
				context.integrityFailures.push(
					`Panel completion timed out after ${timeoutMs}ms`,
				);
		},
		observeToolResult: analysisGateObservation,
	};
}

function analysisGateObservation(toolName: string, result: unknown): unknown {
	if (toolName !== "analysis_status" && toolName !== "analysis_audit")
		return undefined;
	const details =
		typeof result === "object" && result !== null && "details" in result
			? result.details
			: undefined;
	if (typeof details !== "object" || details === null) return { details: {} };
	if (toolName === "analysis_status") return analysisStatusObservation(details);
	return analysisAuditObservation(details);
}

function analysisStatusObservation(details: object): unknown {
	const bindings =
		"capabilities" in details && Array.isArray(details.capabilities)
			? details.capabilities.filter(
					(binding: unknown) =>
						typeof binding === "object" &&
						binding !== null &&
						"capability" in binding &&
						binding.capability === "changed-scope-audit",
				)
			: [];
	return {
		details: {
			capabilities: bindings.map((binding: { state?: unknown }) => ({
				capability: "changed-scope-audit",
				state: binding.state,
			})),
		},
	};
}

function analysisAuditObservation(details: object): unknown {
	const scope =
		"scope" in details &&
		typeof details.scope === "object" &&
		details.scope !== null
			? details.scope
			: undefined;
	return {
		details: {
			kind: "kind" in details ? details.kind : undefined,
			capability: "capability" in details ? details.capability : undefined,
			scope: { base: scope && "base" in scope ? scope.base : undefined },
			verdict: "verdict" in details ? details.verdict : undefined,
			...auditFindingsObservation(details),
		},
	};
}

function auditFindingsObservation(details: object): {
	findings?: AnalysisFinding[];
} {
	return "findings" in details && Array.isArray(details.findings)
		? { findings: details.findings.map(auditFindingObservation) }
		: {};
}

/** The fields host report lines cite; provider details stay in the QM session. */
function auditFindingObservation(finding: AnalysisFinding): AnalysisFinding {
	return {
		id: finding.id,
		category: finding.category,
		severity: finding.severity,
		message: finding.message,
		locations: finding.locations.map(({ path, line }) => ({ path, line })),
		actions: finding.actions.map(({ description }) => ({ description })),
	};
}
