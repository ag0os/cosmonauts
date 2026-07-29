import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
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
		process.on("SIGTERM", () => process.stderr.write("${label}:ignored\\n"));
		process.stdout.write("${label}:ready\\n");
		setInterval(() => {}, 1_000);
	`;
}

describe("project-tools provider process runner", () => {
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
	}, 10_000);
});
