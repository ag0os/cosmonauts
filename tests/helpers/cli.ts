import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { expect, vi } from "vitest";

export class ProcessExitError extends Error {
	constructor(readonly code: number) {
		super(`process.exit(${code})`);
	}
}

export interface CommandTestContext {
	tempDir: string;
	output: ReturnType<typeof captureCommandOutput>;
	exit: ReturnType<typeof mockProcessExitThrow>;
	restore: () => Promise<void>;
}

export function createCommandProgram(
	registerCommand: (program: Command) => void,
): Command {
	const program = new Command();
	program.exitOverride();
	program
		.name("cosmonauts task")
		.option("--plain", "Output in plain text format (for agents)")
		.option("--json", "Output in JSON format");
	registerCommand(program);
	return program;
}

export async function createCommandTestContext(
	prefix: string,
): Promise<CommandTestContext> {
	const tempDir = await mkdtemp(join(tmpdir(), prefix));
	const originalCwd = process.cwd();
	process.chdir(tempDir);

	const output = captureCommandOutput();
	const exit = mockProcessExitThrow();

	return {
		tempDir,
		output,
		exit,
		restore: async () => {
			exit.restore();
			output.restore();
			process.chdir(originalCwd);
			vi.restoreAllMocks();
			await rm(tempDir, { recursive: true, force: true });
		},
	};
}

export function captureCliOutput(): {
	stdout: () => string;
	stderr: () => string;
	restore: () => void;
} {
	let stdoutOutput = "";
	let stderrOutput = "";

	const stdout = vi
		.spyOn(process.stdout, "write")
		.mockImplementation((chunk) => {
			stdoutOutput += String(chunk);
			return true;
		});
	const stderr = vi
		.spyOn(process.stderr, "write")
		.mockImplementation((chunk) => {
			stderrOutput += String(chunk);
			return true;
		});

	return {
		stdout: () => stdoutOutput,
		stderr: () => stderrOutput,
		restore: () => {
			stdout.mockRestore();
			stderr.mockRestore();
		},
	};
}

export function captureCommandOutput(): {
	stdout: () => string;
	stderr: () => string;
	restore: () => void;
} {
	let stdoutOutput = "";
	let stderrOutput = "";
	const streamOutput = captureCliOutput();
	const log = vi
		.spyOn(console, "log")
		.mockImplementation((message, ...rest) => {
			stdoutOutput += `${[message, ...rest].map(String).join(" ")}\n`;
		});
	const error = vi.spyOn(console, "error").mockImplementation((message) => {
		stderrOutput += `${String(message)}\n`;
	});

	return {
		stdout: () => `${streamOutput.stdout()}${stdoutOutput}`,
		stderr: () => `${streamOutput.stderr()}${stderrOutput}`,
		restore: () => {
			log.mockRestore();
			error.mockRestore();
			streamOutput.restore();
		},
	};
}

export function mockProcessExit(): {
	calls: () => readonly number[];
	restore: () => void;
} {
	const exitCalls: number[] = [];
	const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
		exitCalls.push(normalizeExitCode(code));
		return undefined as never;
	});

	return {
		calls: () => exitCalls,
		restore: () => {
			exit.mockRestore();
		},
	};
}

export function mockProcessExitThrow(): {
	calls: () => readonly number[];
	restore: () => void;
} {
	const exitCalls: number[] = [];
	const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
		const normalizedCode = normalizeExitCode(code);
		exitCalls.push(normalizedCode);
		throw new ProcessExitError(normalizedCode);
	});

	return {
		calls: () => exitCalls,
		restore: () => {
			exit.mockRestore();
		},
	};
}

export function expectInvalidPriorityDiagnostics(
	output: ReturnType<typeof captureCommandOutput>,
	exit: ReturnType<typeof mockProcessExitThrow>,
): void {
	expect(output.stdout()).toBe("");
	expect(output.stderr()).toBe(
		"Invalid priority: urgent. Must be one of: high, medium, low\n",
	);
	expect(exit.calls()).toEqual([1]);
}

export function expectInvalidStatusDiagnostics(
	output: ReturnType<typeof captureCommandOutput>,
	exit: ReturnType<typeof mockProcessExitThrow>,
): void {
	expect(output.stdout()).toBe("");
	expect(output.stderr()).toBe(
		"Invalid status: waiting. Must be one of: todo, in-progress, done, blocked\n",
	);
	expect(exit.calls()).toEqual([1]);
}

export function expectNoCommandDiagnostics(
	output: ReturnType<typeof captureCommandOutput>,
	exit: ReturnType<typeof mockProcessExitThrow>,
): void {
	expect(output.stderr()).toBe("");
	expect(exit.calls()).toEqual([]);
}

export function expectSingleJsonTaskTitle(
	output: ReturnType<typeof captureCommandOutput>,
	expectedTitle: string,
): void {
	const tasks = JSON.parse(output.stdout()) as Array<{ title: string }>;
	expect(tasks).toHaveLength(1);
	expect(tasks[0]?.title).toBe(expectedTitle);
}

function normalizeExitCode(code: string | number | null | undefined): number {
	if (typeof code === "number") {
		return code;
	}
	if (typeof code === "string") {
		const parsed = Number(code);
		return Number.isNaN(parsed) ? 1 : parsed;
	}
	return 0;
}
