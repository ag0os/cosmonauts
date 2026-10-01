/**
 * Runs one child process and owns its process tree: the child leads its own
 * process group (POSIX), its output is spooled to files under a byte cap
 * instead of memory, and an abort or the timeout ends the tree with SIGTERM,
 * a grace period, then SIGKILL (`taskkill /T`, then `/T /F`, on Windows). On
 * POSIX the tree is listed with `ps` (`process-tree.ts`), so a descendant in
 * a group of its own is signalled too. The runner resolves only once the
 * tree is confirmed gone or the escalation is spent, and the outcome says
 * which.
 */
import { type ChildProcess, spawn } from "node:child_process";
import {
	closeSync,
	createWriteStream,
	openSync,
	type WriteStream,
} from "node:fs";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { finished } from "node:stream/promises";
import { currentProcessOwner, type ProcessClaim } from "./owned-processes.ts";
import { processGroupExists } from "./process-group.ts";
import {
	type ListProcesses,
	listProcesses,
	PROCESS_LISTING_TIMEOUT_MS,
	reapProcessTree,
} from "./process-tree.ts";

/** SIGTERM (or `taskkill /T`) to SIGKILL (or `taskkill /T /F`). */
export const DEFAULT_CHILD_GRACE_MS = 5_000;
/** How long after SIGKILL the runner waits for the tree before reporting survivors. */
export const DEFAULT_CHILD_KILL_WAIT_MS = 2_000;
/**
 * Per spool file. Past it the first three quarters and the last quarter are
 * kept, and a line in between says how many bytes were dropped.
 */
export const DEFAULT_CHILD_OUTPUT_CAP_BYTES = 16 * 1024 * 1024;

/** After the tree is gone: how long the child's exit event and its output may lag. */
const SETTLE_WAIT_MS = 1_000;

/**
 * The longest a run can take to resolve after an abort or the timeout, on
 * either platform: the escalation, then the exit and output waits. POSIX:
 * three `ps` listings (before SIGTERM, before SIGKILL, and of what is left),
 * the grace and the kill wait. Windows: `taskkill /T` and `/T /F`, each
 * bounded by the kill wait, the grace, and the kill wait for the exit.
 */
export function childStopBoundMs(escalation: {
	readonly graceMs: number;
	readonly killWaitMs: number;
}): number {
	const { graceMs, killWaitMs } = escalation;
	const posix = 3 * PROCESS_LISTING_TIMEOUT_MS + graceMs + killWaitMs;
	const windows = graceMs + 3 * killWaitMs;
	return Math.max(posix, windows) + 2 * SETTLE_WAIT_MS;
}

/** `childStopBoundMs` with the default escalation: 13 s, set by Windows. */
export const DEFAULT_CHILD_STOP_MS = childStopBoundMs({
	graceMs: DEFAULT_CHILD_GRACE_MS,
	killWaitMs: DEFAULT_CHILD_KILL_WAIT_MS,
});

/** Runs `taskkill.exe` with `args` and resolves to its exit code. */
export type WindowsTaskkill = (
	args: readonly string[],
) => Promise<number | null>;

export interface ChildOutputPaths {
	/** Created or truncated. The same path for both streams shares one file and one cap. */
	readonly stdout: string;
	readonly stderr: string;
}

export interface RunChildOptions {
	readonly command: string;
	readonly args: readonly string[];
	readonly cwd: string;
	/** Defaults to the parent's environment. */
	readonly env?: NodeJS.ProcessEnv;
	/** Written to the child's stdin, which is then closed; without it stdin is ignored. */
	readonly stdin?: string;
	readonly output: ChildOutputPaths;
	/**
	 * Bytes kept per spool file: the first three quarters and the last
	 * quarter of what was written, with a note between them. `Infinity`
	 * keeps everything.
	 */
	readonly outputCapBytes?: number;
	/**
	 * Sees every stdout chunk as it arrives, before the spool cap drops any.
	 * A throw is noted and the tap gets no further chunks.
	 */
	readonly onStdout?: (chunk: Buffer) => void;
	readonly signal?: AbortSignal;
	/** No timeout when absent. */
	readonly timeoutMs?: number;
	readonly graceMs?: number;
	readonly killWaitMs?: number;
	/**
	 * Final synchronous check, run immediately before spawn with no await in
	 * between. A throw rejects the run and nothing is spawned.
	 */
	readonly beforeSpawn?: () => void;
	/** Test seam: the platform whose process-tree rules apply. */
	readonly platform?: NodeJS.Platform;
	/** Test seam: how `taskkill` runs on Windows. */
	readonly taskkill?: WindowsTaskkill;
	/** Test seam: how the POSIX process listing is taken. */
	readonly listProcesses?: ListProcesses;
}

export type ChildExit =
	| { readonly kind: "code"; readonly code: number }
	| { readonly kind: "signal"; readonly signal: NodeJS.Signals }
	| {
			readonly kind: "spawn-error";
			readonly error: Error & { readonly code?: string };
	  }
	/** The signal was already aborted: nothing was spawned. */
	| { readonly kind: "not-started" }
	/** The child never reported an exit before the runner gave up on it. */
	| { readonly kind: "unobserved" };

/** Why the runner stopped the child; absent when it ended on its own. */
export type ChildStop =
	| { readonly kind: "aborted"; readonly reason: unknown }
	| { readonly kind: "timeout"; readonly timeoutMs: number };

export type ChildTree =
	/**
	 * Every process found in the child's tree is gone; `by` is what ended the
	 * last of it. POSIX: the child's group, its descendants by parent pid and
	 * the groups they lead, listed before SIGTERM and again before SIGKILL
	 * (once after a natural exit). A process that had already left the tree,
	 * re-parented to init in a group of its own, is not found. Windows:
	 * `taskkill /T` succeeded on the running child.
	 */
	| {
			readonly kind: "gone";
			readonly by: "exit" | NodeJS.Signals | "taskkill" | "taskkill /F";
	  }
	/** Something outlived the escalation, or could not be signalled; the reason lists it. */
	| { readonly kind: "survived"; readonly reason: string }
	/**
	 * The tree could not be listed: on Windows, an exited child's
	 * descendants; on POSIX, a failed `ps` (only the child's group was reaped).
	 */
	| { readonly kind: "unverified"; readonly reason: string };

export interface SpoolFile {
	readonly path: string;
	/** Every byte the child wrote to the stream, kept or not. */
	readonly bytes: number;
	readonly truncated: boolean;
}

export interface ChildRunOutcome {
	readonly exit: ChildExit;
	readonly stopped?: ChildStop;
	readonly tree: ChildTree;
	readonly stdout: SpoolFile;
	readonly stderr: SpoolFile;
	/** What went wrong around the child without ending the run: stdin, signalling. */
	readonly notes: readonly string[];
}

interface Spool {
	readonly path: string;
	/** Counts the chunk against `count` and keeps what fits under the cap. */
	write(chunk: Buffer, count: StreamCount): void;
	close(): Promise<void>;
}

interface StreamCount {
	bytes: number;
	truncated: boolean;
}

interface Settings {
	readonly platform: NodeJS.Platform;
	readonly graceMs: number;
	readonly killWaitMs: number;
	readonly taskkill: WindowsTaskkill;
	readonly listProcesses: ListProcesses;
	readonly notes: string[];
	/** The pids of this child's tree, for the process owner of the caller's context. */
	readonly claim?: ProcessClaim;
}

/**
 * Never rejects except for a `beforeSpawn` throw: a spawn or spool failure is
 * `exit.kind === "spawn-error"` with nothing left running.
 */
export async function runChild(
	options: RunChildOptions,
): Promise<ChildRunOutcome> {
	const counts = { stdout: newCount(), stderr: newCount() };
	const notStarted = (exit: ChildExit, stopped?: ChildStop) =>
		outcome(
			{ exit, stopped, tree: { kind: "gone", by: "exit" } },
			options,
			counts,
			[],
		);
	if (options.signal?.aborted)
		return notStarted({ kind: "not-started" }, abortStop(options.signal));
	let spools: Spools;
	try {
		spools = await openSpools(options);
	} catch (error) {
		return notStarted({ kind: "spawn-error", error: asError(error) });
	}
	if (options.signal?.aborted) {
		await spools.close();
		return notStarted({ kind: "not-started" }, abortStop(options.signal));
	}
	try {
		options.beforeSpawn?.();
	} catch (error) {
		await spools.close();
		throw error;
	}
	const owner = currentProcessOwner();
	const claim = owner?.claim();
	if (owner && !claim) {
		await spools.close();
		return notStarted({ kind: "spawn-error", error: ownerClosed() });
	}
	let child: ChildProcess;
	try {
		child = spawnChild(options);
	} catch (error) {
		await spools.close();
		return notStarted({ kind: "spawn-error", error: asError(error) });
	}
	if (child.pid !== undefined) claim?.add([child.pid]);
	const settings: Settings = {
		platform: options.platform ?? process.platform,
		graceMs: finiteOr(options.graceMs, DEFAULT_CHILD_GRACE_MS),
		killWaitMs: finiteOr(options.killWaitMs, DEFAULT_CHILD_KILL_WAIT_MS),
		taskkill: options.taskkill ?? runTaskkill,
		listProcesses: options.listProcesses ?? listProcesses,
		notes: [],
		...(claim ? { claim } : {}),
	};
	const result = await supervise({ child, options, spools, counts, settings });
	if (result.tree.kind === "gone") claim?.release();
	return outcome(result, options, counts, settings.notes);
}

/** Work whose process owner stopped waiting for it starts no child. */
function ownerClosed(): Error {
	return new Error("not started: the run that owns this process has ended");
}

/** Reads a spool file's text; `tailBytes` keeps only its last bytes. A missing file reads as empty. */
export async function readSpool(
	file: SpoolFile,
	tailBytes?: number,
): Promise<string> {
	try {
		if (tailBytes === undefined) return await readFile(file.path, "utf8");
		const handle = await open(file.path, "r");
		try {
			const { size } = await handle.stat();
			const length = Math.min(size, tailBytes);
			const buffer = Buffer.alloc(length);
			await handle.read(buffer, 0, length, size - length);
			return buffer.toString("utf8");
		} finally {
			await handle.close();
		}
	} catch {
		return "";
	}
}

function spawnChild(options: RunChildOptions): ChildProcess {
	const platform = options.platform ?? process.platform;
	return spawn(options.command, [...options.args], {
		cwd: options.cwd,
		...(options.env ? { env: options.env } : {}),
		detached: platform !== "win32",
		shell: false,
		stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
		windowsHide: true,
	});
}

interface Supervised {
	readonly exit: ChildExit;
	readonly stopped?: ChildStop;
	readonly tree: ChildTree;
}

async function supervise(run: {
	child: ChildProcess;
	options: RunChildOptions;
	spools: Spools;
	counts: { stdout: StreamCount; stderr: StreamCount };
	settings: Settings;
}): Promise<Supervised> {
	const { child, options, spools, settings } = run;
	const tap = stdoutTap(options.onStdout, settings.notes);
	child.stdout?.on("data", (chunk: Buffer) => {
		tap(chunk);
		spools.stdout.write(chunk, run.counts.stdout);
	});
	child.stderr?.on("data", (chunk: Buffer) =>
		spools.stderr.write(chunk, run.counts.stderr),
	);
	const stdin = feedStdin(child, options.stdin);
	const exited = childExit(child);
	const stop = stopRequest(options);
	const first = await Promise.race([
		exited.then((exit) => ({ exit }) as const),
		stop.requested.then((stopped) => ({ stopped }) as const),
	]);
	stop.dispose();
	const result =
		"exit" in first
			? {
					exit: first.exit,
					tree: await treeAfterExit(child, first.exit, settings),
				}
			: await stopTree(child, exited, first.stopped, settings);
	await drainOutput(child);
	noteUntakenStdin(child, stdin, settings.notes);
	await spools.close();
	return result;
}

function stdoutTap(
	onStdout: ((chunk: Buffer) => void) | undefined,
	notes: string[],
): (chunk: Buffer) => void {
	let tap = onStdout;
	return (chunk) => {
		if (tap === undefined) return;
		try {
			tap(chunk);
		} catch (error) {
			tap = undefined;
			notes.push(
				`stdout tap failed and saw no more output: ${asError(error).message}`,
			);
		}
	};
}

async function stopTree(
	child: ChildProcess,
	exited: Promise<ChildExit>,
	stopped: ChildStop,
	settings: Settings,
): Promise<Supervised> {
	const tree =
		settings.platform === "win32"
			? await taskkillTree(child.pid, exited, settings)
			: await reapTree(child.pid, settings);
	const exit = (await within(exited, SETTLE_WAIT_MS)) ?? {
		kind: "unobserved" as const,
	};
	return { exit, stopped, tree };
}

/**
 * After a natural exit: on POSIX, whatever the child left behind in its
 * group, and what those processes started, is reaped too. The child's own
 * children outside its group are already re-parented and cannot be found,
 * so an empty group leaves nothing to list.
 */
async function treeAfterExit(
	child: ChildProcess,
	exit: ChildExit,
	settings: Settings,
): Promise<ChildTree> {
	if (exit.kind === "spawn-error" || child.pid === undefined)
		return { kind: "gone", by: "exit" };
	if (settings.platform === "win32")
		return {
			kind: "unverified",
			reason: `process ${child.pid} exited; Windows cannot enumerate its descendants`,
		};
	if (!processGroupExists(child.pid)) return { kind: "gone", by: "exit" };
	return reapTree(child.pid, settings);
}

async function reapTree(
	pid: number | undefined,
	settings: Settings,
): Promise<ChildTree> {
	if (pid === undefined) return { kind: "gone", by: "exit" };
	return reapProcessTree(pid, {
		graceMs: settings.graceMs,
		killWaitMs: settings.killWaitMs,
		list: settings.listProcesses,
		...(settings.claim ? { onFound: (pids) => settings.claim?.add(pids) } : {}),
	});
}

/**
 * `taskkill /T`, a grace period for the child to exit, then `taskkill /T /F`.
 * A zero exit from the call that preceded the child's exit is the evidence
 * the tree is gone. A child that exited after a failed `/T` leaves its tree
 * unverified: `/T /F` cannot walk the tree of a process that is gone.
 */
async function taskkillTree(
	pid: number | undefined,
	exited: Promise<ChildExit>,
	settings: Settings,
): Promise<ChildTree> {
	if (pid === undefined) return { kind: "gone", by: "exit" };
	const graceful = await callTaskkill(settings, ["/PID", String(pid), "/T"]);
	const terminated = (code: number | null) =>
		classifyTaskkillExitCode(code).kind === "terminated";
	if (await within(exited, settings.graceMs))
		return terminated(graceful)
			? { kind: "gone", by: "taskkill" }
			: {
					kind: "unverified",
					reason: `process ${pid} exited after taskkill /T exited ${String(graceful)}; Windows cannot enumerate its descendants`,
				};
	const forced = await callTaskkill(settings, [
		"/PID",
		String(pid),
		"/T",
		"/F",
	]);
	const exit = await within(exited, settings.killWaitMs);
	if (exit && terminated(forced)) return { kind: "gone", by: "taskkill /F" };
	return {
		kind: "survived",
		reason: `taskkill /T /F of process ${pid} exited ${String(forced)}${exit ? "" : " and the process did not exit"}`,
	};
}

type TaskkillExitOutcome =
	| { readonly kind: "terminated" }
	| { readonly kind: "unverified"; readonly error: Error };

/** Only a zero exit positively establishes that taskkill ended the tree. */
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

async function callTaskkill(
	settings: Settings,
	args: readonly string[],
): Promise<number | null> {
	try {
		const code = await within(settings.taskkill(args), settings.killWaitMs);
		if (code === undefined) {
			settings.notes.push(`taskkill ${args.join(" ")} did not finish`);
			return null;
		}
		if (code !== 0)
			settings.notes.push(`taskkill ${args.join(" ")} exited ${String(code)}`);
		return code;
	} catch (error) {
		settings.notes.push(
			`taskkill ${args.join(" ")} failed: ${asError(error).message}`,
		);
		return null;
	}
}

const runTaskkill: WindowsTaskkill = (args) =>
	new Promise((resolve, reject) => {
		const root = process.env.SystemRoot ?? "C:\\Windows";
		const killer = spawn(join(root, "System32", "taskkill.exe"), [...args], {
			shell: false,
			stdio: "ignore",
			windowsHide: true,
		});
		killer.once("error", reject);
		killer.once("close", (code) => resolve(code));
	});

function childExit(child: ChildProcess): Promise<ChildExit> {
	return new Promise((resolve) => {
		child.on("error", (error) => {
			if (child.pid === undefined) resolve({ kind: "spawn-error", error });
		});
		child.once("exit", (code, signal) => {
			if (typeof code === "number") resolve({ kind: "code", code });
			else if (signal !== null) resolve({ kind: "signal", signal });
			else resolve({ kind: "unobserved" });
		});
	});
}

interface StdinFeed {
	/** The first write error, such as EPIPE from a child that exited without reading. */
	error?: Error;
}

/**
 * A stdin failure is kept for a note; the run goes on. No input given, no
 * feed: Bun leaves a non-null, never-finished `child.stdin` even for an
 * ignored stdin, so the stream cannot say whether input was given.
 */
function feedStdin(
	child: ChildProcess,
	stdin: string | undefined,
): StdinFeed | undefined {
	if (stdin === undefined) return undefined;
	const feed: StdinFeed = {};
	if (child.stdin === null) return feed;
	child.stdin.on("error", (error) => {
		feed.error ??= error;
	});
	child.stdin.end(stdin);
	return feed;
}

/**
 * Notes input a started child did not take: a write error, or a stream that
 * never finished (Node can destroy stdin silently when the child exits). Best
 * effort: Bun reports stdin finished once it has taken the input, read or
 * not, so under Bun such a child may leave no note.
 */
function noteUntakenStdin(
	child: ChildProcess,
	feed: StdinFeed | undefined,
	notes: string[],
): void {
	if (feed === undefined || child.pid === undefined || child.stdin === null)
		return;
	if (feed.error === undefined && child.stdin.writableFinished) return;
	const cause = feed.error ? ` (${feed.error.message})` : "";
	notes.push(`stdin: the child did not take all of its input${cause}`);
}

function stopRequest(options: RunChildOptions): {
	requested: Promise<ChildStop>;
	dispose(): void;
} {
	let timer: NodeJS.Timeout | undefined;
	let onAbort: (() => void) | undefined;
	const requested = new Promise<ChildStop>((resolve) => {
		const { signal, timeoutMs } = options;
		if (signal) {
			onAbort = () => resolve(abortStop(signal));
			if (signal.aborted) onAbort();
			else signal.addEventListener("abort", onAbort, { once: true });
		}
		if (timeoutMs !== undefined && Number.isFinite(timeoutMs) && timeoutMs > 0)
			timer = setTimeout(
				() => resolve({ kind: "timeout", timeoutMs }),
				timeoutMs,
			);
	});
	return {
		requested,
		dispose() {
			if (timer) clearTimeout(timer);
			if (onAbort) options.signal?.removeEventListener("abort", onAbort);
		},
	};
}

function abortStop(signal: AbortSignal): ChildStop {
	return { kind: "aborted", reason: signal.reason };
}

/**
 * Waits for stdin to be flushed or fail and the output pipes to end; a
 * survivor that still holds them is cut off.
 */
async function drainOutput(child: ChildProcess): Promise<void> {
	const streams = [child.stdin, child.stdout, child.stderr].filter(
		(stream) => stream !== null,
	);
	const ended = streams.map((stream) =>
		finished(stream).catch(() => undefined),
	);
	await within(Promise.all(ended), SETTLE_WAIT_MS);
	for (const stream of streams) stream.destroy();
}

interface Spools {
	readonly stdout: Spool;
	readonly stderr: Spool;
	close(): Promise<void>;
}

async function openSpools(options: RunChildOptions): Promise<Spools> {
	const cap = options.outputCapBytes ?? DEFAULT_CHILD_OUTPUT_CAP_BYTES;
	const { stdout: stdoutPath, stderr: stderrPath } = options.output;
	await mkdir(dirname(stdoutPath), { recursive: true });
	await mkdir(dirname(stderrPath), { recursive: true });
	const stdout = openSpool(stdoutPath, cap);
	let stderr: Spool;
	try {
		stderr = stderrPath === stdoutPath ? stdout : openSpool(stderrPath, cap);
	} catch (error) {
		await stdout.close();
		throw error;
	}
	return {
		stdout,
		stderr,
		async close() {
			await stdout.close();
			if (stderr !== stdout) await stderr.close();
		},
	};
}

function openSpool(path: string, cap: number): Spool {
	const fd = openSync(path, "w", 0o600);
	let sink: WriteStream;
	try {
		sink = createWriteStream(path, { fd, autoClose: true });
	} catch (error) {
		closeSync(fd);
		throw error;
	}
	const done = finished(sink).catch(() => undefined);
	const tailCap = Number.isFinite(cap) ? Math.floor(cap / 4) : 0;
	const headCap = cap - tailCap;
	const head = { kept: 0 };
	const tail = new SpoolTail(tailCap);
	return {
		path,
		write(chunk, count) {
			count.bytes += chunk.length;
			const room = headCap - head.kept;
			if (chunk.length <= room) {
				head.kept += chunk.length;
				sink.write(chunk);
				return;
			}
			if (room > 0) {
				head.kept += room;
				sink.write(chunk.subarray(0, room));
			}
			tail.push(chunk.subarray(Math.max(room, 0)), count);
		},
		async close() {
			if (!sink.writableEnded) {
				tail.writeTo(sink);
				sink.end();
			}
			await done;
		},
	};
}

/**
 * The last bytes written past a spool's head, held until the spool closes.
 * Each chunk remembers its stream, so the bytes dropped from it mark the
 * right stream truncated.
 */
class SpoolTail {
	private readonly cap: number;
	private readonly chunks: { data: Buffer; count: StreamCount }[] = [];
	private size = 0;
	private dropped = 0;

	constructor(cap: number) {
		this.cap = cap;
	}

	push(data: Buffer, count: StreamCount): void {
		this.chunks.push({ data, count });
		this.size += data.length;
		while (this.size > this.cap) {
			const first = this.chunks[0];
			if (!first) return;
			const excess = Math.min(this.size - this.cap, first.data.length);
			first.count.truncated = true;
			this.size -= excess;
			this.dropped += excess;
			if (excess === first.data.length) this.chunks.shift();
			else first.data = first.data.subarray(excess);
		}
	}

	writeTo(sink: WriteStream): void {
		if (this.dropped > 0)
			sink.write(`\n[output truncated: ${this.dropped} bytes dropped]\n`);
		for (const { data } of this.chunks) sink.write(data);
	}
}

function newCount(): StreamCount {
	return { bytes: 0, truncated: false };
}

function outcome(
	result: Supervised,
	options: RunChildOptions,
	counts: { stdout: StreamCount; stderr: StreamCount },
	notes: readonly string[],
): ChildRunOutcome {
	return {
		exit: result.exit,
		...(result.stopped ? { stopped: result.stopped } : {}),
		tree: result.tree,
		stdout: { path: options.output.stdout, ...counts.stdout },
		stderr: { path: options.output.stderr, ...counts.stderr },
		notes,
	};
}

/** Settles with `work`, or with undefined once `ms` pass first. */
async function within<T>(work: Promise<T>, ms: number): Promise<T | undefined> {
	let timer: NodeJS.Timeout | undefined;
	const timeout = new Promise<undefined>((resolve) => {
		timer = setTimeout(() => resolve(undefined), ms);
	});
	try {
		return await Promise.race([work, timeout]);
	} finally {
		clearTimeout(timer);
	}
}

function finiteOr(value: number | undefined, fallback: number): number {
	return value !== undefined && Number.isFinite(value) && value >= 0
		? value
		: fallback;
}

function asError(error: unknown): Error & { readonly code?: string } {
	return error instanceof Error ? error : new Error(String(error));
}
