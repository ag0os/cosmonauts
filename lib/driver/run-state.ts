import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomically } from "./atomic-file.ts";
import type {
	DriverResult,
	DriverRunSpec,
	StateCommitPolicy,
} from "./types.ts";

export const RUN_COMPLETION_FILENAME = "run.completion.json";
export const DETACHED_RUN_PID_FILENAME = "run.pid";
export const INLINE_RUN_STATE_FILENAME = "run.inline.json";
export const PENDING_FINALIZATION_FILENAME = "pending-finalization.json";

export interface InlineRunState {
	mode: "inline";
	pid: number;
	startedAt: string;
}

interface PendingFinalizationBase {
	runId: string;
	planSlug: string;
	createdAt: string;
	commitPolicy: DriverRunSpec["commitPolicy"];
	stateCommitPolicy: StateCommitPolicy;
	reason: string;
}

export type PendingFinalizationState =
	| (PendingFinalizationBase & {
			phase: "commit";
			taskId: string;
			headBeforeFinalization: string;
			commitSubject: string;
			verifiedAt: string;
	  })
	| (PendingFinalizationBase & {
			phase: "task_status";
			taskId: string;
			commitSha: string;
			commitSubject?: string;
	  })
	| (PendingFinalizationBase & {
			phase: "state_commit";
			taskIds: string[];
			headBeforeFinalization: string;
	  });

export function createInlineRunState(now = new Date()): InlineRunState {
	return {
		mode: "inline",
		pid: process.pid,
		startedAt: now.toISOString(),
	};
}

export async function writeInlineRunState(
	workdir: string,
	state: InlineRunState = createInlineRunState(),
): Promise<void> {
	await writeFileAtomically(
		join(workdir, INLINE_RUN_STATE_FILENAME),
		`${JSON.stringify(state, null, 2)}\n`,
	);
}

export async function writeRunCompletion(
	workdir: string,
	result: DriverResult,
): Promise<void> {
	await writeFileAtomically(
		join(workdir, RUN_COMPLETION_FILENAME),
		`${JSON.stringify(result, null, 2)}\n`,
	);
}

export function pendingFinalizationPath(workdir: string): string {
	return join(workdir, PENDING_FINALIZATION_FILENAME);
}

export async function writePendingFinalization(
	workdir: string,
	state: PendingFinalizationState,
): Promise<void> {
	await writeFileAtomically(
		pendingFinalizationPath(workdir),
		`${JSON.stringify(state, null, 2)}\n`,
	);
}

export async function readPendingFinalization(
	workdir: string,
): Promise<PendingFinalizationState | undefined> {
	try {
		const raw = await readFile(pendingFinalizationPath(workdir), "utf-8");
		return JSON.parse(raw) as PendingFinalizationState;
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return undefined;
		}
		throw error;
	}
}

export async function clearPendingFinalization(workdir: string): Promise<void> {
	await rm(pendingFinalizationPath(workdir), { force: true });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}
