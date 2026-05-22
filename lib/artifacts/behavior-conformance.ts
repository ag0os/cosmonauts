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
	| "missing-test-marker";

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

export interface CheckBehaviorConformanceOptions {
	planMarkdown: string;
	planSlug: string;
	planPath?: string;
}

export interface ArtifactConformanceResult {
	ok: boolean;
	planSlug: string;
	planPath?: string;
	behaviors: ParsedBehavior[];
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
	const behaviorIssues = section.behaviors.flatMap((behavior) =>
		validateBehavior({
			behavior,
			planSlug: options.planSlug,
		}),
	);
	const issues = [...section.issues, ...behaviorIssues];

	return {
		ok: issues.length === 0,
		planSlug: options.planSlug,
		planPath: options.planPath,
		behaviors: section.behaviors,
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
}: {
	behavior: ParsedBehavior;
	planSlug: string;
}): ArtifactConformanceIssue[] {
	const issues = validateRequiredFields(behavior);
	const markerIssue = validateMarker({
		behavior,
		planSlug,
	});

	if (markerIssue) {
		issues.push(markerIssue);
	}

	return issues;
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
	planSlug,
}: {
	behavior: ParsedBehavior;
	planSlug: string;
}): ArtifactConformanceIssue | undefined {
	const markerField = behavior.fields.marker;
	if (!markerField) {
		return undefined;
	}

	const expected = buildExpectedMarker({
		planSlug,
		behaviorId: behavior.id,
	});
	const actual = trimOptionalSurroundingBackticks(markerField.value);
	if (actual === expected) {
		return undefined;
	}

	return {
		kind: "invalid-marker",
		message: `Behavior ${behavior.id} marker must exactly match ${expected}.`,
		behaviorId: behavior.id,
		field: "marker",
		line: markerField.lineNumber,
		expected,
		actual,
	};
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
