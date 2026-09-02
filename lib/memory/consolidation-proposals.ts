import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { lstat, mkdir, readdir } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import matter from "gray-matter";
import { withEntityFileLock } from "../entity-file-lock.ts";
import { createDurableMachineFiles } from "./durable-files.ts";
import { isSafePosixRelativePath } from "./path-safety.ts";
import {
	ensureSafeContainedDirectory,
	readSafeRegularText,
	writeSafeExclusiveText,
} from "./proposal-files.ts";
import type {
	ConsolidationEvidenceRef,
	ConsolidationObservation,
	ConsolidationProposalStore,
	ConsolidationProposalView,
	ImproveProposalResolution,
	ImproveProposalResolutionResult,
	ImproveProposalResolver,
	JudgedProposal,
	LivingMemoryLockOptions,
	ProposedMemoryRecord,
} from "./types.ts";

const PROPOSAL_ROOT = "memory/agent/proposals/living-memory";
const RESOLUTION_ROOT = `${PROPOSAL_ROOT}/resolutions`;
const LOCK_PATH = ".cosmonauts/living-memory.lock";

export interface ConsolidationProposalMaterialization
	extends ConsolidationProposalView {
	readonly path: string;
	readonly status: "existing";
	readonly outputType?: ProposedMemoryRecord["type"];
}

export interface ConsolidationProposalStoreWithMaterializations
	extends ConsolidationProposalStore {
	readMaterializations(): Promise<
		readonly ConsolidationProposalMaterialization[]
	>;
}

export function createConsolidationProposalStore(options: {
	readonly projectRoot: string;
	readonly durableFiles?: ReturnType<typeof createDurableMachineFiles>;
}): ConsolidationProposalStoreWithMaterializations {
	const durableFiles = options.durableFiles ?? createDurableMachineFiles();
	return {
		async readEvidence() {
			return Object.freeze(
				(await readProposalMaterializations(options.projectRoot)).flatMap(
					(proposal) => proposal.inputs,
				),
			);
		},
		async readMaterializations() {
			return readProposalMaterializations(options.projectRoot);
		},
		async persist(input) {
			validateProposalInput(input.observation, input.proposal);
			const key = validateKey(input.batchKey);
			const relativePath = `${PROPOSAL_ROOT}/${proposalFileName({
				proposalKind: input.proposal.proposalKind,
				observation: input.observation,
				key,
			})}`;
			const rendered = renderConsolidationProposal({
				key,
				observation: input.observation,
				proposal: input.proposal,
			});
			const contentDigest = sha256(rendered);
			if (input.dryRun) {
				return view({
					proposalKind: input.proposal.proposalKind,
					key,
					inputs: input.observation.inputs,
					contentDigest,
					status: "preview",
				});
			}

			const existing = await readSafeRegularText({
				root: options.projectRoot,
				relativePath,
				label: "Living-memory proposal",
			});
			if (existing !== undefined) {
				if (existing !== rendered) {
					throw new Error(
						`Living-memory proposal identity conflict at ${relativePath}.`,
					);
				}
				const path = absolutePath(options.projectRoot, relativePath);
				await durableFiles.writeText({ path, content: rendered });
				const confirmed = await readSafeRegularText({
					root: options.projectRoot,
					relativePath,
					label: "Living-memory proposal",
				});
				if (confirmed !== rendered) {
					throw new Error(
						`Living-memory proposal changed while confirming durability: ${relativePath}.`,
					);
				}
				return view({
					proposalKind: input.proposal.proposalKind,
					key,
					path,
					inputs: input.observation.inputs,
					contentDigest,
					status: "existing",
				});
			}
			const written = await writeSafeExclusiveText({
				root: options.projectRoot,
				relativePath,
				content: rendered,
				durableFiles,
				label: "Living-memory proposal",
				...(input.signal === undefined ? {} : { signal: input.signal }),
			});
			return view({
				proposalKind: input.proposal.proposalKind,
				key,
				path: written.path,
				inputs: input.observation.inputs,
				contentDigest,
				status: "written",
			});
		},
	};
}

export function createImproveProposalResolver(options: {
	readonly projectRoot: string;
	readonly durableFiles?: ReturnType<typeof createDurableMachineFiles>;
	readonly withLock?: typeof withEntityFileLock;
}): ImproveProposalResolver {
	const projectRoot = resolve(options.projectRoot);
	const durableFiles = options.durableFiles ?? createDurableMachineFiles();
	const lock = options.withLock ?? withEntityFileLock;
	return {
		async resolve(input) {
			throwIfAborted(input.signal);
			validateResolution(input.resolution);
			const date = canonicalDate(input.date);
			const proposalPath = normalizeImproveProposalPath({
				projectRoot,
				path: input.proposalPath,
			});
			await assertOpenImproveProposal({ projectRoot, proposalPath });
			await mkdir(join(projectRoot, ".cosmonauts"), { recursive: true });

			let releaseUnconfirmed: unknown;
			const result = await lock(
				join(projectRoot, LOCK_PATH),
				async () => {
					throwIfAborted(input.signal);
					await assertOpenImproveProposal({ projectRoot, proposalPath });
					return resolveImproveUnderLock({
						projectRoot,
						proposalPath,
						resolution: input.resolution,
						date,
						durableFiles,
						...(input.signal === undefined ? {} : { signal: input.signal }),
					});
				},
				lockOptions(input.lockOptions, (error) => {
					releaseUnconfirmed = error;
					input.lockOptions.onReleaseUnconfirmed(error);
				}),
			);
			if (releaseUnconfirmed !== undefined) {
				throw new Error(
					`Living-memory lock release could not be confirmed after improve resolution: ${errorMessage(releaseUnconfirmed)}.`,
				);
			}
			return result;
		},
	};
}

async function resolveImproveUnderLock(options: {
	readonly projectRoot: string;
	readonly proposalPath: string;
	readonly resolution: ImproveProposalResolution;
	readonly date: string;
	readonly durableFiles: ReturnType<typeof createDurableMachineFiles>;
	readonly signal?: AbortSignal;
}): Promise<ImproveProposalResolutionResult> {
	const proposalRelativePath = toProjectRelative(
		options.projectRoot,
		options.proposalPath,
	);
	const historyRelativePath = `${RESOLUTION_ROOT}/${basename(
		proposalRelativePath,
		".md",
	)}.json`;
	const historyPath = join(
		options.projectRoot,
		...historyRelativePath.split("/"),
	);
	const existing = await readSafeRegularText({
		root: options.projectRoot,
		relativePath: historyRelativePath,
		label: "Living-memory improve resolution",
	});
	if (existing !== undefined) {
		const parsed = parseResolutionHistory(existing, historyPath);
		if (
			parsed.proposalPath !== proposalRelativePath ||
			!sameResolution(parsed.resolution, options.resolution)
		) {
			throw new Error(
				`Living-memory improve resolution conflict at ${historyPath}.`,
			);
		}
		return resolutionResult({
			proposalPath: options.proposalPath,
			historyPath,
			resolution: options.resolution,
			existing: true,
		});
	}

	await ensureSafeContainedDirectory({
		root: options.projectRoot,
		relativeDirectory: RESOLUTION_ROOT,
		label: "Living-memory improve resolution",
	});
	const content = renderResolutionHistory({
		proposalPath: proposalRelativePath,
		resolution: options.resolution,
		date: options.date,
	});
	await writeSafeExclusiveText({
		root: options.projectRoot,
		relativePath: historyRelativePath,
		content,
		durableFiles: options.durableFiles,
		label: "Living-memory improve resolution",
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
	return resolutionResult({
		proposalPath: options.proposalPath,
		historyPath,
		resolution: options.resolution,
		existing: false,
	});
}

function renderResolutionHistory(options: {
	readonly proposalPath: string;
	readonly resolution: ImproveProposalResolution;
	readonly date: string;
}): string {
	const event =
		options.resolution.kind === "actioned"
			? {
					status: "actioned" as const,
					pointer: options.resolution.pointer,
					date: options.date,
				}
			: {
					status: "rejected" as const,
					reason: options.resolution.reason,
					date: options.date,
				};
	return `${JSON.stringify(
		{
			kind: "living-memory-improve-resolution",
			schemaVersion: 1,
			proposalPath: options.proposalPath,
			resolution: options.resolution,
			history: [event, { status: "closed", date: options.date }],
		},
		null,
		2,
	)}\n`;
}

function parseResolutionHistory(
	raw: string,
	path: string,
): {
	readonly proposalPath: string;
	readonly resolution: ImproveProposalResolution;
} {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch (error: unknown) {
		throw new Error(`Living-memory improve resolution is malformed: ${path}.`, {
			cause: error,
		});
	}
	if (
		!isRecord(value) ||
		!hasExactKeys(value, [
			"history",
			"kind",
			"proposalPath",
			"resolution",
			"schemaVersion",
		]) ||
		value.kind !== "living-memory-improve-resolution" ||
		value.schemaVersion !== 1 ||
		typeof value.proposalPath !== "string" ||
		!isResolution(value.resolution) ||
		!Array.isArray(value.history) ||
		value.history.length !== 2 ||
		!isResolutionEvent(value.history[0], value.resolution) ||
		!isClosedEvent(value.history[1]) ||
		value.history[0].date !== value.history[1].date
	) {
		throw new Error(`Living-memory improve resolution is malformed: ${path}.`);
	}
	return {
		proposalPath: value.proposalPath,
		resolution: value.resolution,
	};
}

function isResolutionEvent(
	value: unknown,
	resolution: ImproveProposalResolution,
): value is Record<string, unknown> & { readonly date: string } {
	if (!isRecord(value) || !isNonEmpty(value.date)) return false;
	if (resolution.kind === "rejected") {
		return (
			hasExactKeys(value, ["date", "reason", "status"]) &&
			value.status === "rejected" &&
			value.reason === resolution.reason
		);
	}
	return (
		hasExactKeys(value, ["date", "pointer", "status"]) &&
		value.status === "actioned" &&
		isRecord(value.pointer) &&
		JSON.stringify(value.pointer) === JSON.stringify(resolution.pointer)
	);
}

function isClosedEvent(
	value: unknown,
): value is Record<string, unknown> & { readonly date: string } {
	return (
		isRecord(value) &&
		hasExactKeys(value, ["date", "status"]) &&
		value.status === "closed" &&
		isNonEmpty(value.date)
	);
}

async function assertOpenImproveProposal(options: {
	readonly projectRoot: string;
	readonly proposalPath: string;
}): Promise<void> {
	const relativePath = toProjectRelative(
		options.projectRoot,
		options.proposalPath,
	);
	const raw = await readSafeRegularText({
		root: options.projectRoot,
		relativePath,
		label: "Living-memory improve proposal",
	});
	if (raw === undefined) {
		throw new Error(
			`Living-memory improve proposal does not exist: ${options.proposalPath}.`,
		);
	}
	let data: Record<string, unknown>;
	try {
		const parsed: unknown = matter(raw).data;
		if (!isRecord(parsed)) throw new Error("invalid frontmatter");
		data = parsed;
	} catch (error: unknown) {
		throw new Error(
			`Living-memory improve proposal is malformed: ${options.proposalPath}.`,
			{ cause: error },
		);
	}
	if (
		data.kind !== "living-memory-proposal" ||
		data.schemaVersion !== 1 ||
		data.proposalKind !== "improve" ||
		data.status !== "open"
	) {
		throw new Error(
			`Living-memory improve proposal is not an open improve proposal: ${options.proposalPath}.`,
		);
	}
}

function normalizeImproveProposalPath(options: {
	readonly projectRoot: string;
	readonly path: string;
}): string {
	if (options.path.trim() !== options.path || options.path.length === 0) {
		throw new Error("Living-memory improve proposal path must be non-empty.");
	}
	const absolute = isAbsolute(options.path)
		? resolve(options.path)
		: resolve(options.projectRoot, ...options.path.split("/"));
	const relativePath = toProjectRelative(options.projectRoot, absolute);
	if (
		!relativePath.startsWith(`${PROPOSAL_ROOT}/`) ||
		relativePath.slice(PROPOSAL_ROOT.length + 1).includes("/") ||
		!relativePath.endsWith(".md")
	) {
		throw new Error(
			`Living-memory improve proposal path is outside ${PROPOSAL_ROOT}.`,
		);
	}
	return absolute;
}

function toProjectRelative(projectRoot: string, path: string): string {
	const relativePath = relative(projectRoot, path).split("\\").join("/");
	if (!isSafePosixRelativePath(relativePath)) {
		throw new Error(`Living-memory path escapes the project root: ${path}.`);
	}
	return relativePath;
}

function validateResolution(resolution: ImproveProposalResolution): void {
	if (!isResolution(resolution)) {
		throw new Error("Living-memory improve resolution has an invalid shape.");
	}
}

function isResolution(value: unknown): value is ImproveProposalResolution {
	if (!isRecord(value)) return false;
	if (value.kind === "rejected") {
		return hasExactKeys(value, ["kind", "reason"]) && isNonEmpty(value.reason);
	}
	if (value.kind !== "actioned" || !hasExactKeys(value, ["kind", "pointer"])) {
		return false;
	}
	if (!isRecord(value.pointer)) return false;
	return (
		hasExactKeys(value.pointer, ["kind", "value"]) &&
		["roadmap", "task", "prompt", "skill"].includes(
			String(value.pointer.kind),
		) &&
		isNonEmpty(value.pointer.value)
	);
}

function sameResolution(
	left: ImproveProposalResolution,
	right: ImproveProposalResolution,
): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function resolutionResult(options: {
	readonly proposalPath: string;
	readonly historyPath: string;
	readonly resolution: ImproveProposalResolution;
	readonly existing: boolean;
}): ImproveProposalResolutionResult {
	return Object.freeze({
		kind: options.resolution.kind,
		status: "closed",
		proposalPath: options.proposalPath,
		historyPath: options.historyPath,
		existing: options.existing,
	});
}

function lockOptions(
	options: LivingMemoryLockOptions,
	onReleaseUnconfirmed: (error: unknown) => void,
): {
	readonly retryDelayMs: number;
	readonly waitTimeoutMs: number;
	readonly onReleaseUnconfirmed: (error: unknown) => void;
} {
	if (
		!Number.isFinite(options.retryMs) ||
		options.retryMs <= 0 ||
		!Number.isFinite(options.timeoutMs) ||
		options.timeoutMs <= 0
	) {
		throw new Error("Living-memory improve resolution requires a finite lock.");
	}
	return {
		retryDelayMs: options.retryMs,
		waitTimeoutMs: options.timeoutMs,
		onReleaseUnconfirmed,
	};
}

function canonicalDate(value: Date): string {
	if (Number.isNaN(value.getTime())) {
		throw new Error("Living-memory improve resolution date is invalid.");
	}
	return value.toISOString();
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (!signal?.aborted) return;
	throw new DOMException(
		"Living-memory improve resolution was cancelled.",
		"AbortError",
	);
}

function isNonEmpty(value: unknown): value is string {
	return (
		typeof value === "string" && value.trim() === value && value.length > 0
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
	value: Record<string, unknown>,
	keys: readonly string[],
): boolean {
	const actual = Object.keys(value).sort();
	const expected = [...keys].sort();
	return (
		actual.length === expected.length &&
		actual.every((key, index) => key === expected[index])
	);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function readProposalMaterializations(
	projectRoot: string,
): Promise<readonly ConsolidationProposalMaterialization[]> {
	const directory = absolutePath(projectRoot, PROPOSAL_ROOT);
	let entries: Dirent[];
	try {
		const metadata = await lstat(directory);
		if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
			throw new Error(
				`Living-memory proposal root is not a regular directory: ${directory}.`,
			);
		}
		entries = await readdir(directory, { withFileTypes: true });
	} catch (error: unknown) {
		if (errorCode(error) === "ENOENT") return Object.freeze([]);
		throw error;
	}

	const proposals: ConsolidationProposalMaterialization[] = [];
	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		if (entry.name.startsWith(".") || !entry.name.endsWith(".md")) continue;
		if (entry.isSymbolicLink() || !entry.isFile()) {
			throw new Error(
				`Living-memory proposal occupant is not a regular file: ${entry.name}.`,
			);
		}
		const relativePath = `${PROPOSAL_ROOT}/${entry.name}`;
		const raw = await readSafeRegularText({
			root: projectRoot,
			relativePath,
			label: "Living-memory proposal",
		});
		if (raw === undefined) {
			throw new Error(`Living-memory proposal disappeared: ${relativePath}.`);
		}
		const data = matter(raw).data;
		if (
			data.kind !== "living-memory-proposal" ||
			data.schemaVersion !== 1 ||
			data.status !== "open" ||
			!isProposalKind(data.proposalKind) ||
			typeof data.key !== "string" ||
			!/^[a-f0-9]{64}$/u.test(data.key) ||
			!Array.isArray(data.inputs)
		) {
			throw new Error(`Living-memory proposal is malformed: ${relativePath}.`);
		}
		const inputs: ConsolidationEvidenceRef[] = [];
		for (const input of data.inputs) {
			if (!isEvidenceRef(input)) {
				throw new Error(
					`Living-memory proposal has invalid evidence: ${relativePath}.`,
				);
			}
			inputs.push(Object.freeze({ ...input }));
		}
		const outputType = isProposedMemoryRecordType(data.outputType)
			? data.outputType
			: undefined;
		proposals.push(
			Object.freeze({
				proposalKind: data.proposalKind,
				key: data.key,
				path: absolutePath(projectRoot, relativePath),
				inputs: Object.freeze(inputs),
				contentDigest: sha256(raw),
				status: "existing",
				...(outputType === undefined ? {} : { outputType }),
			}),
		);
	}
	return Object.freeze(proposals);
}

export function renderConsolidationProposal(options: {
	readonly key: string;
	readonly observation: ConsolidationObservation;
	readonly proposal: JudgedProposal;
}): string {
	const body = proposalBody(options.proposal);
	const outputType = proposalOutputType(options.proposal);
	return matter.stringify(body, {
		kind: "living-memory-proposal",
		schemaVersion: 1,
		proposalKind: options.proposal.proposalKind,
		...(outputType === undefined ? {} : { outputType }),
		status: "open",
		key: options.key,
		observation: {
			id: options.observation.id,
			kind: options.observation.kind,
			reason: options.observation.reason,
		},
		inputs: options.observation.inputs.map((input) => ({ ...input })),
	});
}

function proposalOutputType(
	proposal: JudgedProposal,
): ProposedMemoryRecord["type"] | undefined {
	return proposal.proposalKind === "create"
		? proposal.record.type
		: proposal.proposalKind === "merge"
			? proposal.replacement.type
			: undefined;
}

function isProposalKind(
	value: unknown,
): value is ConsolidationProposalView["proposalKind"] {
	return ["create", "merge", "retire", "improve"].includes(String(value));
}

function isProposedMemoryRecordType(
	value: unknown,
): value is ProposedMemoryRecord["type"] {
	return ["decision", "trade-off", "gotcha", "convention", "note"].includes(
		String(value),
	);
}

function proposalBody(proposal: JudgedProposal): string {
	switch (proposal.proposalKind) {
		case "create":
			return recordBody("Proposed record", proposal.record);
		case "merge":
			return recordBody("Proposed replacement", proposal.replacement);
		case "retire":
			return `# Proposed retirement\n\nReason: ${proposal.reason}\n`;
		case "improve":
			return [
				"# Proposed improvement",
				"",
				"| Observed problem | What happened | Suggested improvement | Why it helps |",
				"|---|---|---|---|",
				`| ${tableCell(proposal.observedProblem)} | ${tableCell(proposal.whatHappened)} | ${tableCell(proposal.suggestedImprovement)} | ${tableCell(proposal.whyItHelps)} |`,
				"",
			].join("\n");
	}
}

function recordBody(
	heading: string,
	record: Extract<JudgedProposal, { proposalKind: "create" }>["record"],
): string {
	return [
		`# ${heading}`,
		"",
		"```json",
		JSON.stringify(record, null, 2),
		"```",
		"",
	].join("\n");
}

function proposalFileName(options: {
	readonly proposalKind: JudgedProposal["proposalKind"];
	readonly observation: ConsolidationObservation;
	readonly key: string;
}): string {
	const trailing = /(?:^|[-_])(\d+)$/u.exec(options.observation.id)?.[1];
	const slot = trailing
		? trailing.padStart(3, "0")
		: createHash("sha256")
				.update(options.observation.id)
				.digest("hex")
				.slice(0, 6);
	return `${options.proposalKind}-${slot}-${options.key}.md`;
}

function validateProposalInput(
	observation: ConsolidationObservation,
	proposal: JudgedProposal,
): void {
	if (observation.inputs.length === 0) {
		throw new Error("Living-memory proposals require evidence inputs.");
	}
	if (proposal.proposalKind === "merge" && observation.inputs.length < 1) {
		throw new Error(
			"Living-memory merge proposals require replacement inputs.",
		);
	}
}

function isEvidenceRef(value: unknown): value is ConsolidationEvidenceRef {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	const keys = Object.keys(candidate).sort();
	if (
		keys.join("\0") !== ["digest", "id", "path", "scope", "sourceId"].join("\0")
	) {
		return false;
	}
	return (
		typeof candidate.id === "string" &&
		candidate.id.length > 0 &&
		typeof candidate.sourceId === "string" &&
		candidate.sourceId.length > 0 &&
		(candidate.scope === "project" || candidate.scope === "user") &&
		typeof candidate.path === "string" &&
		isSafePosixRelativePath(candidate.path) &&
		typeof candidate.digest === "string" &&
		/^[a-f0-9]{64}$/u.test(candidate.digest)
	);
}

function validateKey(value: string): string {
	if (!/^[a-f0-9]{64}$/u.test(value)) {
		throw new Error("Living-memory proposal keys must be SHA-256 digests.");
	}
	return value;
}

function view(options: {
	readonly proposalKind: JudgedProposal["proposalKind"];
	readonly key: string;
	readonly path?: string;
	readonly inputs: readonly ConsolidationEvidenceRef[];
	readonly contentDigest: string;
	readonly status: ConsolidationProposalView["status"];
}): ConsolidationProposalView {
	return Object.freeze({
		proposalKind: options.proposalKind,
		key: options.key,
		...(options.path === undefined ? {} : { path: options.path }),
		inputs: Object.freeze(
			options.inputs.map((input) => Object.freeze({ ...input })),
		),
		contentDigest: options.contentDigest,
		status: options.status,
	});
}

function absolutePath(root: string, relativePath: string): string {
	return `${root.replace(/\/$/u, "")}/${relativePath}`;
}

function tableCell(value: string): string {
	return value.replace(/\|/gu, "\\|").replace(/\r?\n/gu, "<br>");
}

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function errorCode(error: unknown): string | undefined {
	return error !== null && typeof error === "object" && "code" in error
		? String((error as NodeJS.ErrnoException).code)
		: undefined;
}
