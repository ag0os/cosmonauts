import { vi } from "vitest";

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
