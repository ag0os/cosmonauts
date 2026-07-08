import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { ArchitectureMapRetrievalDetails } from "../../lib/architecture-map/index.ts";
import { createArchitectureMapMemoryStore } from "../../lib/architecture-map/index.ts";
import {
	createMarkdownMemoryStore,
	MEMORY_KINDS,
	MEMORY_SCOPES,
	type MemoryStore,
} from "../../lib/memory/index.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("memory-interface-");

describe("memory interface", () => {
	test("consolidate reports an honest W1 no-op for markdown and architecture stores @cosmo-behavior plan:memory-interface#B-011", async () => {
		const userRoot = join(tmp.path, "user-cosmonauts");
		const markdown = createMarkdownMemoryStore({
			projectRoot: tmp.path,
			userCosmonautsRoot: userRoot,
			now: () => new Date("2026-07-08T14:00:00.000Z"),
		});
		const written = await markdown.write({
			type: "note",
			scope: "project",
			kind: "semantic",
			title: "Release branch",
			description: "Staging deploy branch.",
			content: "Staging deploys happen from release.",
			tags: ["deploys"],
		});
		expect(written.kind).toBe("written");
		if (written.kind !== "written") throw new Error("expected written record");

		const markdownIndexPath = join(tmp.path, "memory", "index.md");
		await writeFile(markdownIndexPath, "# Memory Index\n", "utf-8");
		await writeArchitectureMap(tmp.path);

		const architecture = createArchitectureMapMemoryStore({
			projectRoot: tmp.path,
			checkFreshness: async () => ({ kind: "current", hash: "stat-current" }),
		});

		const before = await readTrackedFiles([
			written.path,
			markdownIndexPath,
			join(tmp.path, "memory", "architecture", "index.md"),
			join(tmp.path, "memory", "architecture", "modules", "lib", "agents.md"),
		]);

		const stores = [markdown, architecture] satisfies readonly MemoryStore[];
		for (const store of stores) {
			await expect(store.consolidate()).resolves.toEqual({
				kind: "noop",
				reason:
					"W1 performs no background memory consolidation, pruning, decay, or dreaming.",
			});
		}

		await expect(
			readTrackedFiles([
				written.path,
				markdownIndexPath,
				join(tmp.path, "memory", "architecture", "index.md"),
				join(tmp.path, "memory", "architecture", "modules", "lib", "agents.md"),
			]),
		).resolves.toEqual(before);
	});

	test("exposes W1 taxonomy and honest write outcomes without speculative consolidation variants", async () => {
		expect(MEMORY_SCOPES).toEqual(["session", "project", "user"]);
		expect(MEMORY_KINDS).toEqual(["semantic", "procedural", "episodic"]);

		const architecture = createArchitectureMapMemoryStore({
			projectRoot: tmp.path,
			checkFreshness: async () => ({ kind: "missing" }),
		});
		await expect(
			architecture.write({
				type: "note",
				scope: "project",
				kind: "semantic",
				title: "No direct map writes",
				description: "Architecture writes stay generated.",
				content: "Generated architecture-map writes stay out of this store.",
				tags: [],
			}),
		).resolves.toEqual({
			kind: "unsupported",
			reason:
				"Architecture-map memory is generated derived state; writes remain owned by generateArchitectureMap.",
		});

		const blockedUserRoot = join(tmp.path, "not-a-directory");
		await writeFile(
			blockedUserRoot,
			"file blocks directory creation\n",
			"utf-8",
		);
		const markdown = createMarkdownMemoryStore({
			projectRoot: tmp.path,
			userCosmonautsRoot: blockedUserRoot,
		});
		const failed = await markdown.write({
			type: "note",
			scope: "user",
			kind: "procedural",
			title: "Reachable failure",
			description: "Failed writes report real filesystem errors.",
			content: "This should fail before a partial record is written.",
			tags: [],
		});
		expect(failed).toMatchObject({
			kind: "failed",
			path: expect.stringContaining("not-a-directory"),
		});
		if (failed.kind !== "failed") throw new Error("expected failed write");
		expect(failed.reason).not.toBe("");

		const typesSource = await readFile(
			join(process.cwd(), "lib", "memory", "types.ts"),
			"utf-8",
		);
		expect(typesSource).toContain('readonly kind: "noop"');
		expect(typesSource).not.toContain('"consolidated"');
		expect(typesSource).not.toContain("registry");
	});

	test("keeps the memory public surface to W1 contracts and factories", async () => {
		const indexSource = await readFile(
			join(process.cwd(), "lib", "memory", "index.ts"),
			"utf-8",
		);
		const fallowConfig = await readFile(
			join(process.cwd(), "fallow.toml"),
			"utf-8",
		);

		expect(fallowConfig).toContain('"lib/memory/index.ts"');
		expect(indexSource).toContain("createMarkdownMemoryStore");
		expect(indexSource).toContain("MarkdownMemoryStoreOptions");
		expect(indexSource).toContain("MemoryStore");
		expect(indexSource).toContain("MemoryConsolidateResult");
		expect(indexSource).not.toContain("./okf.ts");
		expect(indexSource).not.toContain("./paths.ts");
		expect(indexSource).not.toContain("backend");
		expect(indexSource).not.toContain("config");
		expect(indexSource).not.toContain("session-store");
		expect(indexSource).not.toContain("consolidated");
	});

	test("retrieves markdown notes and architecture maps through the shared MemoryStore interface @cosmo-behavior plan:memory-interface#B-002", async () => {
		const userRoot = join(tmp.path, "user-cosmonauts");
		const markdown: MemoryStore = createMarkdownMemoryStore({
			projectRoot: tmp.path,
			userCosmonautsRoot: userRoot,
			now: () => new Date("2026-07-08T14:00:00.000Z"),
		});
		const architecture: MemoryStore = createArchitectureMapMemoryStore({
			projectRoot: tmp.path,
			checkFreshness: async () => ({ kind: "current", hash: "stat-current" }),
		});

		const written = await markdown.write({
			type: "note",
			scope: "project",
			kind: "semantic",
			title: "Release branch",
			description: "Staging deploy branch.",
			content: "Staging deploys happen from release.",
			tags: ["deploys"],
		});
		expect(written.kind).toBe("written");

		const markdownRetrieved = await markdown.retrieve(
			{ projectRoot: tmp.path, scopes: ["project"] },
			{ text: "staging deploys" },
		);
		expect(markdownRetrieved.records).toHaveLength(1);
		expect(markdownRetrieved.records[0]).toMatchObject({
			type: "note",
			scope: "project",
			title: "Release branch",
			content: "Staging deploys happen from release.",
		});

		await writeArchitectureMap(tmp.path);
		const architectureRetrieved = await architecture.retrieve(
			{ projectRoot: tmp.path, scopes: ["project"] },
			{ recordTypes: ["code-structure-index"], limit: 1 },
		);
		expect(architectureRetrieved.records).toHaveLength(1);
		expect(architectureRetrieved.records[0]).toMatchObject({
			type: "code-structure-index",
			scope: "project",
			resource: "memory/architecture/index.md",
		});
		expect(architectureRetrieved.records[0]?.content).toContain(
			"Architecture map freshness: current (stat-current)",
		);

		const ineligible = await architecture.retrieve(
			{ projectRoot: tmp.path, scopes: ["session", "user"] },
			{},
		);
		expect(ineligible.records).toEqual([]);
		expect(ineligible.searchedScopes).toEqual([]);
		expect(ineligible.skippedScopes).toEqual([
			{
				scope: "session",
				reason: "Architecture-map memory is project-scoped generated state.",
			},
			{
				scope: "user",
				reason: "Architecture-map memory is project-scoped generated state.",
			},
		]);
		expect(ineligible.details).toMatchObject({
			status: "scope-ineligible",
			freshness: { kind: "current", hash: "stat-current" },
		} satisfies Partial<ArchitectureMapRetrievalDetails>);

		await expect(
			architecture.write({
				type: "note",
				scope: "project",
				kind: "semantic",
				title: "No direct map writes",
				description: "Architecture writes stay generated.",
				content: "Generated architecture-map writes stay out of this store.",
				tags: [],
			}),
		).resolves.toEqual({
			kind: "unsupported",
			reason:
				"Architecture-map memory is generated derived state; writes remain owned by generateArchitectureMap.",
		});
	});

	test("keeps lib memory core domain-neutral", async () => {
		const memoryDir = join(process.cwd(), "lib", "memory");
		const files = (await readdir(memoryDir))
			.filter((file) => file.endsWith(".ts"))
			.sort();
		const forbidden = [
			"@earendil-works/pi",
			"../architecture-map",
			"../../architecture-map",
			"../artifact-viewer",
			"../../artifact-viewer",
			"../orchestration",
			"../../orchestration",
			"../tasks",
			"../../tasks",
			"../plans",
			"../../plans",
			"../domains",
			"../../domains",
			"../cli",
			"../../cli",
		];

		for (const file of files) {
			const source = await readFile(join(memoryDir, file), "utf-8");
			for (const pattern of forbidden) {
				expect(source, `${file} imports ${pattern}`).not.toContain(pattern);
			}
		}
	});
});

async function readTrackedFiles(
	paths: readonly string[],
): Promise<Record<string, string>> {
	const entries = await Promise.all(
		paths.map(async (path) => [path, await readFile(path, "utf-8")] as const),
	);
	return Object.fromEntries(entries);
}

async function writeArchitectureMap(projectRoot: string): Promise<void> {
	await mkdir(join(projectRoot, "memory", "architecture", "modules", "lib"), {
		recursive: true,
	});
	await writeFile(
		join(projectRoot, "memory", "architecture", "index.md"),
		[
			"---",
			"type: code-structure-index",
			"resource: memory/architecture/index.md",
			"timestamp: 2026-07-08T14:00:00.000Z",
			"---",
			"",
			"# Architecture Map",
			"",
			"- `lib/agents` - Agent definitions.",
			"",
		].join("\n"),
		"utf-8",
	);
	await writeFile(
		join(projectRoot, "memory", "architecture", "modules", "lib", "agents.md"),
		[
			"---",
			"type: code-structure-module",
			"resource: lib/agents",
			"timestamp: 2026-07-08T14:00:00.000Z",
			"---",
			"",
			"# lib/agents",
			"",
		].join("\n"),
		"utf-8",
	);
}
