import { expect, test, vi } from "vitest";
import { buildSessionParams } from "../lib/agents/session-assembly.ts";
import type { AgentDefinition } from "../lib/agents/types.ts";
import { createSessionExtension } from "../lib/extensions/orchestration/index.ts";
import { CosmonautsRuntime } from "../lib/runtime.ts";
import { createMockPi } from "./extensions/orchestration-helpers.ts";
import { useTempDir } from "./helpers/fs.ts";

vi.mock("@earendil-works/pi-ai/providers/all", () => ({
	builtinModels: () => ({
		getModel: (provider: string, id: string) => ({ provider, id }),
	}),
}));
const tmp = useTempDir("review45-runtime-");
const caller: AgentDefinition = {
	id: "plugin/caller",
	description: "Plugin caller",
	instructions: { kind: "inline", content: "Work" },
	model: "test/model",
	tools: "none",
	capabilities: [],
	extensions: ["orchestration"],
	skills: [],
	subagents: ["project/target"],
	memory: {},
	projectContext: false,
	session: "ephemeral",
	loop: false,
};
const target: AgentDefinition = {
	...caller,
	id: "project/target",
	extensions: [],
};

test("CLI extension execution scope denies plugin/domain-only callers in both spawn and chain", async () => {
	const extensionProviders = { orchestration: createSessionExtension };
	const base = await CosmonautsRuntime.create({
		projectRoot: tmp.path,
		projectConfig: {},
		agents: [target],
		extensionProviders,
	});
	const interactive = await CosmonautsRuntime.create({
		projectRoot: tmp.path,
		projectConfig: {},
		agents: [caller, target],
		extensionProviders,
	});
	expect(interactive.agentRegistry.has("plugin/caller")).toBe(true);
	const params = await buildSessionParams({
		def: caller,
		cwd: tmp.path,
		runtime: interactive,
		extensionRuntime: base,
	});
	const pi = createMockPi(tmp.path, { systemPrompt: params.promptContent });
	for (const extension of params.extensionFactories)
		await (typeof extension === "function" ? extension : extension.factory)(
			pi as never,
		);
	await expect(
		pi.callTool("spawn_agent", { role: "project/target", prompt: "Work" }),
	).rejects.toThrow("not active or installed");
	await expect(
		pi.callTool("chain_run", { expression: "project/target" }),
	).rejects.toThrow("not active or installed");
});

test.each([
	true,
	false,
])("explicit runtime config (%s) wins over disk configuration during memory assembly", async (enabled) => {
	const runtime = await CosmonautsRuntime.create({
		projectRoot: tmp.path,
		projectConfig: { knowledgeSurface: { enabled } },
	});
	const disk = vi.fn(async () => ({ knowledgeSurface: { enabled: !enabled } }));
	const params = await buildSessionParams({
		def: { ...target, memory: { knowledge: true } },
		cwd: tmp.path,
		runtime,
		loadConfig: disk,
	});
	expect(params.knowledgeSurfaceEnabled).toBe(enabled);
	expect(disk).not.toHaveBeenCalled();
});
