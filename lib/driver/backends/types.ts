import type { EventSink } from "../types.ts";

interface BackendCapabilities {
	canCommit: boolean;
	isolatedFromHostSource: boolean;
}

export interface BackendInvocation {
	runId: string;
	promptPath: string;
	workdir: string;
	projectRoot: string;
	taskId: string;
	parentSessionId: string;
	planSlug: string;
	eventSink: EventSink;
	signal?: AbortSignal;
}

export interface BackendRunResult {
	exitCode: number;
	stdout: string;
	durationMs: number;
}

export interface Backend {
	readonly name: string;
	readonly capabilities: BackendCapabilities;
	livenessCheck?(): { argv: string[]; expectExitZero: boolean };
	run(invocation: BackendInvocation): Promise<BackendRunResult>;
}
