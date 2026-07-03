import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { describe, expect, test } from "vitest";
import {
	generateArchitectureMap,
	type SourceAnalyzer,
	typescriptSourceAnalyzer,
} from "../../lib/architecture-map/index.ts";
import type {
	AnalysisInput,
	AnalysisResult,
	ModuleSkeleton,
	NarrativeProvider,
} from "../../lib/architecture-map/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("architecture-map-generator-");

describe("generateArchitectureMap", () => {
	test("writes OKF index and module shards for a TypeScript fixture @cosmo-behavior plan:code-structure-map#B-002", async () => {
		await writeTypeScriptFixture(tmp.path);

		const result = await generateArchitectureMap({
			projectRoot: tmp.path,
			analyzer: typescriptSourceAnalyzer,
			configOverrides: {
				sourceRoots: ["src"],
				moduleRoots: ["src/domain", "src/shared"],
				narrative: { enabled: false, maxModulesPerRun: 20 },
			},
		});

		expect(result).toMatchObject({
			kind: "written",
			pendingModules: ["src/domain", "src/shared"],
		});
		if (result.kind === "written") {
			expect(result.changedFiles).toEqual([
				"memory/architecture/index.md",
				"memory/architecture/modules/src/domain.md",
				"memory/architecture/modules/src/shared.md",
			]);
		}

		const index = await readMapFile(tmp.path, "index.md");
		const domainShard = await readMapFile(tmp.path, "modules/src/domain.md");
		const sharedShard = await readMapFile(tmp.path, "modules/src/shared.md");
		const parsedIndex = matter(index);
		const parsedDomain = matter(domainShard);

		expect(parsedIndex.data).toMatchObject({
			type: "code-structure-index",
			title: "Architecture Map",
			description: "Generated TypeScript code structure map.",
			resource: "memory/architecture/index.md",
			generatorVersion: "code-structure-map-w1",
			moduleCount: 2,
			narrativeStatus: "pending",
		});
		expect(parsedIndex.data.projectHash).toMatch(/^[a-f0-9]{64}$/u);
		expect(parsedIndex.data.statFingerprint).toMatch(/^[a-f0-9]{64}$/u);
		expect(parsedIndex.data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/u);
		expect(parsedIndex.data.tags).toEqual([
			"architecture-map",
			"generated",
			"typescript",
		]);
		expect(parsedDomain.data).toMatchObject({
			type: "code-structure-module",
			title: "src/domain",
			resource: "modules/src/domain.md",
			generatorVersion: "code-structure-map-w1",
			sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
			skeletonHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
			narrativeStatus: "pending",
		});

		expect(parsedIndex.content).toContain("`code-structure-index`");
		expect(parsedIndex.content).toContain("`code-structure-module`");
		expect(parsedIndex.content).toContain(
			"- `src/domain` - Narrative pending for `src/domain`.",
		);
		expect(parsedIndex.content).toContain(
			"- `src/shared` - Narrative pending for `src/shared`.",
		);
		// @cosmo-behavior plan:code-structure-map#B-003
		expect(parsedIndex.content).toContain("- `src/domain` -> `src/shared`");
		expect(parsedIndex.content).toContain("- `src/shared` -> none");
		expect(domainShard).toContain("- `src/shared`");
		expect(sharedShard).toContain("- `src/domain`");

		await expect(
			access(join(tmp.path, "memory", "architecture", "log.md")),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	test("returns unchanged without touching generated files when sources are unchanged @cosmo-behavior plan:code-structure-map#B-004", async () => {
		await writeTypeScriptFixture(tmp.path);
		const options = {
			projectRoot: tmp.path,
			analyzer: typescriptSourceAnalyzer,
			configOverrides: {
				sourceRoots: ["src"],
				moduleRoots: ["src/domain", "src/shared"],
				narrative: { enabled: false, maxModulesPerRun: 20 },
			},
		};

		await expect(generateArchitectureMap(options)).resolves.toMatchObject({
			kind: "written",
		});
		const indexPath = join(tmp.path, "memory", "architecture", "index.md");
		const shardPath = join(
			tmp.path,
			"memory",
			"architecture",
			"modules",
			"src",
			"domain.md",
		);
		const beforeIndex = await readFile(indexPath, "utf-8");
		const beforeShard = await readFile(shardPath, "utf-8");
		const beforeIndexStat = await stat(indexPath);
		const beforeShardStat = await stat(shardPath);

		const result = await generateArchitectureMap(options);

		expect(result).toEqual({ kind: "unchanged" });
		await expect(readFile(indexPath, "utf-8")).resolves.toBe(beforeIndex);
		await expect(readFile(shardPath, "utf-8")).resolves.toBe(beforeShard);
		await expect(stat(indexPath)).resolves.toMatchObject({
			mtimeMs: beforeIndexStat.mtimeMs,
		});
		await expect(stat(shardPath)).resolves.toMatchObject({
			mtimeMs: beforeShardStat.mtimeMs,
		});
	});

	test("reuses narrative for body-only edits without provider calls @cosmo-behavior plan:code-structure-map#B-005", async () => {
		await writeTypeScriptFixture(tmp.path);
		const provider = fakeNarrativeProvider();
		const options = {
			projectRoot: tmp.path,
			analyzer: typescriptSourceAnalyzer,
			narrativeProvider: provider,
			configOverrides: {
				sourceRoots: ["src"],
				moduleRoots: ["src/domain", "src/shared"],
				narrative: { enabled: true, maxModulesPerRun: 20 },
			},
		};

		await expect(generateArchitectureMap(options)).resolves.toMatchObject({
			kind: "written",
			pendingModules: [],
		});
		const beforeDomain = matter(
			await readMapFile(tmp.path, "modules/src/domain.md"),
		);
		provider.calls.length = 0;

		await writeFile(
			join(tmp.path, "src", "domain", "index.ts"),
			[
				'import type { SharedThing } from "../shared/model";',
				"export interface DomainApi {",
				"\tshared: SharedThing;",
				"}",
				"export function runDomain(): string {",
				'\treturn "domain body changed";',
				"}",
				"",
			].join("\n"),
			"utf-8",
		);

		const result = await generateArchitectureMap(options);
		expect(result).toMatchObject({
			kind: "written",
			pendingModules: [],
		});
		if (result.kind === "written") {
			expect(result.changedFiles).toEqual([
				"memory/architecture/index.md",
				"memory/architecture/modules/src/domain.md",
			]);
		}
		expect(provider.calls).toEqual([]);

		const afterDomain = matter(
			await readMapFile(tmp.path, "modules/src/domain.md"),
		);
		expect(afterDomain.data.sourceHash).not.toBe(beforeDomain.data.sourceHash);
		expect(afterDomain.data.skeletonHash).toBe(beforeDomain.data.skeletonHash);
		expect(afterDomain.data.narrativeStatus).toBe("reused");
		expect(afterDomain.content).toContain(
			"Generated narrative for src/domain.",
		);
		expect(afterDomain.content).toContain("Detailed narrative for src/domain.");
	});

	test("regenerates only the affected public-interface module narrative @cosmo-behavior plan:code-structure-map#B-006", async () => {
		await writeTypeScriptFixture(tmp.path);
		const provider = fakeNarrativeProvider();
		const options = {
			projectRoot: tmp.path,
			analyzer: typescriptSourceAnalyzer,
			narrativeProvider: provider,
			configOverrides: {
				sourceRoots: ["src"],
				moduleRoots: ["src/domain", "src/shared"],
				narrative: { enabled: true, maxModulesPerRun: 20 },
			},
		};

		await expect(generateArchitectureMap(options)).resolves.toMatchObject({
			kind: "written",
			pendingModules: [],
		});
		const beforeDomain = matter(
			await readMapFile(tmp.path, "modules/src/domain.md"),
		);
		const sharedPath = join(
			tmp.path,
			"memory",
			"architecture",
			"modules",
			"src",
			"shared.md",
		);
		const beforeShared = matter(await readFile(sharedPath, "utf-8"));
		const beforeSharedStat = await stat(sharedPath);
		provider.calls.length = 0;

		await writeFile(
			join(tmp.path, "src", "domain", "index.ts"),
			[
				'import type { SharedThing } from "../shared/model";',
				"export interface DomainApi {",
				"\tshared: SharedThing;",
				"\tversion: number;",
				"}",
				"export function runDomain(): string {",
				'\treturn "domain";',
				"}",
				"",
			].join("\n"),
			"utf-8",
		);

		const result = await generateArchitectureMap(options);
		expect(result).toMatchObject({
			kind: "written",
			pendingModules: [],
		});
		if (result.kind === "written") {
			expect(result.changedFiles).toEqual([
				"memory/architecture/index.md",
				"memory/architecture/modules/src/domain.md",
			]);
		}
		expect(provider.calls).toEqual(["src/domain"]);

		const afterDomain = matter(
			await readMapFile(tmp.path, "modules/src/domain.md"),
		);
		const afterShared = matter(await readFile(sharedPath, "utf-8"));
		expect(afterDomain.data.skeletonHash).not.toBe(
			beforeDomain.data.skeletonHash,
		);
		expect(afterDomain.data.narrativeStatus).toBe("generated");
		expect(afterShared.data.skeletonHash).toBe(beforeShared.data.skeletonHash);
		expect(afterShared.content).toContain(
			"Generated narrative for src/shared.",
		);
		expect(
			Math.abs((await stat(sharedPath)).mtimeMs - beforeSharedStat.mtimeMs),
		).toBeLessThan(2);
	});

	test("writes pending narratives for disabled budget-exhausted and failed generation @cosmo-behavior plan:code-structure-map#B-010", async () => {
		const disabledRoot = join(tmp.path, "disabled");
		await writeTypeScriptFixture(disabledRoot);
		const disabledProvider = fakeNarrativeProvider();
		await expect(
			generateArchitectureMap({
				projectRoot: disabledRoot,
				analyzer: typescriptSourceAnalyzer,
				narrativeProvider: disabledProvider,
				configOverrides: {
					sourceRoots: ["src"],
					moduleRoots: ["src/domain", "src/shared"],
					narrative: { enabled: false, maxModulesPerRun: 20 },
				},
			}),
		).resolves.toMatchObject({
			kind: "written",
			pendingModules: ["src/domain", "src/shared"],
		});
		expect(disabledProvider.calls).toEqual([]);
		expect(await readMapFile(disabledRoot, "index.md")).toContain(
			"- `src/domain` - Narrative pending for `src/domain`.",
		);
		expect(await readMapFile(disabledRoot, "modules/src/domain.md")).toContain(
			"Narrative generation is disabled for this run.",
		);

		const budgetRoot = join(tmp.path, "budget");
		await writeTypeScriptFixture(budgetRoot);
		const budgetProvider = fakeNarrativeProvider();
		await expect(
			generateArchitectureMap({
				projectRoot: budgetRoot,
				analyzer: typescriptSourceAnalyzer,
				narrativeProvider: budgetProvider,
				configOverrides: {
					sourceRoots: ["src"],
					moduleRoots: ["src/domain", "src/shared"],
					narrative: { enabled: true, maxModulesPerRun: 1 },
				},
			}),
		).resolves.toMatchObject({
			kind: "written",
			pendingModules: ["src/shared"],
		});
		expect(budgetProvider.calls).toEqual(["src/domain"]);
		expect(await readMapFile(budgetRoot, "modules/src/shared.md")).toContain(
			"Narrative generation budget was exhausted for this run.",
		);

		const failedRoot = join(tmp.path, "failed");
		await writeTypeScriptFixture(failedRoot);
		await expect(
			generateArchitectureMap({
				projectRoot: failedRoot,
				analyzer: typescriptSourceAnalyzer,
				narrativeProvider: fakeNarrativeProvider({
					failFor: new Set(["src/domain", "src/shared"]),
				}),
				configOverrides: {
					sourceRoots: ["src"],
					moduleRoots: ["src/domain", "src/shared"],
					narrative: { enabled: true, maxModulesPerRun: 20 },
				},
			}),
		).resolves.toMatchObject({
			kind: "written",
			pendingModules: ["src/domain", "src/shared"],
		});
		expect(await readMapFile(failedRoot, "modules/src/domain.md")).toContain(
			"Narrative generation failed: failed src/domain",
		);
	});

	test("completes pending narratives later without touching unaffected module files @cosmo-behavior plan:code-structure-map#B-021", async () => {
		await writeTypeScriptFixture(tmp.path);
		const disabledOptions = {
			projectRoot: tmp.path,
			analyzer: typescriptSourceAnalyzer,
			configOverrides: {
				sourceRoots: ["src"],
				moduleRoots: ["src/domain", "src/shared"],
				narrative: { enabled: false, maxModulesPerRun: 20 },
			},
		};

		await expect(
			generateArchitectureMap(disabledOptions),
		).resolves.toMatchObject({
			kind: "written",
			pendingModules: ["src/domain", "src/shared"],
		});
		const sharedPath = join(
			tmp.path,
			"memory",
			"architecture",
			"modules",
			"src",
			"shared.md",
		);
		const beforeShared = await readFile(sharedPath, "utf-8");
		const beforeSharedStat = await stat(sharedPath);
		const provider = fakeNarrativeProvider();

		const result = await generateArchitectureMap({
			projectRoot: tmp.path,
			analyzer: typescriptSourceAnalyzer,
			narrativeProvider: provider,
			configOverrides: {
				sourceRoots: ["src"],
				moduleRoots: ["src/domain", "src/shared"],
				narrative: { enabled: true, maxModulesPerRun: 1 },
			},
		});

		expect(result).toMatchObject({
			kind: "written",
			pendingModules: ["src/shared"],
		});
		if (result.kind === "written") {
			expect(result.changedFiles).toEqual([
				"memory/architecture/index.md",
				"memory/architecture/modules/src/domain.md",
			]);
		}
		expect(provider.calls).toEqual(["src/domain"]);
		expect(
			matter(await readMapFile(tmp.path, "modules/src/domain.md")).data,
		).toMatchObject({
			narrativeStatus: "generated",
		});
		expect(await readFile(sharedPath, "utf-8")).toBe(beforeShared);
		expect(
			Math.abs((await stat(sharedPath)).mtimeMs - beforeSharedStat.mtimeMs),
		).toBeLessThan(2);
	});

	test("preserves previous content and leaves no partial map on analysis or render failure @cosmo-behavior plan:code-structure-map#B-008", async () => {
		await writeEmptyTypeScriptProject(tmp.path);
		await mkdir(join(tmp.path, "memory", "architecture"), { recursive: true });
		await writeFile(
			join(tmp.path, "memory", "architecture", "index.md"),
			"previous map\n",
			"utf-8",
		);

		const analysisFailure = await generateArchitectureMap({
			projectRoot: tmp.path,
			analyzer: fakeAnalyzer({
				analyze: async () => {
					throw new Error("analysis exploded");
				},
			}),
		});

		expect(analysisFailure).toEqual({
			kind: "failed",
			error: "analysis exploded",
			previousMapIntact: true,
		});
		await expect(
			readFile(join(tmp.path, "memory", "architecture", "index.md"), "utf-8"),
		).resolves.toBe("previous map\n");
		await expect(
			access(join(tmp.path, "memory", ".architecture.tmp")),
		).rejects.toMatchObject({ code: "ENOENT" });

		const renderFailure = await generateArchitectureMap({
			projectRoot: tmp.path,
			analyzer: fakeAnalyzer({
				analyze: async () => ({
					modules: [moduleSkeleton("../outside")],
					diagnostics: [],
				}),
			}),
		});

		expect(renderFailure).toMatchObject({
			kind: "failed",
			previousMapIntact: true,
		});
		await expect(
			readFile(join(tmp.path, "memory", "architecture", "index.md"), "utf-8"),
		).resolves.toBe("previous map\n");
		await expect(
			access(join(tmp.path, "memory", "outside.md")),
		).rejects.toMatchObject({ code: "ENOENT" });
		await expect(
			access(join(tmp.path, "memory", ".architecture.tmp")),
		).rejects.toMatchObject({ code: "ENOENT" });

		const noPreviousRoot = join(tmp.path, "no-previous");
		await writeEmptyTypeScriptProject(noPreviousRoot);
		const noPreviousFailure = await generateArchitectureMap({
			projectRoot: noPreviousRoot,
			analyzer: fakeAnalyzer({
				analyze: async () => {
					throw new Error("analysis exploded");
				},
			}),
		});

		expect(noPreviousFailure).toEqual({
			kind: "failed",
			error: "analysis exploded",
			previousMapIntact: false,
		});
		await expect(
			access(join(noPreviousRoot, "memory", "architecture")),
		).rejects.toMatchObject({ code: "ENOENT" });
		await expect(
			access(join(noPreviousRoot, "memory", ".architecture.tmp")),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	test("writes a valid empty OKF index for an empty TypeScript project @cosmo-behavior plan:code-structure-map#B-011", async () => {
		await writeEmptyTypeScriptProject(tmp.path);

		const result = await generateArchitectureMap({
			projectRoot: tmp.path,
			analyzer: typescriptSourceAnalyzer,
		});

		expect(result).toEqual({
			kind: "written",
			changedFiles: ["memory/architecture/index.md"],
			pendingModules: [],
		});
		const index = await readMapFile(tmp.path, "index.md");
		const parsed = matter(index);
		expect(parsed.data).toMatchObject({
			type: "code-structure-index",
			moduleCount: 0,
			narrativeStatus: "generated",
		});
		expect(parsed.data.projectHash).toMatch(/^[a-f0-9]{64}$/u);
		expect(parsed.data.statFingerprint).toMatch(/^[a-f0-9]{64}$/u);
		expect(parsed.content).toContain("No modules discovered.");
		expect(parsed.content).toContain("- Modules discovered: 0");
		await expect(
			access(join(tmp.path, "memory", "architecture", "modules")),
		).rejects.toMatchObject({ code: "ENOENT" });
		await expect(
			access(join(tmp.path, "memory", "architecture", "log.md")),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	test("recovers crash leftovers and confines replacement to memory architecture", async () => {
		await writeTypeScriptFixture(tmp.path);
		await mkdir(join(tmp.path, "memory", ".architecture.tmp"), {
			recursive: true,
		});
		await writeFile(
			join(tmp.path, "memory", ".architecture.tmp", "partial.md"),
			"partial\n",
			"utf-8",
		);
		await mkdir(join(tmp.path, "memory", ".architecture.bak"), {
			recursive: true,
		});
		await writeFile(
			join(tmp.path, "memory", ".architecture.bak", "index.md"),
			"backup map\n",
			"utf-8",
		);
		await writeFile(
			join(tmp.path, "memory", "architecture-note.md"),
			"human note\n",
			"utf-8",
		);

		const result = await generateArchitectureMap({
			projectRoot: tmp.path,
			analyzer: typescriptSourceAnalyzer,
			configOverrides: {
				sourceRoots: ["src"],
				moduleRoots: ["src/domain", "src/shared"],
				narrative: { enabled: false, maxModulesPerRun: 20 },
			},
		});

		expect(result).toMatchObject({ kind: "written" });
		await expect(
			access(join(tmp.path, "memory", ".architecture.tmp")),
		).rejects.toMatchObject({ code: "ENOENT" });
		await expect(
			access(join(tmp.path, "memory", ".architecture.bak")),
		).rejects.toMatchObject({ code: "ENOENT" });
		await expect(
			readFile(join(tmp.path, "memory", "architecture-note.md"), "utf-8"),
		).resolves.toBe("human note\n");
		await expect(readMapFile(tmp.path, "index.md")).resolves.toContain(
			"# Architecture Map",
		);
	});
});

async function writeTypeScriptFixture(projectRoot: string): Promise<void> {
	await writeEmptyTypeScriptProject(projectRoot);
	await mkdir(join(projectRoot, "src", "domain"), { recursive: true });
	await mkdir(join(projectRoot, "src", "shared"), { recursive: true });
	await writeFile(
		join(projectRoot, "src", "domain", "index.ts"),
		[
			'import type { SharedThing } from "../shared/model";',
			"export interface DomainApi {",
			"\tshared: SharedThing;",
			"}",
			"export function runDomain(): string {",
			'\treturn "domain";',
			"}",
			"",
		].join("\n"),
		"utf-8",
	);
	await writeFile(
		join(projectRoot, "src", "shared", "model.ts"),
		["export interface SharedThing {", "\tlabel: string;", "}", ""].join("\n"),
		"utf-8",
	);
}

async function writeEmptyTypeScriptProject(projectRoot: string): Promise<void> {
	await mkdir(projectRoot, { recursive: true });
	await writeFile(
		join(projectRoot, "package.json"),
		JSON.stringify({ type: "module" }),
		"utf-8",
	);
	await writeFile(
		join(projectRoot, "tsconfig.json"),
		JSON.stringify({
			compilerOptions: {
				target: "ES2023",
				module: "ESNext",
				moduleResolution: "Bundler",
				baseUrl: ".",
				allowImportingTsExtensions: true,
				strict: true,
			},
			include: ["src/**/*.ts"],
		}),
		"utf-8",
	);
}

function fakeAnalyzer(options: {
	readonly analyze: (input: AnalysisInput) => Promise<AnalysisResult>;
}): SourceAnalyzer {
	return {
		getConfigInputs: async () => ["tsconfig.json"],
		analyze: options.analyze,
	};
}

function fakeNarrativeProvider(options?: {
	readonly failFor?: ReadonlySet<string>;
}): NarrativeProvider & { readonly calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		generate: async (input) => {
			calls.push(input.skeleton.resource);
			if (options?.failFor?.has(input.skeleton.resource)) {
				throw new Error(`failed ${input.skeleton.resource}`);
			}
			return {
				oneLiner: `Generated narrative for ${input.skeleton.resource}.`,
				text: `Detailed narrative for ${input.skeleton.resource}.`,
			};
		},
	};
}

function moduleSkeleton(resource: string): ModuleSkeleton {
	return {
		resource,
		rootDir: resource,
		files: ["src/module.ts"],
		hasBarrel: false,
		publicInterface: [],
		dependencies: [],
		externalDependencies: [],
		sourceHash: "a".repeat(64),
		skeletonHash: "b".repeat(64),
	};
}

async function readMapFile(
	projectRoot: string,
	mapPath: string,
): Promise<string> {
	return readFile(
		join(projectRoot, "memory", "architecture", mapPath),
		"utf-8",
	);
}
