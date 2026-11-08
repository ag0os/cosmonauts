import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { codingChainAdapter } from "../bundled/coding/chain-adapter.ts";
import { resolveInteractiveExtensionPaths } from "../cli/main.ts";
import {
	createContentRuntime,
	installContentRuntimeHost,
} from "../domains/host-runtime.ts";
import { qualityReviewSessionPolicies } from "../lib/orchestration/quality-review-session-provider.ts";
import { CosmonautsRuntime } from "../lib/runtime.ts";
import {
	getHostRuntime,
	hasRuntimeHost,
	setRuntimeHost,
} from "../lib/runtime-host.ts";
import { useTempDir } from "./helpers/fs.ts";

const tmp = useTempDir("content-runtime-");
beforeEach(() => vi.stubEnv("HOME", join(tmp.path, "isolated-home")));
afterEach(() => vi.unstubAllEnvs());

test("the current consumer explicitly supplies coding execution policies and its model", async () => {
	const runtime = await createContentRuntime({ projectRoot: tmp.path });
	expect(
		runtime.domains.some((domain) => domain.manifest.id === "coding"),
	).toBe(true);
	expect(runtime.chainAdapter).toBe(codingChainAdapter);
	expect(runtime.sessionPolicies).toBe(qualityReviewSessionPolicies);
	expect(runtime.workerAgent).toBe("coding/worker");
	expect(runtime.defaultModel).toBe("anthropic/claude-opus-4-7");
	const provider = runtime.extensionProviders?.orchestration;
	expect(provider).toBeTypeOf("function");
	expect(
		await provider?.({
			agentId: "coding/cody",
			memory: {
				knowledge: true,
				authored: false,
				architecture: false,
				proposals: false,
				episodes: true,
			},
			runtime,
		}),
	).toBeTypeOf("function");
});

test("inactive coding content does not supply coding runtime policies", async () => {
	await mkdir(join(tmp.path, ".cosmonauts"));
	await writeFile(
		join(tmp.path, ".cosmonauts", "config.json"),
		JSON.stringify({ activeDomains: [] }),
	);
	const runtime = await createContentRuntime({ projectRoot: tmp.path });
	expect(runtime.domains.map((domain) => domain.manifest.id)).toEqual([
		"shared",
	]);
	expect(runtime.chainAdapter).toBeUndefined();
	expect(runtime.sessionPolicies).toBeUndefined();
	expect(runtime.workerAgent).toBeUndefined();
});

test("the content consumer forwards plugin roots to discovery", async () => {
	const plugins = join(tmp.path, "plugins");
	await mkdir(join(plugins, "extra"), { recursive: true });
	await writeFile(
		join(plugins, "extra", "domain.ts"),
		'export default {id:"extra",description:"Plugin"}',
	);
	const runtime = await createContentRuntime({
		projectRoot: tmp.path,
		pluginDirs: [plugins],
	});
	expect(runtime.domains.some((domain) => domain.manifest.id === "extra")).toBe(
		true,
	);
});

test("content installation preserves an already configured consumer host", async () => {
	const runtime = {} as CosmonautsRuntime;
	const factory = vi.fn(async () => runtime);
	setRuntimeHost(factory);
	installContentRuntimeHost();
	await expect(getHostRuntime({ projectRoot: tmp.path })).resolves.toBe(
		runtime,
	);
	expect(factory).toHaveBeenCalledOnce();
});

test("content installation supplies the host when none exists", async () => {
	delete (globalThis as Record<symbol, unknown>)[
		Symbol.for("cosmonauts:runtime-host")
	];
	installContentRuntimeHost();
	expect(hasRuntimeHost()).toBe(true);
	await expect(
		getHostRuntime({ projectRoot: tmp.path }),
	).resolves.toMatchObject({ workerAgent: "coding/worker" });
});

test("importing the CLI content entry installs its host before CLI evaluation", async () => {
	vi.resetModules();
	delete (globalThis as Record<symbol, unknown>)[
		Symbol.for("cosmonauts:runtime-host")
	];
	await import("../domains/host-runtime.ts");
	expect(hasRuntimeHost()).toBe(true);
});

test("orchestration binding requires a runtime and registers Drive with the inline factory", async () => {
	const { createSessionExtension } = await import(
		"../lib/extensions/orchestration/index.ts"
	);
	const context = {
		agentId: "consumer",
		memory: {
			knowledge: true,
			authored: false,
			architecture: false,
			proposals: false,
			episodes: true,
		},
	};
	expect(() => createSessionExtension(context)).toThrow(
		"Orchestration requires the host runtime",
	);
	const runtime = await createContentRuntime({ projectRoot: tmp.path });
	const pi = {
		registerTool: vi.fn(),
		registerMessageRenderer: vi.fn(),
		on: vi.fn(),
	};
	const factory = createSessionExtension({ ...context, runtime });
	await (typeof factory === "function" ? factory : factory.factory)(
		pi as never,
	);
	expect(pi.registerTool).toHaveBeenCalledWith(
		expect.objectContaining({ name: "run_driver" }),
	);
});

test("coding content carries its seal into a direct runtime without the CLI host", async () => {
	const runtime = await CosmonautsRuntime.create({
		projectRoot: tmp.path,
		builtinDomainsDir: new URL("../domains", import.meta.url).pathname,
		bundledDirs: [new URL("../bundled/coding", import.meta.url).pathname],
		projectConfig: {},
	});
	expect(
		runtime.sessionPolicies?.interactiveDenial?.(
			runtime.agentRegistry.resolve("coding/quality-manager"),
		),
	).toContain("private snapshot");
});

test("the real content runtime discovers and mounts the existing domain-bindings extension", async () => {
	const runtime = await createContentRuntime({ projectRoot: tmp.path });
	const paths = resolveInteractiveExtensionPaths(runtime);
	const binding = new URL(
		"../domains/shared/extensions/domain-bindings",
		import.meta.url,
	).pathname;
	expect(paths).toContain(binding);
	expect(existsSync(binding)).toBe(true);
});
