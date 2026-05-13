import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { AgentPackage } from "./types.ts";

type ExecFileBoundary = (
	command: string,
	args: readonly string[],
) => Promise<void>;

interface CompileAgentPackageBinaryOptions {
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
			renderBinaryEntry(options.agentPackage),
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

function renderBinaryEntry(agentPackage: AgentPackage): string {
	if (agentPackage.target === "codex") {
		return renderRunnerEntry({
			agentPackage,
			runnerModule: "./codex-binary-runner.ts",
			runnerFunction: "runCodexBinary",
		});
	}

	return renderRunnerEntry({
		agentPackage,
		runnerModule: "./claude-binary-runner.ts",
		runnerFunction: "runClaudeBinary",
	});
}

function renderRunnerEntry(options: {
	readonly agentPackage: AgentPackage;
	readonly runnerModule: string;
	readonly runnerFunction: string;
}): string {
	const runnerModulePath = fileURLToPath(
		new URL(options.runnerModule, import.meta.url),
	);
	const serializedPackage = JSON.stringify(options.agentPackage);

	return [
		`import { ${options.runnerFunction} } from ${JSON.stringify(
			runnerModulePath,
		)};`,
		"",
		`const packageJson = ${JSON.stringify(serializedPackage)};`,
		`await ${options.runnerFunction}(JSON.parse(packageJson));`,
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
