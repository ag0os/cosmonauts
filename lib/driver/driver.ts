import {
	type ChildProcess,
	execFile,
	execFileSync,
	spawn,
} from "node:child_process";
import { existsSync } from "node:fs";
import {
	chmod,
	copyFile,
	mkdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import type { TaskManager } from "../tasks/task-manager.ts";
import type { Backend } from "./backends/types.ts";
import { generateBashRunner } from "./driver-script.ts";
import {
	bridgeJsonlToActivityBus,
	createEventSink,
	type DriverEventPublisher,
	type JsonlActivityBusBridge,
} from "./event-stream.ts";
import { acquirePlanLock, isProcessAlive } from "./lock.ts";
import { renderPromptForTask } from "./prompt-template.ts";
import { runRunLoop } from "./run-run-loop.ts";
import {
	DETACHED_RUN_PID_FILENAME,
	RUN_COMPLETION_FILENAME,
	writeRunCompletion,
} from "./run-state.ts";
import type {
	DriverHandle,
	DriverResult,
	DriverRunSpec,
	PromptLayers,
} from "./types.ts";

export interface DriverDeps {
	taskManager: TaskManager;
	backend: Backend;
	activityBus: DriverEventPublisher;
	cosmonautsRoot: string;
}

export class DetachedNotSupportedError extends Error {
	// fallow-ignore-next-line unused-class-member
	readonly code = "DETACHED_NOT_SUPPORTED";
	readonly backendName: string;

	constructor(backendName: string) {
		super(`Backend is not supported for detached mode: ${backendName}`);
		this.name = "DetachedNotSupportedError";
		this.backendName = backendName;
	}
}

export class BackendLivenessCheckError extends Error {
	// fallow-ignore-next-line unused-class-member
	readonly code = "BACKEND_LIVENESS_CHECK_FAILED";
	readonly argv: string[];
	readonly exitCode?: number;
	readonly stdout: string;
	readonly stderr: string;

	constructor(
		argv: string[],
		result: { exitCode?: number; stdout?: string; stderr?: string },
	) {
		super(`Backend liveness check failed: ${argv.join(" ")}`);
		this.name = "BackendLivenessCheckError";
		this.argv = argv;
		this.exitCode = result.exitCode;
		this.stdout = result.stdout ?? "";
		this.stderr = result.stderr ?? "";
	}
}

export function runInline(spec: DriverRunSpec, deps: DriverDeps): DriverHandle {
	const controller = new AbortController();
	const result = acquirePlanLock(
		spec.planSlug,
		spec.runId,
		deps.cosmonautsRoot,
	).then((lock) => {
		if ("error" in lock) {
			throw lock;
		}

		const eventSink = createEventSink({
			logPath: spec.eventLogPath,
			runId: spec.runId,
			parentSessionId: spec.parentSessionId,
			activityBus: deps.activityBus,
		});

		return runRunLoop(spec, {
			taskManager: deps.taskManager,
			backend: deps.backend,
			eventSink,
			parentSessionId: spec.parentSessionId,
			runId: spec.runId,
			abortSignal: controller.signal,
			cosmonautsRoot: deps.cosmonautsRoot,
			mode: "inline",
		}).finally(() => lock.release());
	});

	return {
		runId: spec.runId,
		planSlug: spec.planSlug,
		workdir: spec.workdir,
		eventLogPath: spec.eventLogPath,
		async abort() {
			controller.abort();
		},
		result,
	};
}

export function startDetached(
	spec: DriverRunSpec,
	deps: DriverDeps,
): DriverHandle {
	if (spec.backendName === "cosmonauts-subagent") {
		throw new DetachedNotSupportedError(spec.backendName);
	}
	runBackendLivenessCheck(deps.backend);

	const controller = new AbortController();
	let child: ChildProcess | undefined;
	let bridge: JsonlActivityBusBridge | undefined;
	let workdirCreated = false;

	const result = startDetachedProcess({
		spec,
		deps,
		signal: controller.signal,
		setChild: (spawned) => {
			child = spawned;
		},
		setBridge: (started) => {
			bridge = started;
		},
		markWorkdirCreated: () => {
			workdirCreated = true;
		},
	}).finally(async () => {
		await rm(join(spec.workdir, DETACHED_RUN_PID_FILENAME), {
			force: true,
		}).catch(() => undefined);
	});

	return {
		runId: spec.runId,
		planSlug: spec.planSlug,
		workdir: spec.workdir,
		eventLogPath: spec.eventLogPath,
		async abort() {
			bridge?.stop();
			const childWasSpawned = child?.pid !== undefined;
			if (child?.pid) {
				if (isProcessAlive(child.pid)) {
					try {
						process.kill(child.pid, "SIGTERM");
					} catch (error) {
						if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
							throw error;
						}
					}
				}
			}
			if (
				workdirCreated &&
				!existsSync(join(spec.workdir, RUN_COMPLETION_FILENAME))
			) {
				await writeRunCompletion(spec.workdir, {
					runId: spec.runId,
					outcome: "aborted",
					tasksDone: 0,
					tasksBlocked: 0,
				});
			}
			if (!childWasSpawned) {
				controller.abort();
			}
		},
		result,
	};
}

interface StartDetachedProcessOptions {
	spec: DriverRunSpec;
	deps: DriverDeps;
	signal: AbortSignal;
	setChild(child: ChildProcess): void;
	setBridge(bridge: JsonlActivityBusBridge): void;
	markWorkdirCreated(): void;
}

interface PromptLayersWithWorkdir extends PromptLayers {
	workdir: string;
}

async function startDetachedProcess({
	spec,
	deps,
	signal,
	setChild,
	setBridge,
	markWorkdirCreated,
}: StartDetachedProcessOptions): Promise<DriverResult> {
	throwIfAborted(signal);

	await mkdir(spec.workdir, { recursive: true });
	markWorkdirCreated();
	await mkdir(join(spec.workdir, "bin"), { recursive: true });
	await mkdir(dirname(spec.eventLogPath), { recursive: true });

	for (const taskId of spec.taskIds) {
		const promptTemplate: PromptLayersWithWorkdir = {
			...spec.promptTemplate,
			workdir: spec.workdir,
		};
		await renderPromptForTask(taskId, promptTemplate, deps.taskManager);
	}
	throwIfAborted(signal);

	await writeFile(
		join(spec.workdir, "task-queue.txt"),
		`${spec.taskIds.join("\n")}\n`,
		"utf-8",
	);
	await writeFile(
		join(spec.workdir, "spec.json"),
		`${JSON.stringify(spec, null, 2)}\n`,
		"utf-8",
	);
	throwIfAborted(signal);

	const binaryPath = join(spec.workdir, "bin", "cosmonauts-drive-step");
	await prepareRunStepBinary(deps.cosmonautsRoot, binaryPath);
	throwIfAborted(signal);

	const runScriptPath = join(spec.workdir, "run.sh");
	await writeFile(runScriptPath, generateBashRunner(spec.workdir), "utf-8");
	await chmod(runScriptPath, 0o755);
	throwIfAborted(signal);

	const runArgv = [runScriptPath];
	const child = spawn(runArgv[0] ?? runScriptPath, runArgv.slice(1), {
		cwd: spec.workdir,
		detached: true,
		stdio: "ignore",
		env: process.env,
	});
	setChild(child);
	if (!child.pid) {
		throw new Error("Detached driver process did not expose a PID");
	}
	child.unref();

	await writeFile(
		join(spec.workdir, DETACHED_RUN_PID_FILENAME),
		`${JSON.stringify(
			{
				pid: child.pid,
				startedAt: new Date().toISOString(),
				runArgv,
				cosmonautsPath: binaryPath,
			},
			null,
			2,
		)}\n`,
		"utf-8",
	);

	setBridge(
		bridgeJsonlToActivityBus(
			spec.eventLogPath,
			spec.runId,
			spec.parentSessionId,
			deps.activityBus,
		),
	);

	return await waitForDetachedResult(spec.workdir, child, signal);
}

function runBackendLivenessCheck(backend: Backend): void {
	const check = backend.livenessCheck?.();
	if (!check) {
		return;
	}

	const [command, ...args] = check.argv;
	if (!command) {
		throw new BackendLivenessCheckError(check.argv, {
			stderr: "livenessCheck returned an empty argv",
		});
	}

	try {
		execFileSync(command, args, {
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch (error) {
		if (!check.expectExitZero) {
			return;
		}
		const execError = error as NodeJS.ErrnoException & {
			status?: number;
			stdout?: string | Buffer;
			stderr?: string | Buffer;
		};
		const stderr = stringifyOutput(execError.stderr) || execError.message;
		throw new BackendLivenessCheckError(check.argv, {
			exitCode: execError.status,
			stdout: stringifyOutput(execError.stdout),
			stderr,
		});
	}
}

function stringifyOutput(output: string | Buffer | undefined): string {
	if (output === undefined) {
		return "";
	}
	return Buffer.isBuffer(output) ? output.toString("utf-8") : output;
}

async function prepareRunStepBinary(
	cosmonautsRoot: string,
	outfile: string,
): Promise<void> {
	for (const prebuiltPath of prebuiltRunnerCandidates(cosmonautsRoot)) {
		if (!existsSync(prebuiltPath)) {
			continue;
		}
		await copyFile(prebuiltPath, outfile);
		await chmod(outfile, 0o755);
		return;
	}

	await compileRunStep(outfile);
	await chmod(outfile, 0o755);
}

function prebuiltRunnerCandidates(cosmonautsRoot: string): string[] {
	const candidates = [
		join(cosmonautsRoot, "bin", "cosmonauts-drive-step"),
		join(packageRoot(), "bin", "cosmonauts-drive-step"),
	];
	return [...new Set(candidates)];
}

async function compileRunStep(outfile: string): Promise<void> {
	const sourcePath = join(driverSourceDir(), "run-step.ts");
	const result = await execFileResult("bun", [
		"build",
		"--compile",
		sourcePath,
		"--outfile",
		outfile,
	]);
	if (result.exitCode !== 0) {
		throw new Error(
			`Failed to compile detached driver binary: ${result.stderr || result.stdout}`,
		);
	}
}

function execFileResult(
	command: string,
	args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	return new Promise((resolve) => {
		execFile(
			command,
			args,
			{ encoding: "utf-8", maxBuffer: 1024 * 1024 * 10 },
			(error, stdout, stderr) => {
				const errorCode = (error as NodeJS.ErrnoException | null)?.code;
				resolve({
					exitCode: typeof errorCode === "number" ? errorCode : error ? 1 : 0,
					stdout: String(stdout ?? ""),
					stderr: String(stderr ?? ""),
				});
			},
		);
	});
}

async function waitForDetachedResult(
	workdir: string,
	child: ChildProcess,
	signal: AbortSignal,
): Promise<DriverResult> {
	const completionPath = join(workdir, RUN_COMPLETION_FILENAME);
	const completion = waitForCompletion(completionPath, signal);
	const childExit = waitForUnexpectedExit(child, completionPath);

	return await Promise.race([completion, childExit]);
}

async function waitForCompletion(
	path: string,
	signal: AbortSignal,
): Promise<DriverResult> {
	while (true) {
		throwIfAborted(signal);
		try {
			const raw = await readFile(path, "utf-8");
			return JSON.parse(raw) as DriverResult;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				throw error;
			}
		}
		await delay(100, undefined, { signal }).catch((error) => {
			if ((error as Error).name === "AbortError") {
				throw new Error("Detached driver result wait aborted");
			}
			throw error;
		});
	}
}

function waitForUnexpectedExit(
	child: ChildProcess,
	completionPath: string,
): Promise<never> {
	return new Promise((_, reject) => {
		child.once("exit", (code, signal) => {
			setTimeout(() => {
				if (!existsSync(completionPath)) {
					reject(
						new Error(
							`Detached driver exited before writing completion: code=${code} signal=${signal}`,
						),
					);
				}
			}, 500);
		});
	});
}

function driverSourceDir(): string {
	return dirname(fileURLToPath(import.meta.url));
}

function packageRoot(): string {
	return resolve(driverSourceDir(), "..", "..");
}

function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted) {
		throw new Error("Detached driver start aborted");
	}
}
