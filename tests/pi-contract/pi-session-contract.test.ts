import { join } from "node:path";
import {
	fauxAssistantMessage,
	fauxProvider,
	getCurrentSystemPrompt,
	type TranscriptContext,
} from "@earendil-works/pi-ai";
import {
	createAgentSession,
	DefaultResourceLoader,
	type ExtensionFactory,
	ModelRuntime,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, test } from "vitest";
import {
	buildAgentIdentityMarker,
	extractAgentIdFromSystemPrompt,
} from "../../lib/agents/runtime-identity.ts";
import { useTempDir } from "../helpers/fs.ts";

// Session-level contract tests against the REAL createAgentSession, driven by
// pi-ai's faux provider (no network, no real auth, temp agent dir). They pin
// the pi-coding-agent wiring our extensions compose on, which Pi 0.86/0.87
// reworked around transcript system messages:
// - before_agent_start still exposes the rendered prompt (identity marker),
// - custom messages it returns reach the provider, and `context` handlers can
//   prune earlier ones without seeing or dropping the system prompt,
// - a returned `systemPrompt` override is sent once per request and is not
//   recorded in session.messages,
// - session.messages ends on the assistant reply our readers extract.

const AGENT_ID = "contract/agent";
const BASE_PROMPT = `Base prompt.\n${buildAgentIdentityMarker(AGENT_ID)}`;
const FORCED_BLOCK = "FORCED STATUS BLOCK";
const MEMORY_TYPE = "contract-memory";

interface ProviderRequest {
	systemPrompt: string;
	memoryTexts: string[];
}

interface Probe {
	promptsSeenByHook: string[];
	contextHandlerRoles: string[][];
	requests: ProviderRequest[];
}

// Custom messages are converted to plain LLM messages before the provider
// sees them, so match the injected text rather than the customType.
function memoryTexts(messages: readonly unknown[]): string[] {
	return messages.flatMap((message) =>
		[...JSON.stringify(message).matchAll(/memory \d+/g)].map(
			(match) => match[0],
		),
	);
}

function probeExtensions(probe: Probe): ExtensionFactory[] {
	const memory: ExtensionFactory = (pi) => {
		pi.on("before_agent_start", async (event) => {
			probe.promptsSeenByHook.push(event.systemPrompt);
			return {
				message: {
					customType: MEMORY_TYPE,
					content: `memory ${probe.promptsSeenByHook.length}`,
					display: false,
				},
			};
		});
		pi.on("context", async (event) => {
			probe.contextHandlerRoles.push(event.messages.map((m) => m.role));
			const latest = event.messages.findLastIndex(
				(m) => (m as { customType?: string }).customType === MEMORY_TYPE,
			);
			return {
				messages: event.messages.filter(
					(m, index) =>
						(m as { customType?: string }).customType !== MEMORY_TYPE ||
						index === latest,
				),
			};
		});
	};
	const forcedPrompt: ExtensionFactory = (pi) => {
		pi.on("before_agent_start", async (event) => ({
			systemPrompt: `${event.systemPrompt}\n\n${FORCED_BLOCK}`,
		}));
	};
	return [memory, forcedPrompt];
}

async function runTwoPrompts(root: string, probe: Probe) {
	const agentDir = join(root, "agent");
	const faux = fauxProvider({ provider: "contract-faux" });
	const respond = (context: TranscriptContext) => {
		probe.requests.push({
			systemPrompt: getCurrentSystemPrompt(context.messages),
			memoryTexts: memoryTexts(context.messages),
		});
		return fauxAssistantMessage(`reply ${probe.requests.length}`);
	};
	faux.setResponses([respond, respond]);

	const modelRuntime = await ModelRuntime.create({
		authPath: join(agentDir, "auth.json"),
		modelsPath: null,
		modelsStorePath: join(agentDir, "models-store.json"),
		refreshOnCreate: false,
	});
	modelRuntime.registerNativeProvider(faux.provider);

	const resourceLoader = new DefaultResourceLoader({
		cwd: root,
		agentDir,
		noExtensions: true,
		noSkills: true,
		noContextFiles: true,
		noPromptTemplates: true,
		noThemes: true,
		systemPrompt: BASE_PROMPT,
		extensionFactories: probeExtensions(probe),
	});
	await resourceLoader.reload();

	const { session } = await createAgentSession({
		cwd: root,
		agentDir,
		modelRuntime,
		model: faux.getModel(),
		noTools: "all",
		resourceLoader,
		sessionManager: SessionManager.inMemory(root),
		settingsManager: SettingsManager.inMemory({ cacheWarming: "off" }),
	});
	try {
		await session.prompt("first");
		await session.prompt("second");
		return [...session.messages];
	} finally {
		session.dispose();
	}
}

describe("pi contract: session-level extension wiring", () => {
	const tmp = useTempDir("pi-session-contract-");

	test("before_agent_start sees the rendered prompt with the identity marker", async () => {
		const probe: Probe = {
			promptsSeenByHook: [],
			contextHandlerRoles: [],
			requests: [],
		};
		await runTwoPrompts(tmp.path, probe);

		expect(probe.promptsSeenByHook).toHaveLength(2);
		for (const prompt of probe.promptsSeenByHook) {
			expect(extractAgentIdFromSystemPrompt(prompt)).toBe(AGENT_ID);
		}
	});

	test("context handlers never receive system messages yet the prompt still reaches the provider", async () => {
		const probe: Probe = {
			promptsSeenByHook: [],
			contextHandlerRoles: [],
			requests: [],
		};
		await runTwoPrompts(tmp.path, probe);

		expect(probe.contextHandlerRoles.length).toBeGreaterThanOrEqual(2);
		for (const roles of probe.contextHandlerRoles) {
			expect(roles).not.toContain("system");
		}
		expect(probe.requests).toHaveLength(2);
		for (const request of probe.requests) {
			expect(request.systemPrompt).toContain("Base prompt.");
		}
	});

	test("injected custom messages reach the provider and a context handler can prune older ones", async () => {
		const probe: Probe = {
			promptsSeenByHook: [],
			contextHandlerRoles: [],
			requests: [],
		};
		await runTwoPrompts(tmp.path, probe);

		expect(probe.requests.map((request) => request.memoryTexts)).toEqual([
			["memory 1"],
			["memory 2"],
		]);
	});

	test("a returned systemPrompt override is sent once per request and not recorded", async () => {
		const probe: Probe = {
			promptsSeenByHook: [],
			contextHandlerRoles: [],
			requests: [],
		};
		const messages = await runTwoPrompts(tmp.path, probe);

		for (const request of probe.requests) {
			expect(request.systemPrompt.split(FORCED_BLOCK)).toHaveLength(2);
		}
		for (const message of messages) {
			expect(JSON.stringify(message)).not.toContain(FORCED_BLOCK);
		}
	});

	test("session.messages ends on the assistant reply", async () => {
		const probe: Probe = {
			promptsSeenByHook: [],
			contextHandlerRoles: [],
			requests: [],
		};
		const messages = await runTwoPrompts(tmp.path, probe);

		expect(messages.at(-1)?.role).toBe("assistant");
		expect(JSON.stringify(messages.at(-1))).toContain("reply 2");
	});
});
