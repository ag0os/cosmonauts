export interface PromotionReceipt {
	readonly round: number;
	readonly from: string;
	readonly to: string;
	readonly sha256: string;
}

export interface RatifiedBaselineReceipt {
	readonly round: number;
	readonly path: string;
	readonly sha256: string;
	readonly source: "promotion" | "ratified-baseline";
}

export interface RetirementEvidenceReceipt {
	readonly scope: "project" | "user";
	readonly path: string;
	readonly digest: string;
}

export interface RetiredReceiptEvent {
	readonly kind: "retired";
	readonly round: number;
	readonly id: string;
	readonly path: string;
	readonly digest: string;
	readonly reason: "superseded" | "merged" | "obsolete" | "retire-when-met";
	readonly evidence: readonly RetirementEvidenceReceipt[];
	readonly evidenceReason: string;
	readonly date: string;
}

export interface RestoredReceiptEvent {
	readonly kind: "restored";
	readonly round: number;
	readonly retirementId: string;
	readonly path: string;
	readonly digest: string;
	readonly reason: string;
	readonly date: string;
}

export type RetirementReceiptEvent = RetiredReceiptEvent | RestoredReceiptEvent;

export interface RetirementReceiptState {
	readonly id: string;
	readonly path: string;
	readonly digest: string;
	readonly status: "retired" | "restored";
	readonly round: number;
}

export interface RetirementReceiptInventory {
	readonly promotionRounds: readonly number[];
	readonly promotions: readonly PromotionReceipt[];
	readonly curatedRecords: readonly string[];
	readonly retiredRecords: readonly string[];
	readonly ratifiedBaselines: readonly RatifiedBaselineReceipt[];
	readonly activeBaselines: readonly RatifiedBaselineReceipt[];
	readonly retirementEvents: readonly RetirementReceiptEvent[];
	readonly retirementStates: readonly RetirementReceiptState[];
}

export type RetirementReceiptInventoryResult =
	| {
			readonly kind: "healthy";
			readonly inventory: RetirementReceiptInventory;
	  }
	| { readonly kind: "unhealthy"; readonly issues: readonly string[] };

export async function readRetirementReceiptInventory(options: {
	readonly projectRoot: string;
}): Promise<RetirementReceiptInventoryResult> {
	const issues: string[] = [];
	const ledgerFiles = await readRoundFiles({
		directory: join(options.projectRoot, "missions", "reviews"),
		prefix: "knowledge-surface-promotion-",
		issues,
	});
	const manifestFiles = await readRoundFiles({
		directory: join(options.projectRoot, "memory", "agent", "retirements"),
		prefix: "round-",
		issues,
		strictDirectory: true,
	});

	const promotions: PromotionReceipt[] = [];
	const curatedRecords: string[] = [];
	const retiredRecords: string[] = [];
	const ratifiedBaselines: RatifiedBaselineReceipt[] = [];
	const activeBaselines = new Map<string, RatifiedBaselineReceipt>();
	const promotedPaths = new Set<string>();
	const retiredRecordPaths = new Set<string>();
	const promotionRounds: number[] = [];

	validateContiguousRounds(ledgerFiles, "promotion", issues);
	for (const file of ledgerFiles) {
		const data = parseFrontmatter(file, issues);
		if (!data) continue;
		if (data.kind !== "knowledge-surface-promotion") {
			issues.push(`ledger-kind:${file.path}`);
			continue;
		}
		if (data.round !== file.round) {
			issues.push(`ledger-round:${file.path}`);
			continue;
		}
		promotionRounds.push(file.round);

		const rows = requireArray(
			data.promotions,
			`promotions:${file.path}`,
			issues,
		);
		if (rows) {
			if (
				typeof data.promotedCount !== "number" ||
				!Number.isInteger(data.promotedCount) ||
				data.promotedCount !== rows.length
			) {
				issues.push(`promoted-count:${file.path}`);
			}
			for (const [index, row] of rows.entries()) {
				const context = `promotion:${file.path}:${index}`;
				if (!isExactObject(row, ["from", "to", "sha256"])) {
					issues.push(context);
					continue;
				}
				if (
					!isSafeProposalPath(row.from) ||
					!isSafeKnowledgePath(row.to) ||
					!isSha256(row.sha256)
				) {
					issues.push(context);
					continue;
				}
				if (promotedPaths.has(row.to)) {
					issues.push(`duplicate-promotion:${row.to}`);
					continue;
				}
				promotedPaths.add(row.to);
				const promotion = {
					round: file.round,
					from: row.from,
					to: row.to,
					sha256: row.sha256,
				} satisfies PromotionReceipt;
				promotions.push(promotion);
				activeBaselines.set(row.to, {
					round: file.round,
					path: row.to,
					sha256: row.sha256,
					source: "promotion",
				});
			}
		}

		const curated = parsePathList({
			value: data.curatedRecords,
			context: `curated-records:${file.path}`,
			issues,
		});
		for (const path of curated) {
			curatedRecords.push(path);
			activeBaselines.delete(path);
		}

		const retired = parsePathList({
			value: data.retiredRecords,
			context: `retired-records:${file.path}`,
			issues,
		});
		for (const path of retired) {
			if (retiredRecordPaths.has(path)) {
				issues.push(`duplicate-retired-record:${path}`);
				continue;
			}
			retiredRecordPaths.add(path);
			retiredRecords.push(path);
		}

		const baselines = parseRatifiedBaselines({
			value: data.ratifiedBaselines,
			round: file.round,
			context: `ratified-baselines:${file.path}`,
			issues,
		});
		for (const baseline of baselines) {
			ratifiedBaselines.push(baseline);
			activeBaselines.set(baseline.path, baseline);
		}
	}

	const retirementEvents: RetirementReceiptEvent[] = [];
	const retirementStates = new Map<string, RetirementReceiptState>();
	const activeRetirementByPath = new Map<string, string>();
	validateContiguousRounds(manifestFiles, "manifest", issues);
	for (const file of manifestFiles) {
		const data = parseFrontmatter(file, issues);
		if (!data) continue;
		if (data.kind !== "knowledge-retirement-round") {
			issues.push(`manifest-kind:${file.path}`);
			continue;
		}
		if (data.round !== file.round) {
			issues.push(`manifest-round:${file.path}`);
			continue;
		}
		const events = requireArray(data.events, `events:${file.path}`, issues);
		if (!events) continue;
		if (events.length === 0) issues.push(`empty-events:${file.path}`);
		for (const [index, value] of events.entries()) {
			const context = `event:${file.path}:${index}`;
			if (!isRecord(value) || typeof value.kind !== "string") {
				issues.push(context);
				continue;
			}
			if (value.kind === "retired") {
				const event = parseRetiredEvent(value, file.round, context, issues);
				if (!event) continue;
				if (retirementStates.has(event.id)) {
					issues.push(`duplicate-retirement-id:${event.id}`);
					continue;
				}
				if (activeRetirementByPath.has(event.path)) {
					issues.push(`conflicting-retirement:${event.path}`);
					continue;
				}
				retirementEvents.push(event);
				retirementStates.set(event.id, {
					id: event.id,
					path: event.path,
					digest: event.digest,
					status: "retired",
					round: event.round,
				});
				activeRetirementByPath.set(event.path, event.id);
				continue;
			}
			if (value.kind === "restored") {
				const event = parseRestoredEvent(value, file.round, context, issues);
				if (!event) continue;
				const previous = retirementStates.get(event.retirementId);
				if (!previous) {
					issues.push(`unknown-restoration:${event.retirementId}`);
					continue;
				}
				if (
					previous.status !== "retired" ||
					previous.path !== event.path ||
					previous.digest !== event.digest ||
					activeRetirementByPath.get(event.path) !== event.retirementId
				) {
					issues.push(`conflicting-restoration:${event.retirementId}`);
					continue;
				}
				retirementEvents.push(event);
				retirementStates.set(event.retirementId, {
					id: event.retirementId,
					path: event.path,
					digest: event.digest,
					status: "restored",
					round: event.round,
				});
				activeRetirementByPath.delete(event.path);
				continue;
			}
			issues.push(`unknown-event-kind:${context}`);
		}
	}

	if (issues.length > 0) {
		return { kind: "unhealthy", issues: [...new Set(issues)].sort() };
	}
	return {
		kind: "healthy",
		inventory: {
			promotionRounds,
			promotions,
			curatedRecords,
			retiredRecords,
			ratifiedBaselines,
			activeBaselines: [...activeBaselines.values()].sort(comparePath),
			retirementEvents,
			retirementStates: [...retirementStates.values()].sort(comparePath),
		},
	};
}

interface RoundFile {
	readonly round: number;
	readonly path: string;
	readonly raw: string;
}

async function readRoundFiles(options: {
	readonly directory: string;
	readonly prefix: string;
	readonly issues: string[];
	readonly strictDirectory?: boolean;
}): Promise<RoundFile[]> {
	let entries: Dirent[];
	try {
		entries = await readdir(options.directory, { withFileTypes: true });
	} catch (error: unknown) {
		if (errorCode(error) === "ENOENT") return [];
		options.issues.push(`unreadable-directory:${options.directory}`);
		return [];
	}

	const files: RoundFile[] = [];
	for (const entry of entries) {
		if (!entry.name.startsWith(options.prefix)) {
			if (options.strictDirectory) {
				options.issues.push(
					`unexpected-state:${join(options.directory, entry.name)}`,
				);
			}
			continue;
		}
		const match = entry.name.match(
			new RegExp(`^${escapeRegExp(options.prefix)}([1-9]\\d*)\\.md$`, "u"),
		);
		const path = join(options.directory, entry.name);
		if (!match || !entry.isFile()) {
			options.issues.push(`malformed-round-file:${path}`);
			continue;
		}
		try {
			files.push({
				round: Number(match[1]),
				path,
				raw: await readFile(path, "utf-8"),
			});
		} catch {
			options.issues.push(`unreadable-file:${path}`);
		}
	}
	return files.sort((left, right) => left.round - right.round);
}

function validateContiguousRounds(
	files: readonly RoundFile[],
	kind: "promotion" | "manifest",
	issues: string[],
): void {
	for (const [index, file] of files.entries()) {
		if (file.round !== index + 1) issues.push(`noncontiguous-${kind}-rounds`);
	}
}

function parseFrontmatter(
	file: RoundFile,
	issues: string[],
): Record<string, unknown> | undefined {
	try {
		const data: unknown = matter(file.raw).data;
		if (!isRecord(data)) {
			issues.push(`malformed-frontmatter:${file.path}`);
			return undefined;
		}
		return data;
	} catch {
		issues.push(`malformed-frontmatter:${file.path}`);
		return undefined;
	}
}

function requireArray(
	value: unknown,
	context: string,
	issues: string[],
): readonly unknown[] | undefined {
	if (!Array.isArray(value)) {
		issues.push(context);
		return undefined;
	}
	return value;
}

function parsePathList(options: {
	readonly value: unknown;
	readonly context: string;
	readonly issues: string[];
}): string[] {
	if (options.value === undefined) return [];
	const rows = requireArray(options.value, options.context, options.issues);
	if (!rows) return [];
	const seen = new Set<string>();
	const paths: string[] = [];
	for (const [index, value] of rows.entries()) {
		if (!isSafeKnowledgePath(value)) {
			options.issues.push(`${options.context}:${index}`);
			continue;
		}
		if (seen.has(value)) {
			options.issues.push(`duplicate-${options.context}:${value}`);
			continue;
		}
		seen.add(value);
		paths.push(value);
	}
	return paths;
}

function parseRatifiedBaselines(options: {
	readonly value: unknown;
	readonly round: number;
	readonly context: string;
	readonly issues: string[];
}): RatifiedBaselineReceipt[] {
	if (options.value === undefined) return [];
	const rows = requireArray(options.value, options.context, options.issues);
	if (!rows) return [];
	const seen = new Set<string>();
	const baselines: RatifiedBaselineReceipt[] = [];
	for (const [index, row] of rows.entries()) {
		const context = `${options.context}:${index}`;
		if (!isExactObject(row, ["path", "sha256"])) {
			options.issues.push(context);
			continue;
		}
		if (!isSafeKnowledgePath(row.path) || !isSha256(row.sha256)) {
			options.issues.push(context);
			continue;
		}
		if (seen.has(row.path)) {
			options.issues.push(`duplicate-${options.context}:${row.path}`);
			continue;
		}
		seen.add(row.path);
		baselines.push({
			round: options.round,
			path: row.path,
			sha256: row.sha256,
			source: "ratified-baseline",
		});
	}
	return baselines;
}

function parseRetiredEvent(
	value: Record<string, unknown>,
	round: number,
	context: string,
	issues: string[],
): RetiredReceiptEvent | undefined {
	if (
		!hasExactKeys(value, [
			"kind",
			"id",
			"path",
			"digest",
			"reason",
			"evidence",
			"evidenceReason",
			"date",
		]) ||
		!isIdentifier(value.id) ||
		!isSafeKnowledgePath(value.path) ||
		!isSha256(value.digest) ||
		!isRetirementReason(value.reason) ||
		!isNonEmpty(value.evidenceReason) ||
		!isCanonicalDate(value.date)
	) {
		issues.push(context);
		return undefined;
	}
	const rows = requireArray(value.evidence, `${context}:evidence`, issues);
	if (!rows || rows.length === 0) {
		if (rows?.length === 0) issues.push(`${context}:evidence`);
		return undefined;
	}
	const evidence: RetirementEvidenceReceipt[] = [];
	for (const [index, row] of rows.entries()) {
		if (
			!isExactObject(row, ["scope", "path", "digest"]) ||
			(row.scope !== "project" && row.scope !== "user") ||
			!isSafeRelativePath(row.path) ||
			!isSha256(row.digest)
		) {
			issues.push(`${context}:evidence:${index}`);
			continue;
		}
		evidence.push({ scope: row.scope, path: row.path, digest: row.digest });
	}
	if (evidence.length !== rows.length) return undefined;
	return {
		kind: "retired",
		round,
		id: value.id,
		path: value.path,
		digest: value.digest,
		reason: value.reason,
		evidence,
		evidenceReason: value.evidenceReason,
		date: value.date,
	};
}

function parseRestoredEvent(
	value: Record<string, unknown>,
	round: number,
	context: string,
	issues: string[],
): RestoredReceiptEvent | undefined {
	if (
		!hasExactKeys(value, [
			"kind",
			"retirementId",
			"path",
			"digest",
			"reason",
			"date",
		]) ||
		!isIdentifier(value.retirementId) ||
		!isSafeKnowledgePath(value.path) ||
		!isSha256(value.digest) ||
		!isNonEmpty(value.reason) ||
		!isCanonicalDate(value.date)
	) {
		issues.push(context);
		return undefined;
	}
	return {
		kind: "restored",
		round,
		retirementId: value.retirementId,
		path: value.path,
		digest: value.digest,
		reason: value.reason,
		date: value.date,
	};
}

function isSafeProposalPath(value: unknown): value is string {
	return (
		isSafeRelativePath(value) &&
		value.startsWith("memory/agent/proposals/") &&
		value.endsWith(".md")
	);
}

function isSafeKnowledgePath(value: unknown): value is string {
	return (
		isSafeRelativePath(value) &&
		value.startsWith("knowledge/") &&
		!value.startsWith("knowledge/retired/") &&
		value !== "knowledge/retired.md" &&
		value.endsWith(".md")
	);
}

function isSafeRelativePath(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length > 0 &&
		value.trim() === value &&
		!value.startsWith("/") &&
		!value.includes("\\") &&
		!value.includes("\0") &&
		posix.normalize(value) === value &&
		value.split("/").every((segment) => segment !== "." && segment !== "..")
	);
}

function isSha256(value: unknown): value is string {
	return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function isIdentifier(value: unknown): value is string {
	return typeof value === "string" && /^[a-z0-9][a-z0-9._-]*$/u.test(value);
}

function isRetirementReason(
	value: unknown,
): value is RetiredReceiptEvent["reason"] {
	return (
		typeof value === "string" &&
		["superseded", "merged", "obsolete", "retire-when-met"].includes(value)
	);
}

function isCanonicalDate(value: unknown): value is string {
	if (typeof value !== "string") return false;
	try {
		return new Date(value).toISOString() === value;
	} catch {
		return false;
	}
}

function isNonEmpty(value: unknown): value is string {
	return (
		typeof value === "string" && value.trim() === value && value.length > 0
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExactObject<const Keys extends readonly string[]>(
	value: unknown,
	keys: Keys,
): value is Record<Keys[number], unknown> {
	return isRecord(value) && hasExactKeys(value, keys);
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

function comparePath(
	left: { readonly path: string },
	right: { readonly path: string },
): number {
	return left.path.localeCompare(right.path);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function errorCode(error: unknown): string | undefined {
	return isRecord(error) && typeof error.code === "string"
		? error.code
		: undefined;
}

import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import matter from "gray-matter";
