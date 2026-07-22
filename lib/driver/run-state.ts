import { createHash } from "node:crypto";
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

const TERMINAL_EPISODES_DIRECTORY = "run.terminal-episodes";
const DRIVE_TERMINAL_OUTCOMES = new Set<DriveTerminalOutcome>([
	"completed",
	"aborted",
	"blocked",
	"finalization_failed",
	"failed",
]);

export type DriveTerminalOutcome = DriverResult["outcome"] | "failed";

export interface DriveTerminalRecord {
	version: 1;
	attemptId: string;
	outcome: DriveTerminalOutcome;
	timestamp: string;
	state: "intended" | "recorded";
}

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

export async function readRunCompletion(
	workdir: string,
): Promise<DriverResult | undefined> {
	try {
		return JSON.parse(
			await readFile(join(workdir, RUN_COMPLETION_FILENAME), "utf-8"),
		) as DriverResult;
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return undefined;
		throw error;
	}
}

export async function writeFallbackRunCompletion(
	workdir: string,
	fallback: DriverResult,
): Promise<DriverResult> {
	const current = await readRunCompletion(workdir);
	if (current?.completedAt !== undefined) return current;

	await writeRunCompletion(workdir, fallback);
	return fallback;
}

export async function readDriveTerminalRecord(
	workdir: string,
	attemptId: string,
): Promise<DriveTerminalRecord | undefined> {
	try {
		const raw = await readFile(
			driveTerminalRecordPath(workdir, attemptId),
			"utf-8",
		);
		const value: unknown = JSON.parse(raw);
		return isDriveTerminalRecord(value, attemptId) ? value : undefined;
	} catch (error) {
		if (
			(isNodeError(error) && error.code === "ENOENT") ||
			error instanceof SyntaxError
		) {
			return undefined;
		}
		throw error;
	}
}

export async function writeDriveTerminalRecord(
	workdir: string,
	record: DriveTerminalRecord,
): Promise<void> {
	if (!isDriveTerminalRecord(record, record.attemptId)) {
		throw new Error("Invalid Drive terminal record.");
	}
	const persisted: DriveTerminalRecord = {
		version: 1,
		attemptId: record.attemptId,
		outcome: record.outcome,
		timestamp: record.timestamp,
		state: record.state,
	};
	await writeFileAtomically(
		driveTerminalRecordPath(workdir, record.attemptId),
		`${JSON.stringify(persisted, null, 2)}\n`,
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

function driveTerminalRecordPath(workdir: string, attemptId: string): string {
	const digest = createHash("sha256").update(attemptId).digest("hex");
	return join(workdir, TERMINAL_EPISODES_DIRECTORY, `${digest}.json`);
}

function isDriveTerminalRecord(
	value: unknown,
	attemptId: string,
): value is DriveTerminalRecord {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const candidate = value as Partial<DriveTerminalRecord>;
	return (
		candidate.version === 1 &&
		typeof candidate.attemptId === "string" &&
		candidate.attemptId.length > 0 &&
		candidate.attemptId === attemptId &&
		DRIVE_TERMINAL_OUTCOMES.has(candidate.outcome as DriveTerminalOutcome) &&
		isExactIsoTimestamp(candidate.timestamp) &&
		(candidate.state === "intended" || candidate.state === "recorded")
	);
}

function isExactIsoTimestamp(value: unknown): value is string {
	if (typeof value !== "string") return false;
	try {
		return new Date(value).toISOString() === value;
	} catch {
		return false;
	}
}
