import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const LEAKAGE_FINDINGS_PATH = join(
	REPO_ROOT,
	"missions",
	"plans",
	"coding-agnostic-framework",
	"leakage-findings.md",
);

const FINDINGS_HEADER =
	"| Path | Line/pattern | Why it may leak | Disposition | Owner wave |";
const ALLOWED_DISPOSITIONS = new Set([
	"escalate",
	"fix-in-Wave-2",
	"fix-now",
	"accepted/no-action",
]);

interface FindingRow {
	readonly path: string;
	readonly evidence: string;
	readonly why: string;
	readonly disposition: string;
	readonly ownerWave: string;
}

function parseTableLine(line: string): string[] {
	return line
		.slice(1, -1)
		.split("|")
		.map((cell) => cell.trim());
}

function parseFindings(content: string): FindingRow[] {
	const lines = content.split(/\r?\n/);
	const headerIndex = lines.findIndex(
		(line) => line.trim() === FINDINGS_HEADER,
	);
	if (headerIndex === -1) return [];

	const rows: FindingRow[] = [];
	for (const line of lines.slice(headerIndex + 2)) {
		if (!line.startsWith("| ")) break;
		const [
			path = "",
			evidence = "",
			why = "",
			disposition = "",
			ownerWave = "",
		] = parseTableLine(line);
		rows.push({ path, evidence, why, disposition, ownerWave });
	}
	return rows;
}

function validateFindings(rows: readonly FindingRow[]): string[] {
	const errors: string[] = [];
	for (const [index, row] of rows.entries()) {
		const label = row.path || `row ${index + 1}`;
		if (row.path.length === 0) errors.push(`${label}: missing path`);
		if (row.evidence.length === 0) errors.push(`${label}: missing evidence`);
		if (row.why.length === 0)
			errors.push(`${label}: missing leakage rationale`);
		if (!ALLOWED_DISPOSITIONS.has(row.disposition)) {
			errors.push(`${label}: missing or invalid disposition`);
		}
		if (row.ownerWave.length === 0) errors.push(`${label}: missing owner wave`);
	}
	return errors;
}

describe("shared/main leakage scan artifact", () => {
	test("records a disposition for every shared-main leakage finding", async () => {
		// @cosmo-behavior plan:coding-agnostic-framework#B-019
		const content = await readFile(LEAKAGE_FINDINGS_PATH, "utf-8");
		const findings = parseFindings(content);

		expect(content).toContain("domains/shared/**");
		expect(content).toContain("rg -n -i");
		expect(content).toContain("cosmo/main/coding-specific strings");
		expect(content).toContain("P1 direct qualified domain/agent refs");
		expect(content).toContain("Report-Only Boundary");
		expect(content).toContain("No `domains/shared/**` remediation was made");
		expect(findings.length).toBeGreaterThan(0);
		expect(validateFindings(findings)).toEqual([]);
	});

	test("rejects a leakage finding without a disposition", () => {
		const findings = [
			{
				path: "`domains/shared/example.md`",
				evidence: "P2 `cosmo`",
				why: "Example rationale",
				disposition: "",
				ownerWave: "Wave 2",
			},
		];

		expect(validateFindings(findings)).toEqual([
			"`domains/shared/example.md`: missing or invalid disposition",
		]);
	});
});
