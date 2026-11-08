import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { createCliRuntime } from "../../cli/host-runtime.ts";
import { getCliExecutionRuntime } from "../../cli/runtime-bootstrap.ts";
import { buildSessionParams } from "../../lib/agents/session-assembly.ts";
import { DomainBindingTargetError } from "../../lib/domains/bindings.ts";
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

test("plugin-only targets are refused by the base CLI execution runtime", async () => {
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
		extensionRuntime: await getCliExecutionRuntime(tmp.path),
	});
	const pi = createMockPi(tmp.path, { systemPrompt: params.promptContent });
	for (const extension of params.extensionFactories)
		await (typeof extension === "function" ? extension : extension.factory)(
			pi as never,
		);
	await expect(
		pi.callTool("spawn_agent", { role: "worker", prompt: "Work" }),
	).rejects.toBeInstanceOf(DomainBindingTargetError);
	await expect(
		pi.callTool("chain_run", { expression: "worker" }),
	).rejects.toBeInstanceOf(DomainBindingTargetError);
	expect(mocks.session).not.toHaveBeenCalled();
	expect(mocks.createSpawner).not.toHaveBeenCalled();
});

vi.mock("@earendil-works/pi-ai/providers/all", () => ({
	builtinModels: () => ({
		getModel: (provider: string, id: string) => ({ provider, id }),
	}),
}));
