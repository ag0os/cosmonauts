import {
	mkdir,
	readdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { describe, expect, test } from "vitest";
import { createMarkdownMemoryStore } from "../../lib/memory/index.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("markdown-memory-store-");

describe("markdown memory store", () => {
	test("writes OKF note records under sibling project and user agent stores", async () => {
		const projectRoot = join(tmp.path, "project");
		const userRoot = join(tmp.path, "user-cosmonauts");
		await writeArchitectureMap(projectRoot);
		const architectureBefore = await readFile(
			join(projectRoot, "memory", "architecture", "index.md"),
			"utf-8",
		);
		const store = createMarkdownMemoryStore({
			projectRoot,
			userCosmonautsRoot: userRoot,
			now: () => new Date("2026-07-08T14:00:00.000Z"),
		});

		const projectWrite = await store.write({
			type: "note",
			scope: "project",
			kind: "semantic",
			title: "Release branch",
			description: "Staging deploys happen from release.",
			content: "Staging deploys happen from the `release` branch.",
			tags: ["deploys"],
			source: "main/cosmo",
		});
		const userWrite = await store.write({
			type: "note",
			scope: "user",
			kind: "procedural",
			title: "Review preference",
			description: "Prefer concise review notes.",
			content: "Keep review notes concise.",
			tags: ["reviews"],
		});

		expect(projectWrite).toMatchObject({
			kind: "written",
			path: expect.stringContaining(
				join("project", "memory", "agent", "notes"),
			),
		});
		expect(userWrite).toMatchObject({
			kind: "written",
			path: expect.stringContaining(
				join("user-cosmonauts", "memory", "agent", "notes"),
			),
		});
		if (projectWrite.kind !== "written" || userWrite.kind !== "written") {
			throw new Error("expected written records");
		}

		const parsed = matter(await readFile(projectWrite.path, "utf-8"));
		expect(parsed.data).toMatchObject({
			type: "note",
			title: "Release branch",
			description: "Staging deploys happen from release.",
			resource: expect.stringMatching(
				/^memory\/agent\/notes\/20260708T140000000Z-release-branch-[a-f0-9]{8}\.md$/,
			),
			tags: ["deploys"],
			timestamp: "2026-07-08T14:00:00.000Z",
			scope: "project",
			kind: "semantic",
			source: "main/cosmo",
		});
		expect(parsed.content.trim()).toBe(
			"Staging deploys happen from the `release` branch.",
		);
		expect(projectWrite.record).toMatchObject({
			type: "note",
			scope: "project",
			kind: "semantic",
			resource: parsed.data.resource,
			content: "Staging deploys happen from the `release` branch.",
		});
		await expect(
			readFile(
				join(projectRoot, "memory", "architecture", "index.md"),
				"utf-8",
			),
		).resolves.toBe(architectureBefore);
	});

	test("filters project user and skipped session scopes before retrieval @cosmo-behavior plan:memory-interface#B-008", async () => {
		const projectOne = join(tmp.path, "project-one");
		const projectTwo = join(tmp.path, "project-two");
		const userRoot = join(tmp.path, "user-cosmonauts");
		const firstStore = createMarkdownMemoryStore({
			projectRoot: projectOne,
			userCosmonautsRoot: userRoot,
		});
		const secondStore = createMarkdownMemoryStore({
			projectRoot: projectTwo,
			userCosmonautsRoot: userRoot,
		});

		await writeNoteFile({
			root: projectOne,
			scope: "project",
			timestamp: "2026-07-08T12:00:00.000Z",
			title: "Project one secret",
			content: "Only project one should see this.",
		});
		await writeNoteFile({
			root: userRoot,
			scope: "user",
			timestamp: "2026-07-08T13:00:00.000Z",
			title: "Shared user note",
			content: "Every project for this user may see this.",
		});
		const mismatched = await writeNoteFile({
			root: userRoot,
			scope: "project",
			timestamp: "2026-07-08T14:00:00.000Z",
			title: "User store leak",
			content: "A project scoped record in the user store must not leak.",
		});

		const firstResult = await firstStore.retrieve(
			{ projectRoot: projectOne, scopes: ["session", "project", "user"] },
			{ recordTypes: ["note"] },
		);
		expect(firstResult.records.map((record) => record.title)).toEqual([
			"Shared user note",
			"Project one secret",
		]);
		expect(firstResult.searchedScopes).toEqual(["project", "user"]);
		expect(firstResult.skippedScopes).toEqual([
			{
				scope: "session",
				reason:
					"Session-scoped markdown memory is not built in W1; Pi session state and compaction cover short-term memory.",
			},
		]);
		expect(firstResult.warnings).toEqual([
			{
				path: mismatched,
				message: "Memory record scope project does not match user store.",
			},
		]);

		const secondResult = await secondStore.retrieve(
			{ projectRoot: projectTwo, scopes: ["project", "user"] },
			{ recordTypes: ["note"] },
		);
		expect(secondResult.records.map((record) => record.title)).toEqual([
			"Shared user note",
		]);
		expect(secondResult.warnings.map((warning) => warning.path)).toEqual([
			mismatched,
		]);

		await expect(
			firstStore.retrieve(
				{ projectRoot: projectTwo, scopes: ["project"] },
				{ recordTypes: ["note"] },
			),
		).rejects.toThrow("bound to a different projectRoot");
	});

	test("reflects edited and deleted note files on the next retrieval @cosmo-behavior plan:memory-interface#B-009", async () => {
		const projectRoot = join(tmp.path, "project");
		const userRoot = join(tmp.path, "user-cosmonauts");
		const store = createMarkdownMemoryStore({
			projectRoot,
			userCosmonautsRoot: userRoot,
		});
		const editedPath = await writeNoteFile({
			root: projectRoot,
			scope: "project",
			timestamp: "2026-07-08T12:00:00.000Z",
			title: "Mutable fact",
			content: "Original body",
		});
		const deletedPath = await writeNoteFile({
			root: projectRoot,
			scope: "project",
			timestamp: "2026-07-08T13:00:00.000Z",
			title: "Deleted fact",
			content: "This will be deleted",
		});

		await writeFile(
			editedPath,
			renderNote({
				scope: "project",
				timestamp: "2026-07-08T14:00:00.000Z",
				title: "Edited fact",
				description: "Edited on disk.",
				resource: resourceFor(editedPath, projectRoot),
				content: "Edited body from disk",
			}),
			"utf-8",
		);
		await rm(deletedPath);

		const result = await store.retrieve(
			{ projectRoot, scopes: ["project"] },
			{ text: "edited", recordTypes: ["note"] },
		);
		expect(result.records).toHaveLength(1);
		expect(result.records[0]).toMatchObject({
			title: "Edited fact",
			description: "Edited on disk.",
			timestamp: "2026-07-08T14:00:00.000Z",
			content: "Edited body from disk",
		});
		expect(result.records.map((record) => record.path)).not.toContain(
			deletedPath,
		);
	});

	test("returns honest empty results and malformed record warnings without scaffolding @cosmo-behavior plan:memory-interface#B-010", async () => {
		const projectRoot = join(tmp.path, "project");
		const userRoot = join(tmp.path, "user-cosmonauts");
		const store = createMarkdownMemoryStore({
			projectRoot,
			userCosmonautsRoot: userRoot,
		});

		const absent = await store.retrieve(
			{ projectRoot, scopes: ["project", "user"] },
			{ text: "anything", recordTypes: ["note"] },
		);
		expect(absent).toEqual({
			records: [],
			searchedScopes: ["project", "user"],
			skippedScopes: [],
			warnings: [],
		});
		await expect(readdir(join(projectRoot, "memory"))).rejects.toMatchObject({
			code: "ENOENT",
		});
		await expect(readdir(join(userRoot, "memory"))).rejects.toMatchObject({
			code: "ENOENT",
		});

		const healthy = await writeNoteFile({
			root: projectRoot,
			scope: "project",
			timestamp: "2026-07-08T13:00:00.000Z",
			title: "Healthy note",
			content: "Healthy content",
		});
		const malformed = join(
			projectRoot,
			"memory",
			"agent",
			"notes",
			"malformed.md",
		);
		await writeFile(
			malformed,
			"---\ntype: note\n---\nMissing fields\n",
			"utf-8",
		);
		const mismatched = await writeNoteFile({
			root: projectRoot,
			scope: "user",
			timestamp: "2026-07-08T14:00:00.000Z",
			title: "Wrong scope",
			content: "Wrong physical store",
		});
		await writeFile(
			join(projectRoot, "memory", "agent", "index.md"),
			"# Human index edits are not authored records\n",
			"utf-8",
		);

		const noMatch = await store.retrieve(
			{ projectRoot, scopes: ["project"] },
			{ text: "not present", recordTypes: ["note"] },
		);
		expect(noMatch.records).toEqual([]);
		expect(noMatch.searchedScopes).toEqual(["project"]);
		expect(noMatch.warnings.map((warning) => warning.path).sort()).toEqual(
			[malformed, mismatched].sort(),
		);

		const withWarnings = await store.retrieve(
			{ projectRoot, scopes: ["project"] },
			{ recordTypes: ["note"] },
		);
		expect(withWarnings.records.map((record) => record.path)).toEqual([
			healthy,
		]);
		expect(withWarnings.warnings).toEqual([
			{
				path: mismatched,
				message: "Memory record scope user does not match project store.",
			},
			{
				path: malformed,
				message: "Memory record is missing required OKF frontmatter.",
			},
		]);
	});

	test("builds compact indexes most recent first @cosmo-behavior plan:memory-interface#B-014", async () => {
		const projectRoot = join(tmp.path, "project");
		const userRoot = join(tmp.path, "user-cosmonauts");
		const store = createMarkdownMemoryStore({
			projectRoot,
			userCosmonautsRoot: userRoot,
		});
		const older = await writeNoteFile({
			root: projectRoot,
			scope: "project",
			timestamp: "2026-07-08T10:00:00.000Z",
			title: "Older note",
			content: "Older content",
		});
		await writeNoteFile({
			root: projectRoot,
			scope: "project",
			timestamp: "2026-07-08T11:00:00.000Z",
			title: "Tie B",
			content: "Tie content B",
			fileName: "b.md",
		});
		await writeNoteFile({
			root: projectRoot,
			scope: "project",
			timestamp: "2026-07-08T11:00:00.000Z",
			title: "Tie A",
			content: "Tie content A",
			fileName: "a.md",
		});
		await writeFile(
			join(projectRoot, "memory", "agent", "index.md"),
			renderNote({
				scope: "project",
				timestamp: "2026-07-08T12:00:00.000Z",
				title: "Index is not a note",
				resource: "memory/agent/index.md",
				content: "Index files are excluded.",
			}),
			"utf-8",
		);

		const result = await store.retrieve(
			{ projectRoot, scopes: ["project"] },
			{ text: "", recordTypes: ["note"] },
		);
		expect(result.records.map((record) => record.title)).toEqual([
			"Tie A",
			"Tie B",
			"Older note",
		]);
		expect(result.records.map((record) => record.path)).not.toContain(
			join(projectRoot, "memory", "agent", "index.md"),
		);
		expect(result.records.map((record) => record.path)).toContain(older);
	});

	test("writes safely and regenerates index idempotently", async () => {
		const projectRoot = join(tmp.path, "project");
		const userRoot = join(tmp.path, "user-cosmonauts");
		const store = createMarkdownMemoryStore({
			projectRoot,
			userCosmonautsRoot: userRoot,
			now: () => new Date("2026-07-08T14:00:00.000Z"),
		});
		const draft = {
			type: "note",
			scope: "project",
			kind: "semantic",
			title: "Stable index",
			description: "Stable index content.",
			content: "Index regeneration should not churn.",
			tags: ["stable"],
		} as const;

		const first = await store.write(draft);
		expect(first.kind).toBe("written");
		if (first.kind !== "written") throw new Error("expected written record");
		const indexPath = join(projectRoot, "memory", "agent", "index.md");
		const firstIndex = await readFile(indexPath, "utf-8");
		const firstIndexStat = await stat(indexPath);

		const second = await store.write(draft);
		expect(second).toMatchObject({ kind: "written", path: first.path });
		expect(await readFile(indexPath, "utf-8")).toBe(firstIndex);
		expect((await stat(indexPath)).mtimeMs).toBe(firstIndexStat.mtimeMs);

		const blockedRoot = join(tmp.path, "blocked-user-root");
		await writeFile(blockedRoot, "not a directory\n", "utf-8");
		const blockedStore = createMarkdownMemoryStore({
			projectRoot,
			userCosmonautsRoot: blockedRoot,
			now: () => new Date("2026-07-08T15:00:00.000Z"),
		});
		const failed = await blockedStore.write({
			type: "note",
			scope: "user",
			kind: "semantic",
			title: "Blocked write",
			description: "Directory creation fails.",
			content: "No partial record should remain.",
			tags: [],
		});
		expect(failed).toMatchObject({
			kind: "failed",
			path: expect.stringContaining(
				join("blocked-user-root", "memory", "agent"),
			),
		});
		await expect(readdir(blockedRoot)).rejects.toMatchObject({
			code: "ENOTDIR",
		});
	});
});

async function writeArchitectureMap(projectRoot: string): Promise<void> {
	await mkdir(join(projectRoot, "memory", "architecture"), { recursive: true });
	await writeFile(
		join(projectRoot, "memory", "architecture", "index.md"),
		"---\ntype: code-structure-index\nresource: memory/architecture/index.md\ntimestamp: 2026-07-08T14:00:00.000Z\n---\n\n# Architecture\n",
		"utf-8",
	);
}

async function writeNoteFile(options: {
	readonly root: string;
	readonly scope: "project" | "user";
	readonly timestamp: string;
	readonly title: string;
	readonly content: string;
	readonly description?: string;
	readonly fileName?: string;
}): Promise<string> {
	const fileName =
		options.fileName ??
		`${options.timestamp.replace(/[-:.]/g, "")}-${options.title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")}.md`;
	const path = join(options.root, "memory", "agent", "notes", fileName);
	await mkdir(join(options.root, "memory", "agent", "notes"), {
		recursive: true,
	});
	await writeFile(
		path,
		renderNote({
			scope: options.scope,
			timestamp: options.timestamp,
			title: options.title,
			description: options.description ?? `${options.title} description.`,
			resource: resourceFor(path, options.root),
			content: options.content,
		}),
		"utf-8",
	);
	return path;
}

function renderNote(options: {
	readonly scope: "project" | "user";
	readonly timestamp: string;
	readonly title: string;
	readonly resource: string;
	readonly content: string;
	readonly description?: string;
}): string {
	return matter.stringify(options.content, {
		type: "note",
		title: options.title,
		description: options.description ?? `${options.title} description.`,
		resource: options.resource,
		tags: [],
		timestamp: options.timestamp,
		scope: options.scope,
		kind: "semantic",
	});
}

function resourceFor(path: string, root: string): string {
	return path
		.slice(root.length + 1)
		.split("/")
		.join("/");
}
