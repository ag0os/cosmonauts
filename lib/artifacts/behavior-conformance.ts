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
	| "missing-marker";

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
	issues: ArtifactConformanceIssue[];
}

interface MarkdownSection {
	lines: string[];
	startLine: number;
	endLine: number;
}

const BEHAVIOR_SECTION_HEADING = "## Behaviors";
const BEHAVIOR_HEADING_REGEX = /^###\s+(B-\d{3})\s*(?:-|–|—)\s*(.+?)\s*$/;
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
	const behaviors = section.behaviors.map((behavior) =>
		validateBehavior({
			behavior,
			planSlug: options.planSlug,
			projectRoot: options.projectRoot ?? process.cwd(),
		}),
	);
	const behaviorIssues = behaviors.flatMap((behavior) => behavior.issues);
	const issues = [...section.issues, ...behaviorIssues];

	return {
		ok: issues.length === 0,
		planSlug: options.planSlug,
		planPath: options.planPath,
		behaviors,
		issues,
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
		marker,
		testFile: testReference.path,
		issues,
	};
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
