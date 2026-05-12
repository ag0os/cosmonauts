import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { AgentPackage } from "./types.ts";

export type ExecFileBoundary = (
	command: string,
	args: readonly string[],
) => Promise<void>;

export interface CompileAgentPackageBinaryOptions {
	readonly agentPackage: AgentPackage;
	readonly outFile: string;
	readonly execFile?: ExecFileBoundary;
}

const execFileAsync = promisify(execFileCallback);

export async function compileAgentPackageBinary(
	options: CompileAgentPackageBinaryOptions,
): Promise<void> {
	const execFile = options.execFile ?? defaultExecFile;
	const tempDir = await mkdtemp(join(tmpdir(), "cosmonauts-agent-export-"));

	try {
		const entryPath = join(tempDir, "entry.ts");
		await writeFile(
			entryPath,
			renderClaudeBinaryEntry(options.agentPackage),
			"utf-8",
		);
		await execFile("bun", [
			"build",
			"--compile",
			entryPath,
			"--outfile",
			options.outFile,
		]);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}

function renderClaudeBinaryEntry(agentPackage: AgentPackage): string {
	const runnerModuleUrl = pathToFileURL(
		fileURLToPath(new URL("./claude-binary-runner.ts", import.meta.url)),
	).href;
	const serializedPackage = JSON.stringify(agentPackage);

	return [
		`import { runClaudeBinary } from ${JSON.stringify(runnerModuleUrl)};`,
		"",
		`const packageJson = ${JSON.stringify(serializedPackage)};`,
		"await runClaudeBinary(JSON.parse(packageJson));",
		"",
	].join("\n");
}

async function defaultExecFile(
	command: string,
	args: readonly string[],
): Promise<void> {
	await execFileAsync(command, [...args], {
		encoding: "utf-8",
		maxBuffer: 1024 * 1024 * 10,
	});
}
