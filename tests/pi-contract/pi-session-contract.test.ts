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
// - custom messages it returns reach the provider alongside earlier turns, and
//   a `context` handler can prune earlier ones without seeing system messages,
// - when a `context` handler prunes, Pi restores the system prompt it hid (run
//   without a prompt override, which would otherwise rebuild the head itself),
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
	turns: string[];
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

// "role:text" for each user and assistant message, so history checks match
// message structure rather than any substring of the request (e.g. a cwd).
function turnTexts(messages: readonly unknown[]): string[] {
	return messages.flatMap((message) => {
		const { role, content } = message as { role?: string; content?: unknown };
		if ((role !== "user" && role !== "assistant") || !Array.isArray(content))
			return [];
		const text = content
			.flatMap((part: { type?: string; text?: string }) =>
				part.type === "text" && part.text ? [part.text] : [],
			)
			.join("");
		return [`${role}:${text}`];
	});
}

function newProbe(): Probe {
	return { promptsSeenByHook: [], contextHandlerRoles: [], requests: [] };
}

function probeExtensions(
	probe: Probe,
	forcePrompt: boolean,
): ExtensionFactory[] {
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
	return forcePrompt ? [memory, forcedPrompt] : [memory];
}

async function runTwoPrompts(
	root: string,
	probe: Probe,
	{ forcePrompt = true }: { forcePrompt?: boolean } = {},
) {
	const agentDir = join(root, "agent");
	const faux = fauxProvider({ provider: "contract-faux" });
	const respond = (context: TranscriptContext) => {
		probe.requests.push({
			systemPrompt: getCurrentSystemPrompt(context.messages),
			memoryTexts: memoryTexts(context.messages),
			turns: turnTexts(context.messages),
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
		extensionFactories: probeExtensions(probe, forcePrompt),
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
		const probe = newProbe();
		await runTwoPrompts(tmp.path, probe);

		expect(probe.promptsSeenByHook).toHaveLength(2);
		for (const prompt of probe.promptsSeenByHook) {
			expect(extractAgentIdFromSystemPrompt(prompt)).toBe(AGENT_ID);
		}
	});

	test("context handlers never receive system messages", async () => {
		const probe = newProbe();
		await runTwoPrompts(tmp.path, probe, { forcePrompt: false });

		expect(probe.contextHandlerRoles.length).toBeGreaterThanOrEqual(2);
		for (const roles of probe.contextHandlerRoles) {
			expect(roles).not.toContain("system");
		}
	});

	test("the base prompt reaches the provider after a context handler prunes", async () => {
		const probe = newProbe();
		await runTwoPrompts(tmp.path, probe, { forcePrompt: false });

		expect(probe.requests).toHaveLength(2);
		// The restore is only exercised if this run's handler actually pruned.
		expect(probe.requests[1]?.memoryTexts).toEqual(["memory 2"]);
		for (const request of probe.requests) {
			expect(extractAgentIdFromSystemPrompt(request.systemPrompt)).toBe(
				AGENT_ID,
			);
			expect(request.systemPrompt).not.toContain(FORCED_BLOCK);
		}
	});

	test("injected custom messages reach the provider and a context handler can prune older ones", async () => {
		const probe = newProbe();
		await runTwoPrompts(tmp.path, probe);

		expect(probe.requests.map((request) => request.memoryTexts)).toEqual([
			["memory 1"],
			["memory 2"],
		]);
		expect(probe.requests[1]?.turns).toEqual(
			expect.arrayContaining(["user:first", "assistant:reply 1"]),
		);
	});

	test("a returned systemPrompt override is sent once per request and not recorded", async () => {
		const probe = newProbe();
		const messages = await runTwoPrompts(tmp.path, probe);

		for (const request of probe.requests) {
			expect(request.systemPrompt.split(FORCED_BLOCK)).toHaveLength(2);
		}
		for (const message of messages) {
			expect(JSON.stringify(message)).not.toContain(FORCED_BLOCK);
		}
	});

	test("session.messages ends on the assistant reply", async () => {
		const probe = newProbe();
		const messages = await runTwoPrompts(tmp.path, probe);

		expect(messages.at(-1)?.role).toBe("assistant");
		expect(JSON.stringify(messages.at(-1))).toContain("reply 2");
	});
});
