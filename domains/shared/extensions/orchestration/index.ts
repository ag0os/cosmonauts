import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { CosmonautsRuntime } from "../../../../lib/runtime.ts";
import { registerChainTool } from "./chain-tool.ts";
import { registerSpawnTool } from "./spawn-tool.ts";

export default function orchestrationExtension(pi: ExtensionAPI) {
	const runtimeCache = new Map<string, Promise<CosmonautsRuntime>>();
	const domainsDir = resolve(
		fileURLToPath(import.meta.url),
		"..",
		"..",
		"..",
		"..",
		"..",
		"domains",
	);

	function getRuntime(cwd: string): Promise<CosmonautsRuntime> {
		let promise = runtimeCache.get(cwd);
		if (!promise) {
			promise = CosmonautsRuntime.create({
				domainsDir,
				projectRoot: cwd,
			}).catch((error: unknown) => {
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
