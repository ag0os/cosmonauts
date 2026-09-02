import { join } from "node:path";
import { createDurableMachineFiles } from "./durable-files.ts";
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

export interface AcceptedJudgmentReceiptStoreWithPaths
	extends AcceptedJudgmentReceiptStore {
	pathFor(batchKey: string): string;
}

export function createAcceptedJudgmentReceiptStore(options: {
	readonly projectRoot: string;
	readonly durableFiles?: ReturnType<typeof createDurableMachineFiles>;
}): AcceptedJudgmentReceiptStoreWithPaths {
	const durableFiles = options.durableFiles ?? createDurableMachineFiles();
	const pathFor = (batchKey: string) =>
		join(
			options.projectRoot,
			RECEIPT_ROOT,
			`${validateBatchKey(batchKey)}.json`,
		);
	return {
		pathFor,
		async read(batchKey) {
			const key = validateBatchKey(batchKey);
			const raw = await readSafeRegularText({
				root: options.projectRoot,
				relativePath: `${RECEIPT_ROOT}/${key}.json`,
				label: "Accepted judgment receipt",
			});
			return raw === undefined
				? undefined
				: parseReceipt(raw, pathFor(key), key);
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
	validateOutput(receipt.output);
	return Object.freeze({
		schemaVersion: 1,
		batchKey: key,
		state: receipt.state,
		inputDigests: Object.freeze([...receipt.inputDigests]),
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
