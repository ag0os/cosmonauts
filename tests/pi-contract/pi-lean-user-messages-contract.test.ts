import { join } from "node:path";
import {
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
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
import { createLeanRunExtension } from "../../bundled/lean/extensions/lean-run/index.ts";
import type { RunBuildOptions } from "../../lib/lean-run/run-build.ts";
import type { BuilderBackend, RunRecord } from "../../lib/lean-run/types.ts";
import { formatSpawnCompletionMessage } from "../../lib/orchestration/spawn-completion-loop.ts";
import { useTempDir } from "../helpers/fs.ts";

// Contract test against the REAL createAgentSession with pi-ai's faux provider
// (no network). lean_build hands runBuild the user's messages read from
// ctx.sessionManager.getBranch(). It pins that every prompt passed to
// session.prompt() (the path print mode, chain stages and spawned sessions
// all take) is a user entry on the branch by the time a tool of that turn
// runs, and that a before_agent_start custom message is not.

const BACKEND: BuilderBackend = { kind: "pi", run: async () => ({ text: "" }) };

function stubRecord(): RunRecord {
	return {
		dir: "/run",
		manifest: {
			id: "r-1",
			baseSha: "abc",
			backend: "pi",
			reentries: 0,
			snapshotRefs: [],
			status: "done",
			createdAt: "2026-10-02T00:00:00.000Z",
		},
		envelopes: {},
		facts: { passes: [] },
		stats: [],
	};
}

const injector: ExtensionFactory = (pi) => {
	pi.on("before_agent_start", async () => ({
		message: {
			customType: "contract-memory",
			content: "injected memory",
			display: false,
		},
	}));
};

describe("pi contract: the session's user messages reach lean_build", () => {
	const tmp = useTempDir("pi-lean-user-messages-");

	test("runBuild receives each prompt verbatim and no injected or completion message", async () => {
		const calls: RunBuildOptions[] = [];
		const agentDir = join(tmp.path, "agent");
		const faux = fauxProvider({ provider: "contract-faux" });
		faux.setResponses([
			fauxAssistantMessage("noted"),
			fauxAssistantMessage("checker done"),
			fauxAssistantMessage(
				[fauxToolCall("lean_build", { request: "Change greet." })],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("built"),
			fauxAssistantMessage(
				[fauxToolCall("lean_build", { request: "Change greet again." })],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("built again"),
		]);
		const modelRuntime = await ModelRuntime.create({
			authPath: join(agentDir, "auth.json"),
			modelsPath: null,
			modelsStorePath: join(agentDir, "models-store.json"),
			refreshOnCreate: false,
		});
		modelRuntime.registerNativeProvider(faux.provider);
		const leanRun = createLeanRunExtension({
			runBuild: async (options) => {
				calls.push(options);
				return stubRecord();
			},
			createBackends: async () => ({ builder: BACKEND, reviewer: BACKEND }),
			providers: [],
		});
		const resourceLoader = new DefaultResourceLoader({
			cwd: tmp.path,
			agentDir,
			noExtensions: true,
			noSkills: true,
			noContextFiles: true,
			noPromptTemplates: true,
			noThemes: true,
			systemPrompt: "Base prompt.",
			extensionFactories: [injector, leanRun],
		});
		await resourceLoader.reload();
		const { session } = await createAgentSession({
			cwd: tmp.path,
			agentDir,
			modelRuntime,
			model: faux.getModel(),
			tools: ["lean_build"],
			resourceLoader,
			sessionManager: SessionManager.inMemory(tmp.path),
			settingsManager: SettingsManager.inMemory({ cacheWarming: "off" }),
		});
		const first = "Make `src/greet.ts` say hi,\n  not hello.  ";
		try {
			await session.prompt(first);
			await session.prompt(
				formatSpawnCompletionMessage("s-1", "lean/checker", "success", "ok"),
			);
			await session.prompt("ok, build it");
			await session.prompt("now make it say hey");
		} finally {
			session.dispose();
		}

		expect(calls).toHaveLength(2);
		expect(calls[0]?.userMessages).toEqual([first, "ok, build it"]);
		// The first build ended done, so the second carries only what followed.
		expect(calls[1]?.userMessages).toEqual(["now make it say hey"]);
	});
});
