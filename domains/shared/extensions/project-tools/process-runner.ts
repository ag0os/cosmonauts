import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import {
	access,
	constants,
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { finished } from "node:stream/promises";

export const DEFAULT_PROVIDER_TIMEOUT_MS = 30_000;
export const DEFAULT_TERMINATION_GRACE_MS = 250;
const SANDBOX_UNAVAILABLE_CODE = "SANDBOX_UNAVAILABLE";
const MACOS_SANDBOX_EXECUTABLE = "/usr/bin/sandbox-exec";
const LINUX_SANDBOX_EXECUTABLE_CANDIDATES = [
	"/usr/bin/bwrap",
	"/bin/bwrap",
] as const;
const PROVIDER_STDOUT_SPOOL = "provider-stdout.log";
const PROVIDER_STDERR_SPOOL = "provider-stderr.log";
const OUTPUT_CAPTURE_FAILED_CODE = "OUTPUT_CAPTURE_FAILED";

export interface ProviderProcessInvocation {
	readonly executablePath: string;
	readonly args: readonly string[];
	readonly cwd: string;
}

interface ProviderProcessRunOptions {
	readonly timeoutMs?: number;
	readonly terminationGraceMs?: number;
	/** Test seam that can only select another enforced boundary or fail closed. */
	readonly sandboxPlatform?: NodeJS.Platform;
	/** Test-only lifecycle observer; cannot change the prepared boundary. */
	readonly onSandboxReady?: (tempRoot: string) => void;
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

interface PreparedProviderSandbox {
	readonly executablePath: string;
	readonly args: readonly string[];
	readonly cwd: string;
	readonly env: Readonly<Record<string, string>>;
	readonly tempRoot: string;
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

function sandboxUnavailable(
	message: string,
): Error & { readonly code: string } {
	return Object.assign(new Error(message), {
		code: SANDBOX_UNAVAILABLE_CODE,
	});
}

async function executableAvailable(path: string): Promise<boolean> {
	try {
		await access(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

async function resolveSandboxExecutable(
	platform: NodeJS.Platform,
): Promise<string> {
	if (platform === "darwin") {
		if (await executableAvailable(MACOS_SANDBOX_EXECUTABLE)) {
			return MACOS_SANDBOX_EXECUTABLE;
		}
		throw sandboxUnavailable(
			`Provider sandbox boundary is unavailable at ${MACOS_SANDBOX_EXECUTABLE}.`,
		);
	}

	if (platform === "linux") {
		for (const candidate of LINUX_SANDBOX_EXECUTABLE_CANDIDATES) {
			if (await executableAvailable(candidate)) return candidate;
		}
		throw sandboxUnavailable(
			"Provider sandbox boundary is unavailable: bubblewrap was not found.",
		);
	}

	throw sandboxUnavailable(
		`Provider sandbox boundary is unavailable on ${platform}.`,
	);
}

function providerPath(): string {
	return [
		dirname(process.execPath),
		"/opt/homebrew/bin",
		"/usr/local/bin",
		"/usr/bin",
		"/bin",
		"/usr/sbin",
		"/sbin",
	]
		.filter((path, index, paths) => paths.indexOf(path) === index)
		.join(":");
}

function providerEnvironment(
	tempRoot: string,
	platform: NodeJS.Platform,
): Readonly<Record<string, string>> {
	const home = join(tempRoot, "home");
	const temporary = join(tempRoot, "tmp");
	return {
		HOME: home,
		TMPDIR: temporary,
		TMP: temporary,
		TEMP: temporary,
		PATH: providerPath(),
		LANG: "C",
		LC_ALL: "C",
		NO_COLOR: "1",
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_CONFIG_GLOBAL: "/dev/null",
		GIT_TERMINAL_PROMPT: "0",
		...(platform === "darwin"
			? { __CF_USER_TEXT_ENCODING: "0x0:0x0:0x0" }
			: {}),
	};
}

function macosSandboxProfile(tempRoot: string): string {
	return [
		"(version 1)",
		"(deny default)",
		"(allow process*)",
		"(allow file-read*)",
		"(allow sysctl-read)",
		'(allow file-write* (literal "/dev/null"))',
		`(allow file-write* (subpath ${JSON.stringify(tempRoot)}))`,
	].join("");
}

async function prepareProviderSandbox(
	invocation: ProviderProcessInvocation,
	options?: ProviderProcessRunOptions,
): Promise<PreparedProviderSandbox> {
	await access(invocation.executablePath, constants.X_OK);
	const platform = options?.sandboxPlatform ?? process.platform;
	const sandboxExecutable = await resolveSandboxExecutable(platform);
	const createdTempRoot = await mkdtemp(
		join(tmpdir(), "cosmonauts-provider-sandbox-"),
	);
	const tempRoot = await realpath(createdTempRoot);
	await Promise.all([
		mkdir(join(tempRoot, "home"), { mode: 0o700 }),
		mkdir(join(tempRoot, "tmp"), { mode: 0o700 }),
	]);
	const env = providerEnvironment(tempRoot, platform);

	if (platform === "darwin") {
		return {
			executablePath: sandboxExecutable,
			args: [
				"-p",
				macosSandboxProfile(tempRoot),
				invocation.executablePath,
				...invocation.args,
			],
			cwd: invocation.cwd,
			env,
			tempRoot,
		};
	}

	if (platform === "linux") {
		return {
			executablePath: sandboxExecutable,
			args: [
				"--die-with-parent",
				"--unshare-all",
				"--new-session",
				"--ro-bind",
				"/",
				"/",
				"--dev",
				"/dev",
				"--proc",
				"/proc",
				"--bind",
				tempRoot,
				tempRoot,
				"--chdir",
				invocation.cwd,
				"--clearenv",
				...Object.entries(env).flatMap(([key, value]) => [
					"--setenv",
					key,
					value,
				]),
				"--",
				invocation.executablePath,
				...invocation.args,
			],
			cwd: invocation.cwd,
			env,
			tempRoot,
		};
	}

	await rm(tempRoot, { recursive: true, force: true });
	throw sandboxUnavailable(
		`Provider sandbox boundary is unavailable on ${platform}.`,
	);
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
	let sandbox: PreparedProviderSandbox;
	try {
		sandbox = await prepareProviderSandbox(invocation, options);
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
		await rm(sandbox.tempRoot, { recursive: true, force: true });
		return {
			kind: "aborted",
			reason: signal.reason,
			stdout: "",
			stderr: "",
		};
	}
	try {
		options?.onSandboxReady?.(sandbox.tempRoot);
	} catch (error) {
		await rm(sandbox.tempRoot, { recursive: true, force: true });
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
		return await new Promise((resolve) => {
			let settled = false;
			let termination: InitiatedTermination | undefined;
			let timeoutTimer: NodeJS.Timeout | undefined;
			let forceKillTimer: NodeJS.Timeout | undefined;
			let runnerStderr = "";

			let child: ReturnType<typeof spawn>;
			try {
				child = spawn(sandbox.executablePath, [...sandbox.args], {
					cwd: sandbox.cwd,
					env: sandbox.env,
					shell: false,
					stdio: ["ignore", "pipe", "pipe"],
				});
			} catch (error) {
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

			const stdoutPath = join(sandbox.tempRoot, PROVIDER_STDOUT_SPOOL);
			const stderrPath = join(sandbox.tempRoot, PROVIDER_STDERR_SPOOL);
			const stdoutSink = createWriteStream(stdoutPath, { flags: "wx" });
			const stderrSink = createWriteStream(stderrPath, { flags: "wx" });
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
						runnerStderr += `Provider force-kill failed: ${message}`;
						settle((stdout, stderr) =>
							terminationOutcome(initiated, stdout, stderr),
						);
					}
				}, terminationGraceMs);

				try {
					child.kill("SIGTERM");
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					runnerStderr += `Provider graceful termination failed: ${message}`;
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
					const initiated = termination;
					settle((stdout, stderr) =>
						terminationOutcome(initiated, stdout, stderr),
					);
					return;
				}
				settle((stdout, stderr) => ({
					kind: "spawn-error",
					error: errorWithOptionalCode(error),
					stdout,
					stderr,
				}));
			});

			child.once("close", (code, exitSignal) => {
				if (termination) {
					const initiated = termination;
					settle((stdout, stderr) =>
						terminationOutcome(initiated, stdout, stderr),
					);
					return;
				}
				if (typeof code === "number") {
					settle((stdout, stderr) => ({
						kind: "code-exit",
						code,
						stdout,
						stderr,
					}));
					return;
				}
				if (exitSignal !== null) {
					settle((stdout, stderr) => ({
						kind: "signal-exit",
						signal: exitSignal,
						stdout,
						stderr,
					}));
					return;
				}
				settle((stdout, stderr) => ({
					kind: "spawn-error",
					error: new Error(
						"Provider process closed without an exit code or signal",
					),
					stdout,
					stderr,
				}));
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
		await rm(sandbox.tempRoot, { recursive: true, force: true });
	}
};
