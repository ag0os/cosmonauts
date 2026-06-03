import { randomUUID } from "node:crypto";
import {
	appendFile,
	mkdir,
	readdir,
	readFile,
	rename,
	unlink,
	writeFile,
} from "node:fs/promises";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
	sep,
} from "node:path";
import { summarizeRunStatus } from "./controller.ts";
import type {
	CreateRunInput,
	ListRecentRunsOptions,
	OrchestrationEvent,
	ReadEventsOptions,
	RunPolicy,
	RunRecord,
	RunRef,
	RunStatus,
	RunStatusSummary,
	RunStore,
	RuntimeDiagnostic,
	RunWatchResult,
	StepRecord,
	StoredOrchestrationEvent,
} from "./types.ts";

const DEFAULT_POLICY: RunPolicy = {
	reportInference: "strict",
	defaultBackend: { name: "unknown" },
	worktree: { mode: "shared" },
};

interface FileRunStoreOptions {
	rootDir: string;
}

export class FileRunStore implements RunStore {
	readonly rootDir: string;

	constructor(options: FileRunStoreOptions) {
		this.rootDir = resolve(options.rootDir);
	}

	async createRun(input: CreateRunInput): Promise<RunRecord> {
		const runDir = this.runDir(input);
		const now = new Date().toISOString();
		const record: RunRecord = {
			scope: input.scope,
			runId: input.runId,
			status: input.status ?? "pending",
			createdAt: now,
			updatedAt: now,
			runDir,
			graphPath: resolveRunPath(runDir, input.graphPath ?? "graph.json"),
			eventsPath: resolveRunPath(runDir, input.eventsPath ?? "events.jsonl"),
			artifactsDir: resolveRunPath(runDir, input.artifactsDir ?? "artifacts"),
			schedulerStatePath: resolveRunPath(
				runDir,
				input.schedulerStatePath ?? "scheduler.json",
			),
			stepsDir: resolveRunPath(runDir, "steps"),
			policy: mergePolicy(input.policy),
			metadata: input.metadata,
		};

		await mkdir(record.artifactsDir, { recursive: true });
		await mkdir(record.stepsDir, { recursive: true });
		await writeJsonAtomically(record.graphPath, { steps: [], edges: [] });
		await writeJsonAtomically(record.schedulerStatePath, {});
		await writeFile(record.eventsPath, "", { flag: "a" });
		await this.writeRunRecord(record);
		return record;
	}

	async loadRun(ref: RunRef): Promise<RunRecord | undefined> {
		const path = this.runRecordPath(ref);
		try {
			return parseRunRecord(await readFile(path, "utf-8"), path);
		} catch (error) {
			if (isNotFoundError(error)) {
				return undefined;
			}
			throw error;
		}
	}

	async updateRun(record: RunRecord): Promise<RunRecord> {
		const existing = await this.loadRun(record);
		if (
			existing &&
			isTerminalStatus(existing.status) &&
			!isTerminalStatus(record.status)
		) {
			throw new Error(
				`Cannot update terminal run ${record.scope}/${record.runId} from ${existing.status} to ${record.status}.`,
			);
		}

		const runDir = this.runDir(record);
		const normalized: RunRecord = {
			...record,
			runDir,
			graphPath: resolveRunPath(runDir, record.graphPath),
			eventsPath: resolveRunPath(runDir, record.eventsPath),
			artifactsDir: resolveRunPath(runDir, record.artifactsDir),
			schedulerStatePath: resolveRunPath(runDir, record.schedulerStatePath),
			stepsDir: resolveRunPath(runDir, record.stepsDir),
		};
		await this.writeRunRecord(normalized);
		return normalized;
	}

	async appendEvent(
		ref: RunRef,
		event: OrchestrationEvent,
	): Promise<StoredOrchestrationEvent> {
		if (event.runId !== ref.runId) {
			throw new Error(
				`Event runId ${event.runId} does not match run ref ${ref.runId}.`,
			);
		}

		const record = await this.requireRun(ref);
		const { latestSeq } = await this.readEventFile(record.eventsPath);
		const stored: StoredOrchestrationEvent = {
			seq: latestSeq + 1,
			timestamp: new Date().toISOString(),
			runId: ref.runId,
			event,
		};

		await appendFile(record.eventsPath, `${JSON.stringify(stored)}\n`, "utf-8");
		const status = statusFromEvent(event);
		if (
			status &&
			(!isTerminalStatus(record.status) || isTerminalStatus(status))
		) {
			await this.updateRun({
				...record,
				status,
				updatedAt: stored.timestamp,
			});
		}
		return stored;
	}

	async readEvents(
		ref: RunRef,
		options: ReadEventsOptions = {},
	): Promise<RunWatchResult> {
		const record = await this.requireRun(ref);
		const { events, diagnostics, latestSeq } = await this.readEventFile(
			record.eventsPath,
		);
		const sinceSeq = options.sinceSeq ?? 0;
		const filtered = events
			.filter((event) => event.seq > sinceSeq)
			.sort((left, right) => left.seq - right.seq);
		const limited =
			options.limit === undefined ? filtered : filtered.slice(0, options.limit);

		return {
			runId: ref.runId,
			cursor: latestSeq,
			events: limited,
			diagnostics,
		};
	}

	async writeStepRecord(ref: RunRef, step: StepRecord): Promise<StepRecord> {
		if (step.runId !== ref.runId) {
			throw new Error(
				`Step runId ${step.runId} does not match run ref ${ref.runId}.`,
			);
		}

		const record = await this.requireRun(ref);
		const stepPath = this.stepRecordPath(record, step.id);
		await writeJsonAtomically(stepPath, step);
		return step;
	}

	async readStepRecord(
		ref: RunRef & { stepId: string },
	): Promise<StepRecord | undefined> {
		const record = await this.requireRun(ref);
		const stepPath = this.stepRecordPath(record, ref.stepId);
		try {
			return JSON.parse(await readFile(stepPath, "utf-8")) as StepRecord;
		} catch (error) {
			if (isNotFoundError(error)) {
				return undefined;
			}
			throw error;
		}
	}

	async listRecentRuns(
		options: ListRecentRunsOptions = {},
	): Promise<RunRecord[]> {
		const scopes = options.scope
			? [options.scope]
			: await this.listDirectoryNames(this.rootDir);
		const records: RunRecord[] = [];

		for (const scope of scopes) {
			const runsDir = this.runsDir({ scope, runId: "placeholder" });
			const runIds = await this.listDirectoryNames(runsDir);
			for (const runId of runIds) {
				const record = await this.loadRun({ scope, runId });
				if (record) {
					records.push(record);
				}
			}
		}

		const sorted = records.sort((left, right) =>
			right.updatedAt.localeCompare(left.updatedAt),
		);
		return options.limit === undefined
			? sorted
			: sorted.slice(0, options.limit);
	}

	async readStatus(ref: RunRef): Promise<RunStatusSummary | undefined> {
		const record = await this.loadRun(ref);
		if (!record) {
			return undefined;
		}

		const { events, diagnostics } = await this.readEventFile(record.eventsPath);
		return summarizeRunStatus(record, events, diagnostics);
	}

	private async requireRun(ref: RunRef): Promise<RunRecord> {
		const record = await this.loadRun(ref);
		if (!record) {
			throw new Error(`Run ${ref.scope}/${ref.runId} does not exist.`);
		}
		return record;
	}

	private runDir(ref: RunRef): string {
		validateIdentifier("scope", ref.scope);
		validateIdentifier("runId", ref.runId);
		return join(this.rootDir, ref.scope, "runs", ref.runId);
	}

	private runsDir(ref: RunRef): string {
		validateIdentifier("scope", ref.scope);
		return join(this.rootDir, ref.scope, "runs");
	}

	private runRecordPath(ref: RunRef): string {
		return join(this.runDir(ref), "run.json");
	}

	private stepRecordPath(record: RunRecord, stepId: string): string {
		validateIdentifier("stepId", stepId);
		return resolveRunPath(
			record.runDir,
			join(record.stepsDir, stepId, "step.json"),
		);
	}

	private async writeRunRecord(record: RunRecord): Promise<void> {
		await writeJsonAtomically(this.runRecordPath(record), record);
	}

	private async readEventFile(path: string): Promise<{
		events: StoredOrchestrationEvent[];
		diagnostics: RuntimeDiagnostic[];
		latestSeq: number;
	}> {
		let content = "";
		try {
			content = await readFile(path, "utf-8");
		} catch (error) {
			if (isNotFoundError(error)) {
				return { events: [], diagnostics: [], latestSeq: 0 };
			}
			throw error;
		}

		const events: StoredOrchestrationEvent[] = [];
		const diagnostics: RuntimeDiagnostic[] = [];
		let latestSeq = 0;
		const lines = content.split(/\r?\n/);
		for (const [index, line] of lines.entries()) {
			if (line.trim() === "") {
				continue;
			}
			try {
				const parsed = JSON.parse(line) as StoredOrchestrationEvent;
				if (isStoredEvent(parsed)) {
					events.push(parsed);
					latestSeq = Math.max(latestSeq, parsed.seq);
				} else {
					diagnostics.push({
						code: "invalid_event_envelope",
						message: "Normalized event line is not a stored event envelope.",
						path,
						line: index + 1,
					});
				}
			} catch (error) {
				diagnostics.push({
					code: "malformed_event_json",
					message: "Normalized event line is not valid JSON.",
					path,
					line: index + 1,
					details: error instanceof Error ? error.message : String(error),
				});
			}
		}

		return {
			events: events.sort((left, right) => left.seq - right.seq),
			diagnostics,
			latestSeq,
		};
	}

	private async listDirectoryNames(path: string): Promise<string[]> {
		try {
			const entries = await readdir(path, { withFileTypes: true });
			return entries
				.filter((entry) => entry.isDirectory())
				.map((entry) => entry.name);
		} catch (error) {
			if (isNotFoundError(error)) {
				return [];
			}
			throw error;
		}
	}
}

function mergePolicy(policy: Partial<RunPolicy> | undefined): RunPolicy {
	return {
		...DEFAULT_POLICY,
		...policy,
		defaultBackend: {
			...DEFAULT_POLICY.defaultBackend,
			...policy?.defaultBackend,
		},
		worktree: {
			...DEFAULT_POLICY.worktree,
			...policy?.worktree,
		},
	};
}

function resolveRunPath(runDir: string, path: string): string {
	const resolved = isAbsolute(path) ? resolve(path) : resolve(runDir, path);
	const normalizedRunDir = resolve(runDir);
	const rel = relative(normalizedRunDir, resolved);
	if (rel === "" || rel.startsWith("..") || rel.includes(`..${sep}`)) {
		throw new Error(`Path must resolve inside run directory: ${path}`);
	}
	return resolved;
}

function validateIdentifier(label: string, value: string): void {
	if (
		value.length === 0 ||
		value === "." ||
		value === ".." ||
		value.includes("/") ||
		value.includes("\\") ||
		value.includes("\0")
	) {
		throw new Error(`Unsafe ${label}: ${value}`);
	}
}

async function writeJsonAtomically(
	path: string,
	value: unknown,
): Promise<void> {
	const dir = dirname(path);
	await mkdir(dir, { recursive: true });
	const tempPath = join(
		dir,
		`.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
	);
	try {
		await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
		await rename(tempPath, path);
	} catch (error) {
		await unlink(tempPath).catch(() => undefined);
		throw error;
	}
}

function parseRunRecord(content: string, path: string): RunRecord {
	const parsed = JSON.parse(content) as RunRecord;
	if (!parsed.scope || !parsed.runId || !parsed.runDir) {
		throw new Error(`Invalid run record: ${path}`);
	}
	return parsed;
}

function isStoredEvent(value: StoredOrchestrationEvent): boolean {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof value.seq === "number" &&
		Number.isInteger(value.seq) &&
		value.seq > 0 &&
		typeof value.timestamp === "string" &&
		typeof value.runId === "string" &&
		typeof value.event === "object" &&
		value.event !== null &&
		value.event.runId === value.runId
	);
}

function statusFromEvent(event: OrchestrationEvent): RunStatus | undefined {
	switch (event.type) {
		case "run_completed":
			return "completed";
		case "run_blocked":
			return "blocked";
		case "run_failed":
			return "failed";
		case "run_cancelled":
			return "cancelled";
		case "run_stale":
			return "stale";
		case "run_started":
			return "running";
		default:
			return undefined;
	}
}

function isTerminalStatus(status: RunStatus): boolean {
	return (
		status === "completed" ||
		status === "blocked" ||
		status === "failed" ||
		status === "cancelled" ||
		status === "stale"
	);
}

function isNotFoundError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT"
	);
}
