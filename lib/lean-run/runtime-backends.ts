import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverFrameworkBundledPackageDirs } from "../packages/dev-bundled.ts";
import { CosmonautsRuntime } from "../runtime.ts";
import {
	createExternalBuilderBackend,
	leanPackageResolver,
} from "./backends/external.ts";
import { createPiBuilderBackend } from "./backends/pi.ts";
import type { BuilderBackend, LeanBackendKind } from "./types.ts";

export interface LeanBackends {
	builder: BuilderBackend;
	reviewer: BuilderBackend;
}

export type CreateLeanBackends = (
	kind: LeanBackendKind,
	projectRoot: string,
) => Promise<LeanBackends>;

/**
 * The builder and reviewer backend a lean run uses for `kind`, resolved
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
