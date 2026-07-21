import {
	chmod,
	mkdir,
	readdir,
	readFile,
	rm,
	stat,
	utimes,
	writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import matter from "gray-matter";
import { describe, expect, test } from "vitest";
import {
	canonicalizePlaybookName,
	createEpisodeRecord,
	createMarkdownMemoryStore,
	PROFILE_WRITE_MAX_BYTES,
} from "../../lib/memory/index.ts";
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
			stats: {
				filesScanned: 0,
				bytesRead: 0,
				durationMs: expect.any(Number),
			},
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
		expect(firstIndex).toContain("type: memory-index");
		expect(firstIndex).toContain(
			"- 2026-07-08T14:00:00.000Z [project/semantic] Stable index",
		);

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

	test("canonicalizes playbook names into stable scoped resources @cosmo-behavior plan:profile-playbooks#B-008", async () => {
		const projectRoot = join(tmp.path, "canonical-project");
		const userRoot = join(tmp.path, "canonical-user");
		const store = createMarkdownMemoryStore({
			projectRoot,
			userCosmonautsRoot: userRoot,
		});

		expect(canonicalizePlaybookName("  Ｒélease — Déploy!! ")).toBe(
			"rélease-déploy",
		);
		expect(canonicalizePlaybookName("界".repeat(100))).toBe("界".repeat(80));
		expect([...canonicalizePlaybookName("界".repeat(100))]).toHaveLength(80);
		expect(canonicalizePlaybookName(" --- ")).toBe("");

		const projectWrite = await store.write({
			type: "playbook",
			scope: "project",
			kind: "procedural",
			title: "  Ｒélease — Déploy!! ",
			description: "",
			content: "Verify, tag, then deploy.",
			tags: ["release"],
			timestamp: "2026-07-13T12:00:00.000Z",
		});
		expect(projectWrite).toMatchObject({
			kind: "written",
			path: join(
				projectRoot,
				"memory",
				"agent",
				"playbooks",
				"rélease-déploy.md",
			),
			record: {
				type: "playbook",
				scope: "project",
				description: "Ｒélease — Déploy!!",
				resource: "memory/agent/playbooks/rélease-déploy.md",
			},
		});
		if (projectWrite.kind !== "written") {
			throw new Error("expected project playbook write");
		}
		expect(
			await readFile(join(projectRoot, "memory", "agent", "index.md"), "utf-8"),
		).toContain("  Ｒélease — Déploy!!");

		const sameProjectIdentity = await store.write({
			type: "playbook",
			scope: "project",
			kind: "procedural",
			title: "RÉLEASE — DÉPLOY",
			description: "Updated in place.",
			content: "Updated steps.",
			tags: [],
			timestamp: "2026-07-13T13:00:00.000Z",
		});
		expect(sameProjectIdentity).toMatchObject({
			kind: "written",
			path: projectWrite.path,
		});

		const userWrite = await store.write({
			type: "playbook",
			scope: "user",
			kind: "procedural",
			title: "RÉLEASE — DÉPLOY",
			description: "Same key in the user scope.",
			content: "User-wide steps.",
			tags: [],
			timestamp: "2026-07-13T14:00:00.000Z",
		});
		expect(userWrite).toMatchObject({
			kind: "written",
			path: join(userRoot, "memory", "agent", "playbooks", "rélease-déploy.md"),
		});
		expect(userWrite).not.toMatchObject({ path: projectWrite.path });

		const emptyKey = await store.write({
			type: "playbook",
			scope: "project",
			kind: "procedural",
			title: " --- ",
			description: "Invalid title.",
			content: "No write.",
			tags: [],
		});
		expect(emptyKey).toMatchObject({
			kind: "unsupported",
			reason: expect.stringMatching(/canonical.*empty/i),
		});
		expect(
			await readdir(join(projectRoot, "memory", "agent", "playbooks")),
		).toEqual(["rélease-déploy.md"]);

		const invalidOccupantPath = join(
			projectRoot,
			"memory",
			"agent",
			"playbooks",
			"occupied.md",
		);
		const invalidOccupant =
			"---\ntype: playbook\n---\nHuman-owned invalid occupant.\n";
		await writeFile(invalidOccupantPath, invalidOccupant, "utf-8");
		const occupied = await store.write({
			type: "playbook",
			scope: "project",
			kind: "procedural",
			title: "Occupied",
			description: "Must not overwrite.",
			content: "No write.",
			tags: [],
		});
		expect(occupied).toMatchObject({
			kind: "failed",
			path: invalidOccupantPath,
			reason: expect.stringMatching(/invalid occupant/i),
		});
		expect(await readFile(invalidOccupantPath, "utf-8")).toBe(invalidOccupant);
		await expect(
			store.write({
				type: "playbook",
				scope: "project",
				kind: "semantic",
				title: "Wrong kind",
				description: "Unsupported.",
				content: "No write.",
				tags: [],
			}),
		).resolves.toMatchObject({ kind: "unsupported" });
	});

	test("keeps profile and playbook scopes isolated across projects @cosmo-behavior plan:profile-playbooks#B-011", async () => {
		const projectA = join(tmp.path, "scope-project-a");
		const projectB = join(tmp.path, "scope-project-b");
		const userRoot = join(tmp.path, "scope-user");
		const firstStore = createMarkdownMemoryStore({
			projectRoot: projectA,
			userCosmonautsRoot: userRoot,
		});
		const secondStore = createMarkdownMemoryStore({
			projectRoot: projectB,
			userCosmonautsRoot: userRoot,
		});

		await firstStore.write({
			type: "playbook",
			scope: "project",
			kind: "procedural",
			title: "Project A release",
			description: "Only project A uses this.",
			content: "Project A steps.",
			tags: [],
			timestamp: "2026-07-13T13:00:00.000Z",
		});
		await firstStore.write({
			type: "playbook",
			scope: "user",
			kind: "procedural",
			title: "Shared review",
			description: "Shared across projects.",
			content: "Shared review steps.",
			tags: [],
			timestamp: "2026-07-13T14:00:00.000Z",
		});
		await firstStore.write({
			type: "profile",
			scope: "user",
			kind: "semantic",
			title: "User profile",
			description: "Durable user profile and preferences.",
			content: "Prefer concise explanations.",
			tags: [],
			timestamp: "2026-07-13T15:00:00.000Z",
		});

		await expect(
			firstStore.write({
				type: "profile",
				scope: "project",
				kind: "semantic",
				title: "Project profile",
				description: "Not supported.",
				content: "Must not be eligible.",
				tags: [],
			}),
		).resolves.toMatchObject({ kind: "unsupported" });
		await expect(
			firstStore.write({
				type: "playbook",
				scope: "session",
				kind: "procedural",
				title: "Session playbook",
				description: "Not supported.",
				content: "Must stay skipped.",
				tags: [],
			}),
		).resolves.toMatchObject({ kind: "unsupported" });

		const firstResult = await firstStore.retrieve(
			{ projectRoot: projectA, scopes: ["session", "project", "user"] },
			{ recordTypes: ["profile", "playbook"] },
		);
		expect(firstResult.records.map((record) => record.title)).toEqual([
			"User profile",
			"Shared review",
			"Project A release",
		]);
		expect(firstResult.skippedScopes).toHaveLength(1);
		expect(firstResult.skippedScopes[0]?.scope).toBe("session");

		const secondResult = await secondStore.retrieve(
			{ projectRoot: projectB, scopes: ["session", "project", "user"] },
			{ recordTypes: ["profile", "playbook"] },
		);
		expect(secondResult.records.map((record) => record.title)).toEqual([
			"User profile",
			"Shared review",
		]);
		expect(secondResult.records).not.toContainEqual(
			expect.objectContaining({ title: "Project A release" }),
		);
		await expect(
			stat(join(projectA, "memory", "agent", "profile.md")),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	test("skips malformed profile and playbook records with file warnings @cosmo-behavior plan:profile-playbooks#B-012", async () => {
		const emptyProject = join(tmp.path, "malformed-empty-project");
		const emptyUser = join(tmp.path, "malformed-empty-user");
		const emptyStore = createMarkdownMemoryStore({
			projectRoot: emptyProject,
			userCosmonautsRoot: emptyUser,
		});
		await expect(
			emptyStore.retrieve(
				{ projectRoot: emptyProject, scopes: ["project", "user"] },
				{},
			),
		).resolves.toMatchObject({ records: [], warnings: [] });
		await expect(stat(join(emptyProject, "memory"))).rejects.toMatchObject({
			code: "ENOENT",
		});
		await expect(stat(join(emptyUser, "memory"))).rejects.toMatchObject({
			code: "ENOENT",
		});

		const projectRoot = join(tmp.path, "malformed-project");
		const userRoot = join(tmp.path, "malformed-user");
		const store = createMarkdownMemoryStore({
			projectRoot,
			userCosmonautsRoot: userRoot,
		});
		const userProfilePath = join(userRoot, "memory", "agent", "profile.md");
		await mkdir(join(userRoot, "memory", "agent"), { recursive: true });

		const invalidProfiles = [
			renderRecord({
				type: "note",
				scope: "user",
				kind: "semantic",
				resource: "memory/agent/profile.md",
				title: "Wrong reserved type",
			}),
			renderRecord({
				type: "profile",
				scope: "project",
				kind: "semantic",
				resource: "memory/agent/profile.md",
				title: "Wrong profile scope",
			}),
			renderRecord({
				type: "profile",
				scope: "user",
				kind: "procedural",
				resource: "memory/agent/profile.md",
				title: "Wrong profile kind",
			}),
			"---\ntype: profile\ninvalid: [\n---\nMalformed profile\n",
		];
		for (const raw of invalidProfiles) {
			await writeFile(userProfilePath, raw, "utf-8");
			const invalidResult = await store.retrieve(
				{ projectRoot, scopes: ["user"] },
				{},
			);
			expect(invalidResult.records).toEqual([]);
			expect(invalidResult.warnings).toEqual([
				{
					path: userProfilePath,
					message: expect.any(String),
				},
			]);
		}

		const healthyNote = await writeRecordFile({
			root: projectRoot,
			relativePath: "memory/agent/notes/nested/healthy.md",
			type: "note",
			scope: "project",
			kind: "semantic",
			title: "Healthy recursive note",
			timestamp: "2026-07-13T10:00:00.000Z",
		});
		const healthyPlaybook = await writeRecordFile({
			root: projectRoot,
			relativePath: "memory/agent/playbooks/healthy.md",
			type: "playbook",
			scope: "project",
			kind: "procedural",
			title: "Healthy playbook",
			timestamp: "2026-07-13T11:00:00.000Z",
		});
		await writeFile(
			userProfilePath,
			renderRecord({
				type: "profile",
				scope: "user",
				kind: "semantic",
				resource: "memory/agent/profile.md",
				title: "Healthy profile",
				timestamp: "2026-07-13T12:00:00.000Z",
			}),
			"utf-8",
		);

		const malformedNote = join(
			projectRoot,
			"memory",
			"agent",
			"notes",
			"malformed.md",
		);
		await writeFile(
			malformedNote,
			"---\ntype: note\n---\nMissing fields\n",
			"utf-8",
		);
		const profileUnderNotes = await writeRecordFile({
			root: projectRoot,
			relativePath: "memory/agent/notes/profile.md",
			type: "profile",
			scope: "project",
			kind: "semantic",
			title: "Profile under notes",
		});
		const playbookUnderNotes = await writeRecordFile({
			root: projectRoot,
			relativePath: "memory/agent/notes/playbook.md",
			type: "playbook",
			scope: "project",
			kind: "procedural",
			title: "Playbook under notes",
		});
		const noteUnderPlaybooks = await writeRecordFile({
			root: projectRoot,
			relativePath: "memory/agent/playbooks/note.md",
			type: "note",
			scope: "project",
			kind: "semantic",
			title: "Note under playbooks",
		});
		const nestedPlaybook = await writeRecordFile({
			root: projectRoot,
			relativePath: "memory/agent/playbooks/nested/playbook.md",
			type: "playbook",
			scope: "project",
			kind: "procedural",
			title: "Nested playbook",
		});
		const wrongScopePlaybook = await writeRecordFile({
			root: projectRoot,
			relativePath: "memory/agent/playbooks/wrong-scope.md",
			type: "playbook",
			scope: "user",
			kind: "procedural",
			title: "Wrong scope playbook",
		});
		const wrongKindPlaybook = await writeRecordFile({
			root: projectRoot,
			relativePath: "memory/agent/playbooks/wrong-kind.md",
			type: "playbook",
			scope: "project",
			kind: "semantic",
			title: "Wrong kind playbook",
		});
		const malformedPlaybook = join(
			projectRoot,
			"memory",
			"agent",
			"playbooks",
			"malformed.md",
		);
		await writeFile(
			malformedPlaybook,
			"---\ntype: playbook\n---\nMissing fields\n",
			"utf-8",
		);
		const projectProfile = await writeRecordFile({
			root: projectRoot,
			relativePath: "memory/agent/profile.md",
			type: "profile",
			scope: "project",
			kind: "semantic",
			title: "Project profile",
		});

		const result = await store.retrieve(
			{ projectRoot, scopes: ["session", "project", "user"] },
			{},
		);
		expect(result.records.map((record) => record.path)).toEqual([
			userProfilePath,
			healthyPlaybook,
			healthyNote,
		]);
		expect(result.skippedScopes).toHaveLength(1);
		const warningPaths = result.warnings
			.map((warning) => warning.path)
			.filter((path): path is string => path !== undefined);
		for (const invalidPath of [
			malformedNote,
			profileUnderNotes,
			playbookUnderNotes,
			noteUnderPlaybooks,
			nestedPlaybook,
			wrongScopePlaybook,
			wrongKindPlaybook,
			malformedPlaybook,
			projectProfile,
		]) {
			expect(warningPaths).toContain(invalidPath);
		}
		expect(
			result.warnings.find((warning) => warning.path === nestedPlaybook)
				?.message,
		).toMatch(/direct child/i);
		expect(
			result.warnings.find((warning) => warning.path === wrongScopePlaybook)
				?.message,
		).toMatch(/scope/i);
		expect(
			result.warnings.find((warning) => warning.path === wrongKindPlaybook)
				?.message,
		).toMatch(/procedural/i);
		expect(
			result.warnings.find((warning) => warning.path === noteUnderPlaybooks)
				?.message,
		).toMatch(/type|playbook/i);

		const usable = await store.retrieve(
			{ projectRoot, scopes: ["project", "user"] },
			{ text: "Healthy" },
		);
		expect(usable.records).toHaveLength(3);
	});

	test("reflects playbook rename edits and deletion without a stale cache @cosmo-behavior plan:profile-playbooks#B-014", async () => {
		const projectRoot = join(tmp.path, "rename-project");
		const userRoot = join(tmp.path, "rename-user");
		const store = createMarkdownMemoryStore({
			projectRoot,
			userCosmonautsRoot: userRoot,
		});
		const created = await store.write({
			type: "playbook",
			scope: "project",
			kind: "procedural",
			title: "Deploy now",
			description: "Original deployment.",
			content: "Original steps.",
			tags: [],
			timestamp: "2026-07-13T10:00:00.000Z",
		});
		if (created.kind !== "written") throw new Error("expected playbook write");
		const originalPath = created.path;
		const originalResource = created.record.resource;
		const indexPath = join(projectRoot, "memory", "agent", "index.md");
		expect(await readFile(indexPath, "utf-8")).toContain("Deploy now");

		await writeFile(
			originalPath,
			renderRecord({
				type: "playbook",
				scope: "project",
				kind: "procedural",
				title: "Release now",
				description: "Human-retitled release.",
				resource: originalResource,
				content: "Human-edited steps.",
				timestamp: "2026-07-13T11:00:00.000Z",
			}),
			"utf-8",
		);
		const edited = await store.retrieve(
			{ projectRoot, scopes: ["project"] },
			{ recordTypes: ["playbook"] },
		);
		expect(edited.records).toMatchObject([
			{
				title: "Release now",
				content: "Human-edited steps.",
				path: originalPath,
			},
		]);
		const oldNameLookup = await store.retrieve(
			{ projectRoot, scopes: ["project"] },
			{ text: "Deploy now", recordTypes: ["playbook"] },
		);
		expect(oldNameLookup.records).toEqual([]);
		expect(await readFile(indexPath, "utf-8")).toContain("Deploy now");

		const sameNameUpdate = await store.write({
			type: "playbook",
			scope: "project",
			kind: "procedural",
			title: "release NOW!",
			description: "Confirmed current title update.",
			content: "Confirmed updated steps.",
			tags: [],
			timestamp: "2026-07-13T12:00:00.000Z",
		});
		expect(sameNameUpdate).toMatchObject({
			kind: "written",
			path: originalPath,
		});

		const reusedOldName = await store.write({
			type: "playbook",
			scope: "project",
			kind: "procedural",
			title: "Deploy now",
			description: "The freed old name.",
			content: "A distinct new procedure.",
			tags: [],
			timestamp: "2026-07-13T13:00:00.000Z",
		});
		expect(reusedOldName).toMatchObject({
			kind: "written",
			path: join(
				projectRoot,
				"memory",
				"agent",
				"playbooks",
				"deploy-now-2.md",
			),
		});
		if (reusedOldName.kind !== "written") {
			throw new Error("expected freed-name playbook write");
		}
		const regeneratedIndex = await readFile(indexPath, "utf-8");
		expect(regeneratedIndex).toContain("release NOW!");
		expect(regeneratedIndex).toContain("Deploy now");

		const duplicatePath = await writeRecordFile({
			root: projectRoot,
			relativePath: "memory/agent/playbooks/manual-duplicate.md",
			type: "playbook",
			scope: "project",
			kind: "procedural",
			title: "DEPLOY NOW!!",
			content: "Human duplicate.",
			timestamp: "2026-07-13T14:00:00.000Z",
		});
		const ambiguous = await store.retrieve(
			{ projectRoot, scopes: ["project"] },
			{ recordTypes: ["playbook"] },
		);
		expect(
			ambiguous.records.filter(
				(record) => canonicalizePlaybookName(record.title) === "deploy-now",
			),
		).toHaveLength(2);
		const duplicateWarning = ambiguous.warnings.find(
			(warning) =>
				warning.message.includes(reusedOldName.path) &&
				warning.message.includes(duplicatePath),
		);
		expect(duplicateWarning).toBeDefined();

		const refused = await store.write({
			type: "playbook",
			scope: "project",
			kind: "procedural",
			title: "deploy now",
			description: "Must not guess.",
			content: "No write.",
			tags: [],
		});
		expect(refused).toMatchObject({
			kind: "failed",
			reason: expect.stringContaining(reusedOldName.path),
		});
		if (refused.kind !== "failed")
			throw new Error("expected ambiguous failure");
		expect(refused.reason).toContain(duplicatePath);

		await rm(originalPath);
		const afterDeletion = await store.retrieve(
			{ projectRoot, scopes: ["project"] },
			{ recordTypes: ["playbook"] },
		);
		expect(afterDeletion.records.map((record) => record.title)).not.toContain(
			"release NOW!",
		);
	});

	test("creates a freed canonical playbook name across a dense suffix range", async () => {
		// D-003: a freed canonical name must never become uncreatable. The first free
		// suffix is found however dense the occupied range is, without a serial stat
		// per candidate and without a cap that could refuse a creatable name.
		const projectRoot = join(tmp.path, "dense-suffix-project");
		const userRoot = join(tmp.path, "dense-suffix-user");
		const store = createMarkdownMemoryStore({
			projectRoot,
			userCosmonautsRoot: userRoot,
		});
		const created = await store.write({
			type: "playbook",
			scope: "project",
			kind: "procedural",
			title: "Ship it",
			description: "Original.",
			content: "Original steps.",
			tags: [],
			timestamp: "2026-07-13T10:00:00.000Z",
		});
		if (created.kind !== "written") throw new Error("expected playbook write");
		const playbooksDir = join(projectRoot, "memory", "agent", "playbooks");
		expect(created.path).toBe(join(playbooksDir, "ship-it.md"));

		// Human retitles the record in place: "ship-it" is freed, but its default
		// path stays occupied by a valid, differently-named playbook.
		const retitled = (await readFile(created.path, "utf-8")).replace(
			"title: Ship it",
			"title: Ship it later",
		);
		await writeFile(created.path, retitled, "utf-8");
		for (let suffix = 2; suffix <= 120; suffix += 1) {
			await writeFile(
				join(playbooksDir, `ship-it-${suffix}.md`),
				"occupied by an unrelated file\n",
				"utf-8",
			);
		}

		const recreated = await store.write({
			type: "playbook",
			scope: "project",
			kind: "procedural",
			title: "Ship it",
			description: "A new playbook reusing the freed name.",
			content: "Distinct new steps.",
			tags: [],
			timestamp: "2026-07-13T11:00:00.000Z",
		});
		expect(recreated).toMatchObject({
			kind: "written",
			path: join(playbooksDir, "ship-it-121.md"),
		});
	});

	test("rejects profile writes over the 4000 byte body bound @cosmo-behavior plan:profile-playbooks#B-017", async () => {
		const projectRoot = join(tmp.path, "profile-bound-project");
		const userRoot = join(tmp.path, "profile-bound-user");
		const store = createMarkdownMemoryStore({
			projectRoot,
			userCosmonautsRoot: userRoot,
		});
		expect(PROFILE_WRITE_MAX_BYTES).toBe(4000);
		const original = await store.write({
			type: "profile",
			scope: "user",
			kind: "semantic",
			title: "User profile",
			description: "Durable user profile and preferences.",
			content: "Original complete profile.",
			tags: [],
			timestamp: "2026-07-13T10:00:00.000Z",
		});
		if (original.kind !== "written") throw new Error("expected profile write");
		const originalRaw = await readFile(original.path, "utf-8");
		const oversized = "é".repeat(2001);
		expect(Buffer.byteLength(oversized, "utf-8")).toBe(4002);

		const rejected = await store.write({
			type: "profile",
			scope: "user",
			kind: "semantic",
			title: "User profile",
			description: "Durable user profile and preferences.",
			content: oversized,
			tags: [],
			timestamp: "2026-07-13T11:00:00.000Z",
		});
		expect(rejected).toMatchObject({
			kind: "unsupported",
			reason: expect.stringMatching(/4000.*4002|4002.*4000/),
		});
		expect(await readFile(original.path, "utf-8")).toBe(originalRaw);

		const humanRaw = renderRecord({
			type: "profile",
			scope: "user",
			kind: "semantic",
			title: "User profile",
			description: "Oversized human profile.",
			resource: "memory/agent/profile.md",
			content: oversized,
			timestamp: "2026-07-13T12:00:00.000Z",
		});
		await writeFile(original.path, humanRaw, "utf-8");
		const retrieved = await store.retrieve(
			{ projectRoot, scopes: ["user"] },
			{ recordTypes: ["profile"] },
		);
		expect(retrieved.records).toMatchObject([
			{ type: "profile", content: oversized, path: original.path },
		]);
		expect(await readFile(original.path, "utf-8")).toBe(humanRaw);
	});

	test("reports profile and playbook write failures without partial files @cosmo-behavior plan:profile-playbooks#B-018", async () => {
		const blockedProfileRoot = join(tmp.path, "blocked-profile-root");
		await writeFile(blockedProfileRoot, "not a directory\n", "utf-8");
		const blockedProfileStore = createMarkdownMemoryStore({
			projectRoot: join(tmp.path, "blocked-profile-project"),
			userCosmonautsRoot: blockedProfileRoot,
		});
		const profileCreate = await blockedProfileStore.write({
			type: "profile",
			scope: "user",
			kind: "semantic",
			title: "User profile",
			description: "Blocked profile.",
			content: "Complete profile.",
			tags: [],
		});
		expect(profileCreate).toMatchObject({
			kind: "failed",
			path: join(blockedProfileRoot, "memory", "agent", "profile.md"),
			reason: expect.stringMatching(
				/profile.*user.*not a directory|profile.*user.*ENOTDIR/i,
			),
		});

		const blockedPlaybookRoot = join(tmp.path, "blocked-playbook-root");
		await writeFile(blockedPlaybookRoot, "not a directory\n", "utf-8");
		const blockedPlaybookStore = createMarkdownMemoryStore({
			projectRoot: blockedPlaybookRoot,
			userCosmonautsRoot: join(tmp.path, "blocked-playbook-user"),
		});
		const playbookCreate = await blockedPlaybookStore.write({
			type: "playbook",
			scope: "project",
			kind: "procedural",
			title: "Blocked playbook",
			description: "Blocked playbook.",
			content: "Complete steps.",
			tags: [],
		});
		expect(playbookCreate).toMatchObject({
			kind: "failed",
			path: join(
				blockedPlaybookRoot,
				"memory",
				"agent",
				"playbooks",
				"blocked-playbook.md",
			),
			reason: expect.stringMatching(
				/playbook.*project.*not a directory|playbook.*project.*ENOTDIR/i,
			),
		});

		for (const type of ["profile", "playbook"] as const) {
			const projectRoot = join(tmp.path, `${type}-update-project`);
			const userRoot = join(tmp.path, `${type}-update-user`);
			const store = createMarkdownMemoryStore({
				projectRoot,
				userCosmonautsRoot: userRoot,
			});
			const scope = type === "profile" ? "user" : "project";
			const first = await store.write({
				type,
				scope,
				kind: type === "profile" ? "semantic" : "procedural",
				title: type === "profile" ? "User profile" : "Atomic update",
				description: "Old complete record.",
				content: "Old complete body.",
				tags: [],
				timestamp: "2026-07-13T10:00:00.000Z",
			});
			if (first.kind !== "written") throw new Error(`expected ${type} write`);
			const indexRoot = scope === "user" ? userRoot : projectRoot;
			const indexPath = join(indexRoot, "memory", "agent", "index.md");
			await rm(indexPath);
			await mkdir(indexPath);

			const failedUpdate = await store.write({
				type,
				scope,
				kind: type === "profile" ? "semantic" : "procedural",
				title: type === "profile" ? "User profile" : "Atomic update",
				description: "New complete record.",
				content: "New complete body.",
				tags: [],
				timestamp: "2026-07-13T11:00:00.000Z",
			});
			expect(failedUpdate).toMatchObject({
				kind: "failed",
				path: first.path,
				reason: expect.stringContaining(type),
			});
			if (failedUpdate.kind !== "failed") {
				throw new Error(`expected failed ${type} update`);
			}
			expect(failedUpdate.reason).toContain(scope);
			expect(failedUpdate.reason).toContain(first.path);
			expect(failedUpdate.reason).toMatch(/directory|EISDIR/i);
			const parsed = matter(await readFile(first.path, "utf-8"));
			expect(["Old complete body.", "New complete body."]).toContain(
				parsed.content.trim(),
			);
			expect(parsed.data).toMatchObject({ type, scope });
		}

		// Fault-inject the record write itself. Making the record's directory
		// read-only blocks creating the temp file while leaving the existing record
		// file writable, so an existing record must survive byte-identical. A
		// non-atomic direct writeFile(path) would instead succeed and mutate it.
		const isRoot = process.getuid?.() === 0;
		for (const type of isRoot ? [] : (["profile", "playbook"] as const)) {
			const projectRoot = join(tmp.path, `${type}-atomic-project`);
			const userRoot = join(tmp.path, `${type}-atomic-user`);
			const store = createMarkdownMemoryStore({
				projectRoot,
				userCosmonautsRoot: userRoot,
			});
			const scope = type === "profile" ? "user" : "project";
			const first = await store.write({
				type,
				scope,
				kind: type === "profile" ? "semantic" : "procedural",
				title: type === "profile" ? "User profile" : "Atomic record",
				description: "Old complete record.",
				content: "Old complete body.",
				tags: [],
				timestamp: "2026-07-13T10:00:00.000Z",
			});
			if (first.kind !== "written") throw new Error(`expected ${type} write`);
			const before = await readFile(first.path, "utf-8");
			const recordDir = dirname(first.path);

			await chmod(recordDir, 0o500);
			let failedWrite: Awaited<ReturnType<typeof store.write>>;
			try {
				failedWrite = await store.write({
					type,
					scope,
					kind: type === "profile" ? "semantic" : "procedural",
					title: type === "profile" ? "User profile" : "Atomic record",
					description: "New complete record.",
					content: "New complete body.",
					tags: [],
					timestamp: "2026-07-13T11:00:00.000Z",
				});
			} finally {
				await chmod(recordDir, 0o700);
			}

			expect(failedWrite).toMatchObject({ kind: "failed", path: first.path });
			if (failedWrite.kind !== "failed") {
				throw new Error(`expected failed ${type} record write`);
			}
			expect(failedWrite.reason).toContain(type);
			expect(failedWrite.reason).toContain(first.path);
			// Old-complete, never truncated and never replaced.
			expect(await readFile(first.path, "utf-8")).toBe(before);
			expect(await readFile(first.path, "utf-8")).toContain(
				"Old complete body.",
			);
			expect(await readFile(first.path, "utf-8")).not.toContain(
				"New complete body.",
			);
			expect(
				(await readdir(recordDir)).filter((entry) => entry.endsWith(".tmp")),
			).toEqual([]);
		}

		expect(
			(await listTree(tmp.path)).filter((path) => path.endsWith(".tmp")),
		).toEqual([]);
	});

	test("replaces the profile singleton in place and refuses an invalid occupant", async () => {
		const projectRoot = join(tmp.path, "singleton-project");
		const userRoot = join(tmp.path, "singleton-user");
		let currentTime = "2026-07-13T10:00:00.000Z";
		const store = createMarkdownMemoryStore({
			projectRoot,
			userCosmonautsRoot: userRoot,
			now: () => new Date(currentTime),
		});
		const draft = {
			type: "profile",
			scope: "user",
			kind: "semantic",
			title: "User profile",
			description: "Durable user profile and preferences.",
			content: "First complete profile.",
			tags: [],
		} as const;
		const first = await store.write(draft);
		expect(first).toMatchObject({
			kind: "written",
			path: join(userRoot, "memory", "agent", "profile.md"),
			record: { timestamp: "2026-07-13T10:00:00.000Z" },
		});
		if (first.kind !== "written") throw new Error("expected profile write");

		currentTime = "2026-07-13T11:00:00.000Z";
		const second = await store.write({
			...draft,
			content: "Second complete profile.",
		});
		expect(second).toMatchObject({
			kind: "written",
			path: first.path,
			record: {
				timestamp: "2026-07-13T11:00:00.000Z",
				content: "Second complete profile.",
			},
		});
		expect(
			(await readdir(join(userRoot, "memory", "agent"))).filter((name) =>
				name.includes("profile"),
			),
		).toEqual(["profile.md", "profile.md.prev"]);
		expect(
			await readFile(join(userRoot, "memory", "agent", "index.md"), "utf-8"),
		).toBe(
			"---\ntype: memory-index\nresource: memory/agent/index.md\n---\n\n# Agent Memory Index\n\nNo valid authored records.\n",
		);

		const malformed =
			"---\ntype: profile\n---\nHuman-owned malformed profile.\n";
		await writeFile(first.path, malformed, "utf-8");
		const refused = await store.write({
			...draft,
			content: "Must not replace malformed human content.",
		});
		expect(refused).toMatchObject({
			kind: "failed",
			path: first.path,
			reason: expect.stringContaining(first.path),
		});
		if (refused.kind !== "failed") throw new Error("expected occupant refusal");
		expect(refused.reason).toMatch(/invalid|frontmatter|missing/i);
		expect(await readFile(first.path, "utf-8")).toBe(malformed);

		await expect(
			store.write({ ...draft, kind: "procedural" }),
		).resolves.toMatchObject({ kind: "unsupported" });
		await expect(
			store.write({
				...draft,
				type: "unknown",
			}),
		).resolves.toMatchObject({ kind: "unsupported" });
	});

	test("retrieve reports scan-cost stats covering every file read, including unparsable ones", async () => {
		const projectRoot = join(tmp.path, "stats-project");
		const userRoot = join(tmp.path, "stats-user");
		const store = createMarkdownMemoryStore({
			projectRoot,
			userCosmonautsRoot: userRoot,
			now: () => new Date("2026-07-14T10:00:00.000Z"),
		});
		const written = await store.write({
			type: "note",
			scope: "project",
			kind: "semantic",
			title: "Stats note",
			description: "Counted by the scan tally.",
			content: "Body counted in bytesRead.",
			tags: [],
			source: "main/cosmo",
		});
		if (written.kind !== "written") throw new Error("expected note write");
		const noteBytes = Buffer.byteLength(
			await readFile(written.path, "utf-8"),
			"utf-8",
		);
		const malformed = "not an OKF record\n";
		const notesDir = dirname(written.path);
		await writeFile(join(notesDir, "broken.md"), malformed, "utf-8");

		const result = await store.retrieve(
			{ projectRoot, scopes: ["project", "user"] },
			{ text: "" },
		);
		expect(result.warnings).toHaveLength(1);
		expect(result.stats).toMatchObject({
			filesScanned: 2,
			bytesRead: noteBytes + Buffer.byteLength(malformed, "utf-8"),
		});
		expect(result.stats?.durationMs).toBeGreaterThanOrEqual(0);
	});

	// @cosmo-behavior plan:episodic-log#B-006
	test("writes append-only episode files without creating rewriting or entering index.md", async () => {
		const projectRoot = join(tmp.path, "append-only-episode-project");
		const userRoot = join(tmp.path, "append-only-episode-user");
		const store = createMarkdownMemoryStore({
			projectRoot,
			userCosmonautsRoot: userRoot,
		});
		const initialNote = await store.write({
			type: "note",
			scope: "project",
			kind: "semantic",
			title: "Initial authored note",
			description: "Creates the authored index before episode writes.",
			content: "The authored index must stay byte-identical.",
			tags: [],
			timestamp: "2026-07-21T09:00:00.000Z",
		});
		expect(initialNote).toMatchObject({ kind: "written" });
		const indexPath = join(projectRoot, "memory", "agent", "index.md");
		const indexBeforeEpisodes = await readFile(indexPath, "utf-8");
		const episode = createEpisodeRecord(
			{
				scope: "project",
				source: "example/worker",
				action: "task.status-changed",
				outcome: "done",
				subject: { kind: "task", id: "TASK-473" },
				summary: "Completed episodic storage.",
				details: "The episode is one atomic direct-child markdown file.",
			},
			"2026-07-21T14:00:00.000Z",
		);

		const first = await store.write(episode);
		expect(first).toMatchObject({
			kind: "written",
			path: expect.stringMatching(
				/episodes\/20260721T140000000Z-task-status-changed-[a-f0-9]{8}\.md$/u,
			),
		});
		if (first.kind !== "written") throw new Error("expected episode write");
		expect(dirname(first.path)).toBe(
			join(projectRoot, "memory", "agent", "episodes"),
		);
		expect(await readFile(indexPath, "utf-8")).toBe(indexBeforeEpisodes);
		expect(await readFile(first.path, "utf-8")).toContain(
			"The episode is one atomic direct-child markdown file.",
		);
		expect(
			(await readdir(dirname(first.path))).filter((name) =>
				name.endsWith(".tmp"),
			),
		).toEqual([]);

		const pinnedMtime = new Date("2001-01-01T00:00:00.000Z");
		await utimes(first.path, pinnedMtime, pinnedMtime);
		const identical = await store.write(episode);
		expect(identical).toMatchObject({ kind: "written", path: first.path });
		expect((await stat(first.path)).mtimeMs).toBe(pinnedMtime.valueOf());
		expect(
			(await readdir(dirname(first.path))).filter((name) =>
				name.endsWith(".md"),
			),
		).toHaveLength(1);

		const collidingEpisode = createEpisodeRecord(
			{
				scope: "project",
				source: "example/worker",
				action: "task.status-changed",
				outcome: "started",
				subject: { kind: "task", id: "TASK-474" },
				summary: "Started the next task.",
			},
			"2026-07-21T15:00:00.000Z",
		);
		const collisionBase = await store.write(collidingEpisode);
		if (collisionBase.kind !== "written") {
			throw new Error("expected collision fixture write");
		}
		const nonIdenticalOccupant =
			"Human-owned non-identical occupant must never be replaced.\n";
		await writeFile(collisionBase.path, nonIdenticalOccupant, "utf-8");
		const collisionSafeWrite = await store.write(collidingEpisode);
		expect(collisionSafeWrite).toMatchObject({ kind: "written" });
		if (collisionSafeWrite.kind !== "written") {
			throw new Error("expected collision-safe episode write");
		}
		expect(collisionSafeWrite.path).not.toBe(collisionBase.path);
		expect(await readFile(collisionBase.path, "utf-8")).toBe(
			nonIdenticalOccupant,
		);
		expect(dirname(collisionSafeWrite.path)).toBe(dirname(collisionBase.path));
		expect(await readFile(indexPath, "utf-8")).toBe(indexBeforeEpisodes);

		const userEpisode = createEpisodeRecord(
			{
				scope: "user",
				source: "main/cosmo",
				action: "memory.saved",
				outcome: "succeeded",
				subject: { kind: "memory", id: "preference-7" },
				summary: "Saved a user preference.",
			},
			"2026-07-21T16:00:00.000Z",
		);
		await expect(store.write(userEpisode)).resolves.toMatchObject({
			kind: "written",
		});
		await expect(
			stat(join(userRoot, "memory", "agent", "index.md")),
		).rejects.toMatchObject({ code: "ENOENT" });

		const episodeFilesBeforeAuthoredSave = await Promise.all(
			(await readdir(dirname(first.path)))
				.filter((name) => name.endsWith(".md"))
				.map(
					async (name) =>
						[
							name,
							await readFile(join(dirname(first.path), name), "utf-8"),
						] as const,
				),
		);
		await expect(
			store.write({
				type: "note",
				scope: "project",
				kind: "semantic",
				title: "Later authored note",
				description: "Regenerates only the authored index.",
				content: "Episodes stay outside the authored index.",
				tags: [],
				timestamp: "2026-07-21T17:00:00.000Z",
			}),
		).resolves.toMatchObject({ kind: "written" });
		const regeneratedIndex = await readFile(indexPath, "utf-8");
		expect(regeneratedIndex).not.toContain("episodes/");
		expect(regeneratedIndex).not.toContain("Completed episodic storage");
		await expect(
			Promise.all(
				episodeFilesBeforeAuthoredSave.map(
					async ([name]) =>
						[
							name,
							await readFile(join(dirname(first.path), name), "utf-8"),
						] as const,
				),
			),
		).resolves.toEqual(episodeFilesBeforeAuthoredSave);
	});

	// @cosmo-behavior plan:episodic-log#B-007
	test("scans episodes only when recordTypes explicitly includes episode", async () => {
		const projectRoot = join(tmp.path, "conditional-episode-scan-project");
		const store = createMarkdownMemoryStore({ projectRoot });
		const noteWrite = await store.write({
			type: "note",
			scope: "project",
			kind: "semantic",
			title: "Authored scan sentinel",
			description: "The authored-only query reads only this record.",
			content: "Episode files must add no authored-only scan cost.",
			tags: [],
			timestamp: "2026-07-21T10:00:00.000Z",
		});
		if (noteWrite.kind !== "written") throw new Error("expected note write");
		const episodeWrite = await store.write(
			createEpisodeRecord(
				{
					scope: "project",
					source: "example/worker",
					action: "chain.run",
					outcome: "succeeded",
					subject: { kind: "run", id: "run-conditional-scan" },
					summary: "Conditional scan completed.",
				},
				"2026-07-21T11:00:00.000Z",
			),
		);
		if (episodeWrite.kind !== "written") {
			throw new Error("expected episode write");
		}
		const malformedPath = join(dirname(episodeWrite.path), "malformed.md");
		const malformed = "not an OKF episode\n";
		await writeFile(malformedPath, malformed, "utf-8");
		const noteBytes = Buffer.byteLength(
			await readFile(noteWrite.path, "utf-8"),
			"utf-8",
		);

		const authoredOnly = await store.retrieve(
			{ projectRoot, scopes: ["project"] },
			{ recordTypes: ["note"] },
		);
		expect(authoredOnly.records.map((record) => record.type)).toEqual(["note"]);
		expect(authoredOnly.warnings).toEqual([]);
		expect(authoredOnly.stats).toMatchObject({
			filesScanned: 1,
			bytesRead: noteBytes,
		});

		const withEpisodes = await store.retrieve(
			{ projectRoot, scopes: ["project"] },
			{ recordTypes: ["episode"] },
		);
		expect(withEpisodes.records).toHaveLength(1);
		expect(withEpisodes.records[0]).toMatchObject({
			type: "episode",
			path: episodeWrite.path,
		});
		expect(withEpisodes.warnings).toEqual([
			{
				path: malformedPath,
				message: "Memory record is missing required OKF frontmatter.",
			},
		]);
		expect(withEpisodes.stats).toMatchObject({
			filesScanned: 3,
			bytesRead:
				noteBytes +
				Buffer.byteLength(await readFile(episodeWrite.path, "utf-8"), "utf-8") +
				Buffer.byteLength(malformed, "utf-8"),
		});

		await rm(episodeWrite.path);
		const afterDeletion = await store.retrieve(
			{ projectRoot, scopes: ["project"] },
			{ recordTypes: ["episode"] },
		);
		expect(afterDeletion.records).toEqual([]);
		expect(afterDeletion.warnings.map((warning) => warning.path)).toEqual([
			malformedPath,
		]);
	});

	// Regression guard (QM F-001/F-002) defending B-006 direct-child layout and
	// B-007/B-010 malformed-episode warnings. No new behavior marker: the owning
	// behaviors are asserted elsewhere; this pins the store-level parse contract.
	test("skips and warns for envelope-malformed and nested episode files while recalling valid ones", async () => {
		const projectRoot = join(tmp.path, "episode-envelope-and-nesting-project");
		const store = createMarkdownMemoryStore({ projectRoot });
		const episodeWrite = await store.write(
			createEpisodeRecord(
				{
					scope: "project",
					source: "example/worker",
					action: "chain.run",
					outcome: "succeeded",
					subject: { kind: "run", id: "run-valid" },
					summary: "Valid episode retained.",
				},
				"2026-07-21T11:00:00.000Z",
			),
		);
		if (episodeWrite.kind !== "written") {
			throw new Error("expected episode write");
		}
		const episodesDir = dirname(episodeWrite.path);

		// F-001: valid OKF frontmatter but a malformed tag envelope (no action tag)
		// must be skipped with a warning, not recalled as a healthy episode.
		const validRaw = await readFile(episodeWrite.path, "utf-8");
		const envelopeMalformedRaw = validRaw.replace(
			/[ \t]*- 'action:[^']*'\n/u,
			"",
		);
		expect(envelopeMalformedRaw).not.toEqual(validRaw);
		const envelopeMalformedPath = join(episodesDir, "envelope-malformed.md");
		await writeFile(envelopeMalformedPath, envelopeMalformedRaw, "utf-8");

		// F-002: a fully valid episode nested below episodes/ must be skipped with
		// a direct-child warning, matching the documented file-per-episode layout.
		const nestedDir = join(episodesDir, "archive");
		await mkdir(nestedDir, { recursive: true });
		const nestedPath = join(nestedDir, "nested.md");
		await writeFile(
			nestedPath,
			validRaw.replace("run-valid", "run-nested"),
			"utf-8",
		);

		const result = await store.retrieve(
			{ projectRoot, scopes: ["project"] },
			{ recordTypes: ["episode"] },
		);
		expect(result.records).toHaveLength(1);
		expect(result.records[0]).toMatchObject({
			type: "episode",
			path: episodeWrite.path,
		});
		const warningsByPath = new Map(
			result.warnings.map((warning) => [warning.path, warning.message]),
		);
		expect(warningsByPath.get(envelopeMalformedPath)).toBe(
			"Episode records require valid action, outcome, and subject tags (and a payload for wake records).",
		);
		expect(warningsByPath.get(nestedPath)).toBe(
			"Episode records must be direct children of the episodes directory.",
		);
	});

	// @cosmo-behavior plan:episodic-log#B-008
	test("binds default and overridden episode thresholds into fresh-store stats and warnings", async () => {
		const defaultRoot = join(tmp.path, "default-episode-threshold-project");
		const defaultEpisodesDir = join(defaultRoot, "memory", "agent", "episodes");
		await mkdir(defaultEpisodesDir, { recursive: true });
		const defaultContents = Array.from(
			{ length: 500 },
			(_, index) => `malformed episode ${index}\n`,
		);
		await Promise.all(
			defaultContents.map((content, index) =>
				writeFile(
					join(
						defaultEpisodesDir,
						`malformed-${String(index).padStart(3, "0")}.md`,
					),
					content,
					"utf-8",
				),
			),
		);

		const atDefaultThreshold = await createMarkdownMemoryStore({
			projectRoot: defaultRoot,
		}).retrieve(
			{ projectRoot: defaultRoot, scopes: ["project"] },
			{ recordTypes: ["episode"] },
		);
		expect(
			atDefaultThreshold.warnings.filter((warning) =>
				warning.message.startsWith("episode log large"),
			),
		).toEqual([]);
		expect(atDefaultThreshold.stats).toMatchObject({
			filesScanned: 500,
			bytesRead: defaultContents.reduce(
				(total, content) => total + Buffer.byteLength(content, "utf-8"),
				0,
			),
		});

		const aboveDefaultContent = "malformed episode 500\n";
		await writeFile(
			join(defaultEpisodesDir, "malformed-500.md"),
			aboveDefaultContent,
			"utf-8",
		);
		const aboveDefaultThreshold = await createMarkdownMemoryStore({
			projectRoot: defaultRoot,
		}).retrieve(
			{ projectRoot: defaultRoot, scopes: ["project"] },
			{ recordTypes: ["episode"] },
		);
		expect(
			aboveDefaultThreshold.warnings.filter((warning) =>
				warning.message.startsWith("episode log large"),
			),
		).toEqual([
			{
				path: defaultEpisodesDir,
				message: "episode log large — 501 records; run consolidation",
			},
		]);
		expect(aboveDefaultThreshold.stats).toMatchObject({
			filesScanned: 501,
			bytesRead:
				defaultContents.reduce(
					(total, content) => total + Buffer.byteLength(content, "utf-8"),
					0,
				) + Buffer.byteLength(aboveDefaultContent, "utf-8"),
		});

		const overriddenRoot = join(tmp.path, "overridden-threshold-project");
		const overriddenUserRoot = join(tmp.path, "overridden-threshold-user");
		const writer = createMarkdownMemoryStore({
			projectRoot: overriddenRoot,
			userCosmonautsRoot: overriddenUserRoot,
			episodeWarningThreshold: 1,
		});
		const valid = await writer.write(
			createEpisodeRecord(
				{
					scope: "project",
					source: "example/worker",
					action: "chain.run",
					outcome: "succeeded",
					subject: { kind: "run", id: "run-threshold" },
					summary: "Threshold fixture completed.",
				},
				"2026-07-21T18:00:00.000Z",
			),
		);
		if (valid.kind !== "written") throw new Error("expected episode write");
		const projectMalformed = "project malformed episode\n";
		await writeFile(
			join(dirname(valid.path), "malformed.md"),
			projectMalformed,
			"utf-8",
		);
		const userEpisodesDir = join(
			overriddenUserRoot,
			"memory",
			"agent",
			"episodes",
		);
		await mkdir(userEpisodesDir, { recursive: true });
		const userMalformed = "user malformed episode\n";
		await writeFile(
			join(userEpisodesDir, "malformed.md"),
			userMalformed,
			"utf-8",
		);

		const restartedOverrideStore = createMarkdownMemoryStore({
			projectRoot: overriddenRoot,
			userCosmonautsRoot: overriddenUserRoot,
			episodeWarningThreshold: 1,
		});
		const overridden = await restartedOverrideStore.retrieve(
			{ projectRoot: overriddenRoot, scopes: ["project", "user"] },
			{ recordTypes: ["episode"] },
		);
		expect(
			overridden.warnings.filter((warning) =>
				warning.message.startsWith("episode log large"),
			),
		).toEqual([
			{
				path: dirname(valid.path),
				message: "episode log large — 2 records; run consolidation",
			},
		]);
		expect(overridden.stats).toMatchObject({
			filesScanned: 3,
			bytesRead:
				Buffer.byteLength(await readFile(valid.path, "utf-8"), "utf-8") +
				Buffer.byteLength(projectMalformed, "utf-8") +
				Buffer.byteLength(userMalformed, "utf-8"),
		});

		const authoredOnly = await restartedOverrideStore.retrieve(
			{ projectRoot: overriddenRoot, scopes: ["project", "user"] },
			{ recordTypes: ["note", "profile", "playbook"] },
		);
		expect(authoredOnly.warnings).toEqual([]);
		expect(authoredOnly.stats).toMatchObject({
			filesScanned: 0,
			bytesRead: 0,
		});
	});

	test("keeps one previous profile version in a sidecar the store never lists", async () => {
		const projectRoot = join(tmp.path, "sidecar-project");
		const userRoot = join(tmp.path, "sidecar-user");
		let currentTime = "2026-07-14T10:00:00.000Z";
		const store = createMarkdownMemoryStore({
			projectRoot,
			userCosmonautsRoot: userRoot,
			now: () => new Date(currentTime),
		});
		const draft = {
			type: "profile",
			scope: "user",
			kind: "semantic",
			title: "User profile",
			description: "Durable user profile and preferences.",
			content: "First complete profile.",
			tags: [],
		} as const;
		const sidecarPath = join(userRoot, "memory", "agent", "profile.md.prev");

		const first = await store.write(draft);
		if (first.kind !== "written") throw new Error("expected profile write");
		await expect(stat(sidecarPath)).rejects.toMatchObject({ code: "ENOENT" });

		const firstOnDisk = await readFile(first.path, "utf-8");
		currentTime = "2026-07-14T11:00:00.000Z";
		const second = await store.write({
			...draft,
			content: "Second complete profile.",
		});
		expect(second).toMatchObject({ kind: "written" });
		expect(await readFile(sidecarPath, "utf-8")).toBe(firstOnDisk);

		const secondOnDisk = await readFile(first.path, "utf-8");
		currentTime = "2026-07-14T12:00:00.000Z";
		const third = await store.write({
			...draft,
			content: "Third complete profile.",
		});
		expect(third).toMatchObject({ kind: "written" });
		expect(await readFile(sidecarPath, "utf-8")).toBe(secondOnDisk);

		const retrieved = await store.retrieve(
			{ projectRoot, scopes: ["user"] },
			{ text: "" },
		);
		expect(retrieved.warnings).toEqual([]);
		expect(
			retrieved.records.map((record) => [record.type, record.content]),
		).toEqual([["profile", "Third complete profile."]]);
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

function renderRecord(options: {
	readonly type: "note" | "profile" | "playbook";
	readonly scope: "project" | "user";
	readonly kind: "semantic" | "procedural" | "episodic";
	readonly title: string;
	readonly resource: string;
	readonly content?: string;
	readonly description?: string;
	readonly timestamp?: string;
}): string {
	return matter.stringify(options.content ?? `${options.title} body.`, {
		type: options.type,
		title: options.title,
		description: options.description ?? `${options.title} description.`,
		resource: options.resource,
		tags: [],
		timestamp: options.timestamp ?? "2026-07-13T09:00:00.000Z",
		scope: options.scope,
		kind: options.kind,
	});
}

async function writeRecordFile(options: {
	readonly root: string;
	readonly relativePath: string;
	readonly type: "note" | "profile" | "playbook";
	readonly scope: "project" | "user";
	readonly kind: "semantic" | "procedural" | "episodic";
	readonly title: string;
	readonly content?: string;
	readonly timestamp?: string;
}): Promise<string> {
	const path = join(options.root, ...options.relativePath.split("/"));
	await mkdir(join(path, ".."), { recursive: true });
	await writeFile(
		path,
		renderRecord({
			type: options.type,
			scope: options.scope,
			kind: options.kind,
			title: options.title,
			resource: options.relativePath,
			content: options.content,
			timestamp: options.timestamp,
		}),
		"utf-8",
	);
	return path;
}

async function listTree(root: string): Promise<string[]> {
	const entries = await readdir(root, { withFileTypes: true });
	const paths: string[] = [];
	for (const entry of entries) {
		const path = join(root, entry.name);
		paths.push(path);
		if (entry.isDirectory()) paths.push(...(await listTree(path)));
	}
	return paths;
}

function resourceFor(path: string, root: string): string {
	return path
		.slice(root.length + 1)
		.split("/")
		.join("/");
}
