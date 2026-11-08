import {
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	ModelRegistry,
	ModelRuntime,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import {
	requireModelId,
	resolveModel,
} from "../lib/orchestration/model-resolution.ts";
import { getHostRuntime } from "../lib/runtime-host.ts";

export type ToollessPiSession = Awaited<
	ReturnType<typeof createAgentSession>
>["session"];

export async function createToollessPiSession(options: {
	readonly projectRoot: string;
	readonly model?: string;
	readonly systemPrompt: string;
}): Promise<ToollessPiSession> {
	const modelId = requireModelId(
		options.model ??
			(await getHostRuntime({ projectRoot: options.projectRoot })).defaultModel,
	);
	const modelRuntime = await ModelRuntime.create();
	const modelRegistry = new ModelRegistry(modelRuntime);
	const agentDir = getAgentDir();
	const resourceLoader = new DefaultResourceLoader({
		cwd: options.projectRoot,
		agentDir,
		noExtensions: true,
		noSkills: true,
		noPromptTemplates: true,
		noThemes: true,
		noContextFiles: true,
		systemPrompt: options.systemPrompt,
	});
	await resourceLoader.reload();

	const { session } = await createAgentSession({
		cwd: options.projectRoot,
		agentDir,
		modelRuntime,
		model: resolveModel(modelId, modelRegistry),
		noTools: "all",
		resourceLoader,
		sessionManager: SessionManager.inMemory(),
	});
	return session;
}
