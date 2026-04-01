import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { discoverFrameworkBundledPackageDirs } from "../../../../lib/packages/dev-bundled.ts";
import { CosmonautsRuntime } from "../../../../lib/runtime.ts";
import { registerChainTool } from "./chain-tool.ts";
import { registerSpawnTool } from "./spawn-tool.ts";

export default function orchestrationExtension(pi: ExtensionAPI) {
	const runtimeCache = new Map<string, Promise<CosmonautsRuntime>>();
	const frameworkRoot = resolve(
		fileURLToPath(import.meta.url),
		"..",
		"..",
		"..",
		"..",
		"..",
	);
	const domainsDir = join(frameworkRoot, "domains");
	const bundledDirsPromise = discoverFrameworkBundledPackageDirs(frameworkRoot);

	function getRuntime(cwd: string): Promise<CosmonautsRuntime> {
		let promise = runtimeCache.get(cwd);
		if (!promise) {
			promise = bundledDirsPromise
				.then((bundledDirs) =>
					CosmonautsRuntime.create({
						builtinDomainsDir: domainsDir,
						projectRoot: cwd,
						bundledDirs,
					}),
				)
				.catch((error: unknown) => {
					runtimeCache.delete(cwd);
					throw error;
				});
			runtimeCache.set(cwd, promise);
		}
		return promise;
	}

	registerChainTool(pi, getRuntime);
	registerSpawnTool(pi, getRuntime);
}
