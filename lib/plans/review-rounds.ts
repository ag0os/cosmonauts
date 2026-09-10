import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import matter from "gray-matter";
import { scanMarkdown } from "../artifacts/markdown-scan.ts";
import { validateSlug } from "./plan-manager.ts";

export type PlanReviewRoundBlockReason =
	| "invalid-plan-slug"
	| "plan-not-found"
	| "unsafe-plan-directory"
	| "plan-artifact-io"
	| "plan-status-indeterminate"
	| "inactive-plan"
	| "review-artifact-io"
	| "unsafe-review-entry"
	| "invalid-review-name"
	| "duplicate-review-round"
	| "review-round-gap"
	| "no-assessable-review-round"
	| "malformed-review"
	| "stale-review-round"
	| "missing-review-reference";

export interface AssessPlanReviewRoundOptions {
	projectRoot: string;
	planSlug: string;
	reviewRound?: number;
	assessment: "target" | "addressed";
}

export interface AcceptedPlanReviewRound {
	status: "accepted";
	planSlug: string;
	reviewRound: number;
	reviewFile: string;
	allocationRounds: readonly number[];
	assessableRounds: readonly number[];
	blockingFindingIds: readonly string[];
	requiresRevision: boolean;
}

export interface BlockedPlanReviewRound {
	status: "blocked";
	reason: PlanReviewRoundBlockReason;
	planSlug: string;
	reviewRound?: number;
	latestReviewRound?: number;
	findingIds?: readonly string[];
}

export type PlanReviewRoundAssessment =
	| AcceptedPlanReviewRound
	| BlockedPlanReviewRound;

interface ReviewEntry {
	name: string;
	round: number;
	content: string;
}

interface ReviewFinding {
	id: string;
	severity: "high" | "medium" | "low";
}

type FindingsParse =
	| { status: "not-assessable" }
	| { status: "malformed" }
	| { status: "parsed"; findings: ReviewFinding[] };

const REVIEW_NAME_REGEX = /^review-(\d+)\.md$/;
const FINDING_ID_REGEX = /^PR-\d{3}$/;
const DECISION_ENTRY_REGEX = /^-\s+\*\*(D-\d{3})\s+(?:-|–|—)\s+.+?\*\*/;
const FINDING_FIELDS = [
	"id",
	"dimension",
	"severity",
	"title",
	"plan_refs",
	"code_refs",
	"description",
] as const;
const REVIEW_DIMENSIONS = new Set([
	"interface-fidelity",
	"duplication",
	"state-sync",
	"risk-blast-radius",
	"user-experience",
	"behavior-spec",
	"architecture-record",
	"quality-contract",
	"lifecycle-invariant",
	"constraint-ownership",
	"scope-size",
]);

export async function assessPlanReviewRound(
	options: AssessPlanReviewRoundOptions,
): Promise<PlanReviewRoundAssessment> {
	if (!isValidSlug(options.planSlug)) {
		return block(options, "invalid-plan-slug");
	}
	if (
		options.reviewRound !== undefined &&
		(!Number.isSafeInteger(options.reviewRound) || options.reviewRound <= 0)
	) {
		return block(options, "invalid-review-name");
	}

	const plansRoot = join(options.projectRoot, "missions", "plans");
	const planDirectory = join(plansRoot, options.planSlug);
	const containment = await assessPlanDirectory(plansRoot, planDirectory);
	if (containment !== "safe") {
		return block(options, containment);
	}

	const planRead = await readRegularFile(join(planDirectory, "plan.md"));
	if (planRead.status === "missing") {
		return block(options, "plan-not-found");
	}
	if (planRead.status !== "read") {
		return block(options, "plan-artifact-io");
	}
	const planStatus = parseStrictPlanStatus(planRead.content);
	if (planStatus === "indeterminate") {
		return block(options, "plan-status-indeterminate");
	}
	if (planStatus !== "active") {
		return block(options, "inactive-plan");
	}

	const reviewEntries = await readReviewEntries(planDirectory);
	if (reviewEntries.status === "blocked") {
		return block(options, reviewEntries.reason);
	}
	const allocationRounds = reviewEntries.entries.map((entry) => entry.round);
	if (allocationRounds.length === 0) {
		return block(options, "no-assessable-review-round");
	}
	const maximumAllocationRound = allocationRounds.at(-1) ?? 0;
	for (let round = 1; round <= maximumAllocationRound; round += 1) {
		if (allocationRounds[round - 1] !== round) {
			return block(options, "review-round-gap");
		}
	}

	const assessable: Array<ReviewEntry & { findings: ReviewFinding[] }> = [];
	for (const entry of reviewEntries.entries) {
		const parsed = parseFindings(entry.content);
		if (parsed.status === "malformed") {
			return block(options, "malformed-review", {
				reviewRound: entry.round,
			});
		}
		if (parsed.status === "parsed") {
			assessable.push({ ...entry, findings: parsed.findings });
		}
	}

	const latest = assessable.at(-1);
	if (!latest) {
		return block(options, "no-assessable-review-round");
	}
	if (
		options.reviewRound !== undefined &&
		options.reviewRound !== latest.round
	) {
		return block(options, "stale-review-round", {
			latestReviewRound: latest.round,
		});
	}

	const blockingFindingIds = latest.findings
		.filter((finding) => finding.severity !== "low")
		.map((finding) => finding.id);
	const missingReferences =
		options.assessment === "addressed"
			? findMissingReferences({
					planMarkdown: planRead.content,
					reviewFile: latest.name,
					findingIds: blockingFindingIds,
				})
			: [];
	if (missingReferences.length > 0) {
		return block(options, "missing-review-reference", {
			reviewRound: latest.round,
			latestReviewRound: latest.round,
			findingIds: missingReferences,
		});
	}

	return {
		status: "accepted",
		planSlug: options.planSlug,
		reviewRound: latest.round,
		reviewFile: latest.name,
		allocationRounds,
		assessableRounds: assessable.map((entry) => entry.round),
		blockingFindingIds,
		requiresRevision: blockingFindingIds.length > 0,
	};
}

function block(
	options: AssessPlanReviewRoundOptions,
	reason: PlanReviewRoundBlockReason,
	details: Pick<
		BlockedPlanReviewRound,
		"reviewRound" | "latestReviewRound" | "findingIds"
	> = {},
): BlockedPlanReviewRound {
	return {
		status: "blocked",
		reason,
		planSlug: options.planSlug,
		...(details.reviewRound !== undefined
			? { reviewRound: details.reviewRound }
			: options.reviewRound !== undefined
				? { reviewRound: options.reviewRound }
				: {}),
		...(details.latestReviewRound !== undefined
			? { latestReviewRound: details.latestReviewRound }
			: {}),
		...(details.findingIds ? { findingIds: details.findingIds } : {}),
	};
}

function isValidSlug(slug: string): boolean {
	try {
		validateSlug(slug);
		return true;
	} catch {
		return false;
	}
}

async function assessPlanDirectory(
	plansRoot: string,
	planDirectory: string,
): Promise<"safe" | PlanReviewRoundBlockReason> {
	let directoryStat: Awaited<ReturnType<typeof lstat>>;
	try {
		directoryStat = await lstat(planDirectory);
	} catch (error) {
		return isErrno(error, "ENOENT") ? "plan-not-found" : "plan-artifact-io";
	}
	if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
		return "unsafe-plan-directory";
	}

	try {
		const [resolvedRoot, resolvedPlan] = await Promise.all([
			realpath(plansRoot),
			realpath(planDirectory),
		]);
		return pathIsWithin(resolvedRoot, resolvedPlan)
			? "safe"
			: "unsafe-plan-directory";
	} catch {
		return "plan-artifact-io";
	}
}

function pathIsWithin(parent: string, candidate: string): boolean {
	const resolvedRelative = relative(parent, candidate);
	return (
		resolvedRelative === "" ||
		(!isAbsolute(resolvedRelative) &&
			resolvedRelative !== ".." &&
			!resolvedRelative.startsWith(`..${sep}`))
	);
}

async function readRegularFile(
	path: string,
): Promise<
	| { status: "read"; content: string }
	| { status: "missing" }
	| { status: "unsafe" }
	| { status: "io" }
> {
	let handle: Awaited<ReturnType<typeof open>> | undefined;
	try {
		handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
		const stats = await handle.stat();
		if (!stats.isFile()) return { status: "unsafe" };
		return { status: "read", content: await handle.readFile("utf-8") };
	} catch (error) {
		if (isErrno(error, "ENOENT")) return { status: "missing" };
		if (isErrno(error, "ELOOP")) return { status: "unsafe" };
		return { status: "io" };
	} finally {
		await handle?.close().catch(() => undefined);
	}
}

function parseStrictPlanStatus(
	content: string,
): "active" | "inactive" | "indeterminate" {
	try {
		const status = matter(content).data.status;
		if (typeof status !== "string") return "indeterminate";
		const normalized = status.trim().toLowerCase();
		if (normalized === "active") return "active";
		if (normalized === "completed") return "inactive";
		return "indeterminate";
	} catch {
		return "indeterminate";
	}
}

async function readReviewEntries(
	planDirectory: string,
): Promise<
	| { status: "read"; entries: ReviewEntry[] }
	| { status: "blocked"; reason: PlanReviewRoundBlockReason }
> {
	const directoryEntries = await readdir(planDirectory, {
		withFileTypes: true,
	}).catch(() => undefined);
	if (!directoryEntries) {
		return { status: "blocked", reason: "review-artifact-io" };
	}

	const recognized: Array<{ name: string; round: number }> = [];
	for (const entry of directoryEntries) {
		const round = reviewRoundForName(entry.name);
		if (round === undefined) continue;
		if (round === "invalid") {
			return { status: "blocked", reason: "invalid-review-name" };
		}
		if (!entry.isFile() || entry.isSymbolicLink()) {
			return { status: "blocked", reason: "unsafe-review-entry" };
		}
		recognized.push({ name: entry.name, round });
	}

	recognized.sort(
		(left, right) =>
			left.round - right.round || left.name.localeCompare(right.name),
	);
	if (
		recognized.some(
			(entry, index) => entry.round === recognized[index - 1]?.round,
		)
	) {
		return { status: "blocked", reason: "duplicate-review-round" };
	}

	const entries: ReviewEntry[] = [];
	for (const entry of recognized) {
		const read = await readRegularFile(join(planDirectory, entry.name));
		if (read.status === "unsafe") {
			return { status: "blocked", reason: "unsafe-review-entry" };
		}
		if (read.status !== "read") {
			return { status: "blocked", reason: "review-artifact-io" };
		}
		entries.push({ ...entry, content: read.content });
	}
	return { status: "read", entries };
}

function reviewRoundForName(name: string): number | "invalid" | undefined {
	if (name === "review.md") return 1;
	const digits = name.match(REVIEW_NAME_REGEX)?.[1];
	if (!digits) return undefined;
	let value: bigint;
	try {
		value = BigInt(digits);
	} catch {
		return "invalid";
	}
	if (value === 0n) return undefined;
	if (value > BigInt(Number.MAX_SAFE_INTEGER)) return "invalid";
	return Number(value);
}

function parseFindings(content: string): FindingsParse {
	const scan = scanMarkdown(content);
	const headingIndexes = scan.fenceMaskedLines.flatMap((line, index) =>
		line.trimEnd() === "## Findings" ? [index] : [],
	);
	if (headingIndexes.length === 0) return { status: "not-assessable" };
	if (headingIndexes.length > 1) return { status: "malformed" };
	const start = (headingIndexes[0] ?? 0) + 1;
	const relativeEnd = scan.fenceMaskedLines
		.slice(start)
		.findIndex((line) => /^##\s+\S/.test(line));
	const end = relativeEnd === -1 ? scan.lines.length : start + relativeEnd;
	return parseFindingLines({
		lines: scan.lines.slice(start, end),
		fenceMaskedLines: scan.fenceMaskedLines.slice(start, end),
	});
}

function parseFindingLines(options: {
	lines: readonly string[];
	fenceMaskedLines: readonly string[];
}): FindingsParse {
	const findings: ReviewFinding[] = [];
	let fields: Map<string, string> | undefined;
	let descriptionLines: string[] = [];
	let malformed = false;

	const finish = () => {
		if (!fields) return;
		const finding = parseFinding(fields, descriptionLines);
		if (!finding) malformed = true;
		else findings.push(finding);
		fields = undefined;
		descriptionLines = [];
	};

	for (const [index, rawLine] of options.lines.entries()) {
		const line = options.fenceMaskedLines[index] ?? "";
		if (line.trim() === "") continue;
		const id = line.match(/^- id:\s*(\S.*?)\s*$/)?.[1];
		if (id) {
			finish();
			fields = new Map([["id", id]]);
			continue;
		}
		if (!fields) {
			malformed = true;
			continue;
		}
		const fieldMatch = line.match(/^ {2}([a-z_]+):\s*(.*?)\s*$/);
		if (fieldMatch) {
			const name = fieldMatch[1];
			const value = fieldMatch[2] ?? "";
			if (
				!name ||
				fields.has(name) ||
				!FINDING_FIELDS.includes(name as never)
			) {
				malformed = true;
				continue;
			}
			fields.set(name, value);
			continue;
		}
		if (fields.has("description") && /^ {4}\S/.test(rawLine)) {
			descriptionLines.push(rawLine.trim());
			continue;
		}
		malformed = true;
	}
	finish();
	if (malformed) return { status: "malformed" };
	if (new Set(findings.map((finding) => finding.id)).size !== findings.length) {
		return { status: "malformed" };
	}
	return { status: "parsed", findings };
}

function parseFinding(
	fields: ReadonlyMap<string, string>,
	descriptionLines: readonly string[],
): ReviewFinding | undefined {
	if (FINDING_FIELDS.some((field) => !fields.has(field))) return undefined;
	const id = fields.get("id");
	const dimension = fields.get("dimension");
	const severity = fields.get("severity");
	if (
		!id ||
		!FINDING_ID_REGEX.test(id) ||
		!dimension ||
		!REVIEW_DIMENSIONS.has(dimension) ||
		(severity !== "high" && severity !== "medium" && severity !== "low") ||
		!fields.get("title") ||
		!fields.get("plan_refs") ||
		!fields.get("code_refs") ||
		fields.get("description") !== "|" ||
		descriptionLines.length === 0
	) {
		return undefined;
	}
	return { id, severity };
}

function findMissingReferences(options: {
	planMarkdown: string;
	reviewFile: string;
	findingIds: readonly string[];
}): string[] {
	if (options.findingIds.length === 0) return [];
	const scan = scanMarkdown(options.planMarkdown);
	const headingIndex = scan.fenceMaskedLines.findIndex(
		(line) => line.trimEnd() === "## Decision Log",
	);
	if (headingIndex === -1) return [...options.findingIds];
	const relativeEnd = scan.fenceMaskedLines
		.slice(headingIndex + 1)
		.findIndex((line) => /^##\s+\S/.test(line));
	const end =
		relativeEnd === -1 ? scan.lines.length : headingIndex + 1 + relativeEnd;
	const entries: Array<{ start: number; end: number }> = [];
	for (let index = headingIndex + 1; index < end; index += 1) {
		if (!DECISION_ENTRY_REGEX.test(scan.quotedMaskedLines[index] ?? ""))
			continue;
		const previous = entries.at(-1);
		if (previous) previous.end = index;
		entries.push({ start: index, end });
	}

	return options.findingIds.filter((findingId) =>
		entries.every((entry) => {
			const quotedLines = scan.quotedMaskedLines.slice(entry.start, entry.end);
			if (!quotedLines.some((line) => /^\s*-\s+Decision:\s*\S/.test(line))) {
				return true;
			}
			return !entryContainsReference({
				rawLines: scan.lines.slice(entry.start, entry.end),
				quotedLines,
				reviewFile: options.reviewFile,
				findingId,
			});
		}),
	);
}

function entryContainsReference(options: {
	rawLines: readonly string[];
	quotedLines: readonly string[];
	reviewFile: string;
	findingId: string;
}): boolean {
	const escapedReviewFile = escapeRegex(options.reviewFile);
	const escapedFindingId = escapeRegex(options.findingId);
	const pattern = new RegExp(
		`(?<![\\w-])(?:${escapedReviewFile}|\`${escapedReviewFile}\`)\\s+${escapedFindingId}\\b`,
		"g",
	);
	const rawBlock = options.rawLines.join("\n");
	const quotedBlock = options.quotedLines.join("\n");
	for (const match of rawBlock.matchAll(pattern)) {
		const findingOffset = rawBlock.indexOf(
			options.findingId,
			(match.index ?? 0) + match[0].length - options.findingId.length,
		);
		if (
			findingOffset !== -1 &&
			quotedBlock.slice(
				findingOffset,
				findingOffset + options.findingId.length,
			) === options.findingId
		) {
			return true;
		}
	}
	return false;
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isErrno(error: unknown, code: string): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === code
	);
}
