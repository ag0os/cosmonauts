/**
 * Reduces a Stryker JSON report (mutation-testing-report-schema) to counts per
 * changed function. Pure: no Stryker, no filesystem.
 *
 * Timeouts count as detected, because results move between Survived and
 * Timeout from run to run. NoCoverage is kept apart from survivors: code that
 * only runs in a subprocess never activates its mutants.
 */

import { isAbsolute, relative } from "node:path";

export interface ChangedFunctionRange {
	readonly file: string;
	readonly name: string;
	readonly startLine: number;
	readonly endLine: number;
}

export interface MutantLocation {
	readonly id: string;
	readonly mutator: string;
	readonly replacement?: string;
	readonly startLine: number;
	readonly endLine: number;
}

export interface MutationCounts {
	/** Every counted mutant; Ignored and Pending ones are not counted. */
	mutants: number;
	killed: number;
	timeout: number;
	survived: number;
	noCoverage: number;
	/** CompileError and RuntimeError. */
	invalid: number;
}

export interface FunctionMutationResult
	extends ChangedFunctionRange,
		MutationCounts {
	readonly survivors: MutantLocation[];
	readonly uncovered: MutantLocation[];
}

export interface MutationSummary {
	readonly functions: FunctionMutationResult[];
	/** Mutants inside a changed function. */
	readonly inRange: MutationCounts;
	/** Mutants Stryker reported outside every changed function. */
	readonly outsideRange: MutationCounts;
	/**
	 * Test files that covered a mutant in a changed function and detected none:
	 * the "asserts nothing" candidates. Sound only when every covering test runs
	 * against every mutant (`disableBail: true` in stryker.config.mjs); with
	 * bailing, `killedBy` names only the first killer and a redundant file would
	 * be listed here wrongly.
	 */
	readonly testFilesKillingNothing: string[];
}

interface ReportMutant {
	readonly id: string;
	readonly mutatorName: string;
	readonly replacement?: string;
	readonly status: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly coveredBy: readonly string[];
	readonly killedBy: readonly string[];
}

interface ParsedReport {
	readonly files: ReadonlyMap<string, readonly ReportMutant[]>;
	readonly testFileById: ReadonlyMap<string, string>;
}

const STATUS_FIELD = {
	Killed: "killed",
	Timeout: "timeout",
	Survived: "survived",
	NoCoverage: "noCoverage",
	CompileError: "invalid",
	RuntimeError: "invalid",
} as const satisfies Record<string, keyof Omit<MutationCounts, "mutants">>;

type CountedStatus = keyof typeof STATUS_FIELD;

export interface SummarizeOptions {
	/** Root that absolute report paths are made relative to. */
	readonly projectRoot?: string;
}

export function summarizeMutationReport(
	report: unknown,
	ranges: readonly ChangedFunctionRange[],
	options: SummarizeOptions = {},
): MutationSummary {
	const parsed = parseReport(report, options.projectRoot);
	const functions = ranges.map(emptyFunctionResult);
	const inRange = emptyCounts();
	const outsideRange = emptyCounts();
	const coverage = new TestFileCoverage(parsed.testFileById);
	for (const [file, mutants] of parsed.files) {
		for (const mutant of mutants) {
			const status = mutant.status;
			if (!isCounted(status)) continue;
			const owner = innermostOwner(functions, file, mutant.startLine);
			if (owner === undefined) {
				addStatus(outsideRange, status);
				continue;
			}
			addStatus(inRange, status);
			recordInFunction(owner, mutant, status);
			coverage.record(mutant);
		}
	}
	return {
		functions,
		inRange,
		outsideRange,
		testFilesKillingNothing: coverage.filesKillingNothing(),
	};
}

/** True when the status is one of the counted mutant outcomes. */
function isCounted(status: string): status is CountedStatus {
	return Object.hasOwn(STATUS_FIELD, status);
}

function emptyCounts(): MutationCounts {
	return {
		mutants: 0,
		killed: 0,
		timeout: 0,
		survived: 0,
		noCoverage: 0,
		invalid: 0,
	};
}

function emptyFunctionResult(
	range: ChangedFunctionRange,
): FunctionMutationResult {
	return {
		file: range.file,
		name: range.name,
		startLine: range.startLine,
		endLine: range.endLine,
		...emptyCounts(),
		survivors: [],
		uncovered: [],
	};
}

function addStatus(counts: MutationCounts, status: CountedStatus): void {
	counts.mutants += 1;
	counts[STATUS_FIELD[status]] += 1;
}

function recordInFunction(
	owner: FunctionMutationResult,
	mutant: ReportMutant,
	status: CountedStatus,
): void {
	addStatus(owner, status);
	if (status === "Survived") owner.survivors.push(toLocation(mutant));
	if (status === "NoCoverage") owner.uncovered.push(toLocation(mutant));
}

function toLocation(mutant: ReportMutant): MutantLocation {
	return {
		id: mutant.id,
		mutator: mutant.mutatorName,
		...(mutant.replacement === undefined
			? {}
			: { replacement: mutant.replacement }),
		startLine: mutant.startLine,
		endLine: mutant.endLine,
	};
}

/** The smallest changed function in `file` whose lines hold `line`. */
function innermostOwner(
	functions: readonly FunctionMutationResult[],
	file: string,
	line: number,
): FunctionMutationResult | undefined {
	let owner: FunctionMutationResult | undefined;
	for (const candidate of functions) {
		if (candidate.file !== file) continue;
		if (line < candidate.startLine || line > candidate.endLine) continue;
		if (owner === undefined || span(candidate) < span(owner)) owner = candidate;
	}
	return owner;
}

function span(range: ChangedFunctionRange): number {
	return range.endLine - range.startLine;
}

class TestFileCoverage {
	private readonly covered = new Set<string>();
	private readonly detecting = new Set<string>();

	constructor(private readonly fileById: ReadonlyMap<string, string>) {}

	/** A timeout is credited to every covering file: no file is blamed for it. */
	record(mutant: ReportMutant): void {
		this.addFiles(this.covered, mutant.coveredBy);
		this.addFiles(this.detecting, mutant.killedBy);
		if (mutant.status === "Timeout") {
			this.addFiles(this.detecting, mutant.coveredBy);
		}
	}

	filesKillingNothing(): string[] {
		return [...this.covered].filter((file) => !this.detecting.has(file)).sort();
	}

	private addFiles(target: Set<string>, testIds: readonly string[]): void {
		for (const id of testIds) {
			const file = this.fileById.get(id);
			if (file !== undefined) target.add(file);
		}
	}
}

function parseReport(
	report: unknown,
	projectRoot: string | undefined,
): ParsedReport {
	if (!isRecord(report) || !isRecord(report.files)) {
		throw new Error("not a Stryker mutation report: no files object");
	}
	const root =
		projectRoot ??
		(typeof report.projectRoot === "string" ? report.projectRoot : undefined);
	const files = new Map<string, readonly ReportMutant[]>();
	for (const [path, entry] of Object.entries(report.files)) {
		const mutants =
			isRecord(entry) && Array.isArray(entry.mutants) ? entry.mutants : [];
		files.set(
			normalizePath(path, root),
			mutants.flatMap((mutant) => parseMutant(mutant)),
		);
	}
	return {
		files,
		testFileById: parseTestFiles(report.testFiles, root),
	};
}

function parseMutant(value: unknown): ReportMutant[] {
	if (!isRecord(value) || !isRecord(value.location)) return [];
	const start = lineOf(value.location.start);
	const end = lineOf(value.location.end);
	if (typeof value.status !== "string" || start === undefined) return [];
	return [
		{
			id: String(value.id),
			mutatorName:
				typeof value.mutatorName === "string" ? value.mutatorName : "unknown",
			...(typeof value.replacement === "string"
				? { replacement: value.replacement }
				: {}),
			status: value.status,
			startLine: start,
			endLine: end ?? start,
			coveredBy: stringList(value.coveredBy),
			killedBy: stringList(value.killedBy),
		},
	];
}

function parseTestFiles(
	value: unknown,
	projectRoot: string | undefined,
): Map<string, string> {
	const byId = new Map<string, string>();
	if (!isRecord(value)) return byId;
	for (const [path, entry] of Object.entries(value)) {
		if (!isRecord(entry) || !Array.isArray(entry.tests)) continue;
		const file = normalizePath(path, projectRoot);
		for (const test of entry.tests) {
			if (isRecord(test) && test.id !== undefined)
				byId.set(String(test.id), file);
		}
	}
	return byId;
}

function lineOf(position: unknown): number | undefined {
	return isRecord(position) && Number.isInteger(position.line)
		? (position.line as number)
		: undefined;
}

function stringList(value: unknown): string[] {
	return Array.isArray(value) ? value.map(String) : [];
}

function normalizePath(path: string, projectRoot: string | undefined): string {
	const relativePath =
		isAbsolute(path) && projectRoot !== undefined
			? relative(projectRoot, path)
			: path;
	return relativePath.replaceAll("\\", "/");
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
