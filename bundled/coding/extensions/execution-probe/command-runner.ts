import { execFile, spawn } from "node:child_process";
import { reapProcessGroup } from "../../../../lib/process/process-group.ts";

export const PROBE_OUTPUT_LIMIT = 1_048_576;
const OUTPUT_TAIL = 2_000;
// Longer than stopTree's own SIGTERM and SIGKILL grace, so a normal reap settles first.
const SETTLE_AFTER_TERMINATION_MS = 3_000;

type ProbeOutcome =
	| { kind: "code-exit"; code: number }
	| { kind: "signal-exit"; signal: NodeJS.Signals }
	| { kind: "spawn-error"; error: Error }
	| { kind: "timeout" | "output-overflow" | "aborted" }
	| { kind: "termination-error"; error: Error };

export type ProbeCommandOutcome = ProbeOutcome & {
	stdout: string;
	stderr: string;
};

function tail(previous: Buffer, chunk: Buffer): Buffer {
	return Buffer.concat([previous, chunk]).subarray(-OUTPUT_TAIL);
}

async function stopTree(pid: number | undefined): Promise<string | undefined> {
	if (pid === undefined) return undefined;
	if (process.platform === "win32") {
		return new Promise((resolve) => {
			execFile(
				"taskkill",
				["/PID", String(pid), "/T", "/F"],
				{ timeout: 2_000 },
				(error) => {
					resolve(
						error
							? `taskkill could not verify tree termination: ${error.message}`
							: undefined,
					);
				},
			);
		});
	}
	const result = await reapProcessGroup(pid, {
		termGraceMs: 250,
		killGraceMs: 1_000,
	});
	return result.kind === "survived" ? result.reason : undefined;
}

/** Output still open after termination means a process outside the group may hold it. */
function unsettledAfter(kind: ProbeOutcome["kind"]): ProbeOutcome {
	return {
		kind: "termination-error",
		error: new Error(
			`${kind}: command output stayed open ${SETTLE_AFTER_TERMINATION_MS}ms after termination; a descendant that left the process group may still be running`,
		),
	};
}

export async function runProbeCommand(
	command: string,
	cwd: string,
	signal: AbortSignal,
	timeoutMs: number,
): Promise<ProbeCommandOutcome> {
	if (signal.aborted) return { kind: "aborted", stdout: "", stderr: "" };
	return new Promise((resolve) => {
		let stdout: Buffer = Buffer.alloc(0);
		let stderr: Buffer = Buffer.alloc(0);
		let captured = 0;
		let initiated: ProbeOutcome | undefined;
		let settled = false;
		let childClosed = false;
		let cleanupStarted = false;
		let cleanupDone = false;
		let natural: ProbeOutcome | undefined;
		let settleDeadline: NodeJS.Timeout | undefined;
		const child = spawn(
			process.platform === "win32" ? "cmd.exe" : "/bin/sh",
			process.platform === "win32" ? ["/c", command] : ["-c", command],
			{
				cwd,
				detached: process.platform !== "win32",
				stdio: ["ignore", "pipe", "pipe"],
				windowsHide: true,
			},
		);
		const timeout = setTimeout(
			() => terminate({ kind: "timeout" }),
			Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30_000,
		);
		const abort = () => terminate({ kind: "aborted" });
		signal.addEventListener("abort", abort, { once: true });
		if (signal.aborted) abort();

		function finish(outcome: ProbeOutcome): void {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			clearTimeout(settleDeadline);
			signal.removeEventListener("abort", abort);
			child.stdout?.destroy();
			child.stderr?.destroy();
			resolve({
				...outcome,
				stdout: stdout.toString("utf8"),
				stderr: stderr.toString("utf8"),
			});
		}

		function clean(): void {
			if (cleanupStarted) return;
			cleanupStarted = true;
			void stopTree(child.pid).then(
				(error) => {
					if (error) {
						finish({ kind: "termination-error", error: new Error(error) });
						return;
					}
					cleanupDone = true;
					if (childClosed)
						finish(
							initiated ??
								natural ?? {
									kind: "spawn-error",
									error: new Error("command closed without status"),
								},
						);
				},
				(error: unknown) =>
					finish({
						kind: "termination-error",
						error: new Error(String(error)),
					}),
			);
		}

		function terminate(reason: ProbeOutcome): void {
			if (initiated || settled) return;
			initiated = reason;
			settleDeadline = setTimeout(
				() => finish(unsettledAfter(reason.kind)),
				SETTLE_AFTER_TERMINATION_MS,
			);
			clean();
		}

		function capture(stream: "stdout" | "stderr", chunk: Buffer): void {
			if (settled) return;
			captured += chunk.length;
			if (stream === "stdout") stdout = tail(stdout, chunk);
			else stderr = tail(stderr, chunk);
			if (captured > PROBE_OUTPUT_LIMIT) terminate({ kind: "output-overflow" });
		}
		child.stdout?.on("data", (chunk: Buffer) => capture("stdout", chunk));
		child.stderr?.on("data", (chunk: Buffer) => capture("stderr", chunk));
		child.on("error", (error) => {
			natural = { kind: "spawn-error", error };
			childClosed = true;
			clean();
		});
		child.on("exit", () => clean());
		child.on("close", (code, exitSignal) => {
			childClosed = true;
			if (code !== null) natural = { kind: "code-exit", code };
			else if (exitSignal)
				natural = { kind: "signal-exit", signal: exitSignal };
			if (!cleanupStarted) clean();
			if (cleanupDone)
				finish(
					initiated ??
						natural ?? {
							kind: "spawn-error",
							error: new Error("command closed without status"),
						},
				);
		});
	});
}
