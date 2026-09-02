import type { Dirent } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { withEntityFileLock } from "../entity-file-lock.ts";
import { createDurableMachineFiles } from "./durable-files.ts";
import {
	consolidationEvidenceKey,
	isSafePosixRelativePath,
} from "./path-safety.ts";
import {
	ensureSafeContainedDirectory,
	readSafeRegularText,
	writeSafeExclusiveText,
} from "./proposal-files.ts";
import type {
	AcceptedJudgmentReceipt,
	AcceptedJudgmentReceiptStore,
	CorpusJudgmentOutput,
} from "./types.ts";

const RECEIPT_ROOT = "memory/agent/consolidations";
const LOCK_PATH = ".cosmonauts/living-memory.lock";

class ReceiptDischargeError extends Error {
	readonly writesCommitted: boolean;

	constructor(error: unknown, writesCommitted: boolean) {
		super(
			`Accepted judgment receipt discharge failed: ${error instanceof Error ? error.message : String(error)}.`,
		);
		this.name = "ReceiptDischargeError";
		this.writesCommitted = writesCommitted;
	}
}

export interface AcceptedJudgmentReceiptStoreWithPaths
	extends AcceptedJudgmentReceiptStore {
	pathFor(batchKey: string): string;
}

export function createAcceptedJudgmentReceiptStore(options: {
	readonly projectRoot: string;
	readonly durableFiles?: ReturnType<typeof createDurableMachineFiles>;
	readonly withLock?: typeof withEntityFileLock;
}): AcceptedJudgmentReceiptStoreWithPaths {
	const durableFiles = options.durableFiles ?? createDurableMachineFiles();
	const lock = options.withLock ?? withEntityFileLock;
	const pathFor = (batchKey: string) =>
		join(
			options.projectRoot,
			RECEIPT_ROOT,
			`${validateBatchKey(batchKey)}.json`,
		);
	const list = async (): Promise<readonly AcceptedJudgmentReceipt[]> => {
		const directory = join(options.projectRoot, RECEIPT_ROOT);
		let entries: Dirent[];
		try {
			const metadata = await lstat(directory);
			if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
				throw new Error(
					`Accepted judgment receipt root is not a regular directory: ${directory}.`,
				);
			}
			entries = await readdir(directory, { withFileTypes: true });
		} catch (error: unknown) {
			if (errorCode(error) === "ENOENT") return Object.freeze([]);
			throw error;
		}
		const receipts: AcceptedJudgmentReceipt[] = [];
		for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
			if (entry.name.startsWith(".")) continue;
			if (!/^[a-f0-9]{64}\.json$/u.test(entry.name)) {
				throw new Error(
					`Accepted judgment receipt has an invalid filename: ${entry.name}.`,
				);
			}
			if (entry.isSymbolicLink() || !entry.isFile()) {
				throw new Error(
					`Accepted judgment receipt occupant is not a regular file: ${entry.name}.`,
				);
			}
			const batchKey = entry.name.slice(0, -".json".length);
			const raw = await readSafeRegularText({
				root: options.projectRoot,
				relativePath: `${RECEIPT_ROOT}/${entry.name}`,
				label: "Accepted judgment receipt",
			});
			if (raw === undefined) {
				throw new Error(
					`Accepted judgment receipt disappeared: ${entry.name}.`,
				);
			}
			receipts.push(parseReceipt(raw, pathFor(batchKey), batchKey));
		}
		return Object.freeze(receipts);
	};
	return {
		pathFor,
		list,
		async dischargeStale(input) {
			const current = new Set(input.currentKeys);
			if (![...current].every(isEvidenceKey)) {
				throw new Error(
					"Accepted judgment receipt discharge requires scope-path-digest keys.",
				);
			}
			const currentDigests = new Set(
				[...current].map((key) => key.split("\0")[2]),
			);
			let releaseUnconfirmed: unknown;
			const action = async () => {
				const stale = (await list()).filter(
					(receipt) =>
						receipt.state === "materialized" &&
						(receipt.inputs === undefined
							? receipt.inputDigests.every(
									(digest) => !currentDigests.has(digest),
								)
							: receipt.inputs.every(
									(evidence) =>
										!current.has(consolidationEvidenceKey(evidence)),
								)),
				);
				const removed: string[] = [];
				for (const receipt of stale) {
					try {
						await durableFiles.removeFile(receipt.path);
						removed.push(receipt.path);
					} catch (error: unknown) {
						throw new ReceiptDischargeError(error, removed.length > 0);
					}
				}
				return Object.freeze(removed);
			};
			const removed = input.lockHeld
				? await action()
				: await lock(join(options.projectRoot, LOCK_PATH), action, {
						retryDelayMs: input.lockOptions.retryMs,
						waitTimeoutMs: input.lockOptions.timeoutMs,
						onReleaseUnconfirmed(error) {
							releaseUnconfirmed = error;
							input.lockOptions.onReleaseUnconfirmed(error);
						},
					});
			if (releaseUnconfirmed !== undefined) {
				throw new Error(
					`Living-memory lock release could not be confirmed after receipt discharge: ${
						releaseUnconfirmed instanceof Error
							? releaseUnconfirmed.message
							: String(releaseUnconfirmed)
					}.`,
				);
			}
			return removed;
		},
		async read(batchKey) {
			const key = validateBatchKey(batchKey);
			const relativePath = `${RECEIPT_ROOT}/${key}.json`;
			const raw = await readSafeRegularText({
				root: options.projectRoot,
				relativePath,
				label: "Accepted judgment receipt",
			});
			if (raw === undefined) return undefined;
			await durableFiles.writeText({ path: pathFor(key), content: raw });
			const confirmed = await readSafeRegularText({
				root: options.projectRoot,
				relativePath,
				label: "Accepted judgment receipt",
			});
			if (confirmed !== raw) {
				throw new Error(
					`Accepted judgment receipt changed while confirming durability: ${pathFor(key)}.`,
				);
			}
			return parseReceipt(raw, pathFor(key), key);
		},
		async write(receipt) {
			const normalized = normalizeReceipt(receipt, pathFor(receipt.batchKey));
			const relativePath = `${RECEIPT_ROOT}/${normalized.batchKey}.json`;
			const content = renderReceipt(normalized);
			const existing = await readSafeRegularText({
				root: options.projectRoot,
				relativePath,
				label: "Accepted judgment receipt",
			});
			if (existing !== undefined) {
				const parsed = parseReceipt(
					existing,
					normalized.path,
					normalized.batchKey,
				);
				if (renderReceipt(parsed) !== content) {
					throw new Error(
						`Accepted judgment receipt identity conflict at ${normalized.path}.`,
					);
				}
				return parsed;
			}
			await writeSafeExclusiveText({
				root: options.projectRoot,
				relativePath,
				content,
				durableFiles,
				label: "Accepted judgment receipt",
			});
			return normalized;
		},
		async markMaterialized(batchKey) {
			const key = validateBatchKey(batchKey);
			const current = await this.read(key);
			if (current === undefined) {
				throw new Error(`Accepted judgment receipt does not exist: ${key}.`);
			}
			if (current.state === "materialized") return current;
			const next = Object.freeze({
				...current,
				state: "materialized" as const,
			});
			await ensureSafeContainedDirectory({
				root: options.projectRoot,
				relativeDirectory: RECEIPT_ROOT,
				label: "Accepted judgment receipt",
			});
			await durableFiles.replaceText({
				path: next.path,
				content: renderReceipt(next),
			});
			return next;
		},
	};
}

function normalizeReceipt(
	receipt: AcceptedJudgmentReceipt,
	expectedPath: string,
): AcceptedJudgmentReceipt {
	const key = validateBatchKey(receipt.batchKey);
	if (receipt.path !== expectedPath) {
		throw new Error("Accepted judgment receipt path is not canonical.");
	}
	if (receipt.schemaVersion !== 1) {
		throw new Error("Accepted judgment receipt schema is unsupported.");
	}
	if (receipt.state !== "accepted" && receipt.state !== "materialized") {
		throw new Error("Accepted judgment receipt state is unsupported.");
	}
	if (
		!Array.isArray(receipt.inputDigests) ||
		!receipt.inputDigests.every((digest) => /^[a-f0-9]{64}$/u.test(digest))
	) {
		throw new Error("Accepted judgment receipt has invalid input digests.");
	}
	if (
		receipt.inputs !== undefined &&
		(!Array.isArray(receipt.inputs) || !receipt.inputs.every(isEvidenceRef))
	) {
		throw new Error("Accepted judgment receipt has invalid input evidence.");
	}
	validateOutput(receipt.output);
	return Object.freeze({
		schemaVersion: 1,
		batchKey: key,
		state: receipt.state,
		inputDigests: Object.freeze([...receipt.inputDigests]),
		...(receipt.inputs === undefined
			? {}
			: {
					inputs: Object.freeze(
						receipt.inputs.map((evidence) => Object.freeze({ ...evidence })),
					),
				}),
		output: Object.freeze(structuredClone(receipt.output)),
		path: expectedPath,
	});
}

function parseReceipt(
	raw: string,
	path: string,
	batchKey: string,
): AcceptedJudgmentReceipt {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		throw new Error(`Accepted judgment receipt is malformed: ${path}.`);
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`Accepted judgment receipt is malformed: ${path}.`);
	}
	const candidate = value as Record<string, unknown>;
	if (
		candidate.schemaVersion !== 1 ||
		candidate.batchKey !== batchKey ||
		(candidate.state !== "accepted" && candidate.state !== "materialized") ||
		!Array.isArray(candidate.inputDigests) ||
		typeof candidate.output !== "object" ||
		candidate.output === null
	) {
		throw new Error(`Accepted judgment receipt is incomplete: ${path}.`);
	}
	return normalizeReceipt(
		{
			schemaVersion: 1,
			batchKey,
			state: candidate.state,
			inputDigests: candidate.inputDigests as string[],
			...(candidate.inputs === undefined
				? {}
				: { inputs: candidate.inputs as AcceptedJudgmentReceipt["inputs"] }),
			output: candidate.output as CorpusJudgmentOutput,
			path,
		},
		path,
	);
}

function renderReceipt(receipt: AcceptedJudgmentReceipt): string {
	return `${JSON.stringify(
		{
			schemaVersion: receipt.schemaVersion,
			batchKey: receipt.batchKey,
			state: receipt.state,
			inputDigests: [...receipt.inputDigests],
			...(receipt.inputs === undefined
				? {}
				: { inputs: receipt.inputs.map((evidence) => ({ ...evidence })) }),
			output: receipt.output,
		},
		null,
		2,
	)}\n`;
}

function validateOutput(output: CorpusJudgmentOutput): void {
	if (output.schemaVersion !== 1 || !Array.isArray(output.observations)) {
		throw new Error("Accepted judgment receipt output is invalid.");
	}
}

function validateBatchKey(value: string): string {
	if (!/^[a-f0-9]{64}$/u.test(value)) {
		throw new Error(
			"Accepted judgment receipt batch key must be a SHA-256 digest.",
		);
	}
	return value;
}

function isEvidenceRef(
	value: unknown,
): value is NonNullable<AcceptedJudgmentReceipt["inputs"]>[number] {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	return (
		Object.keys(candidate).sort().join("\0") ===
			["digest", "id", "path", "scope", "sourceId"].join("\0") &&
		typeof candidate.id === "string" &&
		candidate.id.length > 0 &&
		typeof candidate.sourceId === "string" &&
		candidate.sourceId.length > 0 &&
		(candidate.scope === "project" || candidate.scope === "user") &&
		isSafePosixRelativePath(candidate.path) &&
		typeof candidate.digest === "string" &&
		/^[a-f0-9]{64}$/u.test(candidate.digest)
	);
}

function isEvidenceKey(value: string): boolean {
	const [scope, path, digest, ...rest] = value.split("\0");
	return (
		rest.length === 0 &&
		(scope === "project" || scope === "user") &&
		isSafePosixRelativePath(path) &&
		/^[a-f0-9]{64}$/u.test(digest ?? "")
	);
}

function errorCode(error: unknown): string | undefined {
	return error !== null && typeof error === "object" && "code" in error
		? String((error as NodeJS.ErrnoException).code)
		: undefined;
}
