import { spawn } from "node:child_process";
import { closeSync, createWriteStream, openSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { finished } from "node:stream/promises";

export const DEFAULT_PROVIDER_TIMEOUT_MS = 30_000;
export const DEFAULT_TERMINATION_GRACE_MS = 250;
export const DEFAULT_FORCE_KILL_WAIT_MS = 1_000;
const PROVIDER_STDOUT_SPOOL = "provider-stdout.log";
const PROVIDER_STDERR_SPOOL = "provider-stderr.log";
const OUTPUT_CAPTURE_FAILED_CODE = "OUTPUT_CAPTURE_FAILED";

export interface ProviderProcessInvocation {
	readonly executablePath: string;
	readonly args: readonly string[];
	readonly cwd: string;
}

export interface ProviderProcessRunOptions {
	readonly timeoutMs?: number;
	readonly terminationGraceMs?: number;
	/**
	 * Final synchronous authorization and executable-identity validation.
	 * Runner preparation is complete before this runs, and spawn follows without
	 * an intervening await.
	 */
	readonly beforeSpawn?: () => void;
	/** Test-only lifecycle observer; cannot change output capture behavior. */
	readonly onOutputSpoolReady?: (outputSpoolRoot: string) => void;
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
	  })
	| (ProviderProcessOutput & {
			readonly kind: "termination-error";
			readonly initiated: InitiatedTermination;
			readonly error: Error & { readonly code: string };
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

const PROCESS_TREE_CLEANUP_FAILED_CODE = "PROCESS_TREE_CLEANUP_FAILED";
const PROCESS_TREE_POLL_MS = 10;

export type TaskkillExitOutcome =
	| { readonly kind: "terminated" }
	| { readonly kind: "unverified"; readonly error: Error };

export function classifyTaskkillExitCode(
	code: number | null,
): TaskkillExitOutcome {
	if (code === 0) return { kind: "terminated" };
	return {
		kind: "unverified",
		error: new Error(
			`taskkill exited with code ${String(
				code,
			)}; this did not positively establish process-tree termination.`,
		),
	};
}

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

type ProviderProcessOutcomeFactory = (
	stdout: string,
	stderr: string,
) => ProviderProcessOutcome;

function appendRunnerStderr(stderr: string, runnerStderr: string): string {
	if (runnerStderr.length === 0) return stderr;
	return `${stderr}${stderr.length === 0 ? "" : "\n"}${runnerStderr}`;
}

function appendRunnerError(current: string, message: string): string {
	return `${current}${current.length === 0 ? "" : "\n"}${message}`;
}

function processGroupExists(processGroupId: number): boolean {
	try {
		process.kill(-processGroupId, 0);
		return true;
	} catch (error) {
		return !(
			error instanceof Error &&
			"code" in error &&
			error.code === "ESRCH"
		);
	}
}

function signalPosixProcessGroup(
	processGroupId: number,
	signal: NodeJS.Signals,
): Error | undefined {
	try {
		process.kill(-processGroupId, signal);
		return undefined;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ESRCH") {
			return undefined;
		}
		return error instanceof Error ? error : new Error(String(error));
	}
}

function windowsTaskkillPath(): string {
	const windowsRoot = process.env.SystemRoot ?? "C:\\Windows";
	return join(windowsRoot, "System32", "taskkill.exe");
}

function taskkillProcessTree(
	processId: number,
	force: boolean,
	onComplete: (error?: Error) => void,
): void {
	let killer: ReturnType<typeof spawn>;
	try {
		killer = spawn(
			windowsTaskkillPath(),
			["/PID", String(processId), "/T", ...(force ? ["/F"] : [])],
			{
				shell: false,
				stdio: "ignore",
				windowsHide: true,
			},
		);
	} catch (error) {
		onComplete(error instanceof Error ? error : new Error(String(error)));
		return;
	}
	let completed = false;
	const complete = (error?: Error): void => {
		if (completed) return;
		completed = true;
		onComplete(error);
	};
	killer.once("error", complete);
	killer.once("close", (code) => {
		const outcome = classifyTaskkillExitCode(code);
		if (outcome.kind === "terminated") {
			complete();
			return;
		}
		complete(outcome.error);
	});
}

async function readableSpool(path: string): Promise<string> {
	try {
		return await readFile(path, "utf8");
	} catch {
		return "";
	}
}

export const runProviderProcess: ProviderProcessExecutor = async (
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
	let outputSpoolRoot: string;
	try {
		outputSpoolRoot = await mkdtemp(
			join(tmpdir(), "cosmonauts-provider-output-"),
		);
	} catch (error) {
		const spawnError =
			error instanceof Error ? error : new Error(String(error));
		return {
			kind: "spawn-error",
			error: errorWithOptionalCode(spawnError),
			stdout: "",
			stderr: "",
		};
	}
	if (signal?.aborted) {
		await rm(outputSpoolRoot, { recursive: true, force: true });
		return {
			kind: "aborted",
			reason: signal.reason,
			stdout: "",
			stderr: "",
		};
	}
	const stdoutPath = join(outputSpoolRoot, PROVIDER_STDOUT_SPOOL);
	const stderrPath = join(outputSpoolRoot, PROVIDER_STDERR_SPOOL);
	let stdoutDescriptor = -1;
	let stderrDescriptor = -1;
	try {
		stdoutDescriptor = openSync(stdoutPath, "wx", 0o600);
		stderrDescriptor = openSync(stderrPath, "wx", 0o600);
		options?.onOutputSpoolReady?.(outputSpoolRoot);
	} catch (error) {
		if (stdoutDescriptor >= 0) closeSync(stdoutDescriptor);
		if (stderrDescriptor >= 0) closeSync(stderrDescriptor);
		await rm(outputSpoolRoot, { recursive: true, force: true });
		const spawnError =
			error instanceof Error ? error : new Error(String(error));
		return {
			kind: "spawn-error",
			error: errorWithOptionalCode(spawnError),
			stdout: "",
			stderr: "",
		};
	}

	try {
		if (signal?.aborted) {
			closeSync(stdoutDescriptor);
			closeSync(stderrDescriptor);
			return {
				kind: "aborted",
				reason: signal.reason,
				stdout: "",
				stderr: "",
			};
		}
		try {
			options?.beforeSpawn?.();
		} catch (error) {
			closeSync(stdoutDescriptor);
			closeSync(stderrDescriptor);
			throw error;
		}
		return await new Promise((resolve) => {
			let settled = false;
			let termination: InitiatedTermination | undefined;
			let timeoutTimer: NodeJS.Timeout | undefined;
			let forceKillTimer: NodeJS.Timeout | undefined;
			let forceKillDeadlineTimer: NodeJS.Timeout | undefined;
			let processTreePollTimer: NodeJS.Timeout | undefined;
			let runnerStderr = "";
			let childClosed = false;
			let windowsTreeKillCompleted = false;
			let naturalOutcomeFactory: ProviderProcessOutcomeFactory | undefined;

			let child: ReturnType<typeof spawn>;
			try {
				child = spawn(invocation.executablePath, [...invocation.args], {
					cwd: invocation.cwd,
					detached: process.platform !== "win32",
					shell: false,
					stdio: ["ignore", "pipe", "pipe"],
					windowsHide: true,
				});
			} catch (error) {
				closeSync(stdoutDescriptor);
				closeSync(stderrDescriptor);
				const spawnError =
					error instanceof Error ? error : new Error(String(error));
				resolve({
					kind: "spawn-error",
					error: errorWithOptionalCode(spawnError),
					stdout: "",
					stderr: "",
				});
				return;
			}

			const stdoutSink = createWriteStream(stdoutPath, {
				fd: stdoutDescriptor,
				autoClose: true,
			});
			const stderrSink = createWriteStream(stderrPath, {
				fd: stderrDescriptor,
				autoClose: true,
			});
			const stdoutFinished = finished(stdoutSink);
			const stderrFinished = finished(stderrSink);
			if (child.stdout === null) {
				stdoutSink.end();
			} else {
				child.stdout.pipe(stdoutSink);
			}
			if (child.stderr === null) {
				stderrSink.end();
			} else {
				child.stderr.pipe(stderrSink);
			}

			const settle = (factory: ProviderProcessOutcomeFactory): void => {
				if (settled) return;
				settled = true;
				if (timeoutTimer) clearTimeout(timeoutTimer);
				if (forceKillTimer) clearTimeout(forceKillTimer);
				if (forceKillDeadlineTimer) clearTimeout(forceKillDeadlineTimer);
				if (processTreePollTimer) clearTimeout(processTreePollTimer);
				signal?.removeEventListener("abort", abort);
				void (async () => {
					try {
						await Promise.all([stdoutFinished, stderrFinished]);
						const [stdout, stderr] = await Promise.all([
							readFile(stdoutPath, "utf8"),
							readFile(stderrPath, "utf8"),
						]);
						resolve(factory(stdout, appendRunnerStderr(stderr, runnerStderr)));
					} catch (error) {
						const [stdout, stderr] = await Promise.all([
							readableSpool(stdoutPath),
							readableSpool(stderrPath),
						]);
						const captureError =
							error instanceof Error ? error : new Error(String(error));
						resolve({
							kind: "spawn-error",
							error: Object.assign(
								new Error(
									`Provider output capture failed: ${captureError.message}`,
								),
								{ code: OUTPUT_CAPTURE_FAILED_CODE },
							),
							stdout,
							stderr: appendRunnerStderr(stderr, runnerStderr),
						});
					}
				})();
			};

			const terminationError = (
				initiated: InitiatedTermination,
				message: string,
			): void => {
				runnerStderr = appendRunnerError(runnerStderr, message);
				child.stdout?.unpipe(stdoutSink);
				child.stderr?.unpipe(stderrSink);
				child.stdout?.destroy();
				child.stderr?.destroy();
				if (!stdoutSink.writableEnded) stdoutSink.end();
				if (!stderrSink.writableEnded) stderrSink.end();
				settle((stdout, stderr) => ({
					kind: "termination-error",
					initiated,
					error: Object.assign(new Error(message), {
						code: PROCESS_TREE_CLEANUP_FAILED_CODE,
					}),
					stdout,
					stderr,
				}));
			};

			const processTreeCleanupError = (message: string): void => {
				const initiated = termination;
				if (initiated !== undefined) {
					terminationError(initiated, message);
					return;
				}
				runnerStderr = appendRunnerError(runnerStderr, message);
				child.stdout?.unpipe(stdoutSink);
				child.stderr?.unpipe(stderrSink);
				child.stdout?.destroy();
				child.stderr?.destroy();
				if (!stdoutSink.writableEnded) stdoutSink.end();
				if (!stderrSink.writableEnded) stderrSink.end();
				settle((stdout, stderr) => ({
					kind: "spawn-error",
					error: Object.assign(new Error(message), {
						code: PROCESS_TREE_CLEANUP_FAILED_CODE,
					}),
					stdout,
					stderr,
				}));
			};

			const processTreeGone = (): boolean => {
				const processId = child.pid;
				if (processId === undefined) return true;
				if (process.platform === "win32") {
					return windowsTreeKillCompleted && childClosed;
				}
				return !processGroupExists(processId);
			};

			const maybeFinishProcessTreeCleanup = (): void => {
				if (!childClosed || !processTreeGone()) {
					return;
				}
				const initiated = termination;
				if (initiated !== undefined) {
					settle((stdout, stderr) =>
						terminationOutcome(initiated, stdout, stderr),
					);
					return;
				}
				const factory = naturalOutcomeFactory;
				if (factory !== undefined) settle(factory);
			};

			const pollForTerminatedTree = (): void => {
				if (
					settled ||
					(termination === undefined && naturalOutcomeFactory === undefined)
				) {
					return;
				}
				maybeFinishProcessTreeCleanup();
				if (settled) return;
				processTreePollTimer = setTimeout(
					pollForTerminatedTree,
					PROCESS_TREE_POLL_MS,
				);
			};

			const forceKillProcessTree = (): void => {
				if (settled) return;
				if (process.platform === "win32") {
					const processId = child.pid;
					if (processId === undefined) {
						windowsTreeKillCompleted = true;
						maybeFinishProcessTreeCleanup();
						return;
					}
					taskkillProcessTree(processId, true, (error) => {
						if (error !== undefined) {
							runnerStderr = appendRunnerError(
								runnerStderr,
								`Provider process-tree force-kill failed: ${error.message}`,
							);
						} else {
							windowsTreeKillCompleted = true;
						}
						maybeFinishProcessTreeCleanup();
					});
				} else if (child.pid !== undefined) {
					const error = signalPosixProcessGroup(child.pid, "SIGKILL");
					if (error !== undefined) {
						runnerStderr = appendRunnerError(
							runnerStderr,
							`Provider process-group force-kill failed: ${error.message}`,
						);
					}
				}

				pollForTerminatedTree();
				forceKillDeadlineTimer = setTimeout(() => {
					if (settled) return;
					maybeFinishProcessTreeCleanup();
					if (!settled) {
						processTreeCleanupError(
							`Provider process tree did not terminate within ${
								terminationGraceMs + DEFAULT_FORCE_KILL_WAIT_MS
							}ms.`,
						);
					}
				}, DEFAULT_FORCE_KILL_WAIT_MS);
			};

			const beginProcessTreeCleanup = (): void => {
				if (timeoutTimer) clearTimeout(timeoutTimer);

				forceKillTimer = setTimeout(() => {
					forceKillProcessTree();
				}, terminationGraceMs);

				if (process.platform === "win32") {
					const processId = child.pid;
					if (processId !== undefined) {
						taskkillProcessTree(processId, false, (error) => {
							if (error !== undefined) {
								runnerStderr = appendRunnerError(
									runnerStderr,
									`Provider process-tree graceful termination failed: ${error.message}`,
								);
							} else {
								windowsTreeKillCompleted = true;
							}
							maybeFinishProcessTreeCleanup();
						});
					}
				} else if (child.pid !== undefined) {
					const error = signalPosixProcessGroup(child.pid, "SIGTERM");
					if (error !== undefined) {
						runnerStderr = appendRunnerError(
							runnerStderr,
							`Provider process-group graceful termination failed: ${error.message}`,
						);
					}
				}
				maybeFinishProcessTreeCleanup();
			};

			const beginTermination = (initiated: InitiatedTermination): void => {
				if (settled || termination || naturalOutcomeFactory) return;
				termination = initiated;
				beginProcessTreeCleanup();
			};

			const completeNaturalExit = (
				factory: ProviderProcessOutcomeFactory,
			): void => {
				if (settled || termination || naturalOutcomeFactory) return;
				naturalOutcomeFactory = factory;
				beginProcessTreeCleanup();
			};

			function abort(): void {
				beginTermination({
					kind: "aborted",
					reason: signal?.reason,
				});
			}

			child.once("error", (error) => {
				if (termination) {
					childClosed = true;
					runnerStderr = appendRunnerError(
						runnerStderr,
						`Provider process emitted an error during termination: ${error.message}`,
					);
					maybeFinishProcessTreeCleanup();
					return;
				}
				childClosed = true;
				completeNaturalExit((stdout, stderr) => ({
					kind: "spawn-error",
					error: errorWithOptionalCode(error),
					stdout,
					stderr,
				}));
			});

			const childExit = (
				code: number | null,
				exitSignal: NodeJS.Signals | null,
			): void => {
				if (childClosed) return;
				childClosed = true;
				if (termination) {
					maybeFinishProcessTreeCleanup();
					return;
				}
				if (typeof code === "number") {
					completeNaturalExit((stdout, stderr) => ({
						kind: "code-exit",
						code,
						stdout,
						stderr,
					}));
					return;
				}
				if (exitSignal !== null) {
					completeNaturalExit((stdout, stderr) => ({
						kind: "signal-exit",
						signal: exitSignal,
						stdout,
						stderr,
					}));
					return;
				}
				completeNaturalExit((stdout, stderr) => ({
					kind: "spawn-error",
					error: new Error(
						"Provider process closed without an exit code or signal",
					),
					stdout,
					stderr,
				}));
			};

			child.once("exit", childExit);
			child.once("close", (code, exitSignal) => {
				childExit(code, exitSignal);
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
	} finally {
		await rm(outputSpoolRoot, { recursive: true, force: true });
	}
};
