/** The CLI is an explicit library consumer, with project/user/plugin discovery. */
import { loadProjectConfig } from "../lib/config/index.ts";
import { CosmonautsRuntime } from "../lib/runtime.ts";
import {
	hasRuntimeHost,
	type RuntimeHostRequest,
	setRuntimeHost,
} from "../lib/runtime-host.ts";

// Model fallback belongs to this executable host, never to the library runtime.
export const CLI_DEFAULT_MODEL = "anthropic/claude-opus-4-7";

export async function createCliRuntime(
	request: RuntimeHostRequest,
): Promise<CosmonautsRuntime> {
	return CosmonautsRuntime.create({
		projectRoot: request.projectRoot,
		projectConfig: await loadProjectConfig(request.projectRoot),
		discoverPackages: true,
		includeUserSources: true,
		pluginDirs: request.pluginDirs ? [...request.pluginDirs] : undefined,
		domainOverride: request.domainOverride,
		extensionProviders: {
			orchestration: async (context) =>
				(
					await import("../lib/extensions/orchestration/index.ts")
				).createSessionExtension(context),
		},
		defaultModel: CLI_DEFAULT_MODEL,
	});
}

export function installCliRuntimeHost(): void {
	if (!hasRuntimeHost()) setRuntimeHost(createCliRuntime);
}

installCliRuntimeHost();
