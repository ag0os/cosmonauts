import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverFrameworkBundledPackageDirs } from "../packages/dev-bundled.ts";
import { CosmonautsRuntime } from "../runtime.ts";
import {
	createExternalBuilderBackend,
	leanPackageResolver,
} from "./backends/external.ts";
import type { BuilderBackend, LeanBackendKind } from "./types.ts";

export interface LeanBackends {
	builder: BuilderBackend;
	reviewer: BuilderBackend;
}

export interface LeanBackendChoices {
	/** The reviewer's harness; defaults to the builder's `kind`. */
	reviewerKind?: LeanBackendKind;
	/** Claude Code sessions keep ANTHROPIC_API_KEY; no effect on other kinds. */
	allowApiBilling?: boolean;
}

export type CreateLeanBackends = (
	kind: LeanBackendKind,
	projectRoot: string,
	choices?: LeanBackendChoices,
) => Promise<LeanBackends>;

/**
 * The builder backend a lean run uses for `kind`, and the reviewer backend
 * for `choices.reviewerKind` (the same backend when the kinds match), resolved
 * through a runtime over this framework's domains and bundled packages and
 * the project's own config; the `lean_build` tool and `cosmonauts lean` share it.
 */
export function runtimeBackends(): CreateLeanBackends {
	const frameworkRoot = resolve(
		fileURLToPath(import.meta.url),
		"..",
		"..",
		"..",
	);
	return async (kind, projectRoot, choices = {}) => {
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
		// Imported only for a Pi run, so the external backends never load Pi.
		const create = async (each: LeanBackendKind) =>
			each === "pi"
				? (await import("./backends/pi.ts")).createPiBuilderBackend(shared)
				: createExternalBuilderBackend({
						kind: each,
						resolvePackage: leanPackageResolver({ kind: each, ...shared }),
						...(choices.allowApiBilling ? { allowApiBilling: true } : {}),
					});
		const reviewerKind = choices.reviewerKind ?? kind;
		const builder = await create(kind);
		const reviewer =
			reviewerKind === kind ? builder : await create(reviewerKind);
		return { builder, reviewer };
	};
}
