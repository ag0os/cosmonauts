import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import {
	AuthStorage,
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	ModelRegistry,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import type {
	GeneratedNarrative,
	NarrativeInput,
	NarrativeProvider,
} from "../../lib/architecture-map/index.ts";
import {
	FALLBACK_MODEL,
	resolveModel,
} from "../../lib/orchestration/model-resolution.ts";

interface PiArchitectureNarrativeProviderOptions {
	readonly projectRoot: string;
	readonly model?: string;
}

type PiSession = Awaited<ReturnType<typeof createAgentSession>>["session"];

const SYSTEM_PROMPT = [
	"You write concise architecture-map narratives for TypeScript modules.",
	"Return only strict JSON with keys oneLiner and text.",
	"oneLiner must be one sentence. text must be one short paragraph.",
	"Do not invent behavior that is not visible in the supplied skeleton.",
].join("\n");

export function createPiArchitectureNarrativeProvider(
	options: PiArchitectureNarrativeProviderOptions,
): NarrativeProvider {
	return new PiArchitectureNarrativeProvider(options);
}

class PiArchitectureNarrativeProvider implements NarrativeProvider {
	private sessionPromise?: Promise<PiSession>;

	constructor(
		private readonly options: PiArchitectureNarrativeProviderOptions,
	) {}

	async generate(
		input: NarrativeInput,
		_signal?: AbortSignal,
	): Promise<GeneratedNarrative> {
		const session = await this.getSession();
		const beforeCount = session.messages.length;
		await session.prompt(buildNarrativePrompt(input));
		const response = extractLatestAssistantText(session.messages, beforeCount);
		return parseGeneratedNarrative(response);
	}

	private async getSession(): Promise<PiSession> {
		this.sessionPromise ??= createNarrativeSession(this.options);
		return this.sessionPromise;
	}
}

async function createNarrativeSession(
	options: PiArchitectureNarrativeProviderOptions,
): Promise<PiSession> {
	const authStorage = AuthStorage.create();
	const modelRegistry = ModelRegistry.create(authStorage);
	const agentDir = getAgentDir();
	const resourceLoader = new DefaultResourceLoader({
		cwd: options.projectRoot,
		agentDir,
		noExtensions: true,
		noSkills: true,
		noPromptTemplates: true,
		noThemes: true,
		noContextFiles: true,
		systemPrompt: SYSTEM_PROMPT,
	});
	await resourceLoader.reload();

	const { session } = await createAgentSession({
		cwd: options.projectRoot,
		agentDir,
		authStorage,
		modelRegistry,
		model: resolveModel(options.model ?? FALLBACK_MODEL, modelRegistry),
		noTools: "all",
		resourceLoader,
		sessionManager: SessionManager.inMemory(),
	});
	return session;
}

function buildNarrativePrompt(input: NarrativeInput): string {
	return JSON.stringify(
		{
			task: "Generate an architecture-map narrative for this module skeleton.",
			module: input.skeleton,
			priorNarrative: input.priorNarrative,
			output: {
				oneLiner: "single sentence",
				text: "short paragraph",
			},
		},
		null,
		2,
	);
}

function extractLatestAssistantText(
	messages: readonly AgentMessage[],
	beforeCount: number,
): string {
	for (let index = messages.length - 1; index >= beforeCount; index -= 1) {
		const message = messages[index];
		if (!isAssistantMessage(message)) continue;
		const text = message.content
			.filter(isTextContent)
			.map((content) => content.text)
			.join("")
			.trim();
		if (text.length > 0) return text;
	}
	throw new Error("Narrative provider returned no assistant text.");
}

function isAssistantMessage(
	message: AgentMessage | undefined,
): message is AssistantMessage {
	return (
		message !== undefined && "role" in message && message.role === "assistant"
	);
}

function isTextContent(
	content: AssistantMessage["content"][number],
): content is TextContent {
	return content.type === "text";
}

function parseGeneratedNarrative(response: string): GeneratedNarrative {
	const parsed = parseJsonObject(response);
	const oneLiner = parsed ? stringField(parsed, "oneLiner") : undefined;
	const text = parsed ? stringField(parsed, "text") : undefined;
	if (oneLiner && text) {
		return { oneLiner, text };
	}

	const fallback = response.trim();
	if (fallback.length === 0) {
		throw new Error("Narrative provider returned empty text.");
	}
	const [firstLine] = fallback.split(/\r?\n/u);
	return {
		oneLiner: (firstLine ?? fallback).trim(),
		text: fallback,
	};
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
	const trimmed = value.trim();
	const candidate =
		trimmed.startsWith("{") && trimmed.endsWith("}")
			? trimmed
			: trimmed.match(/\{[\s\S]*\}/u)?.[0];
	if (!candidate) return undefined;

	try {
		const parsed: unknown = JSON.parse(candidate);
		return isRecord(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

function stringField(
	record: Record<string, unknown>,
	key: string,
): string | undefined {
	const value = record[key];
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
