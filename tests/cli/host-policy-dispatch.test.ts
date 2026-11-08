import { afterEach, expect, test, vi } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { DomainRegistry } from "../../lib/domains/registry.ts";
import type { LoadedDomain } from "../../lib/domains/types.ts";
import { getSharedRegistry } from "../../lib/interactive/agent-switch.ts";

const mocks = vi.hoisted(() => ({
	context: vi.fn(),
	createSession: vi.fn(),
	init: vi.fn(),
	run: vi.fn(),
	print: vi.fn(),
}));
vi.mock("../../cli/runtime-bootstrap.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../cli/runtime-bootstrap.ts")>()),
	createCliRuntimeContext: mocks.context,
}));
vi.mock("../../cli/session.ts", () => ({ createSession: mocks.createSession }));
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
	...(await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()),
	InteractiveMode: class {
		init = mocks.init;
		run = mocks.run;
	},
	runPrintMode: mocks.print,
}));
const originalArgv = process.argv;
const tty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
afterEach(() => {
	process.argv = originalArgv;
	process.exitCode = undefined;
	if (tty) Object.defineProperty(process.stdin, "isTTY", tty);
	else Reflect.deleteProperty(process.stdin, "isTTY");
	(globalThis as Record<symbol, unknown>)[
		Symbol.for("cosmonauts:agent-registry")
	] = undefined;
	vi.clearAllMocks();
	vi.resetModules();
});
for (const mode of ["interactive", "print", "init"]) {
	test(`${mode} startup forwards the consumer policy and interactive commands share it`, async () => {
		const actor: AgentDefinition = {
			id: "archivist",
			domain: "studio",
			description: "Archive",
			instructions: { kind: "inline", content: "Archive" },
			model: "test/model",
			capabilities: [],
			extensions: [],
			skills: [],
			tools: "none",
			projectContext: false,
			session: "ephemeral",
			loop: false,
		};
		const domain: LoadedDomain = {
			manifest: {
				id: "studio",
				description: "Studio",
				lead: "archivist",
				default: true,
			},
			agents: new Map([[actor.id, actor]]),
			portable: false,
			capabilities: new Set(),
			prompts: new Set(),
			skills: new Set(),
			extensions: new Set(),
			chains: [],
			provenance: [],
			rootDirs: [],
		};
		const provider = { forAgent: vi.fn(() => undefined) };
		const runtime = {
			domains: [domain],
			domainContext: "studio",
			domainRegistry: new DomainRegistry([domain]),
			agentRegistry: new AgentRegistry([actor]),
			sessionPolicies: provider,
			domainResolver: {
				resolveExtensionPath: (name: string) => `/consumer/${name}`,
			},
			domainsDir: "/consumer",
			projectSkills: [],
			skillPaths: [],
		};
		mocks.context.mockResolvedValue({ cwd: "/consumer", runtime });
		mocks.createSession.mockResolvedValue({});
		mocks.init.mockResolvedValue(undefined);
		mocks.run.mockResolvedValue(undefined);
		mocks.print.mockResolvedValue(0);
		Object.defineProperty(process.stdin, "isTTY", {
			configurable: true,
			value: true,
		});
		process.argv = [
			"node",
			"cosmonauts",
			...(mode === "print"
				? ["--print", "hello"]
				: mode === "init"
					? ["init"]
					: []),
		];
		await import("../../cli/main.ts");
		await vi.waitFor(() => expect(mocks.createSession).toHaveBeenCalledOnce());
		expect(mocks.createSession.mock.calls[0]?.[0]).toMatchObject({
			sessionPolicies: provider,
			definition: actor,
		});
		if (mode === "interactive")
			expect(getSharedRegistry()?.sessionPolicies).toBe(provider);
	});
}
