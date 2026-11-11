import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";
import { describe, expect, test, vi } from "vitest";
import { resolveInteractiveExtensionPaths } from "../../cli/main.ts";
import { buildSessionParams } from "../../lib/agents/session-assembly.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { DomainRegistry } from "../../lib/domains/registry.ts";
import { DomainResolver } from "../../lib/domains/resolver.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi } from "../helpers/mocks/index.ts";

vi.mock("@earendil-works/pi-ai/providers/all", () => ({
	builtinModels: () => ({
		getModel: (provider: string, id: string) => ({ provider, id }),
	}),
}));
const tmp = useTempDir("extension-binding-");
function definition(extensions: string[]): AgentDefinition {
	return {
		id: "consumer",
		resourceDomain: "alpha",
		description: "Consumer",
		model: "test/model",
		instructions: { kind: "inline", content: "Consumer instructions" },
		capabilities: [],
		tools: "none",
		extensions,
		skills: [],
		projectContext: false,
		session: "ephemeral",
		loop: false,
		memory: { episodes: true },
	};
}
async function provider(name: string, source: string) {
	const path = join(tmp.path, "alpha", "extensions", name);
	await mkdir(path, { recursive: true });
	await writeFile(join(path, "index.ts"), source);
	return path;
}

describe("selected session providers", () => {
	test("does not turn resolver failures into native fallback", async () => {
		const resolver = new DomainResolver(new DomainRegistry([]));
		vi.spyOn(resolver, "resolveExtensionPath").mockImplementation(() => {
			throw new Error("provider index failed");
		});
		await expect(
			buildSessionParams({
				def: definition(["tasks"]),
				cwd: tmp.path,
				resolver,
				loadConfig: async () => ({}),
			}),
		).rejects.toThrow("provider index failed");
	});
	test.each([
		"resolver",
		"directory",
	])("uses native providers after a missing %s provider", async (kind) => {
		const params = await buildSessionParams({
			def: definition(["tasks", "plans"]),
			cwd: tmp.path,
			...(kind === "resolver"
				? { resolver: new DomainResolver(new DomainRegistry([])) }
				: { domainsDir: tmp.path }),
			loadConfig: async () => ({}),
		});
		expect(params.extensionPaths).toEqual([]);
		const pi = createMockPi({
			cwd: tmp.path,
			systemPrompt: params.promptContent,
		});
		for (const ext of params.extensionFactories)
			await (typeof ext === "function" ? ext : ext.factory)(pi as never);
		expect(pi.tools.has("task_list")).toBe(true);
		expect(pi.tools.has("plan_list")).toBe(true);
	});

	test("preserves a consumer's same-name directory provider over native defaults", async () => {
		const path = await provider(
			"tasks",
			"export default function extension() {}\n",
		);
		await provider(
			"plans",
			"throw new Error('unselected provider must not load');\n",
		);
		const params = await buildSessionParams({
			def: definition(["tasks"]),
			cwd: tmp.path,
			domainsDir: tmp.path,
			loadConfig: async () => ({}),
		});
		expect(params.extensionPaths).toEqual([path]);
		expect(params.extensionFactories).toEqual([]);
	});

	test.each([
		{
			kind: "private variable",
			declaration:
				"const privateValue = 1; export default function extension() {}",
		},
		{
			kind: "private async function",
			declaration:
				"async function createSessionExtension() {} export default function extension() {}",
		},
		{
			kind: "exported class",
			declaration:
				"export class Ordinary {} export default function extension() {}",
		},
		{
			kind: "unrelated named export",
			declaration:
				"const local = 1; export { local }; export default function extension() {}",
		},
		{
			kind: "unrelated exported function",
			declaration:
				"export function ordinaryHelper() {} export default function extension() {}",
		},
		{
			kind: "anonymous default function",
			declaration: "export default function() {}",
		},
		{
			kind: "default named function",
			declaration: "export default function createSessionExtension() {}",
		},
		{
			kind: "type export",
			declaration:
				"type Factory = unknown; export type { Factory as createSessionExtension }; export default function extension() {}",
		},
		{
			kind: "type export specifier",
			declaration:
				"type Factory = unknown; export { type Factory as createSessionExtension }; export default function extension() {}",
		},
		{
			kind: "ambient declaration",
			declaration:
				"export declare function createSessionExtension(): void; export default function extension() {}",
		},
		{
			kind: "wildcard export",
			declaration:
				"export * from './extra.ts'; export default function extension() {}",
		},
		{
			kind: "namespace export",
			declaration:
				"export * as createSessionExtension from './extra.ts'; export default function extension() {}",
		},
	])("evaluates an ordinary $kind provider only once, through Pi", async ({
		declaration,
	}) => {
		const key = `provider-import:${tmp.path}`;
		const globals = globalThis as unknown as Record<string, number | undefined>;
		try {
			const path = await provider(
				"ordinary",
				`globalThis[${JSON.stringify(key)}] = (globalThis[${JSON.stringify(key)}] ?? 0) + 1;
export const unrelated = 1;
${declaration}`,
			);
			await writeFile(join(path, "extra.ts"), "export const extra = 1;\n");
			const params = await buildSessionParams({
				def: definition(["ordinary"]),
				cwd: tmp.path,
				domainsDir: tmp.path,
				loadConfig: async () => ({}),
			});
			expect(globals[key]).toBeUndefined();
			const loader = new DefaultResourceLoader({
				cwd: tmp.path,
				agentDir: join(tmp.path, "pi"),
				noExtensions: true,
				noSkills: true,
				additionalExtensionPaths: params.extensionPaths,
				agentsFilesOverride: () => ({ agentsFiles: [] }),
			});
			await loader.reload();
			expect(loader.getExtensions().errors).toEqual([]);
			expect(globals[key]).toBe(1);
			expect(params.extensionPaths).toEqual([path]);
		} finally {
			delete globals[key];
		}
	});

	test.each([
		{
			kind: "function",
			declaration:
				"export function createSessionExtension(context) { return bind(context); }",
		},
		{
			kind: "variable",
			declaration: "export const unrelated = 1, createSessionExtension = bind;",
		},
		{
			kind: "named alias",
			declaration:
				"const unrelated = 1; export { unrelated, bind as createSessionExtension };",
		},
	])("binds the selected $kind provider to host identity and grants", async ({
		declaration,
	}) => {
		await provider(
			"bound",
			`const bind = (context) => (pi) => pi.registerTool({ name: "inspect_grants", execute: async () => ({ content: [], details: context }) });
${declaration}`,
		);
		const params = await buildSessionParams({
			def: definition(["bound"]),
			cwd: tmp.path,
			domainsDir: tmp.path,
			loadConfig: async () => ({}),
		});
		expect(params.extensionPaths).toEqual([]);
		const pi = createMockPi({ cwd: tmp.path });
		for (const ext of params.extensionFactories)
			await (typeof ext === "function" ? ext : ext.factory)(pi as never);
		expect(await pi.callTool("inspect_grants", {})).toMatchObject({
			details: {
				agentId: "consumer",
				memory: { knowledge: true, episodes: true, authored: false },
			},
		});
	});

	test("rejects an unknown provider instead of silently dropping it", async () => {
		await expect(
			buildSessionParams({
				def: definition(["missing"]),
				cwd: tmp.path,
				domainsDir: tmp.path,
				loadConfig: async () => ({}),
			}),
		).rejects.toThrow("Unknown extension");
	});
});

test.each([
	"js",
	"mjs",
])("binds a compiled %s provider without evaluating its default path factory", async (suffix) => {
	const root = join(tmp.path, "alpha", "extensions", "compiled");
	await mkdir(root, { recursive: true });
	await writeFile(
		join(root, `index.${suffix}`),
		`export async function createSessionExtension(context) { return pi => pi.registerTool({name:context.agentId, execute:async()=>({content:[]})}); } export default function fallback() {throw new Error('path factory')}`,
	);
	const params = await buildSessionParams({
		def: definition(["compiled"]),
		cwd: tmp.path,
		domainsDir: tmp.path,
		loadConfig: async () => ({}),
	});
	expect(params.extensionPaths).toEqual([]);
	const pi = createMockPi({ cwd: tmp.path });
	for (const factory of params.extensionFactories)
		await (typeof factory === "function" ? factory : factory.factory)(
			pi as never,
		);
	expect(pi.tools.has("consumer")).toBe(true);
});

test("consumer runtime providers receive the same runtime and grants without a directory", async () => {
	const { CosmonautsRuntime } = await import("../../lib/runtime.ts");
	const seen = vi.fn(
		async () => (pi: { registerTool: (tool: unknown) => void }) =>
			pi.registerTool({
				name: "consumer-tool",
				execute: async () => ({ content: [] }),
			}),
	);
	const def = { ...definition(["consumer-hook"]), resourceDomain: undefined };
	const runtime = await CosmonautsRuntime.create({
		projectRoot: tmp.path,
		projectConfig: {},
		agents: [def],
		extensionProviders: { "consumer-hook": seen },
	});
	const params = await buildSessionParams({
		def,
		runtime,
		cwd: tmp.path,
		resolver: runtime.domainResolver,
		loadConfig: async () => ({}),
	});
	expect(seen).toHaveBeenCalledWith({
		runtime,
		discoveryRuntime: runtime,
		agentId: "consumer",
		memory: {
			knowledge: true,
			authored: false,
			proposals: false,
			architecture: false,
			episodes: true,
		},
	});
	expect(params.extensionPaths).toEqual([]);
	const pi = createMockPi({ cwd: tmp.path });
	for (const factory of params.extensionFactories)
		await (typeof factory === "function" ? factory : factory.factory)(
			pi as never,
		);
	expect(pi.tools.has("consumer-tool")).toBe(true);
});

test.each([
	undefined,
	42,
])("validates optional host provider factory output (%s)", async (value) => {
	const { CosmonautsRuntime } = await import("../../lib/runtime.ts");
	const def = { ...definition(["host-hook"]), resourceDomain: undefined };
	const runtime = await CosmonautsRuntime.create({
		projectRoot: tmp.path,
		projectConfig: {},
		agents: [def],
		extensionProviders: { "host-hook": async () => value },
	});
	const assembly = buildSessionParams({
		def,
		runtime,
		cwd: tmp.path,
		loadConfig: async () => ({}),
	});
	if (value === undefined)
		expect((await assembly).extensionFactories).toEqual([]);
	else
		await expect(assembly).rejects.toThrow(
			"must return an inline factory or undefined",
		);
});

test("directory providers retain precedence over same-name explicit host callbacks", async () => {
	const { CosmonautsRuntime } = await import("../../lib/runtime.ts");
	const path = await provider(
		"tasks",
		"export default function extension() {}",
	);
	const fallback = vi.fn(() => {
		throw new Error("unselected host provider");
	});
	const runtime = await CosmonautsRuntime.create({
		projectRoot: tmp.path,
		projectConfig: {},
		extensionProviders: { tasks: fallback },
	});
	const params = await buildSessionParams({
		def: definition(["tasks"]),
		runtime,
		cwd: tmp.path,
		domainsDir: tmp.path,
		loadConfig: async () => ({}),
	});
	expect(params.extensionPaths).toEqual([path]);
	expect(fallback).not.toHaveBeenCalled();
});

test("an ordinary provider without an index remains a directory without deprecation warnings", async () => {
	const path = join(tmp.path, "alpha", "extensions", "ordinary");
	await mkdir(path, { recursive: true });
	const warning = vi.fn();
	process.on("warning", warning);
	try {
		const params = await buildSessionParams({
			def: definition(["ordinary"]),
			cwd: tmp.path,
			domainsDir: tmp.path,
			loadConfig: async () => ({}),
		});
		expect(params.extensionPaths).toEqual([path]);
		expect(params.extensionFactories).toEqual([]);
		await new Promise((resolve) => setImmediate(resolve));
		expect(warning.mock.calls).not.toContainEqual([
			expect.objectContaining({ code: "DEP0187" }),
		]);
	} finally {
		process.removeListener("warning", warning);
	}
});

test("resolves the library's own extensions by name without a domain directory", async () => {
	const params = await buildSessionParams({
		def: definition([
			"agent-switch",
			"init",
			"observability",
			"project-tools",
			"todo",
		]),
		cwd: tmp.path,
		resolver: new DomainResolver(new DomainRegistry([])),
		loadConfig: async () => ({}),
	});
	expect(params.extensionPaths).toEqual([]);
	const commands = new Set<string>();
	const pi = {
		...createMockPi({ cwd: tmp.path }),
		registerCommand: (name: string) => commands.add(name),
	};
	for (const ext of params.extensionFactories)
		await (typeof ext === "function" ? ext : ext.factory)(pi as never);
	expect([...commands].sort()).toEqual(["agent", "handoff", "init"]);
	expect([...pi.tools.keys()]).toEqual(
		expect.arrayContaining(["analysis_status", "todo_read", "todo_write"]),
	);
	expect(pi.events.get("turn_start")).toHaveLength(1);
});

test("an interactive session mounts agent-switch once when an agent also names it", async () => {
	const interactivePaths = resolveInteractiveExtensionPaths();
	const agentSwitchPath = fileURLToPath(
		new URL("../../lib/extensions/agent-switch", import.meta.url),
	);
	expect(interactivePaths).toContain(agentSwitchPath);
	const params = await buildSessionParams({
		def: definition(["agent-switch", "todo"]),
		cwd: tmp.path,
		resolver: new DomainResolver(new DomainRegistry([])),
		loadConfig: async () => ({}),
		extraExtensionPaths: interactivePaths,
	});
	const commands: string[] = [];
	const pi = {
		...createMockPi({ cwd: tmp.path }),
		registerCommand: (name: string) => commands.push(name),
	};
	for (const ext of params.extensionFactories)
		await (typeof ext === "function" ? ext : ext.factory)(pi as never);
	const pathLoads = params.extensionPaths.filter(
		(path) => path === agentSwitchPath,
	).length;
	const factoryLoads = commands.filter((name) => name === "agent").length;
	expect(pathLoads + factoryLoads).toBe(1);
	expect(params.extensionPaths).toEqual(interactivePaths);
	// Other named library extensions still resolve natively.
	expect([...pi.tools.keys()]).toEqual(
		expect.arrayContaining(["todo_read", "todo_write"]),
	);
});

test("a host's own agent-switch provider still loads when the library directory is mounted", async () => {
	const { CosmonautsRuntime } = await import("../../lib/runtime.ts");
	const hostFactory = vi.fn();
	const def = { ...definition(["agent-switch"]), resourceDomain: undefined };
	const runtime = await CosmonautsRuntime.create({
		projectRoot: tmp.path,
		projectConfig: {},
		agents: [def],
		extensionProviders: { "agent-switch": async () => hostFactory },
	});
	const params = await buildSessionParams({
		def,
		runtime,
		cwd: tmp.path,
		resolver: runtime.domainResolver,
		loadConfig: async () => ({}),
		extraExtensionPaths: resolveInteractiveExtensionPaths(),
	});
	expect(params.extensionFactories).toContain(hostFactory);
});

test("a runtime without extension providers mounts agent-switch once in an interactive session", async () => {
	const { CosmonautsRuntime } = await import("../../lib/runtime.ts");
	const def = { ...definition(["agent-switch"]), resourceDomain: undefined };
	const runtime = await CosmonautsRuntime.create({
		projectRoot: tmp.path,
		projectConfig: {},
		agents: [def],
	});
	expect(runtime.extensionProviders).toBeUndefined();
	const interactivePaths = resolveInteractiveExtensionPaths();
	const params = await buildSessionParams({
		def,
		runtime,
		cwd: tmp.path,
		resolver: runtime.domainResolver,
		loadConfig: async () => ({}),
		extraExtensionPaths: interactivePaths,
	});
	expect(params.extensionPaths).toEqual(interactivePaths);
	const commands: string[] = [];
	const pi = {
		...createMockPi({ cwd: tmp.path }),
		registerCommand: (name: string) => commands.push(name),
	};
	for (const ext of params.extensionFactories)
		await (typeof ext === "function" ? ext : ext.factory)(pi as never);
	expect(commands).not.toContain("agent");
});

describe("/init in a session whose plugin domain overrides an installed domain id", () => {
	function runtimeWithOps(content: string) {
		const domain = {
			manifest: {
				id: "ops",
				description: "ops",
				init: { kind: "inline", content },
			},
		};
		return {
			projectConfig: {},
			domainRegistry: {
				get: (id: string) => (id === "ops" ? domain : undefined),
			},
		} as never;
	}

	test("reads init from the runtime that resolved the active agent, not the execution runtime", async () => {
		const params = await buildSessionParams({
			def: {
				...definition(["init"]),
				id: "helper",
				domain: "ops",
				resourceDomain: undefined,
			},
			cwd: tmp.path,
			domainsDir: tmp.path,
			loadConfig: async () => ({}),
			runtime: runtimeWithOps("B steps."),
			extensionRuntime: runtimeWithOps("A steps."),
		});
		const commands = new Map<
			string,
			{ handler: (args: string, ctx: unknown) => Promise<void> }
		>();
		const sendUserMessage = vi.fn();
		const pi = {
			registerCommand: (name: string, def: never) => commands.set(name, def),
			sendUserMessage,
		};
		for (const ext of params.extensionFactories)
			await (typeof ext === "function" ? ext : ext.factory)(pi as never);
		const notify = vi.fn();
		await commands.get("init")?.handler("", { cwd: tmp.path, ui: { notify } });

		expect(notify).not.toHaveBeenCalled();
		expect(sendUserMessage).toHaveBeenCalledExactlyOnceWith(
			expect.stringContaining("B steps."),
		);
	});
});
