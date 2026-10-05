import { join } from "node:path";
import {
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
} from "@earendil-works/pi-ai";
import {
	createAgentSession,
	DefaultResourceLoader,
	ModelRuntime,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, test } from "vitest";
import { createLeanRunExtension } from "../../bundled/lean/extensions/lean-run/index.ts";
import type {
	BuilderBackend,
	RunRecord,
	RunStage,
	SessionStats,
} from "../../lib/lean-run/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const BACKEND: BuilderBackend = { kind: "pi", run: async () => ({ text: "" }) };
const STAGE_STATS: SessionStats = {
	tokens: {
		input: 17,
		output: 11,
		cacheRead: 7,
		cacheWrite: 5,
		total: 40,
	},
	cost: 0.42,
	durationMs: 100,
	turns: 1,
	toolCalls: 0,
};

type LeanTool = "lean_build" | "lean_review";

function stubRecord(stage: RunStage, withUsage: boolean): RunRecord {
	return {
		dir: "/run",
		manifest: {
			id: "r-1",
			baseSha: "abc",
			backend: "pi",
			reentries: 0,
			snapshotRefs: [],
			status: "done",
			createdAt: "2026-10-05T00:00:00.000Z",
		},
		envelopes: {},
		facts: { passes: [] },
		stats: withUsage
			? [{ stage, durationMs: STAGE_STATS.durationMs, spawn: STAGE_STATS }]
			: [],
	};
}

async function runSession(root: string, tool: LeanTool, withUsage: boolean) {
	const agentDir = join(root, `${tool}-${withUsage ? "usage" : "none"}`);
	const faux = fauxProvider({ provider: `contract-faux-${tool}-${withUsage}` });
	faux.setResponses([
		fauxAssistantMessage(
			[
				fauxToolCall(
					tool,
					tool === "lean_build" ? { request: "Change greet." } : {},
				),
			],
			{ stopReason: "toolUse" },
		),
		fauxAssistantMessage("done"),
	]);
	const modelRuntime = await ModelRuntime.create({
		authPath: join(agentDir, "auth.json"),
		modelsPath: null,
		modelsStorePath: join(agentDir, "models-store.json"),
		refreshOnCreate: false,
	});
	modelRuntime.registerNativeProvider(faux.provider);
	const stage = tool === "lean_build" ? "builder-1" : "reviewer";
	const record = stubRecord(stage, withUsage);
	const leanRun = createLeanRunExtension({
		runBuild: async () => record,
		runReview: async () => record,
		createBackends: async () => ({ builder: BACKEND, reviewer: BACKEND }),
		providers: [],
	});
	const resourceLoader = new DefaultResourceLoader({
		cwd: root,
		agentDir,
		noExtensions: true,
		noSkills: true,
		noContextFiles: true,
		noPromptTemplates: true,
		noThemes: true,
		systemPrompt: "Base prompt.",
		extensionFactories: [leanRun],
	});
	await resourceLoader.reload();
	const { session } = await createAgentSession({
		cwd: root,
		agentDir,
		modelRuntime,
		model: faux.getModel(),
		tools: [tool],
		resourceLoader,
		sessionManager: SessionManager.inMemory(root),
		settingsManager: SettingsManager.inMemory({ cacheWarming: "off" }),
	});
	try {
		await session.prompt("Run it.");
		return session.getSessionStats();
	} finally {
		session.dispose();
	}
}

function usageDifference(
	withUsage: Awaited<ReturnType<typeof runSession>>,
	withoutUsage: Awaited<ReturnType<typeof runSession>>,
) {
	return {
		input: withUsage.tokens.input - withoutUsage.tokens.input,
		output: withUsage.tokens.output - withoutUsage.tokens.output,
		cacheRead: withUsage.tokens.cacheRead - withoutUsage.tokens.cacheRead,
		cacheWrite: withUsage.tokens.cacheWrite - withoutUsage.tokens.cacheWrite,
		cost: withUsage.cost - withoutUsage.cost,
	};
}

describe("pi contract: lean run usage reaches session totals", () => {
	const tmp = useTempDir("pi-lean-run-usage-");

	test("lean_build adds its stage usage to the lead session", async () => {
		const withoutUsage = await runSession(tmp.path, "lean_build", false);
		const withUsage = await runSession(tmp.path, "lean_build", true);

		expect(usageDifference(withUsage, withoutUsage)).toEqual({
			input: 17,
			output: 11,
			cacheRead: 7,
			cacheWrite: 5,
			cost: 0.42,
		});
	});

	test("lean_review adds its stage usage to the lead session", async () => {
		const withoutUsage = await runSession(tmp.path, "lean_review", false);
		const withUsage = await runSession(tmp.path, "lean_review", true);

		expect(usageDifference(withUsage, withoutUsage)).toEqual({
			input: 17,
			output: 11,
			cacheRead: 7,
			cacheWrite: 5,
			cost: 0.42,
		});
	});
});
