import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const LEDGER_PATH = join(
	REPO_ROOT,
	"missions",
	"plans",
	"coding-agnostic-framework",
	"test-decoupling-ledger.md",
);

const CODING_REFERENCE_PATTERN =
	/\bcoding\b|bundled\/coding|@cosmonauts\/coding/;
const REAL_BUNDLED_CODING_PATTERN =
	/bundled\/coding|["'`]bundled["'`]\s*,\s*["'`]coding["'`]/;

const ALLOWED_BUCKETS = new Set(["A", "B", "Keep"]);
const ALLOWED_DISPOSITIONS = new Set([
	"bucket-a-wave2-real-bundled-coding",
	"bucket-b-synthetic-coding-behavior",
	"keep-capability-or-tool-preset",
	"keep-domain-binding-variant",
	"keep-explicit-coding-flow",
	"keep-legacy-envelope",
	"keep-ledger-validator",
	"keep-package-catalog-wave2",
	"keep-package-catalog-helper",
	"keep-plan-marker",
	"keep-source-scan",
	"keep-synthetic-coding-package",
]);

const PACKAGE_CATALOG_PATHS = new Set([
	"tests/cli/export/subcommand.test.ts",
	"tests/cli/packages/subcommand.test.ts",
	"tests/cli/skills/subcommand.test.ts",
	"tests/cli/update/subcommand.test.ts",
	"tests/packages/catalog.test.ts",
	"tests/packages/installer.test.ts",
]);

interface LedgerRow {
	readonly path: string;
	readonly bucket: string;
	readonly disposition: string;
	readonly rationale: string;
}

async function listFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = await Promise.all(
		entries.map((entry) => {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) return listFiles(path);
			if (/\.(?:ts|md)$/.test(entry.name)) return [path];
			return [];
		}),
	);
	return files.flat();
}

async function findFilesMatching(pattern: RegExp): Promise<string[]> {
	const files = await listFiles(join(REPO_ROOT, "tests"));
	const matches: string[] = [];
	for (const file of files) {
		const content = await readFile(file, "utf-8");
		if (pattern.test(content)) {
			matches.push(relative(REPO_ROOT, file));
		}
	}
	return matches.toSorted();
}

function parseLedger(content: string): Map<string, LedgerRow> {
	const rows = new Map<string, LedgerRow>();
	for (const line of content.split(/\r?\n/)) {
		if (!line.startsWith("| `tests/")) continue;
		const columns = line
			.slice(1, -1)
			.split("|")
			.map((column) => column.trim());
		const path = columns[0]?.match(/^`([^`]+)`$/)?.[1];
		if (!path) continue;
		rows.set(path, {
			path,
			bucket: columns[1] ?? "",
			disposition: columns[2] ?? "",
			rationale: columns[3] ?? "",
		});
	}
	return rows;
}

function missingLedgerEntries(
	referencePaths: readonly string[],
	ledgerRows: ReadonlyMap<string, LedgerRow>,
): string[] {
	return referencePaths.filter((path) => !ledgerRows.has(path));
}

async function readLedger(): Promise<Map<string, LedgerRow>> {
	return parseLedger(await readFile(LEDGER_PATH, "utf-8"));
}

describe("coding-agnostic test fixture ledger", () => {
	test("validates ledger coverage for bundled coding references", async () => {
		// @cosmo-behavior plan:coding-agnostic-framework#B-017
		const ledgerRows = await readLedger();
		const bundledReferencePaths = await findFilesMatching(
			REAL_BUNDLED_CODING_PATTERN,
		);
		const bucketAPaths = [...ledgerRows.values()]
			.filter((row) => row.bucket === "A")
			.map((row) => row.path)
			.toSorted();

		expect(bucketAPaths.length).toBeGreaterThan(0);
		expect(bundledReferencePaths).toEqual(expect.arrayContaining(bucketAPaths));
		expect(
			bucketAPaths.filter((path) => !bundledReferencePaths.includes(path)),
		).toEqual([]);
	});

	test("validates every coding test reference has a ledger disposition", async () => {
		// @cosmo-behavior plan:coding-agnostic-framework#B-018
		const ledgerRows = await readLedger();
		const codingReferencePaths = await findFilesMatching(
			CODING_REFERENCE_PATTERN,
		);
		const ledgerPaths = [...ledgerRows.keys()].toSorted();

		expect(
			missingLedgerEntries(["tests/new-helper.test.ts"], ledgerRows),
		).toEqual(["tests/new-helper.test.ts"]);
		expect(missingLedgerEntries(codingReferencePaths, ledgerRows)).toEqual([]);
		expect(ledgerPaths).toEqual(codingReferencePaths);
		expect(
			[...ledgerRows.values()].filter(
				(row) =>
					!ALLOWED_BUCKETS.has(row.bucket) ||
					!ALLOWED_DISPOSITIONS.has(row.disposition) ||
					row.rationale.length === 0,
			),
		).toEqual([]);
	});

	test("validates package catalog coding references are classified", async () => {
		// @cosmo-behavior plan:coding-agnostic-framework#B-024
		const ledgerRows = await readLedger();
		const packageRows = [...PACKAGE_CATALOG_PATHS]
			.map((path) => ledgerRows.get(path))
			.filter((row): row is LedgerRow => row !== undefined);

		expect(packageRows.map((row) => row.path).toSorted()).toEqual(
			[...PACKAGE_CATALOG_PATHS].toSorted(),
		);
		expect(
			packageRows.every((row) =>
				[
					"keep-package-catalog-wave2",
					"keep-package-catalog-helper",
					"keep-explicit-coding-flow",
				].includes(row.disposition),
			),
		).toBe(true);
	});
});
