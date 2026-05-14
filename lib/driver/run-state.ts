import { join } from "node:path";
import { writeFileAtomically } from "./atomic-file.ts";
import type { DriverResult } from "./types.ts";

export const RUN_COMPLETION_FILENAME = "run.completion.json";
export const DETACHED_RUN_PID_FILENAME = "run.pid";
export const INLINE_RUN_STATE_FILENAME = "run.inline.json";

export interface InlineRunState {
	mode: "inline";
	pid: number;
	startedAt: string;
}

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
