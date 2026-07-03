import { access, readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import matter from "gray-matter";
import { resolveArchitectureMapConfig } from "./config.ts";
import {
	computeArchitectureMapStatFingerprint,
	createProjectSnapshot,
} from "./freshness.ts";
import {
	type ArchitectureMapBundleFile,
	hasArchitectureMap,
	recoverArchitectureMapStorage,
	storeArchitectureMapBundle,
} from "./store.ts";
import {
	ARCHITECTURE_MAP_GENERATOR_VERSION,
	ARCHITECTURE_MAP_OUTPUT_DIR,
	type GenerateArchitectureMapOptions,
	type GenerateArchitectureMapResult,
	type ModuleDependent,
	type ModuleNarrative,
	type ModuleRecord,
	type ModuleSkeleton,
	type NarrativeProvider,
	type NarrativeStatus,
	OKF_RECORD_TYPES,
	type PublicExport,
} from "./types.ts";

interface PriorRecord {
	readonly raw: string;
	readonly timestamp?: string;
	readonly generatedAt?: string;
	readonly sourceHash?: string;
	readonly skeletonHash?: string;
	readonly narrative?: ModuleNarrative;
}

interface RecordRenderInput {
	readonly path: string;
	readonly frontmatter: Record<string, unknown>;
	readonly body: string;
	readonly includeGeneratedAt?: boolean;
}

export async function generateArchitectureMap(
	options: GenerateArchitectureMapOptions,
): Promise<GenerateArchitectureMapResult> {
	await recoverArchitectureMapStorage(options.projectRoot);
	const hadPreviousMap = await hasArchitectureMap(options.projectRoot);

	try {
		const config = await resolveArchitectureMapConfig({
			projectRoot: options.projectRoot,
			overrides: options.configOverrides,
		});
		const snapshot = await createProjectSnapshot({
			projectRoot: options.projectRoot,
			config,
			analyzer: options.analyzer,
		});

		if (!(await isSupportedTypeScriptProject(options.projectRoot, snapshot))) {
			return {
				kind: "unsupported",
				reason:
					"Architecture map generation supports TypeScript projects with tsconfig.json or included .ts/.tsx source files.",
			};
		}

		const [statFingerprint, analysis] = await Promise.all([
			computeArchitectureMapStatFingerprint({
				projectRoot: options.projectRoot,
				config,
				analyzer: options.analyzer,
			}),
			options.analyzer.analyze({
				projectRoot: options.projectRoot,
				config,
				snapshot,
			}),
		]);
		const priorRecords = await readPriorRecords(options.projectRoot);
		const records = await buildModuleRecords({
			skeletons: analysis.modules,
			priorRecords,
			narrativeEnabled: config.narrative.enabled,
			maxNarratives: config.narrative.maxModulesPerRun,
			narrativeProvider: options.narrativeProvider,
		});
		const bundle = renderArchitectureMapBundle({
			projectHash: snapshot.hash,
			statFingerprint: statFingerprint.hash,
			records,
			priorRecords,
			now: new Date().toISOString(),
		});
		const stored = await storeArchitectureMapBundle({
			projectRoot: options.projectRoot,
			files: bundle.files,
		});

		if (stored.kind === "unchanged") return { kind: "unchanged" };
		return {
			kind: "written",
			changedFiles: stored.changedFiles,
			pendingModules: records
				.filter((record) => record.narrative.status === "pending")
				.map((record) => record.resource),
		};
	} catch (error: unknown) {
		return {
			kind: "failed",
			error: errorMessage(error),
			previousMapIntact:
				hadPreviousMap && (await hasArchitectureMap(options.projectRoot)),
		};
	}
}

async function buildModuleRecords(options: {
	readonly skeletons: readonly ModuleSkeleton[];
	readonly priorRecords: ReadonlyMap<string, PriorRecord>;
	readonly narrativeEnabled: boolean;
	readonly maxNarratives: number;
	readonly narrativeProvider?: NarrativeProvider;
}): Promise<readonly ModuleRecord[]> {
	const { skeletons } = options;
	const sorted = [...skeletons].sort((left, right) =>
		left.resource.localeCompare(right.resource),
	);
	const dependents = deriveDependents(sorted);
	let narrativeAttempts = 0;

	const records: ModuleRecord[] = [];
	for (const skeleton of sorted) {
		const shardPath = shardPathForResource(skeleton.resource);
		const prior = options.priorRecords.get(shardPath);
		const narrative = await resolveModuleNarrative({
			skeleton,
			prior,
			narrativeEnabled: options.narrativeEnabled,
			narrativeProvider: options.narrativeProvider,
			canAttemptNarrative: narrativeAttempts < options.maxNarratives,
			onNarrativeAttempt: () => {
				narrativeAttempts += 1;
			},
		});

		records.push({
			...skeleton,
			dependents: dependents.get(skeleton.resource) ?? [],
			narrative,
			shardPath,
		});
	}

	return records;
}

async function resolveModuleNarrative(options: {
	readonly skeleton: ModuleSkeleton;
	readonly prior?: PriorRecord;
	readonly narrativeEnabled: boolean;
	readonly narrativeProvider?: NarrativeProvider;
	readonly canAttemptNarrative: boolean;
	readonly onNarrativeAttempt: () => void;
}): Promise<ModuleNarrative> {
	const priorNarrative = options.prior?.narrative;
	if (
		options.prior?.skeletonHash === options.skeleton.skeletonHash &&
		priorNarrative
	) {
		if (priorNarrative.status !== "pending") {
			if (options.prior.sourceHash === options.skeleton.sourceHash) {
				return priorNarrative;
			}
			return {
				...priorNarrative,
				status: "reused",
			};
		}

		if (!shouldAttemptNarrative(options)) {
			return priorNarrative;
		}
	}

	if (!options.narrativeEnabled) {
		return pendingNarrative(
			options.skeleton.resource,
			"Narrative generation is disabled for this run.",
		);
	}
	if (!options.narrativeProvider) {
		return pendingNarrative(
			options.skeleton.resource,
			"Narrative generation has no provider for this run.",
		);
	}
	if (!options.canAttemptNarrative) {
		return pendingNarrative(
			options.skeleton.resource,
			"Narrative generation budget was exhausted for this run.",
		);
	}

	options.onNarrativeAttempt();
	try {
		const generated = await options.narrativeProvider.generate({
			skeleton: options.skeleton,
			priorNarrative,
		});
		return {
			status: "generated",
			oneLiner: generated.oneLiner,
			text: generated.text,
		};
	} catch (error: unknown) {
		return pendingNarrative(
			options.skeleton.resource,
			`Narrative generation failed: ${errorMessage(error)}`,
		);
	}
}

function shouldAttemptNarrative(options: {
	readonly narrativeEnabled: boolean;
	readonly narrativeProvider?: NarrativeProvider;
	readonly canAttemptNarrative: boolean;
}): boolean {
	return (
		options.narrativeEnabled &&
		!!options.narrativeProvider &&
		options.canAttemptNarrative
	);
}

function deriveDependents(
	skeletons: readonly ModuleSkeleton[],
): ReadonlyMap<string, readonly ModuleDependent[]> {
	const knownModules = new Set(skeletons.map((skeleton) => skeleton.resource));
	const dependents = new Map<string, Set<string>>();

	for (const skeleton of skeletons) {
		for (const dependency of skeleton.dependencies) {
			if (!knownModules.has(dependency.resource)) continue;
			const moduleDependents =
				dependents.get(dependency.resource) ?? new Set<string>();
			moduleDependents.add(skeleton.resource);
			dependents.set(dependency.resource, moduleDependents);
		}
	}

	return new Map(
		[...dependents.entries()].map(([resource, resources]) => [
			resource,
			[...resources]
				.sort()
				.map((dependentResource) => ({ resource: dependentResource })),
		]),
	);
}

function pendingNarrative(resource: string, reason: string): ModuleNarrative {
	return {
		status: "pending",
		oneLiner: `Narrative pending for \`${resource}\`.`,
		pendingReason: reason,
	};
}

function renderArchitectureMapBundle(options: {
	readonly projectHash: string;
	readonly statFingerprint: string;
	readonly records: readonly ModuleRecord[];
	readonly priorRecords: ReadonlyMap<string, PriorRecord>;
	readonly now: string;
}): { readonly files: readonly ArchitectureMapBundleFile[] } {
	const narrativeStatus = combinedNarrativeStatus(options.records);
	const inputs: RecordRenderInput[] = [
		{
			path: "index.md",
			includeGeneratedAt: true,
			frontmatter: {
				type: OKF_RECORD_TYPES.index,
				title: "Architecture Map",
				description: "Generated TypeScript code structure map.",
				resource: `${ARCHITECTURE_MAP_OUTPUT_DIR}/index.md`,
				tags: ["architecture-map", "generated", "typescript"],
				generatorVersion: ARCHITECTURE_MAP_GENERATOR_VERSION,
				projectHash: options.projectHash,
				statFingerprint: options.statFingerprint,
				moduleCount: options.records.length,
				narrativeStatus,
			},
			body: renderIndexBody(options.records),
		},
		...options.records.map((record) => ({
			path: record.shardPath,
			frontmatter: {
				type: OKF_RECORD_TYPES.module,
				title: record.resource,
				description: `Generated TypeScript code structure shard for ${record.resource}.`,
				resource: record.shardPath,
				tags: ["architecture-map", "generated", "typescript", "module"],
				generatorVersion: ARCHITECTURE_MAP_GENERATOR_VERSION,
				sourceHash: record.sourceHash,
				skeletonHash: record.skeletonHash,
				narrativeStatus: record.narrative.status,
			},
			body: renderModuleBody(record),
		})),
	];

	return {
		files: inputs.map((input) => ({
			path: input.path,
			content: renderStableRecord(input, options.priorRecords, options.now),
		})),
	};
}

function renderStableRecord(
	input: RecordRenderInput,
	priorRecords: ReadonlyMap<string, PriorRecord>,
	now: string,
): string {
	validateRenderedPath(input.path);
	const prior = priorRecords.get(input.path);
	const previousTimestamp = prior?.timestamp;
	const previousGeneratedAt = prior?.generatedAt;
	const firstPass = renderMarkdownRecord({
		...input,
		timestamp: previousTimestamp ?? now,
		generatedAt: input.includeGeneratedAt
			? (previousGeneratedAt ?? previousTimestamp ?? now)
			: undefined,
	});

	if (prior && stableComparable(prior.raw) === stableComparable(firstPass)) {
		return firstPass;
	}

	return renderMarkdownRecord({
		...input,
		timestamp: now,
		generatedAt: input.includeGeneratedAt ? now : undefined,
	});
}

function renderMarkdownRecord(
	input: RecordRenderInput & {
		readonly timestamp: string;
		readonly generatedAt?: string;
	},
): string {
	const frontmatter = {
		...input.frontmatter,
		timestamp: input.timestamp,
		...(input.generatedAt ? { generatedAt: input.generatedAt } : {}),
	};
	const rendered = matter.stringify(
		ensureTrailingNewline(input.body),
		frontmatter,
	);
	return ensureTrailingNewline(rendered);
}

function renderIndexBody(records: readonly ModuleRecord[]): string {
	const lines = [
		"# Architecture Map",
		"",
		"Generated TypeScript code structure map.",
		"",
		"## OKF Vocabulary",
		"- `code-structure-index`: project-wide architecture map index.",
		"- `code-structure-module`: per-module code structure shard.",
		"",
		"## Module Inventory",
		`- Modules discovered: ${records.length}`,
	];

	if (records.length === 0) {
		lines.push("No modules discovered.");
	} else {
		for (const record of records) {
			lines.push(`- \`${record.resource}\` - ${oneLineNarrative(record)}`);
		}
	}

	lines.push("", "## Dependency Overview");
	if (records.length === 0) {
		lines.push("No module dependencies discovered.");
	} else {
		for (const record of records) {
			const dependencies = record.dependencies.map(
				(dependency) => `\`${dependency.resource}\``,
			);
			lines.push(
				`- \`${record.resource}\` -> ${
					dependencies.length > 0 ? dependencies.join(", ") : "none"
				}`,
			);
		}
	}

	return lines.join("\n");
}

function renderModuleBody(record: ModuleRecord): string {
	const lines = [
		`# ${record.resource}`,
		"",
		oneLineNarrative(record),
		"",
		"## Narrative",
	];

	if (record.narrative.text) {
		lines.push(record.narrative.text);
	} else {
		lines.push(record.narrative.pendingReason ?? "Narrative pending.");
	}

	lines.push("", "## Files");
	pushList(
		lines,
		record.files.map((file) => `\`${file}\``),
	);

	lines.push("", "## Public Interface");
	pushList(lines, record.publicInterface.map(renderPublicExport));

	lines.push("", "## Dependencies");
	pushList(
		lines,
		record.dependencies.map((dependency) => {
			const importedBy = dependency.importedBy
				.map((file) => `\`${file}\``)
				.join(", ");
			return `\`${dependency.resource}\` (imported by: ${importedBy})`;
		}),
	);

	lines.push("", "## Dependents");
	pushList(
		lines,
		record.dependents.map((dependent) => `\`${dependent.resource}\``),
	);

	lines.push("", "## External Dependencies");
	pushList(
		lines,
		record.externalDependencies.map((dependency) => `\`${dependency}\``),
	);

	return lines.join("\n");
}

function renderPublicExport(publicExport: PublicExport): string {
	return `\`${publicExport.kind}\` \`${publicExport.name}\` - \`${publicExport.signature}\``;
}

function pushList(lines: string[], values: readonly string[]): void {
	if (values.length === 0) {
		lines.push("- none");
		return;
	}
	for (const value of values) {
		lines.push(`- ${value}`);
	}
}

function oneLineNarrative(record: ModuleRecord): string {
	return (
		record.narrative.oneLiner ?? `Narrative pending for \`${record.resource}\`.`
	);
}

function combinedNarrativeStatus(
	records: readonly ModuleRecord[],
): NarrativeStatus {
	if (records.some((record) => record.narrative.status === "pending")) {
		return "pending";
	}
	if (records.some((record) => record.narrative.status === "reused")) {
		return "reused";
	}
	return "generated";
}

async function readPriorRecords(
	projectRoot: string,
): Promise<ReadonlyMap<string, PriorRecord>> {
	const root = join(projectRoot, ARCHITECTURE_MAP_OUTPUT_DIR);
	const records = new Map<string, PriorRecord>();
	try {
		await readPriorRecordsFromDir(root, root, records);
	} catch (error: unknown) {
		if (isNotFoundError(error)) return records;
		throw error;
	}
	return records;
}

async function readPriorRecordsFromDir(
	root: string,
	dir: string,
	records: Map<string, PriorRecord>,
): Promise<void> {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const absolute = join(dir, entry.name);
		if (!entry.isDirectory()) {
			if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
			records.set(
				relative(root, absolute).replaceAll("\\", "/"),
				await readPriorRecord(absolute),
			);
			continue;
		}
		await readPriorRecordsFromDir(root, absolute, records);
	}
}

async function readPriorRecord(absolute: string): Promise<PriorRecord> {
	const raw = await readFile(absolute, "utf-8");
	const parsed = matter(raw);
	return {
		raw,
		timestamp: frontmatterString(parsed.data, "timestamp"),
		generatedAt: frontmatterString(parsed.data, "generatedAt"),
		sourceHash: frontmatterString(parsed.data, "sourceHash"),
		skeletonHash: frontmatterString(parsed.data, "skeletonHash"),
		narrative: parsePriorNarrative(parsed.data, parsed.content),
	};
}

function frontmatterString(
	data: Record<string, unknown>,
	key: string,
): string | undefined {
	const value = data[key];
	return typeof value === "string" ? value : undefined;
}

function parsePriorNarrative(
	frontmatter: Record<string, unknown>,
	content: string,
): ModuleNarrative | undefined {
	const status = parseNarrativeStatus(frontmatter.narrativeStatus);
	if (!status) return undefined;

	const oneLiner = extractOneLineNarrative(content);
	const narrativeBody = extractSection(content, "## Narrative", "## Files");
	if (status === "pending") {
		return {
			status,
			...(oneLiner ? { oneLiner } : {}),
			...(narrativeBody ? { pendingReason: narrativeBody } : {}),
		};
	}

	return {
		status,
		...(oneLiner ? { oneLiner } : {}),
		...(narrativeBody ? { text: narrativeBody } : {}),
	};
}

function parseNarrativeStatus(value: unknown): NarrativeStatus | undefined {
	if (value === "generated" || value === "reused" || value === "pending") {
		return value;
	}
	return undefined;
}

function extractOneLineNarrative(content: string): string | undefined {
	const lines = content.split(/\r?\n/u);
	const narrativeHeading = lines.indexOf("## Narrative");
	const searchEnd = narrativeHeading === -1 ? lines.length : narrativeHeading;
	for (let index = 1; index < searchEnd; index += 1) {
		const line = lines[index]?.trim();
		if (line) return line;
	}
	return undefined;
}

function extractSection(
	content: string,
	startHeading: string,
	endHeading: string,
): string | undefined {
	const lines = content.split(/\r?\n/u);
	const start = lines.indexOf(startHeading);
	if (start === -1) return undefined;
	const end = lines.findIndex(
		(line, index) => index > start && line === endHeading,
	);
	const body = lines
		.slice(start + 1, end === -1 ? lines.length : end)
		.join("\n")
		.trim();
	return body.length > 0 ? body : undefined;
}

function stableComparable(raw: string): string {
	const parsed = matter(raw);
	const data = { ...parsed.data };
	delete data.timestamp;
	delete data.generatedAt;
	return `${JSON.stringify(sortObject(data))}\n${parsed.content}`;
}

function sortObject(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortObject);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => [key, sortObject(entry)]),
	);
}

function shardPathForResource(resource: string): string {
	const normalizedResource = resource === "." ? "root" : resource;
	return `modules/${normalizedResource}.md`;
}

function validateRenderedPath(path: string): void {
	if (
		path.length === 0 ||
		path.includes("\\") ||
		path.startsWith("/") ||
		path.split("/").includes("..")
	) {
		throw new Error(`Unsafe architecture map render path: ${path}`);
	}

	const targetRoot = resolve("/", ARCHITECTURE_MAP_OUTPUT_DIR);
	const absolute = resolve(targetRoot, ...path.split("/"));
	const rel = relative(targetRoot, absolute);
	if (rel === "" || rel.startsWith("..")) {
		throw new Error(`Unsafe architecture map render path: ${path}`);
	}
}

async function isSupportedTypeScriptProject(
	projectRoot: string,
	snapshot: { readonly files: readonly { readonly path: string }[] },
): Promise<boolean> {
	if (
		snapshot.files.some(
			(file) => file.path.endsWith(".ts") || file.path.endsWith(".tsx"),
		)
	) {
		return true;
	}
	try {
		await access(join(projectRoot, "tsconfig.json"));
		return true;
	} catch (error: unknown) {
		if (isNotFoundError(error)) return false;
		throw error;
	}
}

function ensureTrailingNewline(value: string): string {
	return value.endsWith("\n") ? value : `${value}\n`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isNotFoundError(error: unknown): boolean {
	return (
		error !== null &&
		typeof error === "object" &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "ENOENT"
	);
}
