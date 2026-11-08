import { loadProjectConfig } from "../../lib/config/index.ts";
import { CosmonautsRuntime } from "../../lib/runtime.ts";
import {
	type RuntimeHostRequest,
	setRuntimeHost,
} from "../../lib/runtime-host.ts";

/** An isolated test consumer: no content scans, privileged policy or worker. */
export async function createLibraryTestRuntime(
	request: RuntimeHostRequest,
	workerAgent?: string,
): Promise<CosmonautsRuntime> {
	return CosmonautsRuntime.create({
		projectRoot: request.projectRoot,
		projectConfig: await loadProjectConfig(request.projectRoot),
		discoverPackages: true,
		includeUserSources: false,
		domainOverride: request.domainOverride,
		pluginDirs: request.pluginDirs ? [...request.pluginDirs] : undefined,
		defaultModel: "test/model",
		workerAgent,
		agents: [
			{
				id: "fixture/reader",
				description: "Library test reader",
				instructions: { kind: "inline", content: "Inspect fixture input." },
				model: "test/model",
				tools: "readonly",
				capabilities: [],
				skills: [],
				extensions: [],
				memory: {},
				subagents: [],
				projectContext: false,
				session: "ephemeral",
				loop: false,
			},
		],
		extensionProviders: {
			orchestration: async (context) =>
				(
					await import("../../lib/extensions/orchestration/index.ts")
				).createSessionExtension(context),
		},
	});
}

/** Content acceptance opts in while its corresponding content still exists. */
export function installContentTestHost(): void {
	setRuntimeHost((request) =>
		import("../../domains/host-runtime.ts").then(({ createContentRuntime }) =>
			createContentRuntime(request),
		),
	);
}
