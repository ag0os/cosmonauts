import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";
import { describe, expect, test, vi } from "vitest";
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
