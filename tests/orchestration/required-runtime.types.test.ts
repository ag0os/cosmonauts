import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const lib = join(here, "..", "..", "lib");
const fixturePath = join(here, "required-runtime.fixture.ts");

function fixture(withRuntime: boolean): string {
	const field = withRuntime ? "runtime, " : "";
	const options = withRuntime ? ", { runtime }" : "";
	return [
		`import type { AgentRegistry } from "${lib}/agents/resolver.ts";`,
		`import { createPiSpawner, type PiSpawnerOptions } from "${lib}/orchestration/agent-spawner.ts";`,
		`import type { ChainConfig, SpawnConfig } from "${lib}/orchestration/types.ts";`,
		`import type { CosmonautsRuntime } from "${lib}/runtime.ts";`,
		"declare const registry: AgentRegistry;",
		"declare const runtime: CosmonautsRuntime;",
		`export const spawn: SpawnConfig = { ${field}role: "r", cwd: "/", prompt: "p" };`,
		`export const chain: ChainConfig = { ${field}steps: [], projectRoot: "/", registry };`,
		`export const options: PiSpawnerOptions = { ${field} };`,
		`export const spawner = createPiSpawner(registry, undefined${options});`,
		`export const spawnerEmpty = createPiSpawner(registry, undefined, { ${field} });`,
	].join("\n");
}

/** Type-check the in-memory fixture; returns the declaration each error falls on. */
function rejectedDeclarations(source: string): string[] {
	const compilerOptions: ts.CompilerOptions = {
		module: ts.ModuleKind.NodeNext,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		target: ts.ScriptTarget.ES2023,
		allowImportingTsExtensions: true,
		noEmit: true,
		strict: true,
		skipLibCheck: true,
	};
	const host = ts.createCompilerHost(compilerOptions);
	const getSourceFile = host.getSourceFile.bind(host);
	const fileExists = host.fileExists.bind(host);
	host.getSourceFile = (name, language, ...rest) =>
		name === fixturePath
			? ts.createSourceFile(name, source, language)
			: getSourceFile(name, language, ...rest);
	host.fileExists = (name) => name === fixturePath || fileExists(name);
	const program = ts.createProgram([fixturePath], compilerOptions, host);
	const file = program.getSourceFile(fixturePath);
	if (!file) throw new Error("Fixture was not loaded");
	const lines = source.split("\n");
	return ts.getPreEmitDiagnostics(program, file).map((diagnostic) => {
		const { line } = file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
		return /export const (\w+)/.exec(lines[line] ?? "")?.[1] ?? `line ${line}`;
	});
}

test("spawn, chain and spawner options reject an omitted runtime at compile time", () => {
	expect(rejectedDeclarations(fixture(true))).toEqual([]);
	expect(rejectedDeclarations(fixture(false))).toEqual([
		"spawn",
		"chain",
		"options",
		"spawner",
		"spawnerEmpty",
	]);
}, 60_000);
