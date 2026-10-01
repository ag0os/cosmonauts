import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import {
	type BuilderBackend,
	createExternalBuilderBackend,
	createPiBuilderBackend,
	type LeanBackendKind,
	leanPackageResolver,
	type RunBuildOptions,
	type RunRecord,
	runBuild,
	type SignalProvider,
	summarizeRun,
} from "../../../../lib/lean-run/index.ts";
import { createDefaultProviders } from "../../../../lib/lean-run/providers/default.ts";
import { discoverFrameworkBundledPackageDirs } from "../../../../lib/packages/dev-bundled.ts";
import { CosmonautsRuntime } from "../../../../lib/runtime.ts";

export const LeanBuildParameters = Type.Object({
	planPath: Type.String({
		description: "Path to plan.md, relative to the project root",
	}),
	specPath: Type.Optional(
		Type.String({ description: "Path to spec.md, when the change has one" }),
	),
	backend: Type.Optional(
		Type.Union(
			[
				Type.Literal("pi"),
				Type.Literal("claude-cli"),
				Type.Literal("codex-cli"),
			],
			{ description: "Where the builder and reviewer run (default: pi)" },
		),
	),
});
type LeanBuildInput = Static<typeof LeanBuildParameters>;

interface LeanBackends {
	builder: BuilderBackend;
	reviewer: BuilderBackend;
}

export interface LeanRunExtensionOptions {
	runBuild?: (options: RunBuildOptions) => Promise<RunRecord>;
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
				"Run the lean build for a plan: builder, host checks, at most one re-entry, then the code reviewer. Returns the run id, status, a summary and the run directory.",
			parameters: LeanBuildParameters,
			execute: async (_id, params: LeanBuildInput, signal, _onUpdate, ctx) => {
				const backends = await createBackends(params.backend ?? "pi", ctx.cwd);
				const record = await execute({
					projectRoot: ctx.cwd,
					planPath: params.planPath,
					...(params.specPath ? { specPath: params.specPath } : {}),
					backend: backends.builder,
					reviewerBackend: backends.reviewer,
					providers: options.providers ?? createDefaultProviders(),
					...(signal ? { signal } : {}),
				});
				const details = {
					runId: record.manifest.id,
					status: record.manifest.status,
					summary: summarizeRun(record),
					runDir: record.dir,
				};
				return {
					content: [{ type: "text" as const, text: JSON.stringify(details) }],
					details,
				};
			},
		});
	};
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
