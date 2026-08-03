import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmod,
	mkdir,
	readdir,
	readFile,
	readlink,
	realpath,
	symlink,
	writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
	discoverFallowProvider,
	FALLOW_VALIDATED_ENGINE_VERSION,
} from "../../domains/shared/extensions/project-tools/fallow-provider.ts";
import type { ProviderProcessExecutor } from "../../domains/shared/extensions/project-tools/process-runner.ts";
import type {
	AnalysisGateCoverage,
	AnalysisRequest,
} from "../../lib/analysis/index.ts";
import {
	captureFallowEnvelopes,
	FALLOW_CAPABILITY_FIXTURES,
	FALLOW_CONFIG_FIXTURES,
	type FallowEnvelopeSource,
} from "../../scripts/capture-fallow-envelopes.ts";
import { useTempDir } from "../helpers/fs.ts";

const execFileAsync = promisify(execFile);
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(TEST_DIR, "../..");
const FIXTURE_ROOT = join(
	REPOSITORY_ROOT,
	"tests",
	"fixtures",
	"fallow-2.54.2",
);
const output = useTempDir("fallow-capture-output-");
const sourceRepository = useTempDir("fallow-capture-source-");
const replayRoot = useTempDir("fallow-coverage-replay-");

const VERDICT_FIXTURE_NAMES = [
	"dead-code",
	"duplication",
	"complexity",
	"boundary-conformance",
	"changed-scope-audit",
] as const;

interface CapturedFixture {
	readonly fixtureSchemaVersion: number;
	readonly name: string;
	readonly kind: "capability" | "config-introspection";
	readonly provenance: {
		readonly envelopeSource: FallowEnvelopeSource;
		readonly provider: string;
		readonly package: string;
		readonly engineVersion: string;
	};
	readonly command: {
		readonly executable: string;
		readonly args: readonly string[];
		readonly cwd: string;
	};
	readonly expectedWorkingTreeChanges?: {
		readonly tracked: readonly string[];
		readonly staged: readonly string[];
		readonly untracked: readonly string[];
	};
	readonly envelope: {
		readonly code: number | null;
		readonly signal: string | null;
		readonly stdout: string;
		readonly stderr: string;
		readonly payload: unknown;
	};
}

async function loadFixture(name: string): Promise<CapturedFixture> {
	return JSON.parse(
		await readFile(join(FIXTURE_ROOT, `${name}.json`), "utf8"),
	) as CapturedFixture;
}

function completedFixtureOutcome(fixture: CapturedFixture) {
	if (fixture.envelope.code === null) {
		throw new Error(`${fixture.name} did not capture a completed process.`);
	}
	return {
		kind: "code-exit",
		code: fixture.envelope.code,
		stdout: fixture.envelope.stdout,
		stderr: fixture.envelope.stderr,
	} as const;
}

async function replayRuntime(
	name: string,
	configFixtureName: "config-healthy" | "config-defaults",
	auditFixtureName = "changed-scope-audit",
	auditPayloadOverride?: unknown,
) {
	const root = join(replayRoot.path, name);
	const projectRoot = join(root, "project");
	const userStateRoot = join(root, "user-state");
	const executablePath = join(root, "bin", "fallow");
	await Promise.all([
		mkdir(projectRoot, { recursive: true }),
		mkdir(userStateRoot, { recursive: true }),
		mkdir(dirname(executablePath), { recursive: true }),
	]);
	await Promise.all([
		writeFile(join(projectRoot, "fallow.toml"), "", "utf8"),
		writeFile(executablePath, "#!/bin/sh\nexit 0\n", "utf8"),
	]);
	await chmod(executablePath, 0o755);
	const canonicalProjectRoot = await realpath(projectRoot);
	await writeFile(
		join(userStateRoot, "analysis-execution-consent.json"),
		`${JSON.stringify({
			schemaVersion: 1,
			projects: {
				[canonicalProjectRoot]: { providers: ["fallow"] },
			},
		})}\n`,
		"utf8",
	);

	const [configFixture, capabilityFixtures] = await Promise.all([
		loadFixture(configFixtureName),
		Promise.all(
			VERDICT_FIXTURE_NAMES.map((fixtureName) =>
				loadFixture(
					fixtureName === "changed-scope-audit"
						? auditFixtureName
						: fixtureName,
				),
			),
		),
	]);
	const executeProcess: ProviderProcessExecutor = async (invocation) => {
		if (invocation.args.includes("--version")) {
			return {
				kind: "code-exit",
				code: 0,
				stdout: `fallow ${FALLOW_VALIDATED_ENGINE_VERSION}\n`,
				stderr: "",
			};
		}
		if (invocation.args[0] === "config") {
			return completedFixtureOutcome(configFixture);
		}
		const fixture = capabilityFixtures.find((candidate) => {
			switch (candidate.name) {
				case "dead-code":
					return (
						invocation.args[0] === "dead-code" &&
						!invocation.args.includes("--boundary-violations")
					);
				case "duplication":
					return invocation.args[0] === "dupes";
				case "complexity":
					return invocation.args[0] === "health";
				case "boundary-conformance":
					return invocation.args.includes("--boundary-violations");
				case "changed-scope-audit":
				case "zero-change-audit":
					return invocation.args[0] === "audit";
				default:
					return false;
			}
		});
		if (fixture === undefined) {
			throw new Error(
				`No captured fixture matches: ${invocation.args.join(" ")}`,
			);
		}
		const outcome = completedFixtureOutcome(fixture);
		if (
			fixture.name === auditFixtureName &&
			auditPayloadOverride !== undefined
		) {
			return { ...outcome, stdout: JSON.stringify(auditPayloadOverride) };
		}
		return outcome;
	};
	const discovery = await discoverFallowProvider({
		projectRoot,
		userStateRoot,
		injectedExecutablePath: executablePath,
		executeProcess,
	});
	if (discovery.status !== "detected") {
		throw new Error(
			`Expected detected provider, received ${discovery.status}.`,
		);
	}
	return discovery.runtime;
}

async function snapshotRepositoryFiles(
	repositoryRoot: string,
): Promise<Readonly<Record<string, string>>> {
	const files: Record<string, string> = {};
	const excludedDirectories = new Set([
		".git",
		"node_modules",
		"missions/sessions",
		"missions/archive/sessions",
	]);

	async function visit(
		directory: string,
		relativeDirectory: string,
	): Promise<void> {
		const entries = await readdir(directory, { withFileTypes: true });
		for (const entry of entries) {
			const absolutePath = join(directory, entry.name);
			const relativePath =
				relativeDirectory.length === 0
					? entry.name
					: join(relativeDirectory, entry.name);
			if (entry.isDirectory()) {
				if (!excludedDirectories.has(relativePath)) {
					await visit(absolutePath, relativePath);
				}
				continue;
			}
			if (entry.isSymbolicLink()) {
				files[relativePath] = createHash("sha256")
					.update(await readlink(absolutePath))
					.digest("hex");
				continue;
			}
			if (entry.isFile()) {
				files[relativePath] = createHash("sha256")
					.update(await readFile(absolutePath))
					.digest("hex");
			}
		}
	}

	await visit(repositoryRoot, "");
	return files;
}

function objectPayload(fixture: CapturedFixture): Record<string, unknown> {
	if (
		fixture.envelope.payload === null ||
		typeof fixture.envelope.payload !== "object" ||
		Array.isArray(fixture.envelope.payload)
	) {
		throw new Error(`${fixture.name} does not contain an object payload.`);
	}
	return fixture.envelope.payload as Record<string, unknown>;
}

describe("pinned Fallow capture fixtures", () => {
	it("pins the reference engine exactly in the manifest and lockfile", async () => {
		const manifest = JSON.parse(
			await readFile(join(REPOSITORY_ROOT, "package.json"), "utf8"),
		) as { devDependencies?: Record<string, string> };
		const lockfile = await readFile(join(REPOSITORY_ROOT, "bun.lock"), "utf8");

		expect(manifest.devDependencies?.fallow).toBe("2.54.2");
		expect(lockfile).toContain('"fallow": "2.54.2"');
		expect(lockfile).toContain('"fallow": ["fallow@2.54.2"');
	});

	it("captures a provenance-labeled live envelope for every supported capability", async () => {
		const files = await readdir(FIXTURE_ROOT);
		const fixtures = await Promise.all(
			FALLOW_CAPABILITY_FIXTURES.map(loadFixture),
		);

		expect(files.filter((file) => file.endsWith(".json")).sort()).toEqual(
			[...FALLOW_CAPABILITY_FIXTURES, ...FALLOW_CONFIG_FIXTURES]
				.map((name) => `${name}.json`)
				.sort(),
		);
		for (const fixture of fixtures) {
			expect(fixture).toMatchObject({
				fixtureSchemaVersion: 1,
				name: fixture.name,
				kind: "capability",
				provenance: {
					envelopeSource: "live-engine",
					provider: "fallow",
					package: "fallow",
					engineVersion: "2.54.2",
				},
				command: {
					executable: "node_modules/.bin/fallow",
					cwd: "<fixture-project>",
				},
				envelope: {
					signal: null,
				},
			});
			expect(["live-engine", "captured-payload"]).toContain(
				fixture.provenance.envelopeSource,
			);
			expect(fixture.command.args).toContain("--no-cache");
			expect(fixture.envelope.code === 0 || fixture.envelope.code === 1).toBe(
				true,
			);
			expect(fixture.envelope.payload).not.toBeNull();
			expect(fixture.envelope.stdout).not.toContain("<fixture-project>/../");
		}

		const fixPreview = objectPayload(
			fixtures.find((fixture) => fixture.name === "fix-preview") ??
				(() => {
					throw new Error("fix-preview fixture is missing.");
				})(),
		);
		expect(fixPreview.dry_run).toBe(true);
		expect(fixPreview.fixes).toEqual(
			expect.arrayContaining([expect.any(Object)]),
		);
	});

	it("captures tracked, staged, and untracked files in the changed-scope audit", async () => {
		const fixture = await loadFixture("changed-scope-audit");
		const payload = objectPayload(fixture);
		const deadCode = payload.dead_code as {
			readonly unused_exports?: readonly { readonly path?: string }[];
			readonly unused_files?: readonly { readonly path?: string }[];
		};
		const findingPaths = [
			...(deadCode.unused_exports ?? []),
			...(deadCode.unused_files ?? []),
		].map((finding) => finding.path);

		expect(fixture.expectedWorkingTreeChanges).toEqual({
			tracked: ["src/tracked.ts"],
			staged: ["src/staged.ts"],
			untracked: ["src/untracked.ts"],
		});
		expect(payload.changed_files_count).toBe(3);
		expect(findingPaths).toEqual(
			expect.arrayContaining([
				"src/tracked.ts",
				"src/staged.ts",
				"src/untracked.ts",
			]),
		);
	});

	it("replays the captured zero-change audit with complete declared coverage", async () => {
		const fixture = await loadFixture("zero-change-audit");
		const payload = objectPayload(fixture);
		const runtime = await replayRuntime(
			"zero-change",
			"config-healthy",
			"zero-change-audit",
		);

		expect(fixture.provenance).toEqual({
			envelopeSource: "live-engine",
			provider: "fallow",
			package: "fallow",
			engineVersion: "2.54.2",
		});
		expect(payload).toMatchObject({
			changed_files_count: 0,
			verdict: "pass",
			summary: {
				dead_code_issues: 0,
				duplication_clone_groups: 0,
				complexity_findings: 0,
			},
		});
		expect(payload).not.toHaveProperty("dead_code");
		expect(payload).not.toHaveProperty("duplication");
		expect(payload).not.toHaveProperty("complexity");

		await expect(
			runtime.execute({
				capability: "changed-scope-audit",
				scope: { kind: "changed", base: "HEAD" },
			}),
		).resolves.toMatchObject({
			kind: "findings",
			verdict: "pass",
			coverage: ["dead-code", "duplication", "complexity"],
			findings: [],
		});

		// An empty changed scope produces no findings, so nothing evidences a
		// boundary evaluation and the category is not declared — identically with
		// and without configured zones (D-032).
		const unconfiguredRuntime = await replayRuntime(
			"zero-change-unconfigured",
			"config-defaults",
			"zero-change-audit",
		);
		await expect(
			unconfiguredRuntime.execute({
				capability: "changed-scope-audit",
				scope: { kind: "changed", base: "HEAD" },
			}),
		).resolves.toMatchObject({
			kind: "findings",
			verdict: "pass",
			coverage: ["dead-code", "duplication", "complexity"],
			findings: [],
		});
	});

	it("fails closed for incomplete or contradictory zero-change summary evidence", async () => {
		const fixture = await loadFixture("zero-change-audit");
		const payload = objectPayload(fixture);
		const summary = payload.summary as Readonly<Record<string, unknown>>;
		const summaryKeys = [
			"dead_code_issues",
			"duplication_clone_groups",
			"complexity_findings",
		] as const;
		const mutations = [
			{
				name: "missing",
				value: undefined,
			},
			{
				name: "malformed",
				value: "0",
			},
			{
				name: "nonzero",
				value: 1,
			},
		] as const;

		for (const key of summaryKeys) {
			for (const mutation of mutations) {
				const mutatedSummary = { ...summary, [key]: mutation.value };
				if (mutation.value === undefined) delete mutatedSummary[key];
				const runtime = await replayRuntime(
					`${mutation.name}-${key}`,
					"config-healthy",
					"zero-change-audit",
					{ ...payload, summary: mutatedSummary },
				);

				await expect(
					runtime.execute({
						capability: "changed-scope-audit",
						scope: { kind: "changed", base: "HEAD" },
					}),
					`${mutation.name} ${key}`,
				).rejects.toMatchObject({
					name: "AnalysisProviderError",
					failureClass: "invalid-output",
				});
			}
		}

		for (const mutation of mutations) {
			const mutatedPayload = {
				...payload,
				changed_files_count: mutation.value,
			};
			if (mutation.value === undefined) {
				delete mutatedPayload.changed_files_count;
			}
			const runtime = await replayRuntime(
				`${mutation.name}-changed-files-count`,
				"config-healthy",
				"zero-change-audit",
				mutatedPayload,
			);

			await expect(
				runtime.execute({
					capability: "changed-scope-audit",
					scope: { kind: "changed", base: "HEAD" },
				}),
				`${mutation.name} changed_files_count`,
			).rejects.toMatchObject({
				name: "AnalysisProviderError",
				failureClass: "invalid-output",
			});
		}
	});

	it("captures the config-introspection exit-code matrix and text preambles", async () => {
		const [healthy, defaults, error] = await Promise.all([
			loadFixture("config-healthy"),
			loadFixture("config-defaults"),
			loadFixture("config-error"),
		]);

		expect(healthy.envelope.code).toBe(0);
		expect(healthy.envelope.stdout).toMatch(
			/^loaded config: <fixture-project>\/\.fallowrc\.json\n\{/u,
		);
		expect(defaults.envelope.code).toBe(3);
		expect(defaults.envelope.stdout).toBe(
			"no config file found, using defaults\n",
		);
		expect(defaults.envelope.payload).toBeNull();
		expect(error.envelope.code).toBe(2);
		expect(error.envelope.stderr).toContain("Failed to parse");

		for (const fixture of [healthy, defaults, error]) {
			expect(fixture.kind).toBe("config-introspection");
			expect(fixture.provenance.envelopeSource).toBe("live-engine");
			expect(fixture.command.args).toContain("--no-cache");
		}
	});

	// @cosmo-behavior plan:analysis-gate-coverage#B-041
	it("derives declared gate coverage from real provider envelopes", async () => {
		const configuredRuntime = await replayRuntime(
			"configured",
			"config-healthy",
		);
		const configuredCases = [
			{
				// The captured dead-code envelope carries a boundary violation, and
				// that finding is itself the evidence boundaries were evaluated
				// (D-032). Coverage does not depend on the resolved configuration.
				request: {
					capability: "dead-code",
					scope: { kind: "project" },
				},
				coverage: ["dead-code", "boundary-conformance"],
			},
			{
				request: {
					capability: "duplication",
					scope: { kind: "project" },
				},
				coverage: ["duplication"],
			},
			{
				request: {
					capability: "complexity",
					scope: { kind: "project" },
					metric: "cyclomatic",
				},
				coverage: ["complexity"],
			},
			{
				request: {
					capability: "boundary-conformance",
					scope: { kind: "project" },
				},
				coverage: ["boundary-conformance"],
			},
			{
				// The captured audit's dead_code sub-envelope reports no boundary
				// violation, so nothing evidences a boundary evaluation and the
				// category is not declared.
				request: {
					capability: "changed-scope-audit",
					scope: { kind: "changed", base: "HEAD" },
				},
				coverage: ["dead-code", "duplication", "complexity"],
			},
		] as const satisfies readonly {
			readonly request: AnalysisRequest;
			readonly coverage: AnalysisGateCoverage;
		}[];

		for (const { request, coverage } of configuredCases) {
			const result = await configuredRuntime.execute(request);
			expect(result).toMatchObject({ kind: "findings", coverage });
			if (result.kind !== "findings") {
				throw new Error(`Expected findings, received ${result.kind}.`);
			}
			expect(new Set(result.coverage).size).toBe(result.coverage.length);
		}

		// Declared coverage is derived from envelope evidence alone, so the same
		// envelopes produce the same coverage whether or not the project
		// configures boundary zones. This is what makes the claim unforgeable by a
		// stale or externally inherited configuration (D-032). The dedicated
		// boundary capability is excluded because it is legitimately unbound
		// without configured zones — a binding property, not a coverage one.
		const unconfiguredRuntime = await replayRuntime(
			"unconfigured",
			"config-defaults",
		);
		for (const { request, coverage } of configuredCases.filter(
			({ request: { capability } }) => capability !== "boundary-conformance",
		)) {
			const result = await unconfiguredRuntime.execute(request);
			expect(result).toMatchObject({ kind: "findings", coverage });
			if (result.kind !== "findings") {
				throw new Error(`Expected findings, received ${result.kind}.`);
			}
			expect(new Set(result.coverage).size).toBe(result.coverage.length);
		}
	});

	it("captures through the local pin without changing the repository worktree", async () => {
		await execFileAsync("git", ["clone", "--quiet", REPOSITORY_ROOT, "."], {
			cwd: sourceRepository.path,
		});
		await symlink(
			join(REPOSITORY_ROOT, "node_modules"),
			join(sourceRepository.path, "node_modules"),
			process.platform === "win32" ? "junction" : "dir",
		);
		const [beforeStatus, beforeFiles] = await Promise.all([
			execFileAsync(
				"git",
				["status", "--porcelain=v1", "--untracked-files=all"],
				{
					cwd: sourceRepository.path,
				},
			),
			snapshotRepositoryFiles(sourceRepository.path),
		]);

		const written = await captureFallowEnvelopes({
			outputRoot: output.path,
			repositoryRoot: sourceRepository.path,
		});

		const [afterStatus, afterFiles] = await Promise.all([
			execFileAsync(
				"git",
				["status", "--porcelain=v1", "--untracked-files=all"],
				{
					cwd: sourceRepository.path,
				},
			),
			snapshotRepositoryFiles(sourceRepository.path),
		]);
		expect(written).toHaveLength(
			FALLOW_CAPABILITY_FIXTURES.length + FALLOW_CONFIG_FIXTURES.length,
		);
		expect(afterStatus.stdout).toBe(beforeStatus.stdout);
		expect(afterFiles).toEqual(beforeFiles);
	});

	it("refuses repository output before writing provider captures", async () => {
		const existingRepositoryDirectory = join(REPOSITORY_ROOT, "tests");

		await expect(
			captureFallowEnvelopes({
				outputRoot: existingRepositoryDirectory,
			}),
		).rejects.toThrow("Capture output must be outside the repository");
	});

	it("does not commit provider cache or generated analysis files", async () => {
		const tracked = await execFileAsync("git", ["ls-files"], {
			cwd: REPOSITORY_ROOT,
		});

		expect(tracked.stdout).not.toMatch(
			/(?:^|\/)\.fallow\/(?:cache|churn)\.bin$/mu,
		);
	});
});
