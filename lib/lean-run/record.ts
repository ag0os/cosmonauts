import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Envelope } from "../envelope/index.ts";
import { writeFileAtomically } from "../fs/atomic-file.ts";
import {
	LEAN_RUN_ROOT,
	RUN_RECORD_FILES,
	RUN_STAGES,
	type RunFacts,
	type RunManifest,
	type RunRecord,
	type RunStage,
	type StageStats,
} from "./types.ts";

export interface RunLocation {
	projectRoot: string;
	id: string;
}

export function runRecordDir({ projectRoot, id }: RunLocation): string {
	return join(projectRoot, LEAN_RUN_ROOT, id);
}

/** Creates the run directory and writes all three top-level files. */
export async function createRunRecord(options: {
	projectRoot: string;
	manifest: RunManifest;
}): Promise<RunRecord> {
	const dir = runRecordDir({
		projectRoot: options.projectRoot,
		id: options.manifest.id,
	});
	await mkdir(join(dir, RUN_RECORD_FILES.envelopes), { recursive: true });
	const record: RunRecord = {
		dir,
		manifest: options.manifest,
		envelopes: {},
		facts: { passes: [] },
		stats: [],
	};
	await saveManifest(record);
	await saveFacts(record);
	await saveStats(record);
	return record;
}

export function saveManifest(record: RunRecord): Promise<void> {
	return writeJson(
		join(record.dir, RUN_RECORD_FILES.manifest),
		record.manifest,
	);
}

export function saveFacts(record: RunRecord): Promise<void> {
	return writeJson(join(record.dir, RUN_RECORD_FILES.facts), record.facts);
}

export function saveStats(record: RunRecord): Promise<void> {
	return writeJson(join(record.dir, RUN_RECORD_FILES.stats), record.stats);
}

export async function saveEnvelope(
	record: RunRecord,
	stage: RunStage,
	envelope: Envelope,
): Promise<void> {
	record.envelopes[stage] = envelope;
	await writeJson(envelopePath(record.dir, stage), envelope);
}

export async function loadRunRecord(location: RunLocation): Promise<RunRecord> {
	const dir = runRecordDir(location);
	const [manifest, facts, stats, envelopes] = await Promise.all([
		readJson<RunManifest>(join(dir, RUN_RECORD_FILES.manifest)),
		readJson<RunFacts>(join(dir, RUN_RECORD_FILES.facts)),
		readJson<StageStats[]>(join(dir, RUN_RECORD_FILES.stats)),
		loadEnvelopes(dir),
	]);
	return { dir, manifest, envelopes, facts, stats };
}

async function loadEnvelopes(
	dir: string,
): Promise<Partial<Record<RunStage, Envelope>>> {
	const present = new Set(await readdir(join(dir, RUN_RECORD_FILES.envelopes)));
	const envelopes: Partial<Record<RunStage, Envelope>> = {};
	for (const stage of RUN_STAGES) {
		if (present.has(`${stage}.json`))
			envelopes[stage] = await readJson<Envelope>(envelopePath(dir, stage));
	}
	return envelopes;
}

function envelopePath(dir: string, stage: RunStage): string {
	return join(dir, RUN_RECORD_FILES.envelopes, `${stage}.json`);
}

function writeJson(path: string, value: unknown): Promise<void> {
	return writeFileAtomically(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson<T>(path: string): Promise<T> {
	return JSON.parse(await readFile(path, "utf-8")) as T;
}
