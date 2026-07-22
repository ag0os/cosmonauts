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
import {
	createDriveEpisodeWarningReporter,
	recordDriveTerminalEpisode,
	runDriveOnGraph,
	stampDriveEpisodeResult,
} from "./drive-graph-runner.ts";
import { generateBashRunner } from "./driver-script.ts";
import { formatError } from "./errors.ts";
import {
	bridgeJsonlToActivityBus,
	createEventSink,
	type DriverEventPublisher,
	driveEventBridgeOptions,
	driveGraphActivityEventSinkOptions,
	type JsonlActivityBusBridge,
} from "./event-stream.ts";
import { acquirePlanLock, isProcessAlive } from "./lock.ts";
import { renderPromptForTask } from "./prompt-template.ts";
import {
	DETACHED_RUN_PID_FILENAME,
	RUN_COMPLETION_FILENAME,
	writeFallbackRunCompletion,
} from "./run-state.ts";
import type {
	DriverHandle,
	DriverResult,
	DriverRunSpec,
	EventSink,
	PromptLayers,
} from "./types.ts";

export interface DriverDeps {
	taskManager: TaskManager;
	backend: Backend;
	activityBus: DriverEventPublisher;
	cosmonautsRoot: string;
}

export interface DetachedLaunchHandle {
	runId: string;
	planSlug: string;
	workdir: string;
	eventLogPath: string;
	pid: number;
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

		const eventSink = createDriverEventSink(spec, deps);

		return runDriveOnGraph(spec, {
			taskManager: deps.taskManager,
			backend: deps.backend,
			eventSink,
			parentSessionId: spec.parentSessionId,
			runId: spec.runId,
			abortSignal: controller.signal,
			cosmonautsRoot: deps.cosmonautsRoot,
			mode: "inline",
			onTerminalPersisted: lock.release,
		}).finally(() => releasePlanLockBackstop(lock));
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

async function releasePlanLockBackstop(lock: {
	release(): Promise<void>;
}): Promise<void> {
	try {
		await lock.release();
	} catch (error) {
		try {
			process.stderr.write(
				`[warning] Plan lock release backstop failed: ${formatError(error)}\n`,
			);
		} catch {
			// Backstop reporting cannot replace the authoritative graph result.
		}
	}
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
	const launchState: DetachedLaunchState = {
		workdirCreated: false,
		aborted: false,
	};
	let abortPromise: Promise<void> | undefined;

	const result = startDetachedProcess({
		spec,
		deps,
		signal: controller.signal,
		setChild: (spawned) => {
			launchState.child = spawned;
		},
		setBridge: (started) => {
			if (launchState.aborted) {
				started.stop();
				return;
			}
			launchState.bridge = started;
		},
		markWorkdirCreated: () => {
			launchState.workdirCreated = true;
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
		abort() {
			abortPromise ??= abortDetachedRun({
				spec,
				deps,
				controller,
				launchState,
			});
			return abortPromise;
		},
		result,
	};
}

interface DetachedLaunchState {
	child?: ChildProcess;
	bridge?: JsonlActivityBusBridge;
	workdirCreated: boolean;
	aborted: boolean;
}

interface AbortDetachedRunOptions {
	readonly spec: DriverRunSpec;
	readonly deps: DriverDeps;
	readonly controller: AbortController;
	readonly launchState: DetachedLaunchState;
}

async function abortDetachedRun({
	spec,
	deps,
	controller,
	launchState,
}: AbortDetachedRunOptions): Promise<void> {
	launchState.aborted = true;
	controller.abort();
	launchState.bridge?.stop();

	await Promise.resolve();

	launchState.bridge?.stop();

	const child = launchState.child;
	if (child?.pid !== undefined) {
		terminateDetachedChild(child.pid);
		await waitForChildExit(child);
	}

	if (!launchState.workdirCreated) return;

	const completion = await writeFallbackRunCompletion(
		spec.workdir,
		stampDriveEpisodeResult(spec, {
			runId: spec.runId,
			outcome: "aborted",
			tasksDone: 0,
			tasksBlocked: 0,
		}),
	);

	const eventSink = createDriverEventSink(spec, deps);
	await recordDriveTerminalEpisode(
		spec,
		completion,
		createDriveEpisodeWarningReporter(spec, eventSink),
	);
}

function terminateDetachedChild(pid: number): void {
	if (!isProcessAlive(pid)) return;
	try {
		process.kill(pid, "SIGTERM");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
			throw error;
		}
	}
}

async function waitForChildExit(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) return;

	await new Promise<void>((resolve, reject) => {
		const cleanup = () => {
			child.off("exit", onExit);
			child.off("error", onError);
		};
		const onExit = () => {
			cleanup();
			resolve();
		};
		const onError = (error: Error) => {
			cleanup();
			reject(error);
		};

		child.once("exit", onExit);
		child.once("error", onError);
		if (child.exitCode !== null || child.signalCode !== null) onExit();
	});
}
export async function launchDetached(
	spec: DriverRunSpec,
	deps: DriverDeps,
): Promise<DetachedLaunchHandle> {
	if (spec.backendName === "cosmonauts-subagent") {
		throw new DetachedNotSupportedError(spec.backendName);
	}
	runBackendLivenessCheck(deps.backend);

	const launch = await launchDetachedProcess({
		spec,
		deps,
		signal: new AbortController().signal,
		markWorkdirCreated: () => undefined,
	});
	return {
		runId: spec.runId,
		planSlug: spec.planSlug,
		workdir: spec.workdir,
		eventLogPath: spec.eventLogPath,
		pid: launch.pid,
	};
}

function createDriverEventSink(
	spec: DriverRunSpec,
	deps: DriverDeps,
): EventSink {
	return createEventSink({
		logPath: spec.eventLogPath,
		runId: spec.runId,
		parentSessionId: spec.parentSessionId,
		activityBus: deps.activityBus,
		...driveEventBridgeOptions(spec),
		durable: driveGraphActivityEventSinkOptions(spec),
	});
}

interface StartDetachedProcessOptions {
	spec: DriverRunSpec;
	deps: DriverDeps;
	signal: AbortSignal;
	setChild?(child: ChildProcess): void;
	setBridge?(bridge: JsonlActivityBusBridge): void;
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
	let bridge: JsonlActivityBusBridge | undefined;
	try {
		const launch = await launchDetachedProcess({
			spec,
			deps,
			signal,
			setChild,
			setBridge: (started) => {
				bridge = started;
				setBridge?.(started);
			},
			markWorkdirCreated,
			bridgeEvents: true,
		});

		const result = await waitForDetachedResult(spec.workdir, launch.child);
		if (driveEventBridgeOptions(spec).bridgeDriverDiagnostics === true) {
			await waitForChildExitWithinDrainDeadline(launch.child);
		}
		return result;
	} finally {
		await bridge?.finish();
	}
}

interface DetachedProcessLaunch {
	child: ChildProcess;
	pid: number;
}

async function launchDetachedProcess({
	spec,
	deps,
	signal,
	setChild,
	setBridge,
	markWorkdirCreated,
	bridgeEvents = false,
}: StartDetachedProcessOptions & {
	bridgeEvents?: boolean;
}): Promise<DetachedProcessLaunch> {
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
		`${(spec.remainingTaskIds ?? spec.taskIds).join("\n")}\n`,
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
	setChild?.(child);
	if (!child.pid) {
		throw new Error("Detached driver process did not expose a PID");
	}
	throwIfAborted(signal);
	child.unref();
	throwIfAborted(signal);

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
	throwIfAborted(signal);

	if (bridgeEvents) {
		const bridge = bridgeJsonlToActivityBus(
			spec.eventLogPath,
			spec.runId,
			spec.parentSessionId,
			deps.activityBus,
			driveEventBridgeOptions(spec),
		);
		setBridge?.(bridge);
		throwIfAborted(signal);
	}

	return { child, pid: child.pid };
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
): Promise<DriverResult> {
	const completionPath = join(workdir, RUN_COMPLETION_FILENAME);
	const completion = waitForCompletion(completionPath);
	const childExit = waitForUnexpectedExit(child, completionPath);

	return await Promise.race([completion, childExit]);
}

async function waitForChildExitWithinDrainDeadline(
	child: ChildProcess,
): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) return;

	await new Promise<void>((resolve) => {
		const cleanup = () => {
			clearTimeout(timeout);
			child.off("exit", settle);
			child.off("error", settle);
		};
		const settle = () => {
			cleanup();
			resolve();
		};
		const timeout = setTimeout(settle, DETACHED_BRIDGE_DRAIN_TIMEOUT_MS);

		child.once("exit", settle);
		child.once("error", settle);
		if (child.exitCode !== null || child.signalCode !== null) settle();
	});
}

async function waitForCompletion(path: string): Promise<DriverResult> {
	while (true) {
		try {
			const raw = await readFile(path, "utf-8");
			return JSON.parse(raw) as DriverResult;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				throw error;
			}
		}
		await delay(100);
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

const DETACHED_BRIDGE_DRAIN_TIMEOUT_MS = 2_000;
