import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, test } from "vitest";

const require = createRequire(import.meta.url);
test("exports retain all stable deep entries with explicit friendly aliases and no wildcard", async () => {
	const pkg = JSON.parse(
		await readFile(new URL("../package.json", import.meta.url), "utf8"),
	);
	const config = await readFile(
		new URL("../fallow.toml", import.meta.url),
		"utf8",
	);
	const section = config.split("entry = [")[1]?.split("]")[0] ?? "";
	const entries = [...section.matchAll(/"([^"]+)"/g)].map(
		(match) => match[1] ?? "",
	);
	expect(entries).toHaveLength(24);
	for (const entry of entries) {
		expect(pkg.exports[`./${entry}`]).toBe(`./${entry}`);
		const alias = entry
			.replace(/^lib\//, "")
			.replace(/\/index\.ts$/, "")
			.replace(/\.ts$/, "");
		expect(require.resolve(`cosmonauts/${alias}`)).toBe(
			require.resolve(`cosmonauts/${entry}`),
		);
	}
	expect(Object.keys(pkg.exports).some((key) => key.includes("*"))).toBe(false);
	expect(() =>
		require.resolve("cosmonauts/lib/agents/session-assembly.ts"),
	).toThrow(/not defined by "exports"/);
	expect(require.resolve("cosmonauts")).toMatch(/lib\/index\.ts$/);
	for (const entry of [
		"chains",
		"extensions/orchestration",
		"orchestration/chain-runner",
		"orchestration/durable-chain-runner",
	])
		expect(require.resolve(`cosmonauts/${entry}`)).toMatch(/\.ts$/);
});

test("the locator stays on its Pi-discovery bridge entry and chains exports configured dispatch", async () => {
	const root = await import("cosmonauts");
	expect(root).not.toHaveProperty("getHostRuntime");
	expect(root).not.toHaveProperty("setRuntimeHost");
	expect(root).not.toHaveProperty("hasRuntimeHost");
	expect((await import("cosmonauts/runtime-host")).getHostRuntime).toBeTypeOf(
		"function",
	);
	expect((await import("cosmonauts/chains")).runConfiguredChain).toBeTypeOf(
		"function",
	);
});

test("every type sent from an eject types module to a barrel remains exported there", () => {
	const pairs = [
		["agents/types.ts", "agents/index.ts"],
		["domains/types.ts", "domains/index.ts"],
		["chains/types.ts", "chains/index.ts"],
	];
	const paths = pairs
		.flat()
		.map((path) => fileURLToPath(new URL(`../lib/${path}`, import.meta.url)));
	const program = ts.createProgram(paths, {
		module: ts.ModuleKind.NodeNext,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		allowImportingTsExtensions: true,
		noEmit: true,
		skipLibCheck: true,
	});
	const checker = program.getTypeChecker();
	const names = (path: string) => {
		const file = program.getSourceFile(
			fileURLToPath(new URL(`../lib/${path}`, import.meta.url)),
		);
		const symbol = file && checker.getSymbolAtLocation(file);
		if (!symbol) throw new Error(`Missing module ${path}`);
		return checker.getExportsOfModule(symbol).map((value) => value.name);
	};
	for (const [source, target] of pairs)
		expect(names(target ?? "")).toEqual(
			expect.arrayContaining(names(source ?? "")),
		);
}, 30000);
