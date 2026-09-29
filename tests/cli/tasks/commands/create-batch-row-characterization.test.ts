import { describe, expect, test } from "vitest";
import {
	parseTaskBatchInputs,
	parseTaskBatchYaml,
} from "../../../../cli/tasks/commands/create.ts";

function parseRow(row: unknown) {
	return parseTaskBatchInputs([row]);
}

function errorOf(row: unknown): string {
	const result = parseRow(row);
	if (result.ok) throw new Error("expected a parse failure");
	return result.error;
}

describe("parseTaskBatchRow through parseTaskBatchInputs (characterization)", () => {
	test("accepts a title-only row and leaves every optional field undefined", () => {
		expect(parseRow({ title: "Only title" })).toEqual({
			ok: true,
			value: [
				{
					title: "Only title",
					description: undefined,
					priority: undefined,
					assignee: undefined,
					labels: undefined,
					dueDate: undefined,
					dependencies: undefined,
					acceptanceCriteria: undefined,
					parent: undefined,
				},
			],
		});
	});

	test("maps every supported field, renaming ac to acceptanceCriteria", () => {
		const result = parseRow({
			title: "Full",
			description: "D",
			assignee: "worker",
			parent: "TASK-1",
			labels: ["a", "b"],
			dependencies: ["TASK-2"],
			ac: ["one", "two"],
			priority: "high",
			due: "2026-06-01",
		});
		expect(result).toMatchObject({
			ok: true,
			value: [
				{
					title: "Full",
					description: "D",
					assignee: "worker",
					parent: "TASK-1",
					labels: ["a", "b"],
					dependencies: ["TASK-2"],
					acceptanceCriteria: ["one", "two"],
					priority: "high",
				},
			],
		});
		const due = result.ok ? result.value[0]?.dueDate : undefined;
		expect(due).toBeInstanceOf(Date);
		expect(due?.toISOString().startsWith("2026-06-01")).toBe(true);
	});

	test("treats null optional fields as absent", () => {
		const result = parseRow({
			title: "Nulls",
			description: null,
			assignee: null,
			parent: null,
			labels: null,
			dependencies: null,
			ac: null,
			priority: null,
			due: null,
		});
		expect(result).toMatchObject({
			ok: true,
			value: [{ title: "Nulls", priority: undefined, dueDate: undefined }],
		});
	});

	test.each(["high", "medium", "low"])("accepts priority %s", (priority) => {
		const result = parseRow({ title: "P", priority });
		expect(result).toMatchObject({ ok: true, value: [{ priority }] });
	});

	test.each([
		["null", null],
		["a string", "text"],
		["a number", 3],
		["an array", ["title"]],
	])("rejects a row that is %s", (_name, row) => {
		expect(errorOf(row)).toBe("row 1: expected a mapping of task fields.");
	});

	test.each([
		["missing title", {}],
		["blank title", { title: "  " }],
		["non-string title", { title: 4 }],
	])("rejects %s", (_name, row) => {
		expect(errorOf(row)).toBe('row 1: missing required field "title".');
	});

	test.each([
		"description",
		"assignee",
		"parent",
	])("rejects a non-string %s", (field) => {
		expect(errorOf({ title: "T", [field]: 5 })).toBe(
			`row 1: "${field}" must be a string.`,
		);
	});

	test.each([
		"labels",
		"dependencies",
		"ac",
	])("rejects a %s value that is not an array of strings", (field) => {
		const message = `row 1: "${field}" must be an array of strings.`;
		expect(errorOf({ title: "T", [field]: "x" })).toBe(message);
		expect(errorOf({ title: "T", [field]: ["x", 1] })).toBe(message);
	});

	test("rejects invalid priorities of any type", () => {
		const message = (value: string) =>
			`row 1: invalid priority "${value}". Must be one of: high, medium, low.`;
		expect(errorOf({ title: "T", priority: "urgent" })).toBe(message("urgent"));
		expect(errorOf({ title: "T", priority: 3 })).toBe(message("3"));
	});

	test("accepts a Date-valued due (unquoted YAML date)", () => {
		const date = new Date("2026-06-01T00:00:00.000Z");
		const result = parseRow({ title: "T", due: date });
		expect(result).toMatchObject({ ok: true, value: [{ dueDate: date }] });
	});

	test("rejects an invalid Date-valued due", () => {
		expect(errorOf({ title: "T", due: new Date("nope") })).toBe(
			'row 1: "due" is not a valid date.',
		);
	});

	test("rejects a malformed due string with the row prefix", () => {
		expect(errorOf({ title: "T", due: "next tuesday" })).toMatch(/^row 1: /);
	});

	test("rejects a due of an unsupported type", () => {
		expect(errorOf({ title: "T", due: 20260601 })).toBe(
			'row 1: "due" must be a date string (YYYY-MM-DD) or a YAML date value.',
		);
	});

	test("labels failures with the one-based index of the failing row and stops there", () => {
		const result = parseTaskBatchInputs([
			{ title: "ok" },
			{ title: "ok too" },
			{ title: "" },
			{ description: 5 },
		]);
		expect(result).toEqual({
			ok: false,
			error: 'row 3: missing required field "title".',
		});
	});

	test("reports the first failing field in validation order", () => {
		expect(
			errorOf({ title: "T", description: 1, assignee: 2, priority: "x" }),
		).toBe('row 1: "description" must be a string.');
		expect(errorOf({ title: "T", labels: "x", priority: "x" })).toBe(
			'row 1: "labels" must be an array of strings.',
		);
	});

	test("parses unquoted YAML dates from a batch file end to end", () => {
		const yaml = parseTaskBatchYaml("- title: Dated\n  due: 2026-06-01\n");
		expect(yaml.ok).toBe(true);
		const parsed = parseTaskBatchInputs(yaml.ok ? yaml.value : undefined);
		expect(parsed).toMatchObject({
			ok: true,
			value: [{ title: "Dated" }],
		});
	});
});
