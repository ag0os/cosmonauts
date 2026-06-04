import {
	appendFile,
	mkdir,
	readdir,
	readFile,
	writeFile,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { writeFileAtomically } from "../fs/atomic-file.ts";
import { summarizeRunStatus } from "./controller.ts";
import { isTerminalStatus, statusFromEvent } from "./status.ts";
import type {
	CreateRunInput,
	ListRecentRunsOptions,
	OrchestrationEvent,
	ReadEventsOptions,
	ReadRunGraphResult,
	RunGraph,
	RunGraphStep,
	RunPolicy,
	RunRecord,
	RunRef,
	RunStatusSummary,
	RunStore,
	RuntimeDiagnostic,
	RunWatchResult,
	SchedulerState,
	StepAttemptRecord,
	StepHeartbeat,
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

interface StoredRuntimeDiagnostic {
	timestamp: string;
	runId: string;
	diagnostic: RuntimeDiagnostic;
}

const GRAPH_MUTABLE_FIELDS = [
	"status",
	"result",
	"latestAttemptId",
	"lease",
	"heartbeat",
	"retryPolicy",
	"outputArtifacts",
] as const;

export class FileRunStore implements RunStore {
	readonly rootDir: string;
	private readonly latestSeqByRun = new Map<string, number>();

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
		this.latestSeqByRun.set(this.runKey(record), 0);
		return record;
	}

	async loadRun(ref: RunRef): Promise<RunRecord | undefined> {
		const path = this.runRecordPath(ref);
		try {
			return normalizeRunRecord(
				parseRunRecord(await readFile(path, "utf-8"), path),
				ref,
				this.runDir(ref),
			);
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

		const normalized = normalizeRunPaths(record, this.runDir(record));
		await this.writeRunRecord(normalized);
		return normalized;
	}

	async readRunGraph(ref: RunRef): Promise<ReadRunGraphResult> {
		const record = await this.requireRun(ref);
		const diagnostics: RuntimeDiagnostic[] = [];
		let parsed: unknown;

		try {
			parsed = JSON.parse(await readFile(record.graphPath, "utf-8")) as unknown;
		} catch (error) {
			if (isNotFoundError(error)) {
				return {
					graph: { steps: [], edges: [] },
					diagnostics: [
						{
							code: "missing_run_graph",
							message: "Run graph file does not exist.",
							path: record.graphPath,
						},
					],
				};
			}
			throw error;
		}

		if (!isGraphLike(parsed)) {
			return {
				graph: { steps: [], edges: [] },
				diagnostics: [
					{
						code: "invalid_run_graph",
						message: "Run graph file is not a graph object.",
						path: record.graphPath,
					},
				],
			};
		}

		const steps: RunGraphStep[] = [];
		for (const [index, step] of parsed.steps.entries()) {
			if (!isRunGraphStepLike(step)) {
				diagnostics.push({
					code: "invalid_run_graph_step",
					message: `Run graph step at index ${index} is invalid.`,
					path: record.graphPath,
					details: { index },
				});
				continue;
			}
			validateIdentifier("stepId", step.id);
			if (step.runId !== ref.runId) {
				diagnostics.push({
					code: "graph_step_run_mismatch",
					message: `Graph step ${step.id} runId does not match run ${ref.runId}.`,
					path: record.graphPath,
					details: { stepId: step.id, runId: step.runId },
				});
				continue;
			}

			const mutableFields = GRAPH_MUTABLE_FIELDS.filter((field) =>
				hasOwn(step, field),
			);
			if (mutableFields.length > 0) {
				diagnostics.push({
					code: "ignored_graph_mutable_state",
					message: `Graph step ${step.id} contains mutable state fields ignored by scheduler recovery.`,
					path: record.graphPath,
					details: { stepId: step.id, fields: mutableFields },
				});
			}

			steps.push({
				id: step.id,
				runId: step.runId,
				title: step.title,
				kind: step.kind,
				backend: step.backend,
				dependsOn: step.dependsOn,
				inputArtifacts: step.inputArtifacts,
			});
		}

		const edges = parsed.edges.filter(
			(edge): edge is RunGraph["edges"][number] => {
				if (!isRunGraphEdgeLike(edge)) {
					diagnostics.push({
						code: "invalid_run_graph_edge",
						message: "Run graph edge is invalid.",
						path: record.graphPath,
						details: { edge },
					});
					return false;
				}
				validateIdentifier("stepId", edge.from);
				validateIdentifier("stepId", edge.to);
				return true;
			},
		);

		return { graph: { steps, edges }, diagnostics };
	}

	async writeRunGraph(ref: RunRef, graph: RunGraph): Promise<RunGraph> {
		const record = await this.requireRun(ref);
		for (const step of graph.steps) {
			validateIdentifier("stepId", step.id);
			if (step.runId !== ref.runId) {
				throw new Error(
					`Graph step runId ${step.runId} does not match run ref ${ref.runId}.`,
				);
			}
		}
		for (const edge of graph.edges) {
			validateIdentifier("stepId", edge.from);
			validateIdentifier("stepId", edge.to);
		}

		await writeJsonAtomically(record.graphPath, graph);
		return graph;
	}

	async readSchedulerState(ref: RunRef): Promise<SchedulerState> {
		const record = await this.requireRun(ref);
		let parsed: unknown;
		try {
			parsed = JSON.parse(
				await readFile(record.schedulerStatePath, "utf-8"),
			) as unknown;
		} catch (error) {
			if (isNotFoundError(error)) {
				return emptySchedulerState(record.updatedAt);
			}
			throw error;
		}

		if (!isSchedulerStateLike(parsed)) {
			return emptySchedulerState(record.updatedAt);
		}

		validateSchedulerState(parsed);
		return parsed;
	}

	async writeSchedulerState(
		ref: RunRef,
		state: SchedulerState,
	): Promise<SchedulerState> {
		const record = await this.requireRun(ref);
		validateSchedulerState(state);
		await writeJsonAtomically(record.schedulerStatePath, state);
		return state;
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
		const runKey = this.runKey(ref);
		const latestSeq = await this.latestSeq(record);
		const stored: StoredOrchestrationEvent = {
			seq: latestSeq + 1,
			timestamp: new Date().toISOString(),
			runId: ref.runId,
			event,
		};

		await appendFile(record.eventsPath, `${JSON.stringify(stored)}\n`, "utf-8");
		this.latestSeqByRun.set(runKey, stored.seq);
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

		const truncated = limited.length < filtered.length;
		const cursor = truncated ? (limited.at(-1)?.seq ?? sinceSeq) : latestSeq;

		return {
			runId: ref.runId,
			cursor,
			events: limited,
			diagnostics,
		};
	}

	async appendDiagnostic(
		ref: RunRef,
		diagnostic: RuntimeDiagnostic,
	): Promise<void> {
		const record = await this.requireRun(ref);
		const stored: StoredRuntimeDiagnostic = {
			timestamp: new Date().toISOString(),
			runId: ref.runId,
			diagnostic,
		};
		await appendFile(record.eventsPath, `${JSON.stringify(stored)}\n`, "utf-8");
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

	async listStepRecords(ref: RunRef): Promise<StepRecord[]> {
		const record = await this.requireRun(ref);
		const stepIds = await this.listDirectoryNames(record.stepsDir);
		const steps: StepRecord[] = [];

		for (const stepId of stepIds.sort((left, right) =>
			left.localeCompare(right),
		)) {
			const step = await this.readStepRecord({ ...ref, stepId });
			if (step) {
				steps.push(step);
			}
		}

		return steps;
	}

	async writeStepHeartbeat(
		ref: RunRef & { stepId: string },
		heartbeat: StepHeartbeat,
	): Promise<StepHeartbeat> {
		const record = await this.requireRun(ref);
		const heartbeatPath = this.stepHeartbeatPath(record, ref.stepId);
		await writeJsonAtomically(heartbeatPath, heartbeat);
		const step = await this.readStepRecord(ref);
		if (step) {
			await this.writeStepRecord(ref, { ...step, heartbeat });
		}
		return heartbeat;
	}

	async readStepHeartbeat(
		ref: RunRef & { stepId: string },
	): Promise<StepHeartbeat | undefined> {
		const record = await this.requireRun(ref);
		const heartbeatPath = this.stepHeartbeatPath(record, ref.stepId);
		try {
			return JSON.parse(
				await readFile(heartbeatPath, "utf-8"),
			) as StepHeartbeat;
		} catch (error) {
			if (isNotFoundError(error)) {
				return undefined;
			}
			throw error;
		}
	}

	async writeStepAttemptRecord(
		ref: RunRef & { stepId: string },
		attempt: StepAttemptRecord,
		options: { outputText?: string } = {},
	): Promise<StepAttemptRecord> {
		const record = await this.requireRun(ref);
		const attemptDir = this.stepAttemptDir(
			record,
			ref.stepId,
			attempt.attemptId,
		);
		await writeJsonAtomically(join(attemptDir, "attempt.json"), attempt);
		if (options.outputText !== undefined) {
			await writeFileAtomically(
				join(attemptDir, "output.md"),
				options.outputText,
			);
		}
		if (attempt.result) {
			await writeJsonAtomically(
				join(attemptDir, "result.json"),
				attempt.result,
			);
		}
		return attempt;
	}

	async readStepAttemptRecord(
		ref: RunRef & { stepId: string; attemptId: string },
	): Promise<StepAttemptRecord | undefined> {
		const record = await this.requireRun(ref);
		const attemptPath = this.stepAttemptRecordPath(
			record,
			ref.stepId,
			ref.attemptId,
		);
		try {
			return JSON.parse(
				await readFile(attemptPath, "utf-8"),
			) as StepAttemptRecord;
		} catch (error) {
			if (isNotFoundError(error)) {
				return undefined;
			}
			throw error;
		}
	}

	async listStepAttemptRecords(
		ref: RunRef & { stepId: string },
	): Promise<StepAttemptRecord[]> {
		const record = await this.requireRun(ref);
		const attemptsDir = this.stepAttemptsDir(record, ref.stepId);
		const attemptIds = await this.listDirectoryNames(attemptsDir);
		const attempts: StepAttemptRecord[] = [];

		for (const attemptId of attemptIds.sort((left, right) =>
			left.localeCompare(right),
		)) {
			const attempt = await this.readStepAttemptRecord({
				...ref,
				attemptId,
			});
			if (attempt) {
				attempts.push(attempt);
			}
		}

		return attempts;
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

	private async latestSeq(record: RunRecord): Promise<number> {
		const runKey = this.runKey(record);
		const cached = this.latestSeqByRun.get(runKey);
		if (cached !== undefined) {
			return cached;
		}

		const { latestSeq } = await this.readEventFile(record.eventsPath);
		this.latestSeqByRun.set(runKey, latestSeq);
		return latestSeq;
	}

	private runKey(ref: RunRef): string {
		return `${ref.scope}/${ref.runId}`;
	}

	private stepRecordPath(record: RunRecord, stepId: string): string {
		validateIdentifier("stepId", stepId);
		return resolveRunPath(
			record.runDir,
			join(record.stepsDir, stepId, "step.json"),
		);
	}

	private stepAttemptsDir(record: RunRecord, stepId: string): string {
		validateIdentifier("stepId", stepId);
		return resolveRunPath(
			record.runDir,
			join(record.stepsDir, stepId, "attempts"),
		);
	}

	private stepHeartbeatPath(record: RunRecord, stepId: string): string {
		validateIdentifier("stepId", stepId);
		return resolveRunPath(
			record.runDir,
			join(record.stepsDir, stepId, "heartbeat.json"),
		);
	}

	private stepAttemptDir(
		record: RunRecord,
		stepId: string,
		attemptId: string,
	): string {
		validateIdentifier("attemptId", attemptId);
		return resolveRunPath(
			record.runDir,
			join(this.stepAttemptsDir(record, stepId), attemptId),
		);
	}

	private stepAttemptRecordPath(
		record: RunRecord,
		stepId: string,
		attemptId: string,
	): string {
		return join(this.stepAttemptDir(record, stepId, attemptId), "attempt.json");
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
				const parsed = JSON.parse(line) as unknown;
				if (isStoredEvent(parsed)) {
					events.push(parsed);
					latestSeq = Math.max(latestSeq, parsed.seq);
				} else if (isStoredDiagnostic(parsed)) {
					diagnostics.push(parsed.diagnostic);
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

function emptySchedulerState(updatedAt: string): SchedulerState {
	return {
		readyStepIds: [],
		leasesByStepId: {},
		heartbeatsByStepId: {},
		updatedAt,
	};
}

function validateSchedulerState(state: SchedulerState): void {
	for (const stepId of state.readyStepIds) {
		validateIdentifier("stepId", stepId);
	}
	for (const stepId of Object.keys(state.leasesByStepId)) {
		validateIdentifier("stepId", stepId);
	}
	for (const stepId of Object.keys(state.heartbeatsByStepId)) {
		validateIdentifier("stepId", stepId);
	}
}

async function writeJsonAtomically(
	path: string,
	value: unknown,
): Promise<void> {
	await writeFileAtomically(path, `${JSON.stringify(value, null, 2)}\n`);
}

function parseRunRecord(content: string, path: string): RunRecord {
	const parsed = JSON.parse(content) as RunRecord;
	if (!parsed.scope || !parsed.runId || !parsed.runDir) {
		throw new Error(`Invalid run record: ${path}`);
	}
	return parsed;
}

function normalizeRunRecord(
	record: RunRecord,
	ref: RunRef,
	runDir: string,
): RunRecord {
	if (record.scope !== ref.scope || record.runId !== ref.runId) {
		throw new Error(
			`Run record does not match requested ref: ${ref.scope}/${ref.runId}`,
		);
	}

	return normalizeRunPaths(record, runDir);
}

function normalizeRunPaths(record: RunRecord, runDir: string): RunRecord {
	return {
		...record,
		runDir,
		graphPath: resolveRunPath(runDir, record.graphPath),
		eventsPath: resolveRunPath(runDir, record.eventsPath),
		artifactsDir: resolveRunPath(runDir, record.artifactsDir),
		schedulerStatePath: resolveRunPath(runDir, record.schedulerStatePath),
		stepsDir: resolveRunPath(runDir, record.stepsDir),
	};
}

function isStoredEvent(value: unknown): value is StoredOrchestrationEvent {
	return (
		typeof value === "object" &&
		value !== null &&
		"seq" in value &&
		typeof value.seq === "number" &&
		Number.isInteger(value.seq) &&
		value.seq > 0 &&
		"timestamp" in value &&
		typeof value.timestamp === "string" &&
		"runId" in value &&
		typeof value.runId === "string" &&
		"event" in value &&
		typeof value.event === "object" &&
		value.event !== null &&
		"runId" in value.event &&
		value.event.runId === value.runId
	);
}

function isStoredDiagnostic(value: unknown): value is StoredRuntimeDiagnostic {
	if (typeof value !== "object" || value === null || !("diagnostic" in value)) {
		return false;
	}

	const diagnostic = value.diagnostic;
	return (
		"timestamp" in value &&
		typeof value.timestamp === "string" &&
		"runId" in value &&
		typeof value.runId === "string" &&
		typeof diagnostic === "object" &&
		diagnostic !== null &&
		"code" in diagnostic &&
		typeof diagnostic.code === "string" &&
		"message" in diagnostic &&
		typeof diagnostic.message === "string"
	);
}

function isGraphLike(value: unknown): value is {
	steps: unknown[];
	edges: unknown[];
} {
	return (
		typeof value === "object" &&
		value !== null &&
		"steps" in value &&
		Array.isArray(value.steps) &&
		"edges" in value &&
		Array.isArray(value.edges)
	);
}

function isRunGraphStepLike(value: unknown): value is RunGraphStep {
	return (
		typeof value === "object" &&
		value !== null &&
		"id" in value &&
		typeof value.id === "string" &&
		"runId" in value &&
		typeof value.runId === "string" &&
		"title" in value &&
		typeof value.title === "string" &&
		"kind" in value &&
		typeof value.kind === "string" &&
		"backend" in value &&
		typeof value.backend === "object" &&
		value.backend !== null &&
		"dependsOn" in value &&
		Array.isArray(value.dependsOn) &&
		value.dependsOn.every((dependency) => typeof dependency === "string") &&
		"inputArtifacts" in value &&
		Array.isArray(value.inputArtifacts)
	);
}

function isRunGraphEdgeLike(
	value: unknown,
): value is RunGraph["edges"][number] {
	return (
		typeof value === "object" &&
		value !== null &&
		"from" in value &&
		typeof value.from === "string" &&
		"to" in value &&
		typeof value.to === "string"
	);
}

function isSchedulerStateLike(value: unknown): value is SchedulerState {
	return (
		typeof value === "object" &&
		value !== null &&
		"readyStepIds" in value &&
		Array.isArray(value.readyStepIds) &&
		value.readyStepIds.every((stepId) => typeof stepId === "string") &&
		"leasesByStepId" in value &&
		typeof value.leasesByStepId === "object" &&
		value.leasesByStepId !== null &&
		"heartbeatsByStepId" in value &&
		typeof value.heartbeatsByStepId === "object" &&
		value.heartbeatsByStepId !== null &&
		"updatedAt" in value &&
		typeof value.updatedAt === "string"
	);
}

function hasOwn<T extends string>(
	record: object,
	key: T,
): record is Record<T, unknown> {
	return Object.hasOwn(record, key);
}

function isNotFoundError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT"
	);
}
