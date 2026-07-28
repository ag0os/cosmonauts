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

interface MarkdownSection {
	lines: string[];
	startLine: number;
	endLine: number;
}

const BEHAVIOR_SECTION_HEADING = "## Behaviors";
const DECISION_LOG_SECTION_HEADING = "## Decision Log";
const FILES_TO_CHANGE_SECTION_HEADING = "## Files to Change";
const BEHAVIOR_COUNT_GUIDANCE = 12;
const BEHAVIOR_HEADING_REGEX = /^###\s+(B-\d{3})\s*(?:-|–|—)\s*(.+?)\s*$/;
const DECISION_ENTRY_REGEX = /^-\s+\*\*(D-\d{3})\s+(?:-|–|—)\s+.+?\*\*/;
const DECISION_CITATION_REGEX = /\bD-\d{3}\b/g;
const ISO_DATE_REGEX = /\b\d{4}-\d{2}-\d{2}\b/;
const WITHDRAWN_ANNOTATION_REGEX = /\*\(withdrawn\b[^)]*\)\*/i;
const SUPERSESSION_ANNOTATION_REGEX =
	/\*\((?:(?:partially\s+)?superseded|withdrawn)\s+by\b[^)]*\)\*/gi;
const FIELD_LINE_REGEX = /^-\s*([^:]+):\s*(.*)$/;

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
	const section = extractBehaviorSection(markdown);
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
	const section = parseBehaviorSection(options.planMarkdown);
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
		...validateDecisionReferences(options.planMarkdown),
		...validateBehaviorFilePairing({
			planMarkdown: options.planMarkdown,
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

function extractBehaviorSection(markdown: string): MarkdownSection | undefined {
	const lines = normalizeLineEndings(markdown).split("\n");
	const headingIndex = lines.findIndex(
		(line) => line.trimEnd() === BEHAVIOR_SECTION_HEADING,
	);

	if (headingIndex === -1) {
		return undefined;
	}

	const nextSecondLevelHeadingIndex = lines.findIndex(
		(line, index) => index > headingIndex && /^##\s+\S/.test(line),
	);
	const endIndex =
		nextSecondLevelHeadingIndex === -1
			? lines.length
			: nextSecondLevelHeadingIndex;

	return {
		lines: lines.slice(headingIndex + 1, endIndex),
		startLine: headingIndex + 2,
		endLine: endIndex,
	};
}

function parseBehaviors(section: MarkdownSection): ParsedBehavior[] {
	const behaviors: ParsedBehavior[] = [];

	for (let index = 0; index < section.lines.length; index += 1) {
		const line = section.lines[index];
		if (!line) continue;

		const headingMatch = line.match(BEHAVIOR_HEADING_REGEX);
		if (!headingMatch) continue;

		const id = headingMatch[1];
		const title = headingMatch[2];
		if (!id || !title) continue;

		const bodyStartIndex = index + 1;
		const bodyEndIndex = findNextBehaviorHeadingIndex(
			section.lines,
			bodyStartIndex,
		);
		const fieldLines = parseBehaviorFieldLines({
			lines: section.lines.slice(bodyStartIndex, bodyEndIndex),
			startLine: section.startLine + bodyStartIndex,
		});

		behaviors.push({
			id,
			title: title.trim(),
			heading: line,
			lineNumber: section.startLine + index,
			withdrawn: WITHDRAWN_ANNOTATION_REGEX.test(title),
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
	startLine,
}: {
	lines: string[];
	startLine: number;
}): ParsedBehaviorField[] {
	const fields: ParsedBehaviorField[] = [];

	for (const [index, line] of lines.entries()) {
		const match = line.match(FIELD_LINE_REGEX);
		if (!match) continue;

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

function validateDecisionReferences(
	markdown: string,
): ArtifactConformanceIssue[] {
	const decisionSection = extractMarkdownSection(
		markdown,
		DECISION_LOG_SECTION_HEADING,
	);
	if (!decisionSection) {
		return [];
	}

	const declaredDecisions = new Set<string>();
	for (const line of decisionSection.lines) {
		const match = line.match(DECISION_ENTRY_REGEX);
		const decisionId = match?.[1];
		if (decisionId) {
			declaredDecisions.add(decisionId);
		}
	}

	const issues: ArtifactConformanceIssue[] = [];
	const unresolved = new Set<string>();
	const lines = normalizeLineEndings(markdown).split("\n");
	for (const [index, line] of lines.entries()) {
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

	issues.push(...validateSupersessionDates({ decisionSection, markdown }));
	return issues;
}

function validateSupersessionDates({
	decisionSection,
	markdown,
}: {
	decisionSection: MarkdownSection;
	markdown: string;
}): ArtifactConformanceIssue[] {
	const issues: ArtifactConformanceIssue[] = [];
	let decisionStartIndex = 0;

	for (let index = 0; index < decisionSection.lines.length; index += 1) {
		const line = decisionSection.lines[index];
		if (!line) continue;
		if (DECISION_ENTRY_REGEX.test(line)) {
			decisionStartIndex = index;
		}

		const match = line.match(/^\s*-\s+Supersedes:\s*(.+)$/i);
		if (!match) continue;

		const nextDecisionIndex = decisionSection.lines.findIndex(
			(candidate, candidateIndex) =>
				candidateIndex > index && DECISION_ENTRY_REGEX.test(candidate),
		);
		const blockEnd =
			nextDecisionIndex === -1
				? decisionSection.lines.length
				: nextDecisionIndex;
		const decisionBlock = decisionSection.lines
			.slice(decisionStartIndex, blockEnd)
			.join("\n");
		if (ISO_DATE_REGEX.test(decisionBlock)) {
			continue;
		}

		const actual = `Supersedes: ${match[1]?.trim() ?? ""}`;
		issues.push({
			kind: "undated-supersession",
			message: `Supersession pointer must include an ISO date: ${actual}.`,
			line: decisionSection.startLine + index,
			actual,
		});
	}

	const lines = normalizeLineEndings(markdown).split("\n");
	for (const [index, line] of lines.entries()) {
		for (const match of line.matchAll(SUPERSESSION_ANNOTATION_REGEX)) {
			const annotation = match[0];
			if (ISO_DATE_REGEX.test(annotation)) {
				continue;
			}

			issues.push({
				kind: "undated-supersession",
				message: `Supersession annotation must include an ISO date: ${annotation}.`,
				line: index + 1,
				actual: annotation,
			});
		}
	}

	return issues;
}

function validateBehaviorFilePairing({
	planMarkdown,
	behaviors,
}: {
	planMarkdown: string;
	behaviors: ParsedBehavior[];
}): ArtifactConformanceIssue[] {
	const filesSection = extractMarkdownSection(
		planMarkdown,
		FILES_TO_CHANGE_SECTION_HEADING,
	);
	if (!filesSection) {
		return [];
	}

	const filesText = filesSection.lines.join("\n");
	const issues: ArtifactConformanceIssue[] = [];

	for (const behavior of behaviors) {
		if (behavior.withdrawn) continue;

		const references: Array<{
			field: "seam" | "test";
			path: string;
			line?: number;
		}> = [];
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

		for (const reference of references) {
			if (fileReferenceAppears(reference.path, filesText)) {
				continue;
			}

			issues.push({
				kind: "unpaired-behavior-file",
				message: `Behavior ${behavior.id} ${FIELD_DISPLAY_NAMES[reference.field]} file is missing from ## Files to Change: ${reference.path}.`,
				behaviorId: behavior.id,
				field: reference.field,
				line: reference.line,
				path: reference.path,
			});
		}
	}

	return issues;
}

function fileReferenceAppears(path: string, filesText: string): boolean {
	const pattern = escapeRegExp(path).replaceAll("\\*", "[^`\\s,]+");
	return new RegExp(`(?:^|[\\s\`(])${pattern}(?=$|[\\s\`,)])`, "m").test(
		filesText,
	);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSeamFilePaths(value: string): string[] {
	const paths: string[] = [];
	for (const match of value.matchAll(/`([^`]+)`/g)) {
		const candidate = match[1]?.trim();
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
	markdown: string,
	heading: string,
): MarkdownSection | undefined {
	const lines = normalizeLineEndings(markdown).split("\n");
	const headingIndex = lines.findIndex((line) => line.trimEnd() === heading);
	if (headingIndex === -1) {
		return undefined;
	}

	const nextSecondLevelHeadingIndex = lines.findIndex(
		(line, index) => index > headingIndex && /^##\s+\S/.test(line),
	);
	const endIndex =
		nextSecondLevelHeadingIndex === -1
			? lines.length
			: nextSecondLevelHeadingIndex;

	return {
		lines: lines.slice(headingIndex + 1, endIndex),
		startLine: headingIndex + 2,
		endLine: endIndex,
	};
}
