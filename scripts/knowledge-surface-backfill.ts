import { createHash, randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import {
	mkdir,
	open,
	readdir,
	readFile,
	rename,
	rm,
	stat,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import {
	deriveKnowledgeProposalIdentity,
	type KnowledgeRecordFields,
	parseHumanKnowledgeRecord,
} from "../lib/memory/knowledge-records.ts";
import { createPiSpawner } from "../lib/orchestration/agent-spawner.ts";
import type { AgentSpawner } from "../lib/orchestration/types.ts";
import { discoverFrameworkBundledPackageDirs } from "../lib/packages/dev-bundled.ts";
import { CosmonautsRuntime } from "../lib/runtime.ts";

const CONFIG_RESOURCE = join(".cosmonauts", "config.json");
const SNAPSHOT_RESOURCE = `${CONFIG_RESOURCE}.backfill-prerun`;
const INVENTORY_RESOURCE = join(
	"tests",
	"fixtures",
	"knowledge-seed-inventory.json",
);
const SCAN_COST_RESOURCE = join(
	"missions",
	"reviews",
	"knowledge-surface-scan-cost.md",
);
const ARCHIVED_PLANS_RESOURCE = join("missions", "archive", "plans");
const PROPOSALS_RESOURCE = join("memory", "agent", "proposals");
const REVIEW_INDEX_RESOURCE = join(PROPOSALS_RESOURCE, "backfill-review.json");
const QUALIFIED_DISTILLER_ID = "coding/distiller";

export interface BackfillConfigIO {
	read(path: string): Promise<Buffer>;
	writeAtomic(path: string, bytes: Buffer): Promise<void>;
	remove(path: string): Promise<void>;
}

export interface KnowledgeSurfaceBackfillOptions {
	readonly projectRoot: string;
	readonly distillSlug: (
		slug: string,
		signal: AbortSignal | undefined,
	) => Promise<void>;
	readonly now?: () => Date;
	readonly signal?: AbortSignal;
	readonly configIO?: BackfillConfigIO;
}

export interface BackfillSourceInput {
	readonly planSlug: string;
	readonly path: string;
	readonly sha256: string;
	readonly verified: boolean;
}

export interface InspectedKnowledgeSurfaceBackfill {
	readonly missingSlugs: readonly string[];
	readonly sourceInputs: readonly BackfillSourceInput[];
	readonly scanCostVerdict: string;
}

export interface KnowledgeSurfaceBackfillResult {
	readonly reviewIndexPath: string;
	readonly missingSlugs: readonly string[];
	readonly proposalCount: number;
	readonly aggregateProposalDigest: string;
}

interface FrozenBackfillInventory {
	readonly archivedPlanSlugs: readonly string[];
	readonly distilledSlugs: readonly string[];
	readonly missingSlugs: readonly string[];
	readonly sourceInputs: Readonly<
		Record<
			string,
			readonly { readonly path: string; readonly sha256: string }[]
		>
	>;
}

interface ProposalIndexEntry {
	readonly planSlug: string;
	readonly path: string;
	readonly sha256: string;
}

interface BackfillReviewIndex {
	readonly version: 1;
	readonly plan: "knowledge-surface";
	readonly generatedAt: string;
	readonly beforeConfigDigest: string;
	readonly temporaryConfigDigest: string;
	readonly afterConfigDigest: string;
	readonly missingSlugs: readonly string[];
	readonly sourceInputs: readonly Omit<BackfillSourceInput, "verified">[];
	readonly proposals: readonly ProposalIndexEntry[];
	readonly aggregateProposalDigest: string;
	readonly noPromotion: true;
}

interface BackfillSnapshotFile {
	readonly version: 1;
	readonly configPath: string;
	readonly sha256: string;
	readonly encoding: "base64";
	readonly bytes: string;
}

export interface BackfillSnapshot {
	readonly configPath: string;
	readonly sha256: string;
	readonly configBytes: Buffer;
}

export async function inspectKnowledgeSurfaceBackfill(options: {
	readonly projectRoot: string;
}): Promise<InspectedKnowledgeSurfaceBackfill> {
	const projectRoot = resolve(options.projectRoot);
	const scanCostVerdict = await readScanCostVerdict(projectRoot);
	if (scanCostVerdict !== "pass") {
		throw new Error(
			`Knowledge surface backfill requires ${SCAN_COST_RESOURCE} with verdict: pass; found ${JSON.stringify(scanCostVerdict)}.`,
		);
	}

	const inventory = await readFrozenInventory(projectRoot);
	const archivedPlanSlugs = await listArchivedPlanSlugs(projectRoot);
	if (!sameStrings(archivedPlanSlugs, inventory.archivedPlanSlugs)) {
		throw inventoryAmendmentError(
			"archived plan directories no longer match the frozen inventory",
		);
	}
	const distilled = new Set(inventory.distilledSlugs);
	const derivedMissing = archivedPlanSlugs.filter(
		(slug) => !distilled.has(slug),
	);
	if (!sameStrings(derivedMissing, inventory.missingSlugs)) {
		throw inventoryAmendmentError(
			"the execution-time missing-slug derivation no longer matches the frozen set",
		);
	}

	const sourceInputs = await verifySourceInputs({
		projectRoot,
		missingSlugs: derivedMissing,
		inventory,
	});
	if (sourceInputs.some((input) => !input.verified)) {
		throw inventoryAmendmentError(
			"one or more frozen backfill source digests changed",
		);
	}

	return {
		missingSlugs: derivedMissing,
		sourceInputs,
		scanCostVerdict,
	};
}

export async function runKnowledgeSurfaceBackfill(
	options: KnowledgeSurfaceBackfillOptions,
): Promise<KnowledgeSurfaceBackfillResult> {
	throwIfAborted(options.signal);
	const projectRoot = resolve(options.projectRoot);
	const inspected = await inspectKnowledgeSurfaceBackfill({ projectRoot });
	const now = options.now ?? (() => new Date());
	const configIO = options.configIO ?? defaultConfigIO;
	const configPath = join(projectRoot, CONFIG_RESOURCE);
	const snapshotPath = join(projectRoot, SNAPSHOT_RESOURCE);
	const reviewIndexPath = join(projectRoot, REVIEW_INDEX_RESOURCE);
	const beforeConfigBytes = await configIO.read(configPath);
	const beforeConfigDigest = sha256(beforeConfigBytes);
	const temporaryConfigBytes = enableKnowledgeSurface(beforeConfigBytes);
	const temporaryConfigDigest = sha256(temporaryConfigBytes);
	const snapshotBytes = renderSnapshot({
		configPath: CONFIG_RESOURCE.split(sep).join("/"),
		configBytes: beforeConfigBytes,
	});
	const indexedProposals = await readIndexedProposals(projectRoot);
	const indexedPaths = new Set(indexedProposals.map(({ path }) => path));
	const proposalEntries = new Map(
		indexedProposals.map((entry) => [entry.path, entry]),
	);
	const sameBatchPaths = new Set<string>();
	let temporaryConfigWritten = false;
	let failure: unknown;

	await configIO.writeAtomic(snapshotPath, snapshotBytes);
	try {
		throwIfAborted(options.signal);
		await configIO.writeAtomic(configPath, temporaryConfigBytes);
		temporaryConfigWritten = true;

		for (const slug of inspected.missingSlugs) {
			throwIfAborted(options.signal);
			await removeUnindexedMachineProposals({
				projectRoot,
				slug,
				indexedPaths,
			});
			const beforeDistill = new Set(
				await listSlugProposalPaths(projectRoot, slug),
			);
			let afterDistill: string[] = [];
			try {
				await options.distillSlug(slug, options.signal);
			} finally {
				afterDistill = await listSlugProposalPaths(projectRoot, slug);
				for (const path of afterDistill) {
					if (!beforeDistill.has(path) && !indexedPaths.has(path)) {
						sameBatchPaths.add(path);
					}
				}
			}
			throwIfAborted(options.signal);
			const validated = await validateSlugProposals({
				projectRoot,
				slug,
				paths: afterDistill,
				attributableSources: new Set([
					...inspected.sourceInputs
						.filter((input) => input.planSlug === slug)
						.map((input) => input.path),
					...(await listLabeledTaskSources(projectRoot, slug)),
				]),
			});
			for (const entry of validated) proposalEntries.set(entry.path, entry);
		}
	} catch (error: unknown) {
		failure = error;
	}

	if (temporaryConfigWritten) {
		try {
			const currentConfigBytes = await configIO.read(configPath);
			if (!currentConfigBytes.equals(temporaryConfigBytes)) {
				throw new Error(
					`Backfill config conflict: preserved concurrent edit at ${configPath}; pre-run config remains at ${snapshotPath}.`,
				);
			}
			await configIO.writeAtomic(configPath, beforeConfigBytes);
			await configIO.remove(snapshotPath);
		} catch (error: unknown) {
			failure = error;
		}
	}

	if (failure !== undefined) {
		await removeSameBatchProposals(projectRoot, sameBatchPaths);
		throw failure;
	}

	try {
		const afterConfigBytes = await configIO.read(configPath);
		const proposals = [...proposalEntries.values()].sort((left, right) =>
			left.path.localeCompare(right.path),
		);
		const aggregateProposalDigest = proposalSetDigest(proposals);
		const index: BackfillReviewIndex = {
			version: 1,
			plan: "knowledge-surface",
			generatedAt: now().toISOString(),
			beforeConfigDigest,
			temporaryConfigDigest,
			afterConfigDigest: sha256(afterConfigBytes),
			missingSlugs: inspected.missingSlugs,
			sourceInputs: inspected.sourceInputs.map(
				({ planSlug, path, sha256: digest }) => ({
					planSlug,
					path,
					sha256: digest,
				}),
			),
			proposals,
			aggregateProposalDigest,
			noPromotion: true,
		};
		await writeFileAtomic(reviewIndexPath, renderJson(index));
		return {
			reviewIndexPath,
			missingSlugs: inspected.missingSlugs,
			proposalCount: proposals.length,
			aggregateProposalDigest,
		};
	} catch (error: unknown) {
		await removeSameBatchProposals(projectRoot, sameBatchPaths);
		throw error;
	}
}

export async function readBackfillSnapshot(
	snapshotPath: string,
): Promise<BackfillSnapshot> {
	const parsed = JSON.parse(await readFile(snapshotPath, "utf-8")) as unknown;
	if (!isRecord(parsed)) throw new Error("Invalid backfill recovery snapshot.");
	if (
		parsed.version !== 1 ||
		typeof parsed.configPath !== "string" ||
		typeof parsed.sha256 !== "string" ||
		parsed.encoding !== "base64" ||
		typeof parsed.bytes !== "string"
	) {
		throw new Error("Invalid backfill recovery snapshot fields.");
	}
	const configBytes = Buffer.from(parsed.bytes, "base64");
	if (sha256(configBytes) !== parsed.sha256) {
		throw new Error("Backfill recovery snapshot digest mismatch.");
	}
	return {
		configPath: parsed.configPath,
		sha256: parsed.sha256,
		configBytes,
	};
}

async function runProductionBackfill(): Promise<KnowledgeSurfaceBackfillResult> {
	const projectRoot = process.cwd();
	const frameworkRoot = resolve(fileURLToPath(import.meta.url), "..", "..");
	let spawner: AgentSpawner | undefined;
	const distillSlug = async (slug: string, signal: AbortSignal | undefined) => {
		process.stderr.write(`[backfill] distilling ${slug}\n`);
		if (!spawner) {
			const domainsDir = join(frameworkRoot, "domains");
			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: domainsDir,
				projectRoot,
				bundledDirs: await discoverFrameworkBundledPackageDirs(frameworkRoot),
			});
			spawner = createPiSpawner(runtime.agentRegistry, domainsDir, {
				resolver: runtime.domainResolver,
			});
		}
		const result = await spawner.spawn({
			role: QUALIFIED_DISTILLER_ID,
			cwd: projectRoot,
			prompt: `Distill the archived plan ${JSON.stringify(slug)} into 3-15 attributable OKF proposals for human review.`,
			signal,
			projectSkills: ["archive"],
			skillPaths: [],
		});
		if (!result.success) {
			throw new Error(
				`Distiller failed for ${slug}: ${result.error ?? "unknown failure"}`,
			);
		}
		process.stderr.write(`[backfill] completed session for ${slug}\n`);
	};

	try {
		return await runKnowledgeSurfaceBackfill({ projectRoot, distillSlug });
	} finally {
		spawner?.dispose();
	}
}

async function readScanCostVerdict(projectRoot: string): Promise<string> {
	const raw = await readFile(join(projectRoot, SCAN_COST_RESOURCE), "utf-8");
	const verdict = matter(raw).data.verdict;
	return typeof verdict === "string" ? verdict : "missing";
}

async function readFrozenInventory(
	projectRoot: string,
): Promise<FrozenBackfillInventory> {
	const parsed = JSON.parse(
		await readFile(join(projectRoot, INVENTORY_RESOURCE), "utf-8"),
	) as unknown;
	if (!isRecord(parsed) || !isRecord(parsed.backfill)) {
		throw inventoryAmendmentError("the frozen backfill inventory is malformed");
	}
	const backfill = parsed.backfill;
	if (
		!isStringArray(backfill.archivedPlanSlugs) ||
		!isStringArray(backfill.distilledSlugs) ||
		!isStringArray(backfill.missingSlugs) ||
		!isRecord(backfill.sourceInputs)
	) {
		throw inventoryAmendmentError(
			"the frozen backfill inventory is incomplete",
		);
	}
	const sourceInputs: Record<string, { path: string; sha256: string }[]> = {};
	for (const [slug, value] of Object.entries(backfill.sourceInputs)) {
		if (!Array.isArray(value)) {
			throw inventoryAmendmentError(`source inputs for ${slug} are malformed`);
		}
		sourceInputs[slug] = value.map((entry) => {
			if (
				!isRecord(entry) ||
				typeof entry.path !== "string" ||
				typeof entry.sha256 !== "string"
			) {
				throw inventoryAmendmentError(
					`source inputs for ${slug} are malformed`,
				);
			}
			return { path: entry.path, sha256: entry.sha256 };
		});
	}
	return {
		archivedPlanSlugs: [...backfill.archivedPlanSlugs].sort(),
		distilledSlugs: [...backfill.distilledSlugs].sort(),
		missingSlugs: [...backfill.missingSlugs].sort(),
		sourceInputs,
	};
}

async function listArchivedPlanSlugs(projectRoot: string): Promise<string[]> {
	const entries = await readdir(join(projectRoot, ARCHIVED_PLANS_RESOURCE), {
		withFileTypes: true,
	});
	return entries
		.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
		.map((entry) => entry.name)
		.sort();
}

async function verifySourceInputs(options: {
	readonly projectRoot: string;
	readonly missingSlugs: readonly string[];
	readonly inventory: FrozenBackfillInventory;
}): Promise<BackfillSourceInput[]> {
	const inputs: BackfillSourceInput[] = [];
	for (const planSlug of options.missingSlugs) {
		const frozen = options.inventory.sourceInputs[planSlug];
		if (!frozen || frozen.length === 0) {
			throw inventoryAmendmentError(
				`source inputs are missing for ${planSlug}`,
			);
		}
		for (const input of frozen) {
			const raw = await readFile(join(options.projectRoot, input.path));
			inputs.push({
				planSlug,
				path: input.path,
				sha256: input.sha256,
				verified: sha256(raw) === input.sha256,
			});
		}
	}
	return inputs.sort(
		(left, right) =>
			left.planSlug.localeCompare(right.planSlug) ||
			left.path.localeCompare(right.path),
	);
}

function enableKnowledgeSurface(configBytes: Buffer): Buffer {
	const parsed = JSON.parse(configBytes.toString("utf-8")) as unknown;
	if (!isRecord(parsed)) {
		throw new Error("Backfill config must be a JSON object.");
	}
	if (
		isRecord(parsed.knowledgeSurface) &&
		parsed.knowledgeSurface.enabled === true
	) {
		throw new Error(
			"Knowledge surface is already enabled; the supervised backfill requires the project gate to begin OFF.",
		);
	}
	return renderJson({
		...parsed,
		knowledgeSurface: {
			...(isRecord(parsed.knowledgeSurface) ? parsed.knowledgeSurface : {}),
			enabled: true,
		},
	});
}

function renderSnapshot(options: {
	readonly configPath: string;
	readonly configBytes: Buffer;
}): Buffer {
	const snapshot: BackfillSnapshotFile = {
		version: 1,
		configPath: options.configPath,
		sha256: sha256(options.configBytes),
		encoding: "base64",
		bytes: options.configBytes.toString("base64"),
	};
	return renderJson(snapshot);
}

async function readIndexedProposals(
	projectRoot: string,
): Promise<ProposalIndexEntry[]> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(
			await readFile(join(projectRoot, REVIEW_INDEX_RESOURCE), "utf-8"),
		);
	} catch (error: unknown) {
		if (errorCode(error) === "ENOENT") return [];
		throw error;
	}
	if (!isRecord(parsed) || !Array.isArray(parsed.proposals)) return [];
	const entries: ProposalIndexEntry[] = [];
	for (const value of parsed.proposals) {
		if (
			!isRecord(value) ||
			typeof value.planSlug !== "string" ||
			typeof value.path !== "string" ||
			typeof value.sha256 !== "string" ||
			!isProposalResource(value.path, value.planSlug)
		) {
			continue;
		}
		try {
			const raw = await readFile(join(projectRoot, value.path));
			if (sha256(raw) === value.sha256) {
				entries.push({
					planSlug: value.planSlug,
					path: value.path,
					sha256: value.sha256,
				});
			}
		} catch (error: unknown) {
			if (errorCode(error) !== "ENOENT") throw error;
		}
	}
	return entries;
}

async function removeUnindexedMachineProposals(options: {
	readonly projectRoot: string;
	readonly slug: string;
	readonly indexedPaths: ReadonlySet<string>;
}): Promise<void> {
	for (const path of await listSlugProposalPaths(
		options.projectRoot,
		options.slug,
	)) {
		if (options.indexedPaths.has(path)) continue;
		const absolutePath = join(options.projectRoot, path);
		const raw = await readFile(absolutePath, "utf-8");
		const parsed = matter(raw).data;
		if (
			parsed.writer === QUALIFIED_DISTILLER_ID &&
			parsed.resource === `knowledge/${options.slug}/${basename(absolutePath)}`
		) {
			await rm(absolutePath);
		}
	}
}

async function listSlugProposalPaths(
	projectRoot: string,
	slug: string,
): Promise<string[]> {
	const directory = join(projectRoot, PROPOSALS_RESOURCE, slug);
	let entries: Dirent[];
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch (error: unknown) {
		if (errorCode(error) === "ENOENT") return [];
		throw error;
	}
	return entries
		.filter(
			(entry) =>
				entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith(".md"),
		)
		.map((entry) => relativeResource(projectRoot, join(directory, entry.name)))
		.sort();
}

async function validateSlugProposals(options: {
	readonly projectRoot: string;
	readonly slug: string;
	readonly paths: readonly string[];
	readonly attributableSources: ReadonlySet<string>;
}): Promise<ProposalIndexEntry[]> {
	if (options.paths.length < 3 || options.paths.length > 15) {
		throw new Error(
			`Distiller ${QUALIFIED_DISTILLER_ID} produced ${options.paths.length} proposals for ${options.slug}; expected 3-15.`,
		);
	}
	const entries: ProposalIndexEntry[] = [];
	for (const path of options.paths) {
		const absolutePath = join(options.projectRoot, path);
		const [raw, metadata] = await Promise.all([
			readFile(absolutePath, "utf-8"),
			stat(absolutePath),
		]);
		const physicalResource = `${options.slug}/${basename(path)}`;
		const parsed = parseHumanKnowledgeRecord({
			raw,
			physicalResource,
			physicalScope: "project",
			mtime: metadata.mtime,
		});
		if (!parsed.ok) {
			throw new Error(`Invalid OKF proposal ${path}: ${parsed.message}`);
		}
		const record = parsed.record;
		if (
			record.writer !== QUALIFIED_DISTILLER_ID ||
			!record.source ||
			!record.date
		) {
			throw new Error(
				`Proposal ${path} lacks qualified writer/source/date provenance.`,
			);
		}
		if (
			!isAttributableSource(
				options.slug,
				record.source,
				record.tags,
				options.attributableSources,
			)
		) {
			throw new Error(
				`Proposal ${path} source is not attributable to ${options.slug}.`,
			);
		}
		if (!hasCanonicalProposalIdentity(options.slug, record)) {
			throw new Error(`Proposal ${path} does not have its canonical identity.`);
		}
		entries.push({
			planSlug: options.slug,
			path,
			sha256: sha256(raw),
		});
	}
	return entries;
}

function hasCanonicalProposalIdentity(
	planSlug: string,
	record: KnowledgeRecordFields,
): boolean {
	if (!record.writer || !record.source) return false;
	const stable = {
		planSlug,
		type: record.type,
		title: record.title,
		description: record.description,
		content: record.content,
		tags: record.tags,
		source: record.source,
		writer: record.writer,
	};
	try {
		if (deriveKnowledgeProposalIdentity(stable).resource === record.resource) {
			return true;
		}
		return (
			deriveKnowledgeProposalIdentity({
				...stable,
				sourceDate: record.date,
			}).resource === record.resource
		);
	} catch {
		return false;
	}
}

function isAttributableSource(
	slug: string,
	source: string,
	_tags: readonly string[],
	attributableSources: ReadonlySet<string>,
): boolean {
	if (attributableSources.has(source)) return true;
	for (const root of [
		`missions/plans/${slug}/`,
		`missions/archive/plans/${slug}/`,
		`missions/sessions/${slug}/`,
		`missions/archive/sessions/${slug}/`,
	]) {
		if (source.startsWith(root)) return true;
	}
	return false;
}

async function listLabeledTaskSources(
	projectRoot: string,
	slug: string,
): Promise<string[]> {
	const paths: string[] = [];
	for (const resource of [
		join("missions", "tasks"),
		join("missions", "archive", "tasks"),
	]) {
		await collectMarkdownFiles(join(projectRoot, resource), paths);
	}
	const label = `plan:${slug}`;
	const matches: string[] = [];
	for (const absolutePath of paths) {
		const labels = matter(await readFile(absolutePath, "utf-8")).data.labels;
		if (Array.isArray(labels) && labels.includes(label)) {
			matches.push(relativeResource(projectRoot, absolutePath));
		}
	}
	return matches.sort();
}

async function collectMarkdownFiles(
	directory: string,
	paths: string[],
): Promise<void> {
	let entries: Dirent[];
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch (error: unknown) {
		if (errorCode(error) === "ENOENT") return;
		throw error;
	}
	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory() && !entry.isSymbolicLink()) {
			await collectMarkdownFiles(path, paths);
		} else if (
			entry.isFile() &&
			!entry.isSymbolicLink() &&
			entry.name.endsWith(".md")
		) {
			paths.push(path);
		}
	}
}

async function removeSameBatchProposals(
	projectRoot: string,
	paths: ReadonlySet<string>,
): Promise<void> {
	await Promise.all(
		[...paths].map((path) => rm(join(projectRoot, path), { force: true })),
	);
}

function proposalSetDigest(entries: readonly ProposalIndexEntry[]): string {
	const canonical = [...entries]
		.sort((left, right) => left.path.localeCompare(right.path))
		.map(({ path, sha256: digest }) => `${path}\0${digest}\n`)
		.join("");
	return sha256(canonical);
}

function isProposalResource(path: string, slug: string): boolean {
	const expectedPrefix = `memory/agent/proposals/${slug}/`;
	return (
		path.startsWith(expectedPrefix) &&
		path.endsWith(".md") &&
		!path.slice(expectedPrefix.length).includes("/") &&
		!path.includes("..")
	);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) throw new Error("Knowledge surface backfill aborted.");
}

function inventoryAmendmentError(reason: string): Error {
	return new Error(
		`Backfill halted for an on-record inventory amendment: ${reason}.`,
	);
}

function sameStrings(
	left: readonly string[],
	right: readonly string[],
): boolean {
	return (
		left.length === right.length &&
		left.every((value, index) => value === right[index])
	);
}

function isStringArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) && value.every((entry) => typeof entry === "string")
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function renderJson(value: unknown): Buffer {
	return Buffer.from(`${JSON.stringify(value, null, "\t")}\n`);
}

function sha256(value: string | Buffer): string {
	return createHash("sha256").update(value).digest("hex");
}

function relativeResource(projectRoot: string, absolutePath: string): string {
	return relative(projectRoot, absolutePath).split(sep).join("/");
}

function errorCode(error: unknown): string | undefined {
	return error && typeof error === "object" && "code" in error
		? String((error as NodeJS.ErrnoException).code)
		: undefined;
}

async function writeFileAtomic(path: string, bytes: Buffer): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temporaryPath = join(
		dirname(path),
		`.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
	);
	const handle = await open(temporaryPath, "wx");
	try {
		await handle.writeFile(bytes);
		await handle.sync();
	} finally {
		await handle.close();
	}
	try {
		await rename(temporaryPath, path);
	} catch (error: unknown) {
		await rm(temporaryPath, { force: true });
		throw error;
	}
}

const defaultConfigIO: BackfillConfigIO = {
	read: async (path) => readFile(path),
	writeAtomic: writeFileAtomic,
	remove: async (path) => rm(path, { force: true }),
};

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
	runProductionBackfill().then(
		(result) => process.stdout.write(`${JSON.stringify(result)}\n`),
		(error: unknown) => {
			const detail =
				error instanceof Error
					? `${error.name}: ${error.message}\n${error.stack ?? ""}`
					: String(error);
			process.stderr.write(`${detail}\n`);
			process.exitCode = 1;
		},
	);
}
