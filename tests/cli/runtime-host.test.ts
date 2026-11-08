import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
	createCliRuntimeContext,
	getCliExecutionRuntime,
} from "../../cli/runtime-bootstrap.ts";
import type { CosmonautsRuntime } from "../../lib/runtime.ts";
import { getHostRuntime, setRuntimeHost } from "../../lib/runtime-host.ts";
import { createMockPi } from "../extensions/orchestration-helpers.ts";
import { writeSyntheticDomainPackage } from "../helpers/domain-package-fixture.ts";
import { useTempDir } from "../helpers/fs.ts";

test("CLI bootstrap forwards effective options and returns the exact host runtime", async () => {
	const runtime = {} as CosmonautsRuntime;
	const factory = vi.fn(async () => runtime);
	setRuntimeHost(factory);
	const context = await createCliRuntimeContext({
		piFlags: {},
		domain: "studio",
		pluginDirs: ["/plugins/first", "/plugins/second"],
	});
	expect(context).toEqual({ cwd: process.cwd(), runtime });
	expect(context.runtime).toBe(runtime);
	expect(factory).toHaveBeenCalledWith({
		projectRoot: process.cwd(),
		domainOverride: "studio",
		pluginDirs: ["/plugins/first", "/plugins/second"],
	});
});

test("CLI execution asks only for the base project runtime without plugin or domain additions", async () => {
	const base = {} as CosmonautsRuntime;
	const factory = vi.fn(async () => base);
	setRuntimeHost(factory);
	expect(await getCliExecutionRuntime(process.cwd())).toBe(base);
	expect(factory).toHaveBeenCalledExactlyOnceWith({
		projectRoot: process.cwd(),
	});
});

test("the CLI factory discovers only consumer sources and keeps host policy explicit", async () => {
	const { createCliRuntime, CLI_DEFAULT_MODEL } = await import(
		"../../cli/host-runtime.ts"
	);
	const runtime = await createCliRuntime({ projectRoot: tmp.path });
	expect(runtime.domains).toEqual([]);
	expect(runtime.agentRegistry.listAll()).toEqual([]);
	expect(runtime.domainsDir).toBeUndefined();
	expect(runtime.workerAgent).toBeUndefined();
	expect(runtime.chainAdapter).toBeUndefined();
	expect(runtime.sessionPolicies).toBeUndefined();
	expect(runtime.defaultModel).toBe(CLI_DEFAULT_MODEL);
});

test("installing the CLI host preserves an existing consumer host", async () => {
	const { installCliRuntimeHost } = await import("../../cli/host-runtime.ts");
	const selected = {} as CosmonautsRuntime;
	const factory = vi.fn(async () => selected);
	setRuntimeHost(factory);
	installCliRuntimeHost();
	expect(await getHostRuntime({ projectRoot: tmp.path })).toBe(selected);
	expect(factory).toHaveBeenCalledOnce();
});

const tmp = useTempDir("cli-host-factory-");
beforeEach(() => {
	vi.stubEnv("HOME", join(tmp.path, "home"));
});
afterEach(() => {
	vi.unstubAllEnvs();
});

test("the CLI host loads project config and explicitly discovers user-owned declarations", async () => {
	const { createCliRuntime } = await import("../../cli/host-runtime.ts");
	const home = join(tmp.path, "home");
	await writeSyntheticDomainPackage(join(home, ".cosmonauts"), {
		domainId: "user",
		domainPath: "domains/user",
		lead: "lead",
		agents: [{ id: "lead" }],
		prompts: { lead: "User-owned persona" },
	});
	await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
	await writeFile(
		join(tmp.path, ".cosmonauts", "config.json"),
		JSON.stringify({
			domain: "user",
			skills: ["consumer-skill"],
			knowledgeSurface: { enabled: true },
		}),
	);
	const runtime = await createCliRuntime({ projectRoot: tmp.path });
	expect(runtime.domains.map((domain) => domain.manifest.id)).toEqual(["user"]);
	expect(runtime.agentRegistry.resolve("user/lead").id).toBe("lead");
	expect(runtime.domainContext).toBe("user");
	expect(runtime.projectConfig.skills).toEqual(["consumer-skill"]);
	expect(runtime.projectConfig.knowledgeSurface?.enabled).toBe(true);
});

test("importing the CLI host installs a factory when no host exists", async () => {
	delete (globalThis as Record<symbol, unknown>)[
		Symbol.for("cosmonauts:runtime-host")
	];
	vi.resetModules();
	await import("../../cli/host-runtime.ts");
	const runtime = await getHostRuntime({ projectRoot: tmp.path });
	expect(runtime.domains).toEqual([]);
	expect(runtime.defaultModel).toBe("anthropic/claude-opus-4-7");
});

test("the CLI host's native orchestration provider mounts functioning tool registrations", async () => {
	const { createCliRuntime } = await import("../../cli/host-runtime.ts");
	const runtime = await createCliRuntime({ projectRoot: tmp.path });
	const provider = runtime.extensionProviders?.orchestration;
	expect(provider).toEqual(expect.any(Function));
	if (!provider) throw new Error("CLI orchestration provider absent");
	const extension = await provider({
		runtime,
		agentId: "consumer/lead",
		memory: {
			knowledge: false,
			authored: false,
			architecture: false,
			proposals: false,
			episodes: false,
		},
	});
	if (typeof extension !== "function")
		throw new Error(
			"CLI orchestration provider did not return its inline factory",
		);
	const pi = createMockPi(tmp.path);
	await extension(pi as never);
	expect(pi.getTool("spawn_agent")).toBeDefined();
	expect(pi.getTool("chain_run")).toBeDefined();
});
