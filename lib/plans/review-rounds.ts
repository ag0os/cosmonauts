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

/** Slug and explicit-round shape must be well formed before any I/O. */
function invalidAssessmentInput(
	options: AssessPlanReviewRoundOptions,
): PlanReviewRoundBlockReason | undefined {
	if (!isValidSlug(options.planSlug)) return "invalid-plan-slug";
	if (
		options.reviewRound !== undefined &&
		(!Number.isSafeInteger(options.reviewRound) || options.reviewRound <= 0)
	) {
		return "invalid-review-name";
	}
	return undefined;
}

/**
 * Prove the plan directory is contained, readable, and explicitly `active`.
 * Status is read strictly here rather than through the shared plan reader,
 * whose parseStatus normalizes missing and unknown values to "active".
 */
async function readActivePlanMarkdown(
	plansRoot: string,
	planDirectory: string,
): Promise<{ content: string } | { reason: PlanReviewRoundBlockReason }> {
	const containment = await assessPlanDirectory(plansRoot, planDirectory);
	if (containment !== "safe") return { reason: containment };

	const planRead = await readRegularFile(join(planDirectory, "plan.md"));
	if (planRead.status === "missing") return { reason: "plan-not-found" };
	if (planRead.status !== "read") return { reason: "plan-artifact-io" };

	const planStatus = parseStrictPlanStatus(planRead.content);
	if (planStatus === "indeterminate") {
		return { reason: "plan-status-indeterminate" };
	}
	if (planStatus !== "active") return { reason: "inactive-plan" };
	return { content: planRead.content };
}

/** True when the allocation set skips a number below its maximum. */
function hasAllocationGap(allocationRounds: readonly number[]): boolean {
	const maximumAllocationRound = allocationRounds.at(-1) ?? 0;
	for (let round = 1; round <= maximumAllocationRound; round += 1) {
		if (allocationRounds[round - 1] !== round) return true;
	}
	return false;
}

type AssessableEntry = ReviewEntry & { findings: ReviewFinding[] };

/**
 * Narrow the allocation set to the rounds carrying a parseable `## Findings`
 * section. Entries without one belong to other reviewers: they keep their
 * number for contiguity but are never assessed.
 */
function collectAssessableEntries(
	entries: readonly ReviewEntry[],
): { assessable: AssessableEntry[] } | { malformedRound: number } {
	const assessable: AssessableEntry[] = [];
	for (const entry of entries) {
		const parsed = parseFindings(entry.content);
		if (parsed.status === "malformed") return { malformedRound: entry.round };
		if (parsed.status === "parsed") {
			assessable.push({ ...entry, findings: parsed.findings });
		}
	}
	return { assessable };
}

export async function assessPlanReviewRound(
	options: AssessPlanReviewRoundOptions,
): Promise<PlanReviewRoundAssessment> {
	const invalidInput = invalidAssessmentInput(options);
	if (invalidInput) return block(options, invalidInput);

	const plansRoot = join(options.projectRoot, "missions", "plans");
	const planRead = await readActivePlanMarkdown(
		plansRoot,
		join(plansRoot, options.planSlug),
	);
	if ("reason" in planRead) return block(options, planRead.reason);

	const reviewEntries = await readReviewEntries(
		join(plansRoot, options.planSlug),
	);
	if (reviewEntries.status === "blocked") {
		return block(options, reviewEntries.reason);
	}
	const allocationRounds = reviewEntries.entries.map((entry) => entry.round);
	if (allocationRounds.length === 0) {
		return block(options, "no-assessable-review-round");
	}
	if (hasAllocationGap(allocationRounds)) {
		return block(options, "review-round-gap");
	}

	const collected = collectAssessableEntries(reviewEntries.entries);
	if ("malformedRound" in collected) {
		return block(options, "malformed-review", {
			reviewRound: collected.malformedRound,
		});
	}
	const latest = collected.assessable.at(-1);
	if (!latest) return block(options, "no-assessable-review-round");
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
		assessableRounds: collected.assessable.map((entry) => entry.round),
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

interface FindingScanState {
	findings: ReviewFinding[];
	fields?: Map<string, string>;
	descriptionLines: string[];
	malformed: boolean;
}

/** Close the finding under construction, recording it or marking malformed. */
function finishFinding(state: FindingScanState): void {
	if (!state.fields) return;
	const finding = parseFinding(state.fields, state.descriptionLines);
	if (finding) state.findings.push(finding);
	else state.malformed = true;
	state.fields = undefined;
	state.descriptionLines = [];
}

/** Record one `  name: value` line; false when unknown, repeated, or unnamed. */
function recordFindingField(
	fields: Map<string, string>,
	fieldMatch: RegExpMatchArray,
): boolean {
	const name = fieldMatch[1];
	if (!name || fields.has(name) || !FINDING_FIELDS.includes(name as never)) {
		return false;
	}
	fields.set(name, fieldMatch[2] ?? "");
	return true;
}

/** Advance the scanner by one line of a `## Findings` block. */
function scanFindingLine(
	state: FindingScanState,
	line: string,
	rawLine: string,
): void {
	if (line.trim() === "") return;

	const id = line.match(/^- id:\s*(\S.*?)\s*$/)?.[1];
	if (id) {
		finishFinding(state);
		state.fields = new Map([["id", id]]);
		return;
	}
	if (!state.fields) {
		state.malformed = true;
		return;
	}

	const fieldMatch = line.match(/^ {2}([a-z_]+):\s*(.*?)\s*$/);
	if (fieldMatch) {
		if (!recordFindingField(state.fields, fieldMatch)) state.malformed = true;
		return;
	}
	if (state.fields.has("description") && /^ {4}\S/.test(rawLine)) {
		state.descriptionLines.push(rawLine.trim());
		return;
	}
	state.malformed = true;
}

/** Two findings sharing an id make the whole block malformed. */
function hasDuplicateFindingIds(findings: readonly ReviewFinding[]): boolean {
	return (
		new Set(findings.map((finding) => finding.id)).size !== findings.length
	);
}

function parseFindingLines(options: {
	lines: readonly string[];
	fenceMaskedLines: readonly string[];
}): FindingsParse {
	const state: FindingScanState = {
		findings: [],
		descriptionLines: [],
		malformed: false,
	};
	for (const [index, rawLine] of options.lines.entries()) {
		scanFindingLine(state, options.fenceMaskedLines[index] ?? "", rawLine);
	}
	finishFinding(state);

	if (state.malformed || hasDuplicateFindingIds(state.findings)) {
		return { status: "malformed" };
	}
	return { status: "parsed", findings: state.findings };
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
