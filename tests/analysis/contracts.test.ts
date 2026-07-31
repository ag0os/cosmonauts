import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, test } from "vitest";
import {
	ANALYSIS_CAPABILITIES,
	ANALYSIS_GATE_CAPABILITIES,
	ANALYSIS_OPERATIONAL_CAPABILITIES,
	ANALYSIS_RESULT_GENERIC_FIELDS,
	type AnalysisBinding,
	type AnalysisGateCoverage,
	type AnalysisResult,
	type AnalysisTraceTarget,
} from "../../lib/analysis/index.ts";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(TEST_DIR, "../..");

async function readRepositoryFile(path: string): Promise<string> {
	return readFile(join(REPOSITORY_ROOT, path), "utf8");
}

function markdownRows(markdown: string, heading: string): string[][] {
	const sectionStart = markdown.indexOf(`## ${heading}`);
	if (sectionStart < 0) {
		throw new Error(`Missing documentation section: ${heading}`);
	}
	const section = markdown
		.slice(sectionStart + heading.length + 3)
		.split(/\n## /u, 1)[0];
	if (section === undefined) {
		throw new Error(`Unable to read documentation section: ${heading}`);
	}
	return section
		.split("\n")
		.filter((line) => /^\|.+\|$/u.test(line))
		.map((line) =>
			line
				.slice(1, -1)
				.split("|")
				.map((cell) => cell.trim()),
		)
		.filter(
			(row) =>
				row.length > 0 &&
				!row.every((cell) => /^:?-+:?$/u.test(cell)) &&
				row[0] !== "Capability" &&
				row[0] !== "Generic field" &&
				row[0] !== "Provider-only aspect",
		);
}

function unquoteCode(value: string): string {
	return value.replace(/^`|`$/gu, "");
}

describe("analysis core contracts", () => {
	// @cosmo-behavior plan:analysis-capability-runtime#B-001
	test("documents one capability vocabulary aligned with gate kinds", async () => {
		const [capabilityDocument, gateContracts] = await Promise.all([
			readRepositoryFile("docs/analysis-capabilities.md"),
			readRepositoryFile(
				"domains/shared/skills/work-artifacts/references/gate-contracts.md",
			),
		]);
		const documented = markdownRows(
			capabilityDocument,
			"Canonical capability vocabulary",
		);
		const documentedNames = documented.map(([name]) => unquoteCode(name ?? ""));
		const classifications = new Map(
			documented.map(([name, classification]) => [
				unquoteCode(name ?? ""),
				classification,
			]),
		);
		const gateKinds = [
			...gateContracts.matchAll(/^\d+\. `([^`]+)`$/gmu),
		].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));

		expect(documentedNames).toEqual([...ANALYSIS_CAPABILITIES]);
		expect(documentedNames).toHaveLength(7);
		expect(
			documentedNames
				.filter((name) => classifications.get(name) === "gate-facing")
				.sort(),
		).toEqual([...ANALYSIS_GATE_CAPABILITIES].sort());
		expect(
			documentedNames.filter(
				(name) => classifications.get(name) === "operational",
			),
		).toEqual([...ANALYSIS_OPERATIONAL_CAPABILITIES]);
		expect(
			gateKinds.filter((kind) => documentedNames.includes(kind)).sort(),
		).toEqual([...ANALYSIS_GATE_CAPABILITIES].sort());
	});

	// @cosmo-behavior plan:analysis-capability-runtime#B-002
	test("documents two-tool evidence and provider-tags single-provider data", async () => {
		const validation = await readRepositoryFile(
			"docs/analysis-provider-validation.md",
		);
		for (const capability of ANALYSIS_CAPABILITIES) {
			const fixture = JSON.parse(
				await readRepositoryFile(
					`tests/fixtures/fallow-2.54.2/${capability}.json`,
				),
			) as {
				readonly name: string;
				readonly provenance: {
					readonly provider: string;
					readonly engineVersion: string;
				};
				readonly envelope: { readonly payload: unknown };
			};
			expect(fixture).toMatchObject({
				name: capability,
				provenance: {
					provider: "fallow",
					engineVersion: "2.54.2",
				},
			});
			expect(fixture.envelope.payload).not.toBeNull();
		}
		const fieldRows = markdownRows(validation, "Generic result field evidence");
		const evidenceByField = new Map(
			fieldRows.map(([field, reference, independent, decision]) => [
				unquoteCode(field ?? ""),
				{ reference, independent, decision },
			]),
		);

		expect([...evidenceByField.keys()]).toEqual([
			...ANALYSIS_RESULT_GENERIC_FIELDS,
		]);
		for (const field of ANALYSIS_RESULT_GENERIC_FIELDS) {
			const evidence = evidenceByField.get(field);
			expect(evidence, `${field} has a validation row`).toBeDefined();
			expect(evidence?.reference).toMatch(/^Fallow 2\.54\.2:/u);
			expect(evidence?.independent).toMatch(
				/^(?!.*Fallow)(?:Knip|jscpd|Radon|dependency-cruiser|Semgrep|ESLint)[^:]*:/u,
			);
			expect(evidence?.decision).toBe("generic");
			expect(
				`${evidence?.reference ?? ""} ${evidence?.independent ?? ""}`.match(
					/Fallow/gu,
				),
			).toHaveLength(1);
		}

		const providerOnlyRows = markdownRows(
			validation,
			"Provider-tagged aspects",
		);
		expect(providerOnlyRows.length).toBeGreaterThan(0);
		for (const [, evidence, placement] of providerOnlyRows) {
			expect(evidence).toMatch(/^Fallow 2\.54\.2:/u);
			expect(placement).toMatch(
				/^`(?:providerDetails\.data|native\.payload)`$/u,
			);
		}

		const capabilityRows = markdownRows(validation, "Capability coverage");
		expect(
			capabilityRows.map(([capability]) => unquoteCode(capability ?? "")),
		).toEqual([...ANALYSIS_CAPABILITIES]);
		for (const [, reference, independent] of capabilityRows) {
			expect(reference).toMatch(/^Fallow 2\.54\.2:/u);
			expect(independent).toMatch(
				/^(?!.*Fallow)(?:Knip|jscpd|Radon|dependency-cruiser|Semgrep|ESLint)[^:]*:/u,
			);
		}
	});

	// @cosmo-behavior plan:analysis-gate-coverage#B-040
	test("declares evaluated gate coverage on every verdict bearing result", () => {
		expectTypeOf<Extract<AnalysisResult, { capability: "dead-code" }>>()
			.toHaveProperty("coverage")
			.toEqualTypeOf<AnalysisGateCoverage>();
		expectTypeOf<Extract<AnalysisResult, { capability: "duplication" }>>()
			.toHaveProperty("coverage")
			.toEqualTypeOf<AnalysisGateCoverage>();
		expectTypeOf<Extract<AnalysisResult, { capability: "complexity" }>>()
			.toHaveProperty("coverage")
			.toEqualTypeOf<AnalysisGateCoverage>();
		expectTypeOf<
			Extract<AnalysisResult, { capability: "boundary-conformance" }>
		>()
			.toHaveProperty("coverage")
			.toEqualTypeOf<AnalysisGateCoverage>();
		expectTypeOf<
			Extract<AnalysisResult, { capability: "changed-scope-audit" }>
		>()
			.toHaveProperty("coverage")
			.toEqualTypeOf<AnalysisGateCoverage>();

		expectTypeOf<readonly []>().not.toMatchTypeOf<AnalysisGateCoverage>();
		expectTypeOf<
			Extract<AnalysisResult, { capability: "trace" }>
		>().not.toHaveProperty("coverage");
		expectTypeOf<
			Extract<AnalysisResult, { capability: "fix-preview" }>
		>().not.toHaveProperty("coverage");
	});

	// @cosmo-behavior plan:analysis-gate-coverage#B-044
	test("records two tool validation for declared gate coverage", async () => {
		const validation = await readRepositoryFile(
			"docs/analysis-provider-validation.md",
		);
		const coverageRow = markdownRows(
			validation,
			"Generic result field evidence",
		).find(([field]) => unquoteCode(field ?? "") === "coverage[]");

		expect(coverageRow).toEqual([
			"`coverage[]`",
			expect.stringMatching(/^Fallow 2\.54\.2:/u),
			expect.stringMatching(/^Knip[^:]*:/u),
			"generic",
		]);
		expect(
			`${coverageRow?.[1] ?? ""} ${coverageRow?.[2] ?? ""}`.match(/Fallow/gu),
		).toHaveLength(1);

		const providerCoverageRow = markdownRows(
			validation,
			"Provider-tagged aspects",
		).find(([aspect]) => /declared coverage/iu.test(aspect ?? ""));
		expect(providerCoverageRow).toEqual([
			expect.stringMatching(/coverage/iu),
			expect.stringMatching(/^Fallow 2\.54\.2:/u),
			"`native.payload`",
		]);
	});

	test("discriminates result verdicts and failed bindings", () => {
		expectTypeOf<
			Extract<AnalysisResult, { capability: "dead-code" }>["verdict"]
		>().toEqualTypeOf<"pass" | "fail">();
		expectTypeOf<
			Extract<AnalysisResult, { capability: "complexity" }>["metric"]
		>().toEqualTypeOf<"cyclomatic" | "cognitive" | "crap">();
		expectTypeOf<
			Extract<AnalysisResult, { capability: "trace" }>["verdict"]
		>().toEqualTypeOf<"not-applicable">();
		expectTypeOf<
			Extract<AnalysisResult, { capability: "fix-preview" }>["verdict"]
		>().toEqualTypeOf<"not-applicable">();
		expectTypeOf<
			Extract<AnalysisBinding, { state: "failed" }>["failure"]
		>().not.toBeNever();
		expectTypeOf<
			Extract<AnalysisBinding, { state: "unbound" }>
		>().not.toEqualTypeOf<Extract<AnalysisBinding, { state: "failed" }>>();
	});

	test("keeps provider-specific trace identity optional in the generic target union", () => {
		const targets = [
			{ kind: "symbol", symbol: "render" },
			{ kind: "symbol", symbol: "render", path: "src/render.ts" },
			{ kind: "file", path: "src/render.ts" },
			{ kind: "dependency", dependency: "typebox" },
			{
				kind: "duplicate-location",
				location: { path: "src/render.ts" },
			},
			{
				kind: "duplicate-location",
				location: { path: "src/render.ts", line: 12 },
			},
			{
				kind: "duplicate-location",
				location: { path: "src/render.ts", line: 12, column: 4 },
			},
		] as const satisfies readonly AnalysisTraceTarget[];

		expect(targets.map(({ kind }) => kind)).toEqual([
			"symbol",
			"symbol",
			"file",
			"dependency",
			"duplicate-location",
			"duplicate-location",
			"duplicate-location",
		]);
		expectTypeOf<
			Extract<AnalysisTraceTarget, { kind: "duplicate-location" }>["location"]
		>().toEqualTypeOf<{
			readonly path: string;
			readonly line?: number;
			readonly column?: number;
		}>();
	});

	test("keeps the analysis core independent from Pi and provider code", async () => {
		const coreDirectory = join(REPOSITORY_ROOT, "lib", "analysis");
		const sources = await readdir(coreDirectory);

		for (const source of sources.filter((path) => path.endsWith(".ts"))) {
			const content = await readFile(join(coreDirectory, source), "utf8");
			expect(content).not.toMatch(/from\s+["'][^"']*(?:pi-|fallow)/u);
			expect(content).not.toMatch(
				/domains\/shared\/extensions|project-tools|concrete provider/iu,
			);
		}
	});
});
