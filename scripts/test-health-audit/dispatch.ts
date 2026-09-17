import { randomUUID } from "node:crypto";
import {
	mkdir,
	open,
	readdir,
	readFile,
	rename,
	unlink,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	createCodexBackend,
	readCodexArgsFromEnv,
	readCodexExecArgsFromEnv,
} from "../../lib/driver/backends/codex.ts";
import type {
	Backend,
	BackendInvocation,
} from "../../lib/driver/backends/types.ts";
import {
	buildProfileWorkQueue,
	type ProfileWorkQueue,
	type ProfileWorkUnit,
	parseCalibrationDocument,
	publishProfileUnit,
	readCurrentEpochManifest,
	readProfileWorkQueue,
	validateCalibrationRecord,
	validateProfileEpoch,
} from "./artifacts.ts";
import type { TestEvidenceProfile } from "./schema.ts";
import type { SourceCensus } from "./source-census.ts";

export interface DispatchProfileUnitsOptions {
	readonly auditRoot: string;
	readonly projectRoot: string;
	readonly backend?: Backend;
	readonly resampleControls?: ControlSampler;
}

export interface ControlWaveResult {
	readonly status: "pass" | "miss";
	readonly controlIds: readonly string[];
	readonly issues?: readonly string[];
}

export type ControlSampler = (
	wave: number,
	context: { readonly epochId: string },
) => Promise<ControlWaveResult>;

export interface ProfileDispatchResult {
	readonly epochId: string;
	readonly dispatchedUnitIds: readonly string[];
	readonly completedUnitIds: readonly string[];
}

/**
 * Drains the current epoch queue in bounded waves. The only durable progress
 * signal is a shard that passes the current-epoch validator; backend exit codes
 * and prompt files are deliberately not checkpoints.
 */
export async function dispatchProfileUnits({
	auditRoot,
	projectRoot,
	backend = defaultProcessBackend(),
	resampleControls,
}: DispatchProfileUnitsOptions): Promise<ProfileDispatchResult> {
	const manifest = await readCurrentEpochManifest(auditRoot);
	const queue = await readCurrentQueue(auditRoot, manifest.epochId);
	await requireQueueMatchesCensus(auditRoot, queue);
	if (!backend.capabilities.isolatedFromHostSource)
		throw new Error(
			`profile dispatcher backend ${backend.name} is not an isolated driver process backend`,
		);

	const dispatchDirectory = join(
		auditRoot,
		"epochs",
		manifest.epochId,
		"dispatch",
	);
	await mkdir(dispatchDirectory, { recursive: true });
	const dispatchedUnitIds: string[] = [];
	const priorControls = await readControlWaveState(auditRoot, manifest.epochId);
	if (priorControls.issues.length > 0)
		throw new Error(
			`current control-wave evidence is invalid: ${priorControls.issues.join("; ")}`,
		);
	let waveNumber = priorControls.lastWave;
	const sampleControls =
		resampleControls ??
		((wave: number) =>
			resampleControlsWithBackend({
				auditRoot,
				projectRoot,
				dispatchDirectory,
				epochId: manifest.epochId,
				wave,
				backend,
			}));

	for (;;) {
		const beforeWave = await validateProfileEpoch(auditRoot, projectRoot);
		const blockingIssues = issuesOutsidePendingUnits(
			beforeWave.issues,
			beforeWave.pendingUnitIds,
		);
		if (blockingIssues.length > 0)
			throw new Error(
				`current profile shards are invalid: ${blockingIssues.join("; ")}`,
			);
		if (beforeWave.pendingUnitIds.length === 0) {
			if (!beforeWave.complete)
				throw new Error(
					`current profile epoch is incomplete: ${beforeWave.issues.join("; ")}`,
				);
			return {
				epochId: manifest.epochId,
				dispatchedUnitIds,
				completedUnitIds: beforeWave.completedUnitIds,
			};
		}

		const pending = new Set(beforeWave.pendingUnitIds);
		waveNumber += 1;
		const wave = queue.units
			.filter((unit) => pending.has(unit.id))
			.slice(0, queue.execution.maxConcurrent);
		const results = await Promise.all(
			wave.map(async (unit) => {
				dispatchedUnitIds.push(unit.id);
				try {
					return await runUnit({
						auditRoot,
						projectRoot,
						dispatchDirectory,
						epochId: manifest.epochId,
						unit,
						backend,
					});
				} catch (error) {
					return {
						unitId: unit.id,
						exitCode: 1,
						stdout: error instanceof Error ? error.message : String(error),
					};
				}
			}),
		);
		const failed = results.filter((result) => result.exitCode !== 0);
		const afterWave = await validateProfileEpoch(auditRoot, projectRoot);
		for (const result of results) {
			if (
				result.exitCode === 0 &&
				!afterWave.completedUnitIds.includes(result.unitId)
			)
				failed.push({
					...result,
					exitCode: result.exitCode || 1,
					stdout: `${result.stdout}\nvalidated shard was not published`,
				});
		}
		if (failed.length > 0) {
			const details = failed
				.map(
					(result) =>
						`${result.unitId} exited ${result.exitCode}: ${result.stdout.trim() || "no backend output"}`,
				)
				.join("; ");
			throw new Error(`profile dispatch failed: ${details}`);
		}
		const controlResult = await sampleControls(waveNumber, {
			epochId: manifest.epochId,
		});
		await recordControlWave(
			auditRoot,
			manifest.epochId,
			waveNumber,
			controlResult,
		);
		if (controlResult.status !== "pass")
			throw new Error(
				`profile dispatch stopped after control regression in wave ${waveNumber}: ${(controlResult.issues ?? []).join("; ") || "control sample missed"}`,
			);
	}
}

async function readCurrentQueue(
	auditRoot: string,
	epochId: string,
): Promise<ProfileWorkQueue> {
	const path = join(auditRoot, "epochs", epochId, "work-units.json");
	try {
		return await readProfileWorkQueue(auditRoot);
	} catch (error) {
		throw new Error(
			`${path} is missing, malformed, or stale: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

async function requireQueueMatchesCensus(
	auditRoot: string,
	queue: ProfileWorkQueue,
): Promise<void> {
	const censusPath = join(
		auditRoot,
		"epochs",
		queue.epochId,
		"source-census.json",
	);
	let census: SourceCensus[];
	try {
		const parsed = JSON.parse(await readFile(censusPath, "utf8")) as unknown;
		if (!Array.isArray(parsed)) throw new Error("expected an array");
		census = parsed as SourceCensus[];
	} catch (error) {
		throw new Error(
			`${censusPath} is missing or malformed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	let expected: ProfileWorkQueue;
	try {
		expected = buildProfileWorkQueue(queue.epochId, census);
	} catch (error) {
		throw new Error(
			`${censusPath} is malformed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	if (JSON.stringify(queue) !== JSON.stringify(expected))
		throw new Error(
			`${join(auditRoot, "epochs", queue.epochId, "work-units.json")} is stale for ${censusPath}`,
		);
}

function issuesOutsidePendingUnits(
	issues: readonly string[],
	pendingUnitIds: readonly string[],
): string[] {
	return issues.filter(
		(issue) => !pendingUnitIds.some((unitId) => issue.startsWith(`${unitId}:`)),
	);
}

async function runUnit(options: {
	auditRoot: string;
	projectRoot: string;
	dispatchDirectory: string;
	epochId: string;
	unit: ProfileWorkUnit;
	backend: Backend;
}): Promise<{ unitId: string; exitCode: number; stdout: string }> {
	const promptPath = join(options.dispatchDirectory, `${options.unit.id}.md`);
	const candidatePath = join(
		options.dispatchDirectory,
		`${options.unit.id}.profiles.json`,
	);
	await unlink(candidatePath).catch((error: unknown) => {
		if (!isRecord(error) || error.code !== "ENOENT") throw error;
	});
	await writeTextAtomic(
		promptPath,
		renderUnitPrompt({
			auditRoot: options.auditRoot,
			projectRoot: options.projectRoot,
			epochId: options.epochId,
			unit: options.unit,
			candidatePath,
		}),
	);
	const invocation: BackendInvocation = {
		runId: `profile-assessment-${options.epochId}`,
		promptPath,
		workdir: options.dispatchDirectory,
		projectRoot: options.projectRoot,
		taskId: options.unit.id,
		parentSessionId: `profile-assessment-${options.epochId}`,
		planSlug: "test-health-audit",
		eventSink: () => Promise.resolve(),
	};
	const processStartedAt = Date.now();
	const result = await options.backend.run(invocation);
	const processEndedAt = Date.now();
	const durationMs = processEndedAt - processStartedAt;
	if (result.exitCode !== 0)
		return {
			unitId: options.unit.id,
			exitCode: result.exitCode,
			stdout: result.stdout,
		};
	if (!result.processMetrics)
		throw new Error(
			`${options.unit.id} backend omitted dispatcher-owned process metrics`,
		);
	const candidate = await readCandidate(candidatePath, options.unit.id);
	await publishProfileUnit({
		root: options.auditRoot,
		projectRoot: options.projectRoot,
		unitId: options.unit.id,
		assessorId: candidate.assessorId,
		processId: result.processMetrics.processId,
		processStartedAt: new Date(processStartedAt).toISOString(),
		processEndedAt: new Date(processEndedAt).toISOString(),
		durationMs,
		peakRssBytes: result.processMetrics.peakRssBytes,
		profiles: candidate.profiles,
	});
	return {
		unitId: options.unit.id,
		exitCode: result.exitCode,
		stdout: result.stdout,
	};
}

async function readCandidate(
	path: string,
	unitId: string,
): Promise<{ assessorId: string; profiles: readonly TestEvidenceProfile[] }> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
	} catch (error) {
		throw new Error(
			`${unitId} candidate is missing or malformed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	if (!isRecord(parsed))
		throw new Error(`${unitId} candidate must be an object`);
	const forbidden = ["processId", "durationMs", "peakRssBytes"].filter(
		(field) => field in parsed,
	);
	if (forbidden.length > 0)
		throw new Error(
			`${unitId} candidate contains agent-supplied cost fields: ${forbidden.join(", ")}`,
		);
	if (
		typeof parsed.assessorId !== "string" ||
		parsed.assessorId.length === 0 ||
		!Array.isArray(parsed.profiles)
	)
		throw new Error(`${unitId} candidate omits assessorId or profiles`);
	return {
		assessorId: parsed.assessorId,
		profiles: parsed.profiles as TestEvidenceProfile[],
	};
}

function renderUnitPrompt(options: {
	auditRoot: string;
	projectRoot: string;
	epochId: string;
	unit: ProfileWorkUnit;
	candidatePath: string;
}): string {
	return `# Test health profile assessment unit

Assess exactly this disjoint current-epoch unit. Do not assess identities outside it and do not edit product source, missions task state, the queue, or another unit's shard.

- Audit root: ${options.auditRoot}
- Project root: ${options.projectRoot}
- Epoch: ${options.epochId}
- Unit: ${options.unit.id}
- Candidate JSON path: ${options.candidatePath}

The identities and their source declaration spans are:

${JSON.stringify(options.unit.identities)}

The shared file-context/import/helper evidence digests are:

${JSON.stringify(options.unit.fileContexts)}

Open the named test files, their imports/helpers, runtime evidence, frozen behavior-risk inventory, ratified plan ground, shipped authorities, and relevant knowledge. Produce every TestEvidenceProfile field with the exact vocabulary in scripts/test-health-audit/schema.ts. A collision in ratified plan ground halts this unit. An absent or self-contradicting shipped authority is claim status unresolved with cited counterevidence, uncertainty, and a drafted question; it does not halt the unit.

Write one JSON object to the candidate path containing only assessorId and profiles. It must contain every assigned identity exactly once. Do not supply process identity, duration, or memory cost and do not write the final shard: the dispatcher measures the process it owns, validates the candidate, and atomically publishes the NDJSON shard.
`;
}

async function resampleControlsWithBackend(options: {
	auditRoot: string;
	projectRoot: string;
	dispatchDirectory: string;
	epochId: string;
	wave: number;
	backend: Backend;
}): Promise<ControlWaveResult> {
	const suffix = String(options.wave).padStart(4, "0");
	const promptPath = join(
		options.dispatchDirectory,
		`controls-wave-${suffix}.md`,
	);
	const candidatePath = join(
		options.dispatchDirectory,
		`controls-wave-${suffix}.json`,
	);
	const calibrationPath = join(
		options.auditRoot,
		"epochs",
		options.epochId,
		"calibration.md",
	);
	await unlink(candidatePath).catch((error: unknown) => {
		if (!isRecord(error) || error.code !== "ENOENT") throw error;
	});
	await writeTextAtomic(
		promptPath,
		`# Calibration control re-sample\n\nRe-run every predeclared calibration control for epoch ${options.epochId} by opening its exact named source identity and authorities. Write the complete CalibrationRecord JSON, without markdown fences, to ${candidatePath}. A missing or regressed control must remain a miss. The prior calibration document is ${calibrationPath}; it is context, not permission to copy outcomes without re-assessment. Do not edit product or audit artifacts other than the candidate file.\n`,
	);
	const result = await options.backend.run({
		runId: `profile-controls-${options.epochId}`,
		promptPath,
		workdir: options.dispatchDirectory,
		projectRoot: options.projectRoot,
		taskId: `controls-wave-${suffix}`,
		parentSessionId: `profile-assessment-${options.epochId}`,
		planSlug: "test-health-audit",
		eventSink: () => Promise.resolve(),
	});
	if (result.exitCode !== 0)
		return {
			status: "miss",
			controlIds: [],
			issues: [`control backend exited ${result.exitCode}: ${result.stdout}`],
		};
	try {
		const parsed = JSON.parse(await readFile(candidatePath, "utf8")) as unknown;
		const document = `\`\`\`json calibration\n${JSON.stringify(parsed)}\n\`\`\``;
		const record = parseCalibrationDocument(document);
		const validation = validateCalibrationRecord(record, options.epochId);
		return {
			status: validation.valid ? "pass" : "miss",
			controlIds: record.controls.map((control) => control.id),
			...(validation.issues.length > 0 ? { issues: validation.issues } : {}),
		};
	} catch (error) {
		return {
			status: "miss",
			controlIds: [],
			issues: [
				`control candidate is missing or malformed: ${error instanceof Error ? error.message : String(error)}`,
			],
		};
	}
}

async function recordControlWave(
	auditRoot: string,
	epochId: string,
	wave: number,
	result: ControlWaveResult,
): Promise<void> {
	await writeTextAtomic(
		join(
			auditRoot,
			"epochs",
			epochId,
			"control-waves",
			`wave-${String(wave).padStart(4, "0")}.json`,
		),
		`${JSON.stringify(
			{
				schemaVersion: 1,
				epochId,
				wave,
				resampledAt: new Date().toISOString(),
				...result,
			},
			null,
			2,
		)}\n`,
	);
}

async function readControlWaveState(
	auditRoot: string,
	epochId: string,
): Promise<{ lastWave: number; issues: string[] }> {
	const directory = join(auditRoot, "epochs", epochId, "control-waves");
	let names: string[];
	try {
		names = await readdir(directory);
	} catch (error) {
		if (isRecord(error) && error.code === "ENOENT")
			return { lastWave: 0, issues: [] };
		throw error;
	}
	const issues: string[] = [];
	let lastWave = 0;
	for (const name of names.filter((candidate) => candidate.endsWith(".json"))) {
		try {
			const parsed = JSON.parse(
				await readFile(join(directory, name), "utf8"),
			) as unknown;
			if (
				!isRecord(parsed) ||
				parsed.schemaVersion !== 1 ||
				parsed.epochId !== epochId ||
				!Number.isSafeInteger(parsed.wave) ||
				Number(parsed.wave) < 1 ||
				!Array.isArray(parsed.controlIds) ||
				!parsed.controlIds.every((id) => typeof id === "string") ||
				(parsed.status !== "pass" && parsed.status !== "miss")
			)
				throw new Error("malformed control-wave record");
			lastWave = Math.max(lastWave, Number(parsed.wave));
			if (parsed.status !== "pass")
				issues.push(`${name} records a calibration control regression`);
		} catch (error) {
			issues.push(
				`${name}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	return { lastWave, issues };
}

function defaultProcessBackend(): Backend {
	return createCodexBackend({
		globalArgs: readCodexArgsFromEnv(),
		extraArgs: readCodexExecArgsFromEnv(),
	});
}

function isRecord(input: unknown): input is Record<string, unknown> {
	return typeof input === "object" && input !== null && !Array.isArray(input);
}

async function writeTextAtomic(path: string, value: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temporary = join(
		dirname(path),
		`.${randomUUID()}.${path.split("/").at(-1)}.tmp`,
	);
	try {
		const handle = await open(temporary, "wx");
		try {
			await handle.writeFile(value);
			await handle.sync();
		} finally {
			await handle.close();
		}
		await rename(temporary, path);
	} catch (error) {
		await unlink(temporary).catch(() => {});
		throw error;
	}
}
