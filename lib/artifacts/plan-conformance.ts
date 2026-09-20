import { type MarkdownScan, scanMarkdown } from "./markdown-scan.ts";

export type PlanConformanceIssueKind =
	| "unresolved-decision-citation"
	| "undated-supersession";

export type PlanConformanceAdvisoryKind = "behavior-count-guidance";

export interface PlanConformanceAdvisory {
	kind: PlanConformanceAdvisoryKind;
	message: string;
	count: number;
	guidance: number;
}

export interface PlanConformanceIssue {
	kind: PlanConformanceIssueKind;
	message: string;
	line?: number;
	actual?: string;
}

export interface CheckPlanConformanceOptions {
	planMarkdown: string;
	planSlug: string;
	planPath?: string;
}

export interface PlanConformanceResult {
	ok: boolean;
	planSlug: string;
	planPath?: string;
	behaviorCount: number;
	issues: PlanConformanceIssue[];
	advisories: PlanConformanceAdvisory[];
}

interface MarkdownSection extends MarkdownScan {
	startLine: number;
	endLine: number;
}

const BEHAVIOR_SECTION_HEADING = "## Behaviors";
const DECISION_LOG_SECTION_HEADING = "## Decision Log";
const BEHAVIOR_COUNT_GUIDANCE = 12;
const BEHAVIOR_HEADING_REGEX = /^###\s+B-\d{3}\b/;
const DECISION_ENTRY_REGEX = /^-\s+\*\*(D-\d{3})\s+(?:-|–|—)\s+.+?\*\*/;
const DECISION_CITATION_REGEX = /\bD-\d{3}\b/g;
const ISO_DATE_REGEX = /\b\d{4}-\d{2}-\d{2}\b/;
const STRUCTURED_SUPERSESSION_POINTER_REGEX =
	/^D-\d{3}(?:(?:\s*,\s*|\s*\/\s*|\s+and\s+)D-\d{3})*(?:(?:\s*,\s*|\s+)\d{4}-\d{2}-\d{2})?$/;
const SUPERSESSION_ANNOTATION_REGEX =
	/\*\((?:(?:partially\s+)?superseded|withdrawn)\s+by\b[^)]*\)\*/gi;

export function checkPlanConformance(
	options: CheckPlanConformanceOptions,
): PlanConformanceResult {
	const scan = scanMarkdown(options.planMarkdown);
	const issues = validateDecisionReferences(scan);
	const behaviorCount = countBehaviors(scan);

	return {
		ok: issues.length === 0,
		planSlug: options.planSlug,
		planPath: options.planPath,
		behaviorCount,
		issues,
		advisories: buildBehaviorCountAdvisories(behaviorCount),
	};
}

function countBehaviors(scan: MarkdownScan): number {
	const section = extractMarkdownSection(scan, BEHAVIOR_SECTION_HEADING);
	if (!section) return 0;
	return section.fenceMaskedLines.filter((line) =>
		BEHAVIOR_HEADING_REGEX.test(line),
	).length;
}

function validateDecisionReferences(
	scan: MarkdownScan,
): PlanConformanceIssue[] {
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

	const issues: PlanConformanceIssue[] = [];
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
}): PlanConformanceIssue[] {
	const pointerIssues: PlanConformanceIssue[] = [];
	const annotationIssues: PlanConformanceIssue[] = [];
	const decisionStartIndex = decisionSection.startLine - 1;

	for (const [index, line] of scan.quotedMaskedLines.entries()) {
		if (index >= decisionStartIndex && index < decisionSection.endLine) {
			const pointerIssue = validateSupersessionPointer({
				line,
				lineNumber: index + 1,
				// Boundary and date detection both use the quote-masked view so a
				// fenced or code-quoted decision example inside an entry neither
				// splits the entry nor contributes a date.
				entryBlock: decisionEntryBlockAt({
					lines: scan.quotedMaskedLines,
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
}): PlanConformanceIssue | undefined {
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
): PlanConformanceIssue[] {
	const issues: PlanConformanceIssue[] = [];
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

function buildBehaviorCountAdvisories(
	count: number,
): PlanConformanceAdvisory[] {
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
