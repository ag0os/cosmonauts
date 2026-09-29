import { spawn } from "node:child_process";
import {
	existsSync,
	lstatSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { TaskManager } from "../tasks/task-manager.ts";
import type { BackendRunResult } from "./backends/types.ts";
import {
	type BlockedReport,
	type DriverRunSpec,
	type ParsedReport,
	resolveStateCommitPolicy,
} from "./types.ts";

interface CommandResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
	readonly termination: "exit" | "timeout" | "abort";
}

export interface SpawnSuccess {
	readonly status: "success";
	readonly result: BackendRunResult;
}

export interface SpawnFailure {
	readonly status: "failure";
	readonly error: string;
	readonly exitCode?: number;
}

type TimedBackendResult = SpawnSuccess | SpawnFailure;

export function driveRunExpectations(spec: DriverRunSpec) {
	return {
		backendName: spec.backendName,
		commitPolicy: spec.commitPolicy,
		stateCommitPolicy: resolveStateCommitPolicy(spec),
		preflightCommands: spec.preflightCommands,
		postflightCommands: spec.postflightCommands,
		projectRoot: spec.projectRoot,
		workdir: spec.workdir,
		branch: spec.branch,
	};
}

export function reportSummary(report: ParsedReport): string | undefined {
	const text = report.outcome === "unknown" ? report.raw : report.notes;
	if (!text) return undefined;
	const trimmed = text.trim();
	if (
		/```/u.test(trimmed) ||
		/^\{[\s\S]*\}$/u.test(trimmed) ||
		/Outcome inferred from passing postflight/u.test(trimmed)
	)
		return undefined;
	const line = text
		.split(/\r?\n/)
		.map((item) => item.trim())
		.find((item) => item.length > 0);
	if (
		!line ||
		/```/u.test(line) ||
		/^\{.*\}$/u.test(line) ||
		/^outcome\s*:/iu.test(line) ||
		/Outcome inferred from passing postflight/u.test(line)
	)
		return undefined;
	const normalized = line
		.replace(/^(implemented|status|summary):\s*/i, "")
		.slice(0, 80)
		.trim();
	if (
		/^outcome\s*:/iu.test(normalized) ||
		/^\{.*\}$/u.test(normalized) ||
		/```/u.test(normalized)
	)
		return undefined;
	return normalized || undefined;
}

export async function uncheckedAcceptanceCriteriaReason(
	taskManager: TaskManager,
	taskId: string,
): Promise<string | undefined> {
	const task = await taskManager.getTask(taskId);
	if (!task) {
		return `task not found during acceptance-criteria verification: ${taskId}`;
	}
	const unchecked = task.acceptanceCriteria.filter(
		(criterion) => !criterion.checked,
	);
	if (unchecked.length === 0) return undefined;
	const ids = unchecked.map((criterion) => `#${criterion.index}`).join(", ");
	return `acceptance criteria still unchecked: ${ids}`;
}

export function authoritativeDriveTaskIds(
	metadata: Record<string, unknown> | undefined,
	spec: DriverRunSpec,
): readonly string[] {
	const value = metadata?.driveTaskIds;
	return Array.isArray(value) && value.every((item) => typeof item === "string")
		? value
		: spec.taskIds;
}

type PreflightCheck =
	| { readonly passed: true }
	| {
			readonly passed: false;
			readonly reason: string;
			readonly details: Record<string, string>;
	  };

export async function checkDrivePreflight(
	spec: DriverRunSpec,
	signal: AbortSignal,
): Promise<PreflightCheck> {
	if (spec.branch) {
		const branch = await runCommand(
			"git",
			["rev-parse", "--abbrev-ref", "HEAD"],
			spec.projectRoot,
			signal,
		);
		if (branch.exitCode !== 0) {
			const reason = branch.stderr || "failed to determine git branch";
			return {
				passed: false,
				reason,
				details: {
					command: "git rev-parse --abbrev-ref HEAD",
					stderr: reason,
				},
			};
		}
		const actualBranch = branch.stdout.trim();
		if (actualBranch !== spec.branch) {
			const reason = `branch mismatch: expected ${spec.branch}, got ${actualBranch}`;
			return {
				passed: false,
				reason,
				details: { branch: actualBranch, stderr: reason },
			};
		}
	}
	for (const command of spec.preflightCommands) {
		const result = await runShellCommand(command, spec.projectRoot, signal);
		if (result.exitCode !== 0) {
			const reason = result.stderr || `preflight failed: ${command}`;
			return {
				passed: false,
				reason,
				details: { command, stderr: reason },
			};
		}
	}
	return { passed: true };
}

function projectCommandEnvironment(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	for (const key of Object.keys(env)) {
		if (key.startsWith("COSMONAUTS_DRIVER_")) delete env[key];
	}
	return env;
}

export function runShellCommand(
	command: string,
	cwd: string,
	signal: AbortSignal,
): Promise<CommandResult> {
	return runCommand(command, [], cwd, signal, true);
}

export function runCommand(
	command: string,
	args: string[],
	cwd: string,
	signal: AbortSignal,
	shell = false,
	options?: { env?: NodeJS.ProcessEnv; timeoutMs?: number },
): Promise<CommandResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			shell,
			...(options?.env
				? { env: { ...process.env, ...options.env } }
				: shell
					? { env: projectCommandEnvironment() }
					: {}),
			signal,
			stdio: ["ignore", "pipe", "pipe"],
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
		child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
		let closeTimer: NodeJS.Timeout | undefined;
		let timeoutTimer: NodeJS.Timeout | undefined;
		let abortError: string | undefined;
		let timedOut = false;
		let childExited = false;
		let settled = false;
		const finish = (
			code: number | null,
			closeSignal: NodeJS.Signals | null,
		) => {
			if (settled) return;
			settled = true;
			if (closeTimer) clearTimeout(closeTimer);
			if (timeoutTimer) clearTimeout(timeoutTimer);
			child.stdout?.destroy();
			child.stderr?.destroy();
			const termination =
				signal.aborted || abortError ? "abort" : timedOut ? "timeout" : "exit";
			resolve({
				termination,
				exitCode: termination !== "exit" ? 124 : (code ?? 1),
				stdout: Buffer.concat(stdout).toString(),
				stderr:
					Buffer.concat(stderr).toString() ||
					abortError ||
					(timedOut
						? `timed out${closeSignal ? ` (${closeSignal})` : ""}`
						: ""),
			});
		};
		if (options?.timeoutMs) {
			timeoutTimer = setTimeout(() => {
				timedOut = true;
				child.kill("SIGTERM");
				closeTimer ??= setTimeout(() => {
					if (!childExited) child.kill("SIGKILL");
					finish(null, null);
				}, 250);
			}, options.timeoutMs);
		}
		child.on("error", (error) => {
			if ((error as NodeJS.ErrnoException).name !== "AbortError") {
				if (closeTimer) clearTimeout(closeTimer);
				if (timeoutTimer) clearTimeout(timeoutTimer);
				settled = true;
				reject(error);
				return;
			}
			abortError = formatError(error);
			closeTimer ??= setTimeout(() => finish(null, null), 250);
		});
		child.on("exit", (code, exitSignal) => {
			childExited = true;
			if (timeoutTimer) clearTimeout(timeoutTimer);
			closeTimer ??= setTimeout(() => finish(code, exitSignal), 250);
		});
		child.on("close", (code, closeSignal) => finish(code, closeSignal));
	});
}

export function runBackendWithTimeout(
	run: (signal: AbortSignal) => Promise<BackendRunResult>,
	timeoutMs: number,
	parentSignal: AbortSignal,
): Promise<TimedBackendResult> {
	const controller = new AbortController();
	let timedOut = false;
	let timeout: NodeJS.Timeout | undefined;
	const abortFromParent = () => controller.abort(parentSignal.reason);
	if (parentSignal.aborted) abortFromParent();
	else parentSignal.addEventListener("abort", abortFromParent, { once: true });

	const timeoutPromise = new Promise<SpawnFailure>((resolve) => {
		timeout = setTimeout(() => {
			timedOut = true;
			controller.abort();
			resolve({
				status: "failure",
				error: `task timed out after ${timeoutMs}ms`,
				exitCode: 124,
			});
		}, timeoutMs);
	});
	const runPromise: Promise<TimedBackendResult> = run(controller.signal).then(
		(result) => ({ status: "success", result }),
		(error: unknown) => ({
			status: "failure",
			error: formatError(error),
			exitCode: timedOut ? 124 : undefined,
		}),
	);
	return Promise.race([runPromise, timeoutPromise]).finally(() => {
		if (timeout) clearTimeout(timeout);
		parentSignal.removeEventListener("abort", abortFromParent);
	});
}

export async function appendDriveAttemptRecord(options: {
	taskManager: TaskManager;
	taskId: string;
	runId: string;
	outcome: "failure" | "partial" | "unknown" | "blocked";
	attemptNumber: number;
	body: string;
	worktreeSnapshot?: string;
}): Promise<void> {
	const {
		taskManager,
		taskId,
		runId,
		outcome,
		attemptNumber,
		body,
		worktreeSnapshot,
	} = options;
	const snapshotLine = worktreeSnapshot
		? `Worktree snapshot: ${worktreeSnapshot}\n`
		: "";
	await taskManager.updateTask(taskId, {
		appendImplementationNotes: `### Drive — outcome ${outcome} — attempt ${attemptNumber} — run ${runId}\n\n${snapshotLine}${body}`,
	});
}

export function blockedReportReason(report: BlockedReport): string {
	return report.notes?.trim() ? report.notes : report.raw;
}

export async function blockedReportEvidence(options: {
	projectRoot: string;
	signal: AbortSignal;
	commitPolicy: DriverRunSpec["commitPolicy"];
	headBefore: string | undefined;
}): Promise<{ note: string; unverifiedCommits?: string }> {
	const { projectRoot, signal, commitPolicy, headBefore } = options;
	if (commitPolicy === "backend-commits") {
		const after = await headBeforeSpawn(projectRoot, signal);
		if (headBefore && after && headBefore !== after) {
			const unverifiedCommits = `${headBefore}..${after}`;
			return {
				note: `Unverified commits: ${unverifiedCommits}`,
				unverifiedCommits,
			};
		}
		return { note: "" };
	}
	const status = await runCommand(
		"git",
		["status", "--porcelain", "--untracked-files=all"],
		projectRoot,
		signal,
	);
	return {
		note:
			status.exitCode === 0 && status.stdout.trim()
				? `Dirty paths:\n${status.stdout.trimEnd()}`
				: "",
	};
}

class GitInterruptedError extends Error {}

async function boundedGit(
	projectRoot: string,
	signal: AbortSignal,
	args: string[],
	env?: NodeJS.ProcessEnv,
): Promise<string> {
	let result: CommandResult;
	try {
		result = await runCommand("git", args, projectRoot, signal, false, {
			env,
			timeoutMs: 60_000,
		});
	} catch (error) {
		throw new Error(`git ${args.join(" ")} failed: ${formatError(error)}`);
	}
	if (result.termination !== "exit") {
		throw new GitInterruptedError(
			`git ${args.join(" ")} failed: ${result.termination === "abort" ? "aborted" : "timed out"}`,
		);
	}
	if (result.exitCode !== 0) {
		throw new Error(
			`git ${args.join(" ")} failed: ${result.stderr.trim() || `exit ${result.exitCode}`}`,
		);
	}
	return result.stdout.trim();
}

export async function snapshotWorktree(options: {
	projectRoot: string;
	runId: string;
	taskId: string;
	attemptNumber: number;
	taskFile?: string;
	signal?: AbortSignal;
}): Promise<string | undefined> {
	const {
		projectRoot,
		runId,
		taskId,
		attemptNumber,
		signal = new AbortController().signal,
	} = options;
	const git = (args: string[], env?: NodeJS.ProcessEnv) =>
		boundedGit(projectRoot, signal, args, env);
	try {
		if ((await git(["rev-parse", "--is-inside-work-tree"])) !== "true")
			return undefined;
	} catch (error) {
		if (
			error instanceof Error &&
			/fatal: not a git repository/u.test(error.message)
		)
			return undefined;
		throw error;
	}
	if (!(await git(["status", "--porcelain", "--untracked-files=all"])))
		return undefined;
	const ref = `refs/cosmonauts/drive/${runId}/${taskId}/attempt-${attemptNumber}`;
	const directory = mkdtempSync(join(tmpdir(), "cosmonauts-drive-index-"));
	try {
		const env = { GIT_INDEX_FILE: join(directory, "index") };
		await git(["read-tree", "HEAD"], env);
		// Session directories are skipped through a temporary excludes file,
		// never through `:(exclude)` pathspecs: git exits 1 when an exclude
		// pathspec names only paths the project's .gitignore already ignores.
		const excludesFile = join(directory, "excludes");
		let globalExcludes: string | undefined;
		try {
			globalExcludes = await git(["config", "--get", "core.excludesFile"]);
		} catch (error) {
			if (error instanceof GitInterruptedError) throw error;
			globalExcludes = join(
				process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
				"git",
				"ignore",
			);
		}
		const globalPath = globalExcludes.startsWith("~/")
			? join(homedir(), globalExcludes.slice(2))
			: isAbsolute(globalExcludes)
				? globalExcludes
				: join(projectRoot, globalExcludes);
		let originalExcludes = "";
		if (existsSync(globalPath)) {
			try {
				originalExcludes = readFileSync(globalPath, "utf8");
			} catch {
				// An unreadable global excludes file cannot contribute patterns.
			}
		}
		writeFileSync(
			excludesFile,
			`${originalExcludes}\nmissions/sessions/\nmissions/archive/sessions/\n`,
		);
		await git(
			["-c", `core.excludesFile=${excludesFile}`, "add", "-A", "--", "."],
			env,
		);
		const tree = await git(["write-tree"], env);
		const sha = await git(
			[
				"commit-tree",
				tree,
				"-p",
				await git(["rev-parse", "HEAD"]),
				"-m",
				`Drive snapshot ${runId}/${taskId}/attempt-${attemptNumber}${options.taskFile ? `\n\nDrive-Task-File: ${options.taskFile}` : ""}`,
			],
			{
				...env,
				GIT_AUTHOR_NAME: "Cosmonauts Drive",
				GIT_AUTHOR_EMAIL: "drive@cosmonauts.local",
				GIT_COMMITTER_NAME: "Cosmonauts Drive",
				GIT_COMMITTER_EMAIL: "drive@cosmonauts.local",
			},
		);
		await git(["update-ref", ref, sha]);
		return ref;
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

export async function removeDoneTaskSnapshots(
	projectRoot: string,
	runId: string,
	taskId: string,
	commitPolicy: DriverRunSpec["commitPolicy"],
	commitSha: string | undefined,
	signal: AbortSignal,
	taskFile = `missions/tasks/${taskId}.md`,
): Promise<string[]> {
	const git = (args: string[]) => boundedGit(projectRoot, signal, args);
	try {
		if ((await git(["rev-parse", "--is-inside-work-tree"])) !== "true")
			return [];
	} catch (error) {
		if (
			error instanceof Error &&
			/fatal: not a git repository/u.test(error.message)
		)
			return [];
		throw error;
	}
	const prefix = `refs/cosmonauts/drive/${runId}/${taskId}/`;
	const refs = (await git(["for-each-ref", "--format=%(refname)", prefix]))
		.split("\n")
		.filter((item) => item.startsWith(prefix));
	const finalTree =
		commitPolicy === "driver-commits" ? (commitSha ?? "HEAD") : "HEAD";
	const finalEntries =
		commitPolicy === "no-commit"
			? new Map<string, string>()
			: await treeEntries(git, finalTree);
	const retained: string[] = [];
	for (const ref of refs) {
		const message = await git(["show", "-s", "--format=%B", ref]);
		const snapshotTaskFile =
			/^Drive-Task-File: (missions\/tasks\/[^\n]+\.md)$/mu.exec(message)?.[1];
		const snapshot = await treeEntries(git, ref);
		const delta = await git([
			"diff-tree",
			"-r",
			"--name-status",
			"-z",
			`${ref}^`,
			ref,
		]);
		const changes = delta.split("\0");
		let contained = true;
		for (let index = 0; index + 1 < changes.length; index += 2) {
			const status = changes[index];
			const path = changes[index + 1];
			if (!path || !status || path === taskFile || path === snapshotTaskFile)
				continue;
			const hash = status === "D" ? undefined : snapshot.get(path);
			let finalHash: string | undefined;
			if (
				commitPolicy === "no-commit" ||
				path.startsWith("missions/") ||
				path.startsWith("memory/") ||
				/^\.cosmonauts\/[^/]+\.lock$/u.test(path)
			) {
				const result = await runCommand(
					"git",
					["hash-object", "--", path],
					projectRoot,
					signal,
					false,
					{ timeoutMs: 60_000 },
				);
				if (result.termination !== "exit")
					throw new GitInterruptedError(
						`git hash-object -- ${path} failed: ${result.termination === "abort" ? "aborted" : "timed out"}`,
					);
				const mode = worktreeMode(join(projectRoot, path));
				finalHash =
					result.exitCode === 0 && mode
						? `${mode} ${result.stdout.trim()}`
						: undefined;
			} else finalHash = finalEntries.get(path);
			if (hash !== finalHash) {
				contained = false;
				break;
			}
		}
		if (!contained) {
			retained.push(ref);
			continue;
		}
		await git(["update-ref", "-d", ref]);
	}
	return retained;
}

function worktreeMode(path: string): string | undefined {
	let info: ReturnType<typeof lstatSync>;
	try {
		info = lstatSync(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
	if (info.isSymbolicLink()) return "120000";
	if (info.isFile()) return info.mode & 0o111 ? "100755" : "100644";
	return undefined;
}

async function treeEntries(
	git: (args: string[]) => Promise<string>,
	ref: string,
): Promise<Map<string, string>> {
	const output = await git(["ls-tree", "-r", "-z", ref]);
	const entries = new Map<string, string>();
	for (const entry of output.split("\0")) {
		const match = /^(\d+) (?:blob|commit) ([0-9a-f]+)\t([\s\S]+)$/u.exec(entry);
		if (match?.[1] && match[2] && match[3])
			entries.set(match[3], `${match[1]} ${match[2]}`);
	}
	return entries;
}

export async function headBeforeSpawn(
	projectRoot: string,
	signal: AbortSignal,
): Promise<string | undefined> {
	const result = await runCommand(
		"git",
		["rev-parse", "HEAD"],
		projectRoot,
		signal,
	);
	return result.exitCode === 0 ? result.stdout.trim() : undefined;
}

export type RetriableTaskAttempt<T> =
	| { readonly kind: "outcome"; readonly outcome: T }
	| {
			readonly kind: "block-candidate";
			readonly reason: string;
			readonly finalize: (
				contradicted:
					| { readonly path: string; readonly existsOnDisk: true }
					| undefined,
				options?: { readonly skipStatusTransition?: boolean },
			) => Promise<T>;
	  };

export async function runContradictedAttempts<
	T,
	Contradicted extends {
		readonly annotation: { readonly path: string; readonly existsOnDisk: true };
	},
>(options: {
	readonly spec: DriverRunSpec;
	readonly attempt: (
		appendedNote: string | undefined,
		attemptNumber: number,
		beforeSpawn?: () => Promise<void>,
	) => Promise<RetriableTaskAttempt<T>>;
	readonly find: (
		reason: string,
		projectRoot: string,
	) => Contradicted | undefined;
	readonly buildNote: (contradicted: Contradicted) => string;
	readonly onRetry: (
		contradicted: Contradicted["annotation"],
		attemptNumber: number,
	) => Promise<void>;
}): Promise<T> {
	let appendedNote: string | undefined;
	let retried = false;
	let attemptNumber = 1;
	let beforeSpawn: (() => Promise<void>) | undefined;
	while (true) {
		const attempt = await options.attempt(
			appendedNote,
			attemptNumber,
			beforeSpawn,
		);
		if (attempt.kind === "outcome") return attempt.outcome;
		const contradicted =
			!retried && (options.spec.retryOnContradictedBlock ?? true)
				? options.find(attempt.reason, options.spec.projectRoot)
				: undefined;
		if (!contradicted) return attempt.finalize(undefined);
		retried = true;
		await attempt.finalize(contradicted.annotation, {
			skipStatusTransition: true,
		});
		attemptNumber++;
		appendedNote = options.buildNote(contradicted);
		beforeSpawn = () => options.onRetry(contradicted.annotation, attemptNumber);
	}
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
