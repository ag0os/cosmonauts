import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import * as consolidationSources from "../../lib/memory/consolidation-sources.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("project-corpus-source-");
const COLLECT_LIMITS = Object.freeze({
	maxCorpusRecordBytes: 64 * 1024,
	maxCorpusBytes: 256 * 1024,
	maxEpisodeRecordBytes: 64 * 1024,
	maxEpisodeBytes: 256 * 1024,
});

describe("project corpus consolidation source", () => {
	test("exports the production project corpus adapter", () => {
		expect(
			(consolidationSources as Readonly<Record<string, unknown>>)
				.createProjectCorpusConsolidationSource,
		).toBeTypeOf("function");
	});

	test("emits immutable exact-byte snapshots through the knowledge read path", async () => {
		const projectRoot = join(tmp.path, "project");
		const userCosmonautsRoot = join(tmp.path, "user");
		const projectPath = join(projectRoot, "knowledge", "guides", "gotcha.md");
		const userPath = join(userCosmonautsRoot, "knowledge", "preferences.md");
		const projectRaw = [
			"---",
			"type: gotcha",
			"title: Keep exact bytes",
			"description: Preserve the source serialization.",
			"resource: knowledge/guides/gotcha.md",
			"timestamp: 2026-09-02T12:00:00.000Z",
			"scope: project",
			"kind: semantic",
			"tags:",
			"  - memory",
			"  - fixtures",
			"retire-when:",
			"  condition: Remove after the replacement exists.",
			"  check:",
			"    kind: path-exists",
			"    path: docs/replacement.md",
			"files:",
			"  - docs/reference.md",
			"---",
			"",
			"# Keep exact bytes",
			"",
			"Raw body with trailing whitespace.  ",
			"",
		].join("\n");
		const userRaw = [
			"---",
			"type: convention",
			"title: User preference",
			"description: A user-scope measurement record.",
			"resource: preferences.md",
			"timestamp: 2026-09-01T12:00:00.000Z",
			"scope: user",
			"kind: semantic",
			"tags: [preferences]",
			"---",
			"",
			"# User preference",
			"",
			"Measure this record without mutating it.",
			"",
		].join("\n");
		await Promise.all([
			mkdir(join(projectRoot, "knowledge", "guides"), { recursive: true }),
			mkdir(join(userCosmonautsRoot, "knowledge"), { recursive: true }),
		]);
		await Promise.all([
			writeFile(projectPath, projectRaw),
			writeFile(userPath, userRaw),
		]);

		const source = consolidationSources.createProjectCorpusConsolidationSource({
			projectRoot,
			userCosmonautsRoot,
		});
		const snapshot = await source.collect({ limit: 10, ...COLLECT_LIMITS });
		const project = snapshot.records.find(
			(record) => record.scope === "project",
		);
		const user = snapshot.inventory?.find((record) => record.scope === "user");

		expect(source.id).toBe("project-corpus");
		expect(source).not.toHaveProperty("finalize");
		expect(snapshot.inventoryComplete).toBe(true);
		expect(snapshot.warnings).toEqual([]);
		expect(snapshot.omitted).toBe(0);
		expect(project).toEqual({
			id: "knowledge/guides/gotcha.md",
			sourceId: "project-corpus",
			scope: "project",
			path: "knowledge/guides/gotcha.md",
			digest: sha256(projectRaw),
			kind: "knowledge",
			content: projectRaw,
			metadata: {
				type: "gotcha",
				title: "Keep exact bytes",
				description: "Preserve the source serialization.",
				resource: "knowledge/guides/gotcha.md",
				timestamp: "2026-09-02T12:00:00.000Z",
				tags: ["fixtures", "memory"],
				scopeRoot: projectRoot,
				retireWhen: {
					condition: "Remove after the replacement exists.",
					check: { kind: "path-exists", path: "docs/replacement.md" },
				},
				files: ["docs/reference.md"],
			},
		});
		expect(user).toMatchObject({
			id: "knowledge/preferences.md",
			scope: "user",
			path: "knowledge/preferences.md",
			digest: sha256(userRaw),
			metadata: { scopeRoot: userCosmonautsRoot },
		});
		expect(user).not.toHaveProperty("content");
		expect(Object.isFrozen(snapshot)).toBe(true);
		expect(Object.isFrozen(snapshot.records)).toBe(true);
		expect(Object.isFrozen(project)).toBe(true);
		expect(Object.isFrozen(project?.metadata)).toBe(true);
		expect(Object.isFrozen(project?.metadata.tags)).toBe(true);
	});

	// @cosmo-behavior plan:living-memory-fidelity#B-004
	test("marks corpus inventory incomplete when retrieval omits a warned record", async () => {
		const projectRoot = join(tmp.path, "warned-omission-project");
		const userCosmonautsRoot = join(tmp.path, "warned-omission-user");
		const malformedPath = join(projectRoot, "knowledge", "malformed.md");
		const healthy = knowledgeRecord({
			resource: "healthy.md",
			title: "Healthy",
			scope: "project",
		});
		await mkdir(join(projectRoot, "knowledge"), { recursive: true });
		await Promise.all([
			writeFile(join(projectRoot, "knowledge", "healthy.md"), healthy),
			writeFile(malformedPath, "not an OKF knowledge record\n"),
		]);
		const source = consolidationSources.createProjectCorpusConsolidationSource({
			projectRoot,
			userCosmonautsRoot,
		});
		const warning = {
			path: malformedPath,
			message:
				"Knowledge record type undefined is not one of decision, trade-off, gotcha, or convention.",
		};

		const snapshot = await source.collect({ limit: 10, ...COLLECT_LIMITS });
		const aggregate = await consolidationSources.collectConsolidationSources({
			sources: [source],
			maxCorpusRecords: 10,
			maxEpisodeRecords: 10,
			...COLLECT_LIMITS,
		});

		expect(snapshot).toMatchObject({
			omitted: 1,
			deferred: 0,
			inventoryComplete: false,
			warnings: [warning],
		});
		expect(snapshot.knowledgeIndex?.warnings).toEqual([warning]);
		expect(Object.isFrozen(snapshot.warnings)).toBe(true);
		expect(aggregate).toMatchObject({
			inventoryComplete: false,
			warnings: [warning],
		});
		expect(Object.isFrozen(aggregate.warnings)).toBe(true);
		expect(Object.isFrozen(aggregate.warnings[0])).toBe(true);
	});

	test("declines oversized corpus files at the shared knowledge read boundary", async () => {
		const projectRoot = join(tmp.path, "read-bounded-project");
		const userCosmonautsRoot = join(tmp.path, "read-bounded-user");
		const oversizedPath = join(projectRoot, "knowledge", "oversized.md");
		await mkdir(join(projectRoot, "knowledge"), { recursive: true });
		await writeFile(oversizedPath, "x".repeat(1_024));
		const source = consolidationSources.createProjectCorpusConsolidationSource({
			projectRoot,
			userCosmonautsRoot,
		});

		const snapshot = await source.collect({
			limit: 10,
			...COLLECT_LIMITS,
			maxCorpusRecordBytes: 128,
		});

		expect(snapshot.records).toEqual([]);
		expect(snapshot.inventory).toEqual([]);
		expect(snapshot.omitted).toBe(1);
		expect(snapshot.deferred).toBe(1);
		expect(snapshot.declines).toEqual([
			expect.objectContaining({
				code: "source-record-bytes-deferred",
				path: "knowledge/oversized.md",
			}),
		]);
	});

	test("declines aggregate corpus overflow inside the shared knowledge reader", async () => {
		const projectRoot = join(tmp.path, "aggregate-read-bounded-project");
		const userCosmonautsRoot = join(tmp.path, "aggregate-read-bounded-user");
		const first = knowledgeRecord({
			resource: "a.md",
			title: "First bounded record",
			scope: "project",
		});
		await mkdir(join(projectRoot, "knowledge"), { recursive: true });
		await Promise.all([
			writeFile(join(projectRoot, "knowledge", "a.md"), first),
			writeFile(join(projectRoot, "knowledge", "b.md"), "x".repeat(128)),
		]);
		const source = consolidationSources.createProjectCorpusConsolidationSource({
			projectRoot,
			userCosmonautsRoot,
		});

		const snapshot = await source.collect({
			limit: 10,
			...COLLECT_LIMITS,
			maxCorpusBytes: Buffer.byteLength(first, "utf-8") + 16,
		});

		expect(snapshot.records).toHaveLength(1);
		expect(snapshot.inventory).toHaveLength(1);
		expect(snapshot.omitted).toBe(1);
		expect(snapshot.deferred).toBe(1);
		expect(snapshot.declines).toEqual([
			expect.objectContaining({
				code: "source-aggregate-bytes-deferred",
				path: "knowledge/b.md",
			}),
		]);
	});

	test("keeps complete index metadata while admitting only bounded project bodies", async () => {
		const projectRoot = join(tmp.path, "complete-inventory-project");
		const userCosmonautsRoot = join(tmp.path, "complete-inventory-user");
		await Promise.all([
			mkdir(join(projectRoot, "knowledge"), { recursive: true }),
			mkdir(join(userCosmonautsRoot, "knowledge"), { recursive: true }),
		]);
		await Promise.all([
			...Array.from({ length: 51 }, (_, index) =>
				writeFile(
					join(
						projectRoot,
						"knowledge",
						`project-${String(index).padStart(2, "0")}.md`,
					),
					knowledgeRecord({
						resource: `project-${String(index).padStart(2, "0")}.md`,
						title: `Project ${index}`,
						scope: "project",
						timestamp: new Date(
							Date.UTC(2026, 8, 2, 0, 0, index),
						).toISOString(),
					}),
				),
			),
			writeFile(
				join(userCosmonautsRoot, "knowledge", "newest-user.md"),
				knowledgeRecord({
					resource: "newest-user.md",
					title: "Newest user",
					scope: "user",
					timestamp: "2026-09-03T12:00:00.000Z",
				}),
			),
		]);
		const source = consolidationSources.createProjectCorpusConsolidationSource({
			projectRoot,
			userCosmonautsRoot,
		});

		const snapshot = await source.collect({ limit: 50, ...COLLECT_LIMITS });
		const inventory = snapshot.inventory;
		if (inventory === undefined) throw new Error("missing complete inventory");

		expect(inventory).toHaveLength(52);
		expect(inventory.filter((record) => record.scope === "user")).toHaveLength(
			1,
		);
		expect(snapshot.records).toHaveLength(50);
		expect(snapshot.inventoryComplete).toBe(true);
		expect(snapshot.records.every((record) => record.scope === "project")).toBe(
			true,
		);
		expect(snapshot.omitted).toBe(1);
		expect(snapshot.deferred).toBe(1);
	});

	test("pages past represented project records on a subsequent bounded pass", async () => {
		const projectRoot = join(tmp.path, "paged-project");
		const userCosmonautsRoot = join(tmp.path, "paged-user");
		await mkdir(join(projectRoot, "knowledge"), { recursive: true });
		await Promise.all(
			Array.from({ length: 51 }, (_, index) => {
				const suffix = String(index).padStart(2, "0");
				return writeFile(
					join(projectRoot, "knowledge", `project-${suffix}.md`),
					knowledgeRecord({
						resource: `project-${suffix}.md`,
						title: `Project ${index}`,
						scope: "project",
						timestamp: new Date(
							Date.UTC(2026, 8, 2, 0, 0, index),
						).toISOString(),
					}),
				);
			}),
		);
		const source = consolidationSources.createProjectCorpusConsolidationSource({
			projectRoot,
			userCosmonautsRoot,
		});
		const first = await source.collect({ limit: 50, ...COLLECT_LIMITS });
		const second = await source.collect({
			limit: 50,
			...COLLECT_LIMITS,
			representedKeys: first.records.map(
				(record) => `${record.scope}\0${record.path}\0${record.digest}`,
			),
		});

		expect(first.records).toHaveLength(50);
		expect(first.omitted).toBe(1);
		expect(second.records).toHaveLength(1);
		expect(second.records[0]?.path).toBe("knowledge/project-00.md");
		expect(second.omitted).toBe(0);
		expect(second.inventory).toHaveLength(51);
	});

	test("caps live corpus bodies while excluding indexes and retired records without writes", async () => {
		const projectRoot = join(tmp.path, "bounded-project");
		const userCosmonautsRoot = join(tmp.path, "bounded-user");
		const fixtureFiles = new Map<string, string>([
			[
				join(projectRoot, "knowledge", "a.md"),
				knowledgeRecord({ resource: "a.md", title: "A", scope: "project" }),
			],
			[
				join(projectRoot, "knowledge", "nested", "b.md"),
				knowledgeRecord({
					resource: "nested/b.md",
					title: "B",
					scope: "project",
				}),
			],
			[
				join(projectRoot, "knowledge", "z.md"),
				knowledgeRecord({ resource: "z.md", title: "Z", scope: "project" }),
			],
			[
				join(projectRoot, "knowledge", "index.md"),
				"# Reserved project index\n",
			],
			[
				join(projectRoot, "knowledge", "nested", "index.md"),
				"# Reserved nested index\n",
			],
			[
				join(projectRoot, "knowledge", "retired", "old.md"),
				knowledgeRecord({
					resource: "old.md",
					title: "Retired",
					scope: "project",
				}),
			],
			[
				join(userCosmonautsRoot, "knowledge", "preferences.md"),
				knowledgeRecord({
					resource: "preferences.md",
					title: "User",
					scope: "user",
					timestamp: "2026-09-03T12:00:00.000Z",
				}),
			],
			[
				join(userCosmonautsRoot, "knowledge", "index.md"),
				"# Reserved user index\n",
			],
			[
				join(userCosmonautsRoot, "knowledge", "retired", "old.md"),
				knowledgeRecord({
					resource: "old.md",
					title: "Retired user",
					scope: "user",
				}),
			],
		]);
		for (const [path, content] of fixtureFiles) {
			await mkdir(join(path, ".."), { recursive: true });
			await writeFile(path, content);
		}
		const before = await readFixtureFiles(fixtureFiles.keys());
		const source = consolidationSources.createProjectCorpusConsolidationSource({
			projectRoot,
			userCosmonautsRoot,
		});

		const complete = await source.collect({ limit: 10, ...COLLECT_LIMITS });
		const bounded = await source.collect({ limit: 2, ...COLLECT_LIMITS });

		expect(
			complete.inventory?.map((record) => [record.scope, record.path]),
		).toEqual([
			["user", "knowledge/preferences.md"],
			["project", "knowledge/a.md"],
			["project", "knowledge/nested/b.md"],
			["project", "knowledge/z.md"],
		]);
		expect(
			complete.records.map((record) => [record.scope, record.path]),
		).toEqual([
			["project", "knowledge/a.md"],
			["project", "knowledge/nested/b.md"],
			["project", "knowledge/z.md"],
		]);
		expect(complete.omitted).toBe(0);
		expect(bounded.records).toHaveLength(2);
		expect(bounded.records.every((record) => record.scope === "project")).toBe(
			true,
		);
		expect(bounded.omitted).toBe(1);
		expect(bounded.deferred).toBe(1);
		expect(await readFixtureFiles(fixtureFiles.keys())).toEqual(before);
	});
});

describe("project episode consolidation source", () => {
	// @cosmo-behavior plan:living-memory-fidelity#B-006
	test("counts malformed episodes as omitted incomplete inventory", async () => {
		const projectRoot = join(tmp.path, "malformed-episode-project");
		const malformed = "not an OKF episode\n";
		const relativePath = "memory/agent/episodes/malformed.md";
		const malformedPath = join(projectRoot, relativePath);
		await mkdir(join(projectRoot, "memory", "agent", "episodes"), {
			recursive: true,
		});
		await writeFile(malformedPath, malformed);
		const source = consolidationSources.createProjectEpisodeConsolidationSource(
			{
				projectRoot,
			},
		);
		const warning = {
			path: relativePath,
			message: "Memory record is missing required OKF frontmatter.",
		};

		const snapshot = await source.collect({ limit: 10, ...COLLECT_LIMITS });
		const aggregate = await consolidationSources.collectConsolidationSources({
			sources: [source],
			maxCorpusRecords: 10,
			maxEpisodeRecords: 10,
			...COLLECT_LIMITS,
		});

		expect(snapshot).toMatchObject({
			records: [],
			inventory: [
				{
					id: relativePath,
					path: relativePath,
					digest: sha256(malformed),
					kind: "episode",
				},
			],
			omitted: 1,
			deferred: 0,
			inventoryComplete: false,
			warnings: [warning],
		});
		expect(aggregate).toMatchObject({
			inventoryComplete: false,
			warnings: [warning],
		});
	});
});

describe("consolidation source inventory contract", () => {
	test("accepts an explicitly empty inventory from a genuinely empty healthy source", async () => {
		const aggregate = await consolidationSources.collectConsolidationSources({
			sources: [
				{
					id: "empty-custom",
					async collect() {
						return {
							records: [],
							inventory: [],
							inventoryComplete: true,
							omitted: 0,
							deferred: 0,
						};
					},
				},
			],
			maxCorpusRecords: 10,
			maxEpisodeRecords: 10,
			...COLLECT_LIMITS,
		});

		expect(aggregate).toMatchObject({
			inventory: [],
			inventoryComplete: true,
			sources: [{ sourceId: "empty-custom", admitted: 0, omitted: 0 }],
		});
	});
});

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function knowledgeRecord(options: {
	readonly resource: string;
	readonly title: string;
	readonly scope: "project" | "user";
	readonly timestamp?: string;
}): string {
	return [
		"---",
		"type: decision",
		`title: ${options.title}`,
		`description: ${options.title} fixture.`,
		`resource: ${options.resource}`,
		`timestamp: ${options.timestamp ?? "2026-09-02T12:00:00.000Z"}`,
		`scope: ${options.scope}`,
		"kind: semantic",
		"tags: [fixture]",
		"---",
		"",
		`# ${options.title}`,
		"",
		"Fixture body.",
		"",
	].join("\n");
}

async function readFixtureFiles(
	paths: Iterable<string>,
): Promise<Record<string, string>> {
	return Object.fromEntries(
		await Promise.all(
			[...paths].map(
				async (path) => [path, await readFile(path, "utf-8")] as const,
			),
		),
	);
}
