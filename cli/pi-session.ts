import {
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	ModelRegistry,
	ModelRuntime,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import {
	FALLBACK_MODEL,
	resolveModel,
} from "../lib/orchestration/model-resolution.ts";

export type ToollessPiSession = Awaited<
	ReturnType<typeof createAgentSession>
>["session"];

export async function createToollessPiSession(options: {
	readonly projectRoot: string;
	readonly model?: string;
	readonly systemPrompt: string;
}): Promise<ToollessPiSession> {
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
		model: resolveModel(options.model ?? FALLBACK_MODEL, modelRegistry),
		noTools: "all",
		resourceLoader,
		sessionManager: SessionManager.inMemory(),
	});
	return session;
}
