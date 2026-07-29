import { spawn } from "node:child_process";

export const DEFAULT_PROVIDER_TIMEOUT_MS = 30_000;
export const DEFAULT_TERMINATION_GRACE_MS = 250;

export interface ProviderProcessInvocation {
	readonly executablePath: string;
	readonly args: readonly string[];
	readonly cwd: string;
}

export interface ProviderProcessRunOptions {
	readonly timeoutMs?: number;
	readonly terminationGraceMs?: number;
}

interface ProviderProcessOutput {
	readonly stdout: string;
	readonly stderr: string;
}

export type ProviderProcessOutcome =
	| (ProviderProcessOutput & {
			readonly kind: "code-exit";
			readonly code: number;
	  })
	| (ProviderProcessOutput & {
			readonly kind: "signal-exit";
			readonly signal: NodeJS.Signals;
	  })
	| (ProviderProcessOutput & {
			readonly kind: "spawn-error";
			readonly error: Error & { readonly code?: string };
	  })
	| (ProviderProcessOutput & {
			readonly kind: "aborted";
			readonly reason: unknown;
	  })
	| (ProviderProcessOutput & {
			readonly kind: "timeout";
			readonly reason: string;
			readonly timeoutMs: number;
	  });

export type ProviderProcessExecutor = (
	invocation: ProviderProcessInvocation,
	signal?: AbortSignal,
	options?: ProviderProcessRunOptions,
) => Promise<ProviderProcessOutcome>;

type InitiatedTermination =
	| { readonly kind: "aborted"; readonly reason: unknown }
	| {
			readonly kind: "timeout";
			readonly reason: string;
			readonly timeoutMs: number;
	  };

function finiteTimeout(value: number | undefined): number {
	return value !== undefined && Number.isFinite(value) && value > 0
		? value
		: DEFAULT_PROVIDER_TIMEOUT_MS;
}

function finiteGracePeriod(value: number | undefined): number {
	return value !== undefined && Number.isFinite(value) && value >= 0
		? value
		: DEFAULT_TERMINATION_GRACE_MS;
}

function errorWithOptionalCode(
	error: Error,
): Error & { readonly code?: string } {
	if ("code" in error && typeof error.code === "string") {
		return Object.assign(error, { code: error.code });
	}
	return error;
}

function terminationOutcome(
	termination: InitiatedTermination,
	stdout: string,
	stderr: string,
): ProviderProcessOutcome {
	return { ...termination, stdout, stderr };
}

export const runProviderProcess: ProviderProcessExecutor = (
	invocation,
	signal,
	options,
) => {
	if (signal?.aborted) {
		return Promise.resolve({
			kind: "aborted",
			reason: signal.reason,
			stdout: "",
			stderr: "",
		});
	}

	const timeoutMs = finiteTimeout(options?.timeoutMs);
	const terminationGraceMs = finiteGracePeriod(options?.terminationGraceMs);

	return new Promise((resolve) => {
		let stdout = "";
		let stderr = "";
		let settled = false;
		let termination: InitiatedTermination | undefined;
		let timeoutTimer: NodeJS.Timeout | undefined;
		let forceKillTimer: NodeJS.Timeout | undefined;

		const settle = (outcome: ProviderProcessOutcome): void => {
			if (settled) return;
			settled = true;
			if (timeoutTimer) clearTimeout(timeoutTimer);
			if (forceKillTimer) clearTimeout(forceKillTimer);
			signal?.removeEventListener("abort", abort);
			resolve(outcome);
		};

		let child: ReturnType<typeof spawn>;
		try {
			child = spawn(invocation.executablePath, [...invocation.args], {
				cwd: invocation.cwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
			});
		} catch (error) {
			const spawnError =
				error instanceof Error ? error : new Error(String(error));
			settle({
				kind: "spawn-error",
				error: errorWithOptionalCode(spawnError),
				stdout,
				stderr,
			});
			return;
		}

		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr?.on("data", (chunk: string) => {
			stderr += chunk;
		});

		const beginTermination = (initiated: InitiatedTermination): void => {
			if (settled || termination) return;
			termination = initiated;
			if (timeoutTimer) clearTimeout(timeoutTimer);

			forceKillTimer = setTimeout(() => {
				if (settled) return;
				try {
					child.kill("SIGKILL");
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					stderr += `\nProvider force-kill failed: ${message}`;
					settle(terminationOutcome(initiated, stdout, stderr));
				}
			}, terminationGraceMs);

			try {
				child.kill("SIGTERM");
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				stderr += `\nProvider graceful termination failed: ${message}`;
			}
		};

		function abort(): void {
			beginTermination({
				kind: "aborted",
				reason: signal?.reason,
			});
		}

		child.once("error", (error) => {
			if (termination) {
				settle(terminationOutcome(termination, stdout, stderr));
				return;
			}
			settle({
				kind: "spawn-error",
				error: errorWithOptionalCode(error),
				stdout,
				stderr,
			});
		});

		child.once("close", (code, exitSignal) => {
			if (termination) {
				settle(terminationOutcome(termination, stdout, stderr));
				return;
			}
			if (typeof code === "number") {
				settle({ kind: "code-exit", code, stdout, stderr });
				return;
			}
			if (exitSignal !== null) {
				settle({
					kind: "signal-exit",
					signal: exitSignal,
					stdout,
					stderr,
				});
				return;
			}
			settle({
				kind: "spawn-error",
				error: new Error(
					"Provider process closed without an exit code or signal",
				),
				stdout,
				stderr,
			});
		});

		signal?.addEventListener("abort", abort, { once: true });
		if (signal?.aborted) {
			abort();
		}
		timeoutTimer = setTimeout(() => {
			beginTermination({
				kind: "timeout",
				reason: `Timed out after ${timeoutMs}ms`,
				timeoutMs,
			});
		}, timeoutMs);
	});
};
