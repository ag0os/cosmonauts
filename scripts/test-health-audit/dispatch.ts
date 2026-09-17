import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
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
	readCurrentEpochManifest,
	readProfileWorkQueue,
	validateProfileEpoch,
} from "./artifacts.ts";
import type { SourceCensus } from "./source-census.ts";

export interface DispatchProfileUnitsOptions {
	readonly auditRoot: string;
	readonly projectRoot: string;
	readonly backend?: Backend;
}

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
	const result = await options.backend.run(invocation);
	return {
		unitId: options.unit.id,
		exitCode: result.exitCode,
		stdout: result.stdout,
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

Write one JSON object to the candidate path with assessorId, processId, durationMs, peakRssBytes, and profiles. It must contain every assigned identity exactly once. Then publish it only through:

  bun scripts/test-health-audit/cli.ts --audit-root ${shellQuote(options.auditRoot)} publish-unit --unit ${shellQuote(options.unit.id)} --input ${shellQuote(options.candidatePath)}

That command validates current epoch, queue ownership, schema, provenance, freshness, and material-input digests before atomically renaming the one NDJSON shard. Finish successfully only after the command succeeds. Do not write the final shard directly.
`;
}

function defaultProcessBackend(): Backend {
	return createCodexBackend({
		globalArgs: readCodexArgsFromEnv(),
		extraArgs: readCodexExecArgsFromEnv(),
	});
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
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
