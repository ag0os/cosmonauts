import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { acquireRepoCommitLock } from "./lock.ts";
import type { DriverEvent, DriverRunSpec } from "./types.ts";
import { resolveStateCommitPolicy } from "./types.ts";

const execFileAsync = promisify(execFile);

type DriverEventInput = DriverEvent extends infer Event
	? Event extends DriverEvent
		? Omit<Event, "runId" | "parentSessionId" | "timestamp">
		: never
	: never;

export type StateCommitResult =
	| { status: "committed"; sha: string }
	| {
			status: "skipped";
			reason: "policy_none" | "not_all_tasks_done" | "no_changes";
	  }
	| { status: "failed"; reason: string; headBeforeFinalization: string };

export interface StateCommitCtx {
	eventSink: (event: DriverEvent) => Promise<void>;
	abortSignal: AbortSignal;
}

export async function skipStateCommit(
	spec: DriverRunSpec,
	ctx: StateCommitCtx,
	reason: "policy_none" | "not_all_tasks_done",
): Promise<StateCommitResult> {
	await emit(spec, ctx, {
		type: "finalize",
		phase: "state_commit",
		status: "skipped",
		details: { reason },
	});
	return { status: "skipped", reason };
}

export async function commitFinalState(
	spec: DriverRunSpec,
	ctx: StateCommitCtx,
	taskIds: readonly string[],
): Promise<StateCommitResult> {
	if (resolveStateCommitPolicy(spec) === "none") {
		return skipStateCommit(spec, ctx, "policy_none");
	}

	const taskPaths = await findTaskMarkdownPaths(spec.projectRoot, taskIds);
	const headBeforeFinalization = await gitStdout(
		spec.projectRoot,
		["rev-parse", "HEAD"],
		ctx.abortSignal,
	);
	await emit(spec, ctx, {
		type: "finalize",
		phase: "state_commit",
		status: "started",
	});

	if (taskPaths.length === 0) {
		await emit(spec, ctx, {
			type: "finalize",
			phase: "state_commit",
			status: "skipped",
			details: { reason: "no_changes" },
		});
		return { status: "skipped", reason: "no_changes" };
	}

	const lock = await acquireRepoCommitLock(spec.projectRoot);
	try {
		if (!(await hasPathChanges(spec.projectRoot, taskPaths, ctx.abortSignal))) {
			await emit(spec, ctx, {
				type: "finalize",
				phase: "state_commit",
				status: "skipped",
				details: { reason: "no_changes" },
			});
			return { status: "skipped", reason: "no_changes" };
		}

		await git(
			spec.projectRoot,
			["add", "--all", "--", ...taskPaths],
			ctx.abortSignal,
		);
		if (
			!(await hasStagedPathChanges(
				spec.projectRoot,
				taskPaths,
				ctx.abortSignal,
			))
		) {
			await emit(spec, ctx, {
				type: "finalize",
				phase: "state_commit",
				status: "skipped",
				details: { reason: "no_changes" },
			});
			return { status: "skipped", reason: "no_changes" };
		}

		const subject = `Drive state: mark ${spec.planSlug} tasks done`;
		await git(
			spec.projectRoot,
			["commit", "-m", subject, "--", ...taskPaths],
			ctx.abortSignal,
		);
		const sha = await gitStdout(
			spec.projectRoot,
			["rev-parse", "HEAD"],
			ctx.abortSignal,
		);
		await emit(spec, ctx, {
			type: "finalize",
			phase: "state_commit",
			status: "passed",
			details: { sha, subject },
		});
		return { status: "committed", sha };
	} catch (error) {
		const reason = `state commit failed: ${formatError(error)}`;
		await emit(spec, ctx, {
			type: "finalize",
			phase: "state_commit",
			status: "failed",
			details: { error: reason },
		});
		return { status: "failed", reason, headBeforeFinalization };
	} finally {
		await lock.release();
	}
}

async function findTaskMarkdownPaths(
	projectRoot: string,
	taskIds: readonly string[],
): Promise<string[]> {
	const taskDir = join(projectRoot, "missions", "tasks");
	const entries = await readdir(taskDir, { withFileTypes: true }).catch(
		(error: unknown) => {
			if (isErrnoError(error) && error.code === "ENOENT") {
				return [];
			}
			throw error;
		},
	);
	const ids = new Set(taskIds);
	return entries
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name)
		.filter((name) => name.endsWith(".md"))
		.filter((name) => ids.has(name.split(" ")[0] ?? name.replace(/\.md$/, "")))
		.map((name) => `missions/tasks/${name}`)
		.sort();
}

async function hasPathChanges(
	cwd: string,
	paths: readonly string[],
	signal: AbortSignal,
): Promise<boolean> {
	const stdout = await gitStdout(
		cwd,
		["status", "--porcelain", "--untracked-files=all", "--", ...paths],
		signal,
	);
	return stdout.trim().length > 0;
}

async function hasStagedPathChanges(
	cwd: string,
	paths: readonly string[],
	signal: AbortSignal,
): Promise<boolean> {
	try {
		await git(cwd, ["diff", "--cached", "--quiet", "--", ...paths], signal);
		return false;
	} catch (error) {
		if (isExecError(error) && error.code === 1) {
			return true;
		}
		throw error;
	}
}

async function gitStdout(
	cwd: string,
	args: readonly string[],
	signal: AbortSignal,
): Promise<string> {
	const { stdout } = await git(cwd, args, signal);
	return stdout.toString().trim();
}

async function git(cwd: string, args: readonly string[], signal: AbortSignal) {
	return execFileAsync("git", [...args], {
		cwd,
		encoding: "utf-8",
		signal,
	});
}

async function emit(
	spec: DriverRunSpec,
	ctx: StateCommitCtx,
	event: DriverEventInput,
): Promise<void> {
	await ctx.eventSink({
		...event,
		runId: spec.runId,
		parentSessionId: spec.parentSessionId,
		timestamp: new Date().toISOString(),
	} as DriverEvent);
}

function formatError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

function isErrnoError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && "code" in error;
}

function isExecError(error: unknown): error is Error & { code: number } {
	return error instanceof Error && "code" in error;
}
