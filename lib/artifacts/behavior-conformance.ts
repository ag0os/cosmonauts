import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, win32 } from "node:path";

export const REQUIRED_BEHAVIOR_FIELD_NAMES = [
	"source",
	"context",
	"action",
	"expected",
	"seam",
	"test",
	"marker",
] as const;

export type BehaviorFieldName = (typeof REQUIRED_BEHAVIOR_FIELD_NAMES)[number];

export type ArtifactConformanceIssueKind =
	| "missing-behavior-section"
	| "missing-behavior-entry"
	| "missing-behavior-field"
	| "invalid-marker"
	| "invalid-test-reference"
	| "missing-test-file"
	| "missing-marker"
	| "unresolved-decision-citation"
	| "undated-supersession"
	| "unpaired-behavior-file"
	| "duplicate-marker";

export type ArtifactConformanceAdvisoryKind = "behavior-count-guidance";

export interface ArtifactConformanceAdvisory {
	kind: ArtifactConformanceAdvisoryKind;
	message: string;
	count: number;
	guidance: number;
}

export interface ParsedBehaviorField {
	name: BehaviorFieldName;
	label: string;
	value: string;
	line: string;
	lineNumber: number;
}

export type ParsedBehaviorFields = Partial<
	Record<BehaviorFieldName, ParsedBehaviorField>
>;

export interface ParsedBehavior {
	id: string;
	title: string;
	heading: string;
	lineNumber: number;
	withdrawn: boolean;
	fields: ParsedBehaviorFields;
	fieldLines: ParsedBehaviorField[];
	testReferenceText?: string;
}

export interface ArtifactConformanceIssue {
	kind: ArtifactConformanceIssueKind;
	message: string;
	behaviorId?: string;
	field?: BehaviorFieldName;
	line?: number;
	path?: string;
	marker?: string;
	expected?: string;
	actual?: string;
}

export interface ParsedBehaviorSection {
	present: boolean;
	behaviors: ParsedBehavior[];
	issues: ArtifactConformanceIssue[];
	startLine?: number;
	endLine?: number;
}

export interface BehaviorConformanceEvidence {
	behaviorId: string;
	withdrawn: boolean;
	marker?: string;
	testFile?: string;
	issues: ArtifactConformanceIssue[];
}

export interface CheckBehaviorConformanceOptions {
	planMarkdown: string;
	planSlug: string;
	planPath?: string;
	projectRoot?: string;
}

export interface ArtifactConformanceResult {
	ok: boolean;
	planSlug: string;
	planPath?: string;
	behaviors: BehaviorConformanceEvidence[];
	withdrawn: number;
	issues: ArtifactConformanceIssue[];
	advisories: ArtifactConformanceAdvisory[];
}

interface MarkdownScan {
	lines: string[];
	fenceMaskedLines: string[];
	quotedMaskedLines: string[];
}

interface MarkdownSection extends MarkdownScan {
	startLine: number;
	endLine: number;
}

interface MarkdownFence {
	character: "`" | "~";
	length: number;
}

const BEHAVIOR_SECTION_HEADING = "## Behaviors";
const DECISION_LOG_SECTION_HEADING = "## Decision Log";
const FILES_TO_CHANGE_SECTION_HEADING = "## Files to Change";
const BEHAVIOR_COUNT_GUIDANCE = 12;
const BEHAVIOR_HEADING_REGEX = /^###\s+(B-\d{3})\s*(?:-|–|—)\s*(.+?)\s*$/;
const DECISION_ENTRY_REGEX = /^-\s+\*\*(D-\d{3})\s+(?:-|–|—)\s+.+?\*\*/;
const DECISION_CITATION_REGEX = /\bD-\d{3}\b/g;
const ISO_DATE_REGEX = /\b\d{4}-\d{2}-\d{2}\b/;
const STRUCTURED_SUPERSESSION_POINTER_REGEX =
	/^D-\d{3}(?:(?:\s*,\s*|\s*\/\s*|\s+and\s+)D-\d{3})*(?:(?:\s*,\s*|\s+)\d{4}-\d{2}-\d{2})?$/;
const WITHDRAWN_ANNOTATION_REGEX =
	/\*\(withdrawn by D-\d{3}, \d{4}-\d{2}-\d{2}(?:\s+—\s+[^)]+)?\)\*\s*$/;
const SUPERSESSION_ANNOTATION_REGEX =
	/\*\((?:(?:partially\s+)?superseded|withdrawn)\s+by\b[^)]*\)\*/gi;
const FIELD_LINE_REGEX = /^-\s*([^:]+):\s*(.*)$/;
const MAX_WILDCARD_PATH_COMPARISONS = 4_096;

const FIELD_LABELS: Record<string, BehaviorFieldName> = {
	source: "source",
	context: "context",
	action: "action",
	expected: "expected",
	"expected result": "expected",
	seam: "seam",
	test: "test",
	marker: "marker",
} as const satisfies Record<string, BehaviorFieldName>;

const FIELD_DISPLAY_NAMES: Record<BehaviorFieldName, string> = {
	source: "Source",
	context: "Context",
	action: "Action",
	expected: "Expected",
	seam: "Seam",
	test: "Test",
	marker: "Marker",
} as const satisfies Record<BehaviorFieldName, string>;

export function parseBehaviorSection(markdown: string): ParsedBehaviorSection {
	return parseBehaviorSectionFromScan(scanMarkdown(markdown));
}

function parseBehaviorSectionFromScan(
	scan: MarkdownScan,
): ParsedBehaviorSection {
	const section = extractMarkdownSection(scan, BEHAVIOR_SECTION_HEADING);
	if (!section) {
		return {
			present: false,
			behaviors: [],
			issues: [
				{
					kind: "missing-behavior-section",
					message: "Plan is missing an exact ## Behaviors section.",
				},
			],
		};
	}

	const behaviors = parseBehaviors(section);
	if (behaviors.length === 0) {
		return {
			present: true,
			behaviors,
			issues: [
				{
					kind: "missing-behavior-entry",
					message:
						"## Behaviors section has no parseable ### B-### behavior entries.",
				},
			],
			startLine: section.startLine,
			endLine: section.endLine,
		};
	}

	return {
		present: true,
		behaviors,
		issues: [],
		startLine: section.startLine,
		endLine: section.endLine,
	};
}

export function checkBehaviorConformance(
	options: CheckBehaviorConformanceOptions,
): ArtifactConformanceResult {
	const scan = scanMarkdown(options.planMarkdown);
	const section = parseBehaviorSectionFromScan(scan);
	const behaviors = section.behaviors.map((behavior) => {
		if (behavior.withdrawn) {
			return buildWithdrawnBehaviorEvidence(behavior);
		}

		return validateBehavior({
			behavior,
			planSlug: options.planSlug,
			projectRoot: options.projectRoot ?? process.cwd(),
		});
	});
	const behaviorIssues = behaviors.flatMap((behavior) => behavior.issues);
	const structuralIssues = [
		...validateDecisionReferences(scan),
		...validateBehaviorFilePairing({
			scan,
			behaviors: section.behaviors,
		}),
		...validateMarkerUniqueness(section.behaviors),
	];
	const issues = [...section.issues, ...behaviorIssues, ...structuralIssues];
	const advisories = buildBehaviorCountAdvisories(section.behaviors.length);

	return {
		ok: issues.length === 0,
		planSlug: options.planSlug,
		planPath: options.planPath,
		behaviors,
		withdrawn: section.behaviors.filter((behavior) => behavior.withdrawn)
			.length,
		issues,
		advisories,
	};
}

function parseBehaviors(section: MarkdownSection): ParsedBehavior[] {
	const behaviors: ParsedBehavior[] = [];

	for (let index = 0; index < section.lines.length; index += 1) {
		const line = section.lines[index];
		const scannedLine = section.fenceMaskedLines[index];
		if (!line || !scannedLine) continue;

		const headingMatch = scannedLine.match(BEHAVIOR_HEADING_REGEX);
		const rawHeadingMatch = line.match(BEHAVIOR_HEADING_REGEX);
		if (!headingMatch || !rawHeadingMatch) continue;

		const id = headingMatch[1];
		const title = rawHeadingMatch[2];
		if (!id || !title) continue;

		const bodyStartIndex = index + 1;
		const bodyEndIndex = findNextBehaviorHeadingIndex(
			section.fenceMaskedLines,
			bodyStartIndex,
		);
		const fieldLines = parseBehaviorFieldLines({
			lines: section.lines.slice(bodyStartIndex, bodyEndIndex),
			fenceMaskedLines: section.fenceMaskedLines.slice(
				bodyStartIndex,
				bodyEndIndex,
			),
			startLine: section.startLine + bodyStartIndex,
		});

		behaviors.push({
			id,
			title: title.trim(),
			heading: line,
			lineNumber: section.startLine + index,
			// Withdrawal must come from the quote-masked heading: a code-quoted
			// annotation is a mention and the behavior stays active.
			withdrawn: WITHDRAWN_ANNOTATION_REGEX.test(
				section.quotedMaskedLines[index] ?? scannedLine,
			),
			fields: Object.fromEntries(
				fieldLines.map((field) => [field.name, field]),
			) as ParsedBehaviorFields,
			fieldLines,
			testReferenceText: fieldLines.find((field) => field.name === "test")
				?.value,
		});

		index = bodyEndIndex - 1;
	}

	return behaviors;
}

function findNextBehaviorHeadingIndex(
	lines: string[],
	startIndex: number,
): number {
	const nextIndex = lines.findIndex(
		(line, index) => index >= startIndex && line.startsWith("### "),
	);

	return nextIndex === -1 ? lines.length : nextIndex;
}

function parseBehaviorFieldLines({
	lines,
	fenceMaskedLines,
	startLine,
}: {
	lines: string[];
	fenceMaskedLines: string[];
	startLine: number;
}): ParsedBehaviorField[] {
	const fields: ParsedBehaviorField[] = [];

	for (const [index, line] of lines.entries()) {
		const scannedMatch = fenceMaskedLines[index]?.match(FIELD_LINE_REGEX);
		const match = line.match(FIELD_LINE_REGEX);
		if (!scannedMatch || !match) continue;

		const label = match[1]?.trim();
		const value = match[2]?.trim() ?? "";
		const name = label ? normalizeFieldName(label) : undefined;
		if (!name || !label) continue;

		fields.push({
			name,
			label,
			value,
			line,
			lineNumber: startLine + index,
		});
	}

	return fields;
}

function validateBehavior({
	behavior,
	planSlug,
	projectRoot,
}: {
	behavior: ParsedBehavior;
	planSlug: string;
	projectRoot: string;
}): BehaviorConformanceEvidence {
	const issues = validateRequiredFields(behavior);
	const expectedMarker = buildExpectedMarker({
		planSlug,
		behaviorId: behavior.id,
	});
	const marker = behavior.fields.marker
		? trimOptionalSurroundingBackticks(behavior.fields.marker.value)
		: undefined;
	const markerIssue = validateMarker({
		behavior,
		expectedMarker,
	});
	const testReference = validateTestReference({
		behavior,
		projectRoot,
	});

	if (markerIssue) {
		issues.push(markerIssue);
	}
	if (testReference.issue) {
		issues.push(testReference.issue);
	}
	if (
		!markerIssue &&
		testReference.path &&
		testReference.absolutePath &&
		marker === expectedMarker
	) {
		const missingMarkerIssue = validateReferencedFileMarker({
			behavior,
			expectedMarker,
			path: testReference.path,
			absolutePath: testReference.absolutePath,
		});
		if (missingMarkerIssue) {
			issues.push(missingMarkerIssue);
		}
	}

	return {
		behaviorId: behavior.id,
		withdrawn: false,
		marker,
		testFile: testReference.path,
		issues,
	};
}

function buildWithdrawnBehaviorEvidence(
	behavior: ParsedBehavior,
): BehaviorConformanceEvidence {
	const marker = behavior.fields.marker
		? trimOptionalSurroundingBackticks(behavior.fields.marker.value)
		: undefined;
	const testFile = behavior.fields.test
		? parseTestReferencePath(behavior.fields.test.value)
		: undefined;

	return {
		behaviorId: behavior.id,
		withdrawn: true,
		marker,
		testFile,
		issues: [],
	};
}

function scanMarkdown(markdown: string): MarkdownScan {
	const lines = normalizeLineEndings(markdown).split("\n");
	const fenceMaskedLines: string[] = [];
	let fence: MarkdownFence | undefined;

	for (const line of lines) {
		if (fence) {
			fenceMaskedLines.push(" ".repeat(line.length));
			if (isFenceClosingLine(line, fence)) fence = undefined;
			continue;
		}

		const openingFence = parseOpeningFence(line);
		if (openingFence) {
			fence = openingFence;
			fenceMaskedLines.push(" ".repeat(line.length));
			continue;
		}

		fenceMaskedLines.push(line);
	}

	const quotedMaskedLines = maskInlineCodeSpansByBlock(fenceMaskedLines);
	return { lines, fenceMaskedLines, quotedMaskedLines };
}

function parseOpeningFence(line: string): MarkdownFence | undefined {
	const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
	const run = match?.[1];
	if (!run) return undefined;
	if (run[0] === "`" && match[2]?.includes("`")) return undefined;

	return {
		character: run[0] as "`" | "~",
		length: run.length,
	};
}

function isFenceClosingLine(line: string, fence: MarkdownFence): boolean {
	const match = line.match(/^ {0,3}(`+|~+)[ \t]*$/);
	const run = match?.[1];
	return (
		run !== undefined &&
		run[0] === fence.character &&
		run.length >= fence.length
	);
}

/**
 * Inline code spans cannot cross Markdown block boundaries: blank lines,
 * headings, and new list items end the inline context, so a stray backtick
 * in one block must never pair with a backtick in another and mask the
 * real content between them. Spans may still continue across soft line
 * breaks within one block.
 */
function maskInlineCodeSpansByBlock(lines: readonly string[]): string[] {
	const masked: string[] = [];
	let block: string[] = [];
	const flush = () => {
		if (block.length === 0) return;
		masked.push(...maskInlineCodeSpans(block.join("\n")).split("\n"));
		block = [];
	};

	for (const line of lines) {
		if (/^\s*$/.test(line)) {
			flush();
			masked.push(line);
			continue;
		}
		if (/^#{1,6}\s/.test(line)) {
			flush();
			masked.push(maskInlineCodeSpans(line));
			continue;
		}
		// A new list item interrupts the inline context: a stray backtick in
		// one item must never pair into a later item and mask the content
		// between them. Continuation lines of the same item stay in-block.
		if (/^\s*(?:[-*+]|\d+[.)])\s/.test(line)) {
			flush();
		}
		block.push(line);
	}
	flush();
	return masked;
}

function maskInlineCodeSpans(content: string): string {
	let masked = "";
	let cursor = 0;
	while (cursor < content.length) {
		if (content[cursor] !== "`") {
			masked += content[cursor];
			cursor += 1;
			continue;
		}

		const openerEnd = endOfRun(content, cursor, "`");
		const runLength = openerEnd - cursor;
		const closingStart = findMatchingRun(content, openerEnd, runLength);
		if (closingStart === -1) {
			masked += content.slice(cursor, openerEnd);
			cursor = openerEnd;
			continue;
		}

		const closingEnd = closingStart + runLength;
		masked += content.slice(cursor, closingEnd).replaceAll(/[^\n]/g, " ");
		cursor = closingEnd;
	}
	return masked;
}

function findMatchingRun(
	line: string,
	start: number,
	runLength: number,
): number {
	let cursor = start;
	while (cursor < line.length) {
		const next = line.indexOf("`", cursor);
		if (next === -1) return -1;
		const end = endOfRun(line, next, "`");
		if (end - next === runLength) return next;
		cursor = end;
	}
	return -1;
}

function endOfRun(line: string, start: number, character: string): number {
	let end = start;
	while (line[end] === character) end += 1;
	return end;
}

function validateDecisionReferences(
	scan: MarkdownScan,
): ArtifactConformanceIssue[] {
	const decisionSection = extractMarkdownSection(
		scan,
		DECISION_LOG_SECTION_HEADING,
	);
	const declaredDecisions = new Set<string>();
	for (const line of decisionSection?.quotedMaskedLines ?? []) {
		const match = line.match(DECISION_ENTRY_REGEX);
		const decisionId = match?.[1];
		if (decisionId) {
			declaredDecisions.add(decisionId);
		}
	}

	const issues: ArtifactConformanceIssue[] = [];
	const unresolved = new Set<string>();
	for (const [index, line] of scan.quotedMaskedLines.entries()) {
		for (const match of line.matchAll(DECISION_CITATION_REGEX)) {
			const decisionId = match[0];
			if (declaredDecisions.has(decisionId) || unresolved.has(decisionId)) {
				continue;
			}

			unresolved.add(decisionId);
			issues.push({
				kind: "unresolved-decision-citation",
				message: `Decision citation ${decisionId} does not resolve to a Decision Log entry.`,
				line: index + 1,
				actual: decisionId,
			});
		}
	}

	if (decisionSection) {
		issues.push(...validateSupersessionDates({ decisionSection, scan }));
	}
	return issues;
}

function validateSupersessionDates({
	decisionSection,
	scan,
}: {
	decisionSection: MarkdownSection;
	scan: MarkdownScan;
}): ArtifactConformanceIssue[] {
	const pointerIssues: ArtifactConformanceIssue[] = [];
	const annotationIssues: ArtifactConformanceIssue[] = [];
	const decisionStartIndex = decisionSection.startLine - 1;

	for (const [index, line] of scan.quotedMaskedLines.entries()) {
		if (index >= decisionStartIndex && index < decisionSection.endLine) {
			const pointerIssue = validateSupersessionPointer({
				line,
				lineNumber: index + 1,
				entryBlock: decisionEntryBlockAt({
					lines: scan.lines,
					sectionStart: decisionStartIndex,
					sectionEnd: decisionSection.endLine,
					lineIndex: index,
				}),
			});
			if (pointerIssue) pointerIssues.push(pointerIssue);
		}
		annotationIssues.push(...validateSupersessionAnnotations(line, index + 1));
	}
	return [...pointerIssues, ...annotationIssues];
}

function decisionEntryBlockAt({
	lines,
	sectionStart,
	sectionEnd,
	lineIndex,
}: {
	lines: readonly string[];
	sectionStart: number;
	sectionEnd: number;
	lineIndex: number;
}): string {
	let start = sectionStart;
	for (let index = lineIndex; index >= sectionStart; index -= 1) {
		if (DECISION_ENTRY_REGEX.test(lines[index] ?? "")) {
			start = index;
			break;
		}
	}
	let end = sectionEnd;
	for (let index = lineIndex + 1; index < sectionEnd; index += 1) {
		if (DECISION_ENTRY_REGEX.test(lines[index] ?? "")) {
			end = index;
			break;
		}
	}
	return lines.slice(start, end).join("\n");
}

function validateSupersessionPointer({
	line,
	lineNumber,
	entryBlock,
}: {
	line: string;
	lineNumber: number;
	entryBlock: string;
}): ArtifactConformanceIssue | undefined {
	const value = line.match(/^\s*-\s+Supersedes:\s*(.+)$/i)?.[1]?.trim();
	if (!value) return undefined;

	// A structured decision-ID pointer must date itself; any other
	// Supersedes ground must at least carry an ISO date within its decision
	// entry (typically on the Decided-by line), so no supersession is undated.
	const dated = STRUCTURED_SUPERSESSION_POINTER_REGEX.test(value)
		? ISO_DATE_REGEX.test(value)
		: ISO_DATE_REGEX.test(entryBlock);
	if (dated) return undefined;

	const actual = `Supersedes: ${value}`;
	return {
		kind: "undated-supersession",
		message: `Supersession pointer must include an ISO date: ${actual}.`,
		line: lineNumber,
		actual,
	};
}

function validateSupersessionAnnotations(
	line: string,
	lineNumber: number,
): ArtifactConformanceIssue[] {
	const issues: ArtifactConformanceIssue[] = [];
	for (const match of line.matchAll(SUPERSESSION_ANNOTATION_REGEX)) {
		const annotation = match[0];
		if (ISO_DATE_REGEX.test(annotation)) continue;

		issues.push({
			kind: "undated-supersession",
			message: `Supersession annotation must include an ISO date: ${annotation}.`,
			line: lineNumber,
			actual: annotation,
		});
	}
	return issues;
}

interface BehaviorFileReference {
	field: "seam" | "test";
	path: string;
	line?: number;
}

interface ChangedFileIndex {
	exactPaths: ReadonlySet<string>;
	wildcardCandidates: readonly string[];
	wildcardMatches: Map<string, boolean>;
	remainingWildcardComparisons: number;
}

function validateBehaviorFilePairing({
	scan,
	behaviors,
}: {
	scan: MarkdownScan;
	behaviors: ParsedBehavior[];
}): ArtifactConformanceIssue[] {
	const filesSection = extractMarkdownSection(
		scan,
		FILES_TO_CHANGE_SECTION_HEADING,
	);
	if (!filesSection) return [];

	const changedPaths = extractChangedFilePaths(filesSection.fenceMaskedLines);
	const changedFileIndex: ChangedFileIndex = {
		exactPaths: new Set(changedPaths),
		wildcardCandidates: changedPaths,
		wildcardMatches: new Map(),
		remainingWildcardComparisons: MAX_WILDCARD_PATH_COMPARISONS,
	};
	return behaviors.flatMap((behavior) =>
		validateBehaviorReferences(behavior, changedFileIndex),
	);
}

function extractChangedFilePaths(lines: readonly string[]): string[] {
	const paths = new Set<string>();
	for (const line of lines) {
		for (const candidate of line.split(/[\s`(),]+/)) {
			if (looksLikeProjectFilePath(candidate)) paths.add(candidate);
		}
	}
	return [...paths];
}

function validateBehaviorReferences(
	behavior: ParsedBehavior,
	changedFileIndex: ChangedFileIndex,
): ArtifactConformanceIssue[] {
	if (behavior.withdrawn) return [];

	return collectBehaviorFileReferences(behavior).flatMap((reference) => {
		if (fileReferenceAppears(reference.path, changedFileIndex)) return [];
		return [unpairedBehaviorFileIssue(behavior, reference)];
	});
}

function collectBehaviorFileReferences(
	behavior: ParsedBehavior,
): BehaviorFileReference[] {
	const references: BehaviorFileReference[] = [];
	const seamField = behavior.fields.seam;
	if (seamField) {
		for (const path of extractSeamFilePaths(seamField.value)) {
			references.push({
				field: "seam",
				path,
				line: seamField.lineNumber,
			});
		}
	}

	const testField = behavior.fields.test;
	const testPath = testField
		? parseTestReferencePath(testField.value)
		: undefined;
	if (testField && testPath) {
		references.push({
			field: "test",
			path: testPath,
			line: testField.lineNumber,
		});
	}
	return references;
}

function unpairedBehaviorFileIssue(
	behavior: ParsedBehavior,
	reference: BehaviorFileReference,
): ArtifactConformanceIssue {
	return {
		kind: "unpaired-behavior-file",
		message: `Behavior ${behavior.id} ${FIELD_DISPLAY_NAMES[reference.field]} file is missing from ## Files to Change: ${reference.path}.`,
		behaviorId: behavior.id,
		field: reference.field,
		line: reference.line,
		path: reference.path,
	};
}

function fileReferenceAppears(
	path: string,
	changedFileIndex: ChangedFileIndex,
): boolean {
	if (!path.includes("*")) {
		return changedFileIndex.exactPaths.has(path);
	}

	const cached = changedFileIndex.wildcardMatches.get(path);
	if (cached !== undefined) return cached;

	for (const candidate of changedFileIndex.wildcardCandidates) {
		if (changedFileIndex.remainingWildcardComparisons === 0) {
			changedFileIndex.wildcardMatches.set(path, false);
			return false;
		}
		changedFileIndex.remainingWildcardComparisons -= 1;
		if (wildcardPathMatches(path, candidate)) {
			changedFileIndex.wildcardMatches.set(path, true);
			return true;
		}
	}

	changedFileIndex.wildcardMatches.set(path, false);
	return false;
}

function wildcardPathMatches(pattern: string, candidate: string): boolean {
	if (!pattern.includes("*")) return pattern === candidate;

	const segments = pattern.split("*").filter((segment) => segment.length > 0);
	if (segments.length === 0) return candidate.length > 0;

	const leadingWildcard = pattern.startsWith("*");
	const trailingWildcard = pattern.endsWith("*");
	let segmentIndex = 0;
	let cursor = 0;

	if (!leadingWildcard) {
		const first = segments[0];
		if (!first || !candidate.startsWith(first)) return false;
		cursor = first.length;
		segmentIndex = 1;
	}

	const middleEnd = trailingWildcard ? segments.length : segments.length - 1;
	for (; segmentIndex < middleEnd; segmentIndex += 1) {
		const segment = segments[segmentIndex];
		if (!segment) continue;
		const found = candidate.indexOf(segment, cursor);
		if (found === -1) return false;
		cursor = found + segment.length;
	}

	if (trailingWildcard) return true;
	const last = segments.at(-1);
	if (!last) return false;
	const lastStart = candidate.length - last.length;
	return lastStart >= cursor && candidate.startsWith(last, lastStart);
}

function extractSeamFilePaths(value: string): string[] {
	const paths: string[] = [];
	for (const match of value.matchAll(/`([^`]+)`|([^\s`,()]+)/g)) {
		const candidate = (match[1] ?? match[2])?.trim();
		if (candidate && looksLikeProjectFilePath(candidate)) {
			paths.push(candidate);
		}
	}

	return [...new Set(paths)];
}

function looksLikeProjectFilePath(value: string): boolean {
	if (value.startsWith("@") || /\s/.test(value)) {
		return false;
	}

	return /(?:^|\/)[^/]*\.[A-Za-z0-9*]+$/.test(value);
}

function validateMarkerUniqueness(
	behaviors: ParsedBehavior[],
): ArtifactConformanceIssue[] {
	const firstBehaviorByMarker = new Map<string, string>();
	const issues: ArtifactConformanceIssue[] = [];

	for (const behavior of behaviors) {
		if (behavior.withdrawn || !behavior.fields.marker) {
			continue;
		}

		const marker = trimOptionalSurroundingBackticks(
			behavior.fields.marker.value,
		);
		const firstBehaviorId = firstBehaviorByMarker.get(marker);
		if (!firstBehaviorId) {
			firstBehaviorByMarker.set(marker, behavior.id);
			continue;
		}

		issues.push({
			kind: "duplicate-marker",
			message: `Behavior ${behavior.id} duplicates marker ${marker} already used by ${firstBehaviorId}.`,
			behaviorId: behavior.id,
			field: "marker",
			line: behavior.fields.marker.lineNumber,
			marker,
			actual: marker,
		});
	}

	return issues;
}

function buildBehaviorCountAdvisories(
	count: number,
): ArtifactConformanceAdvisory[] {
	if (count <= BEHAVIOR_COUNT_GUIDANCE) {
		return [];
	}

	return [
		{
			kind: "behavior-count-guidance",
			message: `Plan has ${count} behaviors, exceeding the guidance of ${BEHAVIOR_COUNT_GUIDANCE}; consider splitting it along a real boundary.`,
			count,
			guidance: BEHAVIOR_COUNT_GUIDANCE,
		},
	];
}

function validateRequiredFields(
	behavior: ParsedBehavior,
): ArtifactConformanceIssue[] {
	return REQUIRED_BEHAVIOR_FIELD_NAMES.flatMap((field) => {
		if (behavior.fields[field]) {
			return [];
		}

		return [
			{
				kind: "missing-behavior-field",
				message: `Behavior ${behavior.id} is missing required ${FIELD_DISPLAY_NAMES[field]} field.`,
				behaviorId: behavior.id,
				field,
				line: behavior.lineNumber,
			},
		];
	});
}

function validateMarker({
	behavior,
	expectedMarker,
}: {
	behavior: ParsedBehavior;
	expectedMarker: string;
}): ArtifactConformanceIssue | undefined {
	const markerField = behavior.fields.marker;
	if (!markerField) {
		return undefined;
	}

	const actual = trimOptionalSurroundingBackticks(markerField.value);
	if (actual === expectedMarker) {
		return undefined;
	}

	return {
		kind: "invalid-marker",
		message: `Behavior ${behavior.id} marker must exactly match ${expectedMarker}.`,
		behaviorId: behavior.id,
		field: "marker",
		line: markerField.lineNumber,
		expected: expectedMarker,
		actual,
	};
}

function validateTestReference({
	behavior,
	projectRoot,
}: {
	behavior: ParsedBehavior;
	projectRoot: string;
}): {
	path?: string;
	absolutePath?: string;
	issue?: ArtifactConformanceIssue;
} {
	const testField = behavior.fields.test;
	if (!testField) {
		return {};
	}

	const parsed = parseTestReferencePath(testField.value);
	if (!parsed) {
		return {
			issue: invalidTestReferenceIssue({
				behavior,
				testField,
				message: `Behavior ${behavior.id} Test field must include a project-root-relative path.`,
				actual: testField.value,
			}),
		};
	}

	if (parsed.includes("\0")) {
		return {
			path: parsed,
			issue: invalidTestReferenceIssue({
				behavior,
				testField,
				message: `Behavior ${behavior.id} Test field path must not contain NUL bytes.`,
				path: parsed,
				actual: testField.value,
			}),
		};
	}

	if (isAbsolute(parsed) || win32.isAbsolute(parsed)) {
		return {
			path: parsed,
			issue: invalidTestReferenceIssue({
				behavior,
				testField,
				message: `Behavior ${behavior.id} Test field path must be relative to the project root.`,
				path: parsed,
				actual: testField.value,
			}),
		};
	}

	const root = realpathSync(projectRoot);
	const candidate = resolve(root, parsed);
	if (!isPathInsideRoot({ path: candidate, root })) {
		return {
			path: parsed,
			issue: invalidTestReferenceIssue({
				behavior,
				testField,
				message: `Behavior ${behavior.id} Test field path must stay inside the project root.`,
				path: parsed,
				actual: testField.value,
			}),
		};
	}

	if (!existsSync(candidate) || !statSync(candidate).isFile()) {
		return {
			path: parsed,
			issue: missingTestFileIssue({
				behavior,
				testField,
				path: parsed,
			}),
		};
	}

	const realCandidate = realpathSync(candidate);
	if (!isPathInsideRoot({ path: realCandidate, root })) {
		return {
			path: parsed,
			issue: invalidTestReferenceIssue({
				behavior,
				testField,
				message: `Behavior ${behavior.id} Test field path resolves outside the project root.`,
				path: parsed,
				actual: testField.value,
			}),
		};
	}

	return {
		path: parsed,
		absolutePath: realCandidate,
	};
}

function parseTestReferencePath(value: string): string | undefined {
	const pathSegment = value.split(">", 1)[0]?.trim();
	if (!pathSegment || hasMalformedBackticks(pathSegment)) {
		return undefined;
	}

	const firstInlineCode = pathSegment.match(/`([^`]*)`/);
	const candidate = firstInlineCode ? firstInlineCode[1] : pathSegment;
	const path = candidate?.trim();

	return path ? path : undefined;
}

function hasMalformedBackticks(value: string): boolean {
	const backtickCount = [...value].filter(
		(character) => character === "`",
	).length;
	return backtickCount % 2 !== 0;
}

function invalidTestReferenceIssue({
	behavior,
	testField,
	message,
	path,
	actual,
}: {
	behavior: ParsedBehavior;
	testField: ParsedBehaviorField;
	message: string;
	path?: string;
	actual: string;
}): ArtifactConformanceIssue {
	return {
		kind: "invalid-test-reference",
		message,
		behaviorId: behavior.id,
		field: "test",
		line: testField.lineNumber,
		path,
		actual,
	};
}

function missingTestFileIssue({
	behavior,
	testField,
	path,
}: {
	behavior: ParsedBehavior;
	testField: ParsedBehaviorField;
	path: string;
}): ArtifactConformanceIssue {
	return {
		kind: "missing-test-file",
		message: `Behavior ${behavior.id} referenced Test file does not exist: ${path}.`,
		behaviorId: behavior.id,
		field: "test",
		line: testField.lineNumber,
		path,
	};
}

function validateReferencedFileMarker({
	behavior,
	expectedMarker,
	path,
	absolutePath,
}: {
	behavior: ParsedBehavior;
	expectedMarker: string;
	path: string;
	absolutePath: string;
}): ArtifactConformanceIssue | undefined {
	const content = readFileSync(absolutePath, "utf-8");
	if (content.includes(expectedMarker)) {
		return undefined;
	}

	return {
		kind: "missing-marker",
		message: `Behavior ${behavior.id} referenced Test file does not contain marker ${expectedMarker}.`,
		behaviorId: behavior.id,
		field: "marker",
		line: behavior.fields.marker?.lineNumber,
		path,
		marker: expectedMarker,
	};
}

function isPathInsideRoot({
	path,
	root,
}: {
	path: string;
	root: string;
}): boolean {
	const distance = relative(root, path);
	return (
		distance === "" || (!distance.startsWith("..") && !isAbsolute(distance))
	);
}

function buildExpectedMarker({
	planSlug,
	behaviorId,
}: {
	planSlug: string;
	behaviorId: string;
}): string {
	return `@cosmo-behavior plan:${planSlug}#${behaviorId}`;
}

function trimOptionalSurroundingBackticks(value: string): string {
	const trimmed = value.trim();
	if (trimmed.startsWith("`") && trimmed.endsWith("`") && trimmed.length >= 2) {
		return trimmed.slice(1, -1).trim();
	}

	return trimmed;
}

function normalizeFieldName(label: string): BehaviorFieldName | undefined {
	return FIELD_LABELS[normalizeFieldLabel(label)];
}

function normalizeFieldLabel(label: string): string {
	return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeLineEndings(content: string): string {
	return content.replace(/\r\n/g, "\n");
}

function extractMarkdownSection(
	scan: MarkdownScan,
	heading: string,
): MarkdownSection | undefined {
	const headingIndex = scan.fenceMaskedLines.findIndex(
		(line) => line.trimEnd() === heading,
	);
	if (headingIndex === -1) return undefined;

	const nextHeadingIndex = scan.fenceMaskedLines.findIndex(
		(line, index) => index > headingIndex && /^##\s+\S/.test(line),
	);
	const endIndex =
		nextHeadingIndex === -1 ? scan.lines.length : nextHeadingIndex;
	const sectionStart = headingIndex + 1;

	return {
		lines: scan.lines.slice(sectionStart, endIndex),
		fenceMaskedLines: scan.fenceMaskedLines.slice(sectionStart, endIndex),
		quotedMaskedLines: scan.quotedMaskedLines.slice(sectionStart, endIndex),
		startLine: headingIndex + 2,
		endLine: endIndex,
	};
}
