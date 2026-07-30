import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	classifyTaskkillExitCode,
	DEFAULT_PROVIDER_TIMEOUT_MS,
	DEFAULT_TERMINATION_GRACE_MS,
	runProviderProcess,
} from "../../domains/shared/extensions/project-tools/process-runner.ts";

const CHILD_TIMEOUT_MS = 250;
const TERMINATION_GRACE_MS = 75;

function nodeInvocation(script: string) {
	return {
		executablePath: process.execPath,
		args: ["-e", script],
		cwd: process.cwd(),
	} as const;
}

function terminationIgnoringScript(label: string): string {
	return `
		const { spawn } = require("node:child_process");
		const descendant = spawn(process.execPath, ["-e", [
			'process.on("SIGTERM", () => process.stderr.write("${label}:descendant-ignored\\\\n"));',
			'setInterval(() => {}, 1_000);',
		].join("\\n")], { stdio: ["ignore", "inherit", "inherit"] });
		process.on("SIGTERM", () => process.stderr.write("${label}:ignored\\n"));
		process.stdout.write("${label}:ready:" + process.pid + ":" + descendant.pid + "\\n");
		setInterval(() => {}, 1_000);
	`;
}

function naturallyExitingDescendantScript(
	label: string,
	exit: "code" | "signal",
): string {
	const exitStatement =
		exit === "code"
			? "process.exit(0)"
			: 'process.kill(process.pid, "SIGTERM")';
	return `
		const { spawn } = require("node:child_process");
		const descendant = spawn(process.execPath, ["-e", "setInterval(() => {}, 1_000)"], {
			stdio: "ignore",
		});
		process.stdout.write("${label}:ready:" + process.pid + ":" + descendant.pid + "\\n", () => {
			${exitStatement};
		});
	`;
}

function processExists(processId: number): boolean {
	try {
		process.kill(processId, 0);
		return true;
	} catch (error) {
		return !(
			error instanceof Error &&
			"code" in error &&
			error.code === "ESRCH"
		);
	}
}

async function expectProcessGone(processId: number): Promise<void> {
	const deadline = Date.now() + 1_000;
	while (Date.now() < deadline) {
		if (!processExists(processId)) return;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	expect(processExists(processId)).toBe(false);
}

function processIdsFromOutput(
	output: string,
	label: string,
): readonly number[] {
	const match = output.match(new RegExp(`${label}:ready:(\\d+):(\\d+)`, "u"));
	if (match?.[1] === undefined || match[2] === undefined) {
		throw new Error(`Missing ${label} process IDs in provider output.`);
	}
	return [Number(match[1]), Number(match[2])];
}

async function waitForFileSize(
	path: string,
	minimumBytes: number,
	timeoutMs = 2_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			if ((await stat(path)).size >= minimumBytes) return;
		} catch {
			// The spool file is created asynchronously after output setup.
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error(
		`Expected ${path} to reach ${minimumBytes} bytes within ${timeoutMs}ms.`,
	);
}

describe("project-tools provider process runner", () => {
	test("requires positive taskkill evidence before reporting tree termination", () => {
		expect(classifyTaskkillExitCode(0)).toEqual({ kind: "terminated" });

		const ambiguous = classifyTaskkillExitCode(128);
		expect(ambiguous.kind).toBe("unverified");
		if (ambiguous.kind !== "unverified") {
			throw new Error("Expected taskkill exit 128 to remain unverified.");
		}
		expect(ambiguous.error.message).toContain("code 128");
		expect(ambiguous.error.message).toContain(
			"did not positively establish process-tree termination",
		);
	});

	test("spools large output losslessly and removes the private copies", async () => {
		const payloadBytes = 2 * 1024 * 1024;
		const stderrBytes = 1024 * 1024;
		const expectedStdout = JSON.stringify({
			payload: "λ".repeat(payloadBytes / 2),
		});
		const expectedStderr = `stderr-start\n${"é".repeat(stderrBytes / 2)}\nstderr-end`;
		let outputSpoolRoot: string | undefined;

		const execution = runProviderProcess(
			nodeInvocation(`
				process.stdout.write(JSON.stringify({ payload: "λ".repeat(${payloadBytes / 2}) }));
				process.stderr.write("stderr-start\\n" + "é".repeat(${stderrBytes / 2}) + "\\nstderr-end");
				setTimeout(() => process.exit(0), 250);
			`),
			undefined,
			{
				onOutputSpoolReady: (root) => {
					outputSpoolRoot = root;
				},
			},
		);

		while (outputSpoolRoot === undefined) {
			await new Promise((resolve) => setTimeout(resolve, 5));
		}
		const stdoutSpool = join(outputSpoolRoot, "provider-stdout.log");
		const stderrSpool = join(outputSpoolRoot, "provider-stderr.log");
		await Promise.all([
			waitForFileSize(stdoutSpool, Buffer.byteLength(expectedStdout)),
			waitForFileSize(stderrSpool, Buffer.byteLength(expectedStderr)),
		]);

		const outcome = await execution;
		expect(outcome).toEqual({
			kind: "code-exit",
			code: 0,
			stdout: expectedStdout,
			stderr: expectedStderr,
		});
		await expect(stat(outputSpoolRoot)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("reaps descendants after providers exit naturally or by signal", async () => {
		for (const exit of ["code", "signal"] as const) {
			const label = `natural-${exit}`;
			const outcome = await runProviderProcess(
				nodeInvocation(naturallyExitingDescendantScript(label, exit)),
				undefined,
				{ terminationGraceMs: TERMINATION_GRACE_MS },
			);
			const processIds = processIdsFromOutput(outcome.stdout, label);
			try {
				expect(outcome.kind).toBe(
					exit === "code" ? "code-exit" : "signal-exit",
				);
				for (const processId of processIds) {
					await expectProcessGone(processId);
				}
			} finally {
				for (const processId of processIds) {
					try {
						process.kill(processId, "SIGKILL");
					} catch {
						// The runner already reaped the process.
					}
				}
			}
		}
	});

	// @cosmo-behavior plan:analysis-capability-runtime#B-029
	test("distinguishes signal abort timeout and spawn failure from clean exit", async () => {
		expect(Number.isFinite(DEFAULT_PROVIDER_TIMEOUT_MS)).toBe(true);
		expect(DEFAULT_PROVIDER_TIMEOUT_MS).toBeGreaterThan(0);
		expect(Number.isFinite(DEFAULT_TERMINATION_GRACE_MS)).toBe(true);
		expect(DEFAULT_TERMINATION_GRACE_MS).toBeGreaterThanOrEqual(0);

		const codeExit = await runProviderProcess(
			nodeInvocation(
				'process.stdout.write("code-out"); process.stderr.write("code-err"); process.exit(7)',
			),
		);
		expect(codeExit).toEqual({
			kind: "code-exit",
			code: 7,
			stdout: "code-out",
			stderr: "code-err",
		});

		const signalExit = await runProviderProcess(
			nodeInvocation(`
				process.stdout.write("signal-out", () => {
					process.stderr.write("signal-err", () => {
						process.kill(process.pid, "SIGTERM");
					});
				});
			`),
		);
		expect(signalExit).toEqual({
			kind: "signal-exit",
			signal: "SIGTERM",
			stdout: "signal-out",
			stderr: "signal-err",
		});
		expect(signalExit).not.toHaveProperty("code");

		const spawnError = await runProviderProcess({
			executablePath: join(
				tmpdir(),
				`cosmonauts-provider-does-not-exist-${process.pid}`,
			),
			args: [],
			cwd: process.cwd(),
		});
		expect(spawnError.kind).toBe("spawn-error");
		if (spawnError.kind !== "spawn-error") {
			throw new Error(`Expected spawn-error, received ${spawnError.kind}`);
		}
		expect(spawnError.error.code).toBe("ENOENT");
		expect(spawnError.stdout).toBe("");
		expect(spawnError.stderr).toBe("");

		const abortController = new AbortController();
		const abortReason = new Error("cancelled by Pi contract test");
		const abortStartedAt = Date.now();
		const abortPromise = runProviderProcess(
			nodeInvocation(terminationIgnoringScript("abort")),
			abortController.signal,
			{
				timeoutMs: 5_000,
				terminationGraceMs: TERMINATION_GRACE_MS,
			},
		);
		setTimeout(() => abortController.abort(abortReason), CHILD_TIMEOUT_MS);
		const aborted = await abortPromise;
		expect(aborted.kind).toBe("aborted");
		if (aborted.kind !== "aborted") {
			throw new Error(`Expected aborted, received ${aborted.kind}`);
		}
		expect(aborted.reason).toBe(abortReason);
		expect(aborted.stdout).toContain("abort:ready");
		if (process.platform !== "win32") {
			expect(aborted.stderr).toContain("abort:ignored");
		}
		expect(Date.now() - abortStartedAt).toBeLessThan(2_000);
		expect(aborted).not.toHaveProperty("signal");
		expect(aborted).not.toHaveProperty("code");
		for (const processId of processIdsFromOutput(aborted.stdout, "abort")) {
			await expectProcessGone(processId);
		}

		const timeoutStartedAt = Date.now();
		const timedOut = await runProviderProcess(
			nodeInvocation(terminationIgnoringScript("timeout")),
			undefined,
			{
				timeoutMs: CHILD_TIMEOUT_MS,
				terminationGraceMs: TERMINATION_GRACE_MS,
			},
		);
		expect(timedOut.kind).toBe("timeout");
		if (timedOut.kind !== "timeout") {
			throw new Error(`Expected timeout, received ${timedOut.kind}`);
		}
		expect(timedOut.reason).toContain(`${CHILD_TIMEOUT_MS}`);
		expect(timedOut.timeoutMs).toBe(CHILD_TIMEOUT_MS);
		expect(timedOut.stdout).toContain("timeout:ready");
		if (process.platform !== "win32") {
			expect(timedOut.stderr).toContain("timeout:ignored");
		}
		expect(Date.now() - timeoutStartedAt).toBeLessThan(2_000);
		expect(timedOut).not.toHaveProperty("signal");
		expect(timedOut).not.toHaveProperty("code");
		for (const processId of processIdsFromOutput(timedOut.stdout, "timeout")) {
			await expectProcessGone(processId);
		}
	}, 10_000);
});
