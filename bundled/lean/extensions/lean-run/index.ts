import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import {
	type BuilderBackend,
	createExternalBuilderBackend,
	createPiBuilderBackend,
	LEAN_LENSES,
	type LeanBackendKind,
	type LeanLens,
	leanPackageResolver,
	MAX_RUN_TIME_MS,
	type RunBudget,
	type RunBuildOptions,
	type RunRecord,
	type RunReviewOptions,
	runBuild,
	runReview,
	type SignalProvider,
	summarizeRun,
} from "../../../../lib/lean-run/index.ts";
import { createDefaultProviders } from "../../../../lib/lean-run/providers/default.ts";
import { discoverFrameworkBundledPackageDirs } from "../../../../lib/packages/dev-bundled.ts";
import { CosmonautsRuntime } from "../../../../lib/runtime.ts";

function positiveInteger(description: string, maximum?: number) {
	return Type.Optional(
		Type.Integer({
			minimum: 1,
			...(maximum === undefined ? {} : { maximum }),
			description,
		}),
	);
}

const BackendParameter = Type.Optional(
	Type.Union(
		[Type.Literal("pi"), Type.Literal("claude-cli"), Type.Literal("codex-cli")],
		{ description: "Where the builder and reviewer run (default: pi)" },
	),
);

const LensesParameter = Type.Optional(
	Type.Array(Type.Union(LEAN_LENSES.map((lens) => Type.Literal(lens))), {
		minItems: 1,
		description:
			"Reviewer lenses: general, security, performance, ux (default: general)",
	}),
);

export const LeanBuildParameters = Type.Object({
	planPath: Type.Optional(
		Type.String({
			description:
				"Path to plan.md, relative to the project root. Give this or request, not both.",
		}),
	),
	request: Type.Optional(
		Type.String({
			description:
				"A direct fix with no plan document: what to change, in a few sentences. Give this or planPath, not both.",
		}),
	),
	specPath: Type.Optional(
		Type.String({ description: "Path to spec.md, when the change has one" }),
	),
	backend: BackendParameter,
	lenses: LensesParameter,
	budgetTokens: positiveInteger(
		"Input + output token limit for the whole run (default: lean.budget.tokens in the project config, else 1,000,000)",
	),
	budgetTimeMs: positiveInteger(
		`Wall-time limit for the whole run, in ms, at most ${MAX_RUN_TIME_MS} (default: lean.budget.timeMs in the project config, else 60 minutes)`,
		MAX_RUN_TIME_MS,
	),
});
type LeanBuildInput = Static<typeof LeanBuildParameters>;

export const LeanReviewParameters = Type.Object({
	base: Type.Optional(
		Type.String({
			description:
				"Git ref to review the working tree against, committed and uncommitted work alike (default: the merge-base of HEAD with main, else master, else HEAD)",
		}),
	),
	planPath: Type.Optional(
		Type.String({
			description:
				"plan.md the change answers, relative to the project root, as context for the reviewer. Give this, request, or neither; not both.",
		}),
	),
	request: Type.Optional(
		Type.String({
			description:
				"What the change was meant to do, in a few sentences, as context for the reviewer. Give this, planPath, or neither; not both.",
		}),
	),
	backend: BackendParameter,
	lenses: LensesParameter,
});
type LeanReviewInput = Static<typeof LeanReviewParameters>;

interface LeanBackends {
	builder: BuilderBackend;
	reviewer: BuilderBackend;
}

export interface LeanRunExtensionOptions {
	runBuild?: (options: RunBuildOptions) => Promise<RunRecord>;
	runReview?: (options: RunReviewOptions) => Promise<RunRecord>;
	/** The host's signal providers; defaults to `createDefaultProviders()`. */
	providers?: readonly SignalProvider[];
	createBackends?: (
		kind: LeanBackendKind,
		projectRoot: string,
	) => Promise<LeanBackends>;
}

export function createLeanRunExtension(options: LeanRunExtensionOptions = {}) {
	return function leanRunExtension(pi: ExtensionAPI): void {
		const execute = options.runBuild ?? runBuild;
		const createBackends = options.createBackends ?? runtimeBackends();
		pi.registerTool({
			name: "lean_build",
			label: "Lean build",
			description:
				"Run a lean build for a plan or a direct request: builder, host checks, at most one re-entry, the code reviewer, and at most one findings re-entry with a re-review. The run's wall-time limit defaults to 60 minutes. Returns the run id, status, a summary and the run directory.",
			parameters: LeanBuildParameters,
			execute: async (_id, params: LeanBuildInput, signal, _onUpdate, ctx) => {
				const source = planSource(params);
				const lenses = checkedLenses(params.lenses);
				const backends = await createBackends(params.backend ?? "pi", ctx.cwd);
				const budget = requestedBudget(params);
				const record = await execute({
					projectRoot: ctx.cwd,
					...source,
					...(params.specPath ? { specPath: params.specPath } : {}),
					backend: backends.builder,
					reviewerBackend: backends.reviewer,
					providers: options.providers ?? createDefaultProviders(),
					...(lenses ? { lenses } : {}),
					...(budget ? { budget } : {}),
					...(signal ? { signal } : {}),
				});
				const details = {
					runId: record.manifest.id,
					status: record.manifest.status,
					summary: summarizeRun(record),
					runDir: record.dir,
				};
				return toolResult(details);
			},
		});
		registerLeanReview(pi, options.runReview ?? runReview, createBackends);
	};
}

/** Reviews an existing change through the host, so the reviewer gets the diff. */
function registerLeanReview(
	pi: ExtensionAPI,
	execute: (options: RunReviewOptions) => Promise<RunRecord>,
	createBackends: (
		kind: LeanBackendKind,
		projectRoot: string,
	) => Promise<LeanBackends>,
): void {
	pi.registerTool({
		name: "lean_review",
		label: "Lean review",
		description:
			"Review a change that already exists: the working tree against a base ref, read by lean/code-reviewer in a read-only checkout with the diff and the changed files. Runs no builder and changes nothing. Returns the run id, status, a summary, the findings and the run directory.",
		parameters: LeanReviewParameters,
		execute: async (_id, params: LeanReviewInput, signal, _onUpdate, ctx) => {
			if (params.planPath !== undefined && params.request !== undefined)
				throw new Error("lean_review takes planPath or request, not both");
			const lenses = checkedLenses(params.lenses);
			const backends = await createBackends(params.backend ?? "pi", ctx.cwd);
			const record = await execute({
				projectRoot: ctx.cwd,
				...(params.base ? { base: params.base } : {}),
				...(params.planPath ? { planPath: params.planPath } : {}),
				...(params.request?.trim() ? { request: params.request } : {}),
				reviewerBackend: backends.reviewer,
				...(lenses ? { lenses } : {}),
				...(signal ? { signal } : {}),
			});
			return toolResult({
				runId: record.manifest.id,
				status: record.manifest.status,
				summary: summarizeRun(record),
				findings: record.envelopes.reviewer?.findings ?? [],
				runDir: record.dir,
			});
		},
	});
}

function toolResult<T>(details: T) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(details) }],
		details,
	};
}

function planSource(
	params: LeanBuildInput,
): { planPath: string } | { request: string } {
	const { planPath, request } = params;
	if (planPath !== undefined && request !== undefined)
		throw new Error("lean_build takes planPath or request, not both");
	if (planPath !== undefined) return { planPath };
	if (request === undefined || request.trim() === "")
		throw new Error("lean_build needs planPath or a non-empty request");
	return { request };
}

function checkedLenses(
	lenses: readonly string[] | undefined,
): LeanLens[] | undefined {
	if (lenses === undefined) return undefined;
	const known = new Set<string>(LEAN_LENSES);
	const unknown = lenses.filter((lens) => !known.has(lens));
	if (lenses.length === 0 || unknown.length > 0)
		throw new Error(
			`lenses must be one or more of ${LEAN_LENSES.join(", ")}${unknown.length > 0 ? `; got ${unknown.join(", ")}` : ""}`,
		);
	return [...new Set(lenses)] as LeanLens[];
}

function requestedBudget(
	params: LeanBuildInput,
): Partial<RunBudget> | undefined {
	const budget: Partial<RunBudget> = {
		...(params.budgetTokens === undefined
			? {}
			: { tokens: positive(params.budgetTokens, "budgetTokens") }),
		...(params.budgetTimeMs === undefined
			? {}
			: {
					timeMs: positive(
						params.budgetTimeMs,
						"budgetTimeMs",
						MAX_RUN_TIME_MS,
					),
				}),
	};
	return Object.keys(budget).length > 0 ? budget : undefined;
}

function positive(
	value: number,
	name: string,
	max = Number.MAX_SAFE_INTEGER,
): number {
	if (Number.isSafeInteger(value) && value > 0 && value <= max) return value;
	const limit = max === Number.MAX_SAFE_INTEGER ? "" : ` up to ${max}`;
	throw new Error(`lean_build ${name} must be a positive integer${limit}`);
}

function runtimeBackends(): (
	kind: LeanBackendKind,
	projectRoot: string,
) => Promise<LeanBackends> {
	const frameworkRoot = resolve(
		fileURLToPath(import.meta.url),
		"..",
		"..",
		"..",
		"..",
		"..",
	);
	return async (kind, projectRoot) => {
		const runtime = await CosmonautsRuntime.create({
			builtinDomainsDir: join(frameworkRoot, "domains"),
			projectRoot,
			bundledDirs: await discoverFrameworkBundledPackageDirs(frameworkRoot),
		});
		const shared = {
			registry: runtime.agentRegistry,
			domainsDir: runtime.domainsDir,
			resolver: runtime.domainResolver,
			...(runtime.projectSkills
				? { projectSkills: runtime.projectSkills }
				: {}),
			skillPaths: runtime.skillPaths,
		};
		const backend =
			kind === "pi"
				? createPiBuilderBackend(shared)
				: createExternalBuilderBackend({
						kind,
						resolvePackage: leanPackageResolver({ kind, ...shared }),
					});
		return { builder: backend, reviewer: backend };
	};
}

export default createLeanRunExtension();
