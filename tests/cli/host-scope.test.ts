import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { createCliRuntime } from "../../cli/host-runtime.ts";
import { getCliExecutionRuntime } from "../../cli/runtime-bootstrap.ts";
import { buildSessionParams } from "../../lib/agents/session-assembly.ts";
import { createMockPi } from "../extensions/orchestration-helpers.ts";
import { writeSyntheticDomainPackage } from "../helpers/domain-package-fixture.ts";
import { useTempDir } from "../helpers/fs.ts";

const mocks = vi.hoisted(() => ({
	spawn: vi.fn(),
	session: vi.fn(),
	createSpawner: vi.fn(),
}));
vi.mock("../../lib/orchestration/agent-spawner.ts", () => ({
	createPiSpawner: mocks.createSpawner,
}));
vi.mock("../../lib/orchestration/session-factory.ts", () => ({
	createAgentSessionFromDefinition: mocks.session,
}));
const tmp = useTempDir("cli-scope-");
afterEach(() => vi.unstubAllEnvs());

test("domain/plugin actors retain actual spawn and chain reach through the selected CLI execution runtime", async () => {
	vi.stubEnv("HOME", join(tmp.path, "home"));
	const plugin = await writeSyntheticDomainPackage(
		join(tmp.path, "plugin-package"),
		{
			domainId: "studio",
			lead: "lead",
			agents: [
				{ id: "lead", subagents: ["worker"], extensions: ["orchestration"] },
				{ id: "worker" },
			],
			prompts: { lead: "Consumer lead", worker: "Consumer worker" },
		},
	);
	await mkdir(join(plugin.domainRoot, "extensions", "orchestration"), {
		recursive: true,
	});
	await writeFile(
		join(plugin.domainRoot, "extensions", "orchestration", "index.ts"),
		"export function createSessionExtension(context) { return context.runtime.extensionProviders.orchestration(context); }\n",
	);
	const runtime = await createCliRuntime({
		projectRoot: tmp.path,
		pluginDirs: [dirname(plugin.domainRoot)],
		domainOverride: "studio",
	});
	expect(runtime.domainContext).toBe("studio");
	const params = await buildSessionParams({
		def: runtime.agentRegistry.resolve("studio/lead"),
		resolver: runtime.domainResolver,
		cwd: tmp.path,
		runtime,
		extensionRuntime: await getCliExecutionRuntime(tmp.path, runtime),
	});
	const pi = createMockPi(tmp.path, { systemPrompt: params.promptContent });
	for (const extension of params.extensionFactories)
		await (typeof extension === "function" ? extension : extension.factory)(
			pi as never,
		);
	mocks.session.mockRejectedValue(
		new Error("Offline fixture stops after session admission"),
	);
	mocks.createSpawner.mockReturnValue({ spawn: mocks.spawn, dispose() {} });
	mocks.spawn.mockResolvedValue({
		success: true,
		sessionId: "offline-chain",
		messages: [],
	});
	const spawned = await pi.callTool("spawn_agent", {
		role: "worker",
		prompt: "Work",
	});
	expect(spawned).toMatchObject({ details: { status: "accepted" } });
	expect(mocks.session).toHaveBeenCalledWith(
		expect.objectContaining({ id: "worker" }),
		expect.objectContaining({ runtime }),
		undefined,
		runtime.domainResolver,
	);
	const chained = await pi.callTool("chain_run", { expression: "worker" });
	expect(chained).toMatchObject({ details: { result: { success: true } } });
	expect(mocks.spawn).toHaveBeenCalledWith(
		expect.objectContaining({
			role: "worker",
			agentReference: expect.objectContaining({
				resolved: expect.objectContaining({ qualifiedId: "studio/worker" }),
			}),
		}),
	);
	expect(mocks.createSpawner).toHaveBeenCalledWith(
		runtime.agentRegistry,
		undefined,
		expect.objectContaining({ runtime }),
	);
});

vi.mock("@earendil-works/pi-ai/providers/all", () => ({
	builtinModels: () => ({
		getModel: (provider: string, id: string) => ({ provider, id }),
	}),
}));
