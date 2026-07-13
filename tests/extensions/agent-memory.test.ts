import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { describe, expect, test, vi } from "vitest";
import cosmo from "../../domains/main/agents/cosmo.ts";
import {
	default as agentMemoryExtension,
	createAgentMemoryExtension,
} from "../../domains/shared/extensions/agent-memory/index.ts";
import { buildAgentIdentityMarker } from "../../lib/agents/runtime-identity.ts";
import {
	createMarkdownMemoryStore,
	type MemoryKind,
	type MemoryScopeName,
	type MemoryStore,
	type MemoryWriteResult,
	type RetrievedMemoryRecord,
} from "../../lib/memory/index.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi } from "../helpers/mocks/index.ts";

const tmp = useTempDir("agent-memory-");

describe("agent-memory extension", () => {
	test("preserves W1 note save recall allowlisting and Cosmo authorization @cosmo-behavior plan:profile-playbooks#B-015", async () => {
		const projectRoot = join(tmp.path, "w1-contract-project");
		const userRoot = join(tmp.path, "w1-contract-user");
		const store = createMarkdownMemoryStore({
			projectRoot,
			userCosmonautsRoot: userRoot,
			now: () => new Date("2026-07-08T14:00:00.000Z"),
		});
		const storeFactory = vi.fn(() => store);
		const pi = createMockPi({ cwd: projectRoot });
		createAgentMemoryExtension({
			userCosmonautsRoot: userRoot,
			storeFactory,
			now: () => new Date("2026-07-08T14:00:00.000Z"),
		})(pi as never);

		expect(cosmo).toMatchObject({
			tools: "none",
			extensions: expect.arrayContaining(["agent-memory"]),
		});
		expect([...pi.tools.keys()]).toEqual(["remember", "recall"]);
		expect(storeFactory).not.toHaveBeenCalled();

		const initiallyUnauthorized = (await pi.callTool("remember", {
			content: "Must not be written before a Cosmo turn.",
		})) as ToolResult;
		expect(initiallyUnauthorized.details).toMatchObject({
			status: "unauthorized",
			authorizedAgent: "main/cosmo",
		});
		expect(storeFactory).not.toHaveBeenCalled();

		await pi.fireEvent("before_agent_start", {
			systemPrompt: buildAgentIdentityMarker("main/not-cosmo"),
		});
		const nonCosmo = (await pi.callTool("recall", {
			query: "anything",
		})) as ToolResult;
		expect(nonCosmo.details).toMatchObject({ status: "unauthorized" });
		expect(storeFactory).not.toHaveBeenCalled();

		const emptyInjection = await pi.fireEvent(
			"before_agent_start",
			{ systemPrompt: buildAgentIdentityMarker("main/cosmo") },
			{ cwd: projectRoot },
		);
		expect(emptyInjection).toBeUndefined();
		await expect(readdir(join(projectRoot, "memory"))).rejects.toMatchObject({
			code: "ENOENT",
		});
		await expect(readdir(join(userRoot, "memory"))).rejects.toMatchObject({
			code: "ENOENT",
		});

		const saved = (await pi.callTool("remember", {
			content: "W1 note defaults remain stable.",
		})) as ToolResult;
		expect(saved.details).toMatchObject({
			status: "saved",
			title: "W1 note defaults remain stable.",
			scope: "project",
			kind: "semantic",
			tags: [],
			timestamp: "2026-07-08T14:00:00.000Z",
			humanPath: expect.stringMatching(/^memory\/agent\/notes\//),
		});
		const savedPath = stringDetail(saved.details, "path");
		expect(savedPath).toMatch(
			/memory\/agent\/notes\/20260708T140000000Z-w1-note-defaults-remain-stable-[a-f0-9]{8}\.md$/,
		);
		const parsed = matter(await readFile(savedPath, "utf-8"));
		expect(parsed.data).toMatchObject({
			type: "note",
			title: "W1 note defaults remain stable.",
			description: "W1 note defaults remain stable.",
			resource: expect.stringMatching(/^memory\/agent\/notes\//),
			tags: [],
			timestamp: "2026-07-08T14:00:00.000Z",
			scope: "project",
			kind: "semantic",
			source: "main/cosmo",
		});
		expect(parsed.content.trim()).toBe("W1 note defaults remain stable.");

		await store.write({
			type: "note",
			scope: "user",
			kind: "procedural",
			title: "Older user procedure",
			description: "An older user-scoped note.",
			content: "Follow the older procedure.",
			tags: [],
			timestamp: "2026-07-08T13:00:00.000Z",
		});
		const listed = await store.retrieve(
			{ projectRoot, scopes: ["session", "project", "user"] },
			{ text: "", recordTypes: ["note"], limit: 20 },
		);
		expect(listed.records.map((record) => record.title)).toEqual([
			"W1 note defaults remain stable.",
			"Older user procedure",
		]);
		expect(listed.searchedScopes).toEqual(["project", "user"]);
		expect(listed.skippedScopes).toEqual([
			{
				scope: "session",
				reason:
					"Session-scoped markdown memory is not built in W1; Pi session state and compaction cover short-term memory.",
			},
		]);

		const defaultRecall = (await pi.callTool("recall", {
			query: "procedure",
		})) as ToolResult;
		expect(defaultRecall.details).toMatchObject({
			status: "matched",
			limit: 5,
			searchedScopes: ["project", "user"],
		});
		const cappedRecall = (await pi.callTool("recall", {
			query: "note",
			limit: 200,
		})) as ToolResult;
		expect(cappedRecall.details).toMatchObject({
			status: "matched",
			limit: 20,
		});

		await expect(store.consolidate()).resolves.toEqual({
			kind: "noop",
			reason:
				"W1 performs no background memory consolidation, pruning, decay, or dreaming.",
		});

		await pi.fireEvent("session_start");
		const afterSessionStart = (await pi.callTool("remember", {
			content: "Session reset must refuse this note.",
		})) as ToolResult;
		expect(afterSessionStart.details).toMatchObject({ status: "unauthorized" });
		await pi.fireEvent("before_agent_start", {
			systemPrompt: buildAgentIdentityMarker("main/cosmo"),
		});
		await pi.fireEvent("session_shutdown");
		const afterSessionShutdown = (await pi.callTool("recall", {
			query: "note",
		})) as ToolResult;
		expect(afterSessionShutdown.details).toMatchObject({
			status: "unauthorized",
		});

		const failedProjectRoot = join(tmp.path, "w1-failed-project");
		const failedPi = await cosmoPi({
			projectRoot: failedProjectRoot,
			userRoot: join(tmp.path, "w1-failed-user"),
		});
		await mkdir(join(failedProjectRoot, "memory", "agent", "index.md"), {
			recursive: true,
		});
		const failed = (await failedPi.callTool("remember", {
			content: "The blocked index must leave no partial note.",
			title: "Blocked W1 write",
		})) as ToolResult;
		expect(failed.details).toMatchObject({
			status: "failed",
			title: "Blocked W1 write",
			scope: "project",
			path: expect.stringContaining(join("memory", "agent", "notes")),
			reason: expect.stringMatching(/EISDIR|directory/i),
		});
		await expect(
			readdir(join(failedProjectRoot, "memory", "agent", "notes")),
		).resolves.toEqual([]);
	});

	test("updates the same profile file and reports the change summary @cosmo-behavior plan:profile-playbooks#B-004", async () => {
		const projectRoot = join(tmp.path, "profile-update-project");
		const userRoot = join(tmp.path, "profile-update-user");
		let currentTime = "2026-07-13T10:00:00.000Z";
		const pi = await cosmoPi({
			projectRoot,
			userRoot,
			now: () => new Date(currentTime),
		});

		const created = (await pi.callTool("remember", {
			type: "profile",
			content: "I prefer concise status updates.",
			changeSummary: "Added the concise status-update preference.",
		})) as ToolResult;
		expect(created.details).toMatchObject({
			status: "created",
			type: "profile",
			scope: "user",
			changeSummary: "Added the concise status-update preference.",
			timestamp: "2026-07-13T10:00:00.000Z",
			humanPath: ".cosmonauts/memory/agent/profile.md",
		});
		const profilePath = stringDetail(created.details, "path");
		expect(profilePath).toBe(join(userRoot, "memory", "agent", "profile.md"));

		currentTime = "2026-07-13T11:00:00.000Z";
		const updated = (await pi.callTool("remember", {
			type: "profile",
			content:
				"I prefer concise status updates.\n\nDo not schedule meetings before 10:00.",
			changeSummary: "Added the morning scheduling constraint.",
		})) as ToolResult;
		expect(updated.details).toMatchObject({
			status: "updated",
			type: "profile",
			scope: "user",
			changeSummary: "Added the morning scheduling constraint.",
			timestamp: "2026-07-13T11:00:00.000Z",
			path: profilePath,
			humanPath: ".cosmonauts/memory/agent/profile.md",
		});
		expect(resultText(updated)).toMatch(/updated.*profile/i);
		expect(resultText(updated)).toContain(
			"Added the morning scheduling constraint.",
		);
		const parsed = matter(await readFile(profilePath, "utf-8"));
		expect(parsed.data).toMatchObject({
			type: "profile",
			scope: "user",
			kind: "semantic",
			timestamp: "2026-07-13T11:00:00.000Z",
			source: "main/cosmo",
		});
		expect(parsed.content.trim()).toContain(
			"Do not schedule meetings before 10:00.",
		);
		expect(
			(await readdir(join(userRoot, "memory", "agent"))).filter((name) =>
				name.includes("profile"),
			),
		).toEqual(["profile.md"]);

		const malformed =
			"---\ntype: profile\n---\nHuman-owned malformed profile.\n";
		await writeFile(profilePath, malformed, "utf-8");
		const refused = (await pi.callTool("remember", {
			type: "profile",
			content: "Must not replace malformed human content.",
			changeSummary: "This change must be refused.",
		})) as ToolResult;
		expect(refused.details).toMatchObject({
			status: "failed",
			type: "profile",
			scope: "user",
			path: profilePath,
			humanPath: ".cosmonauts/memory/agent/profile.md",
			reason: expect.stringMatching(/invalid|frontmatter|missing/i),
		});
		expect(resultText(refused)).toContain(
			".cosmonauts/memory/agent/profile.md",
		);
		expect(await readFile(profilePath, "utf-8")).toBe(malformed);

		const validationFactory = vi.fn(() => memoryStore({}));
		const validationPi = createMockPi({ cwd: projectRoot });
		createAgentMemoryExtension({
			userCosmonautsRoot: join(tmp.path, "profile-validation-user"),
			storeFactory: validationFactory,
		})(validationPi as never);
		await validationPi.fireEvent("before_agent_start", {
			systemPrompt: buildAgentIdentityMarker("main/cosmo"),
		});
		for (const params of [
			{ type: "profile", content: "Missing summary." },
			{
				type: "profile",
				content: "Wrong scope.",
				changeSummary: "Invalid scope.",
				scope: "project",
			},
			{
				type: "profile",
				content: "Wrong kind.",
				changeSummary: "Invalid kind.",
				kind: "procedural",
			},
		]) {
			const invalid = (await validationPi.callTool(
				"remember",
				params,
			)) as ToolResult;
			expect(invalid.details).toMatchObject({ status: "invalid_request" });
		}
		expect(validationFactory).not.toHaveBeenCalled();
	});

	test("saves named playbooks directly in project and user scopes @cosmo-behavior plan:profile-playbooks#B-005", async () => {
		const projectRoot = join(tmp.path, "playbook-save-project");
		const userRoot = join(tmp.path, "playbook-save-user");
		const pi = await cosmoPi({ projectRoot, userRoot });

		const projectSave = (await pi.callTool("remember", {
			type: "playbook",
			title: "Release Deploy",
			scope: "project",
			description: "Use when publishing a production release.",
			content: "When to use: after release approval.\n\n1. Tag.\n2. Deploy.",
			tags: ["release", "deploy"],
		})) as ToolResult;
		const userSave = (await pi.callTool("remember", {
			type: "playbook",
			title: "Inbox Triage",
			scope: "user",
			description: "Use at the start of the workday.",
			content: "Review urgent threads first, then archive informational mail.",
		})) as ToolResult;

		for (const [result, title, scope] of [
			[projectSave, "Release Deploy", "project"],
			[userSave, "Inbox Triage", "user"],
		] as const) {
			expect(result.details).toMatchObject({
				status: "created",
				type: "playbook",
				title,
				scope,
				kind: "procedural",
				humanPath: expect.stringContaining("memory/agent/playbooks/"),
			});
			expect(resultText(result)).toMatch(/created.*playbook/i);
			expect(resultText(result)).toContain(title);
			expect(resultText(result)).toContain(scope);
			expect(resultText(result)).toContain(
				stringDetail(result.details, "humanPath"),
			);
		}

		const projectPath = stringDetail(projectSave.details, "path");
		const userPath = stringDetail(userSave.details, "path");
		expect(projectPath).toBe(
			join(projectRoot, "memory", "agent", "playbooks", "release-deploy.md"),
		);
		expect(userPath).toBe(
			join(userRoot, "memory", "agent", "playbooks", "inbox-triage.md"),
		);
		const projectRecord = matter(await readFile(projectPath, "utf-8"));
		const userRecord = matter(await readFile(userPath, "utf-8"));
		expect(projectRecord.data).toMatchObject({
			type: "playbook",
			title: "Release Deploy",
			description: "Use when publishing a production release.",
			scope: "project",
			kind: "procedural",
			source: "main/cosmo",
		});
		expect(userRecord.data).toMatchObject({
			type: "playbook",
			title: "Inbox Triage",
			description: "Use at the start of the workday.",
			scope: "user",
			kind: "procedural",
			source: "main/cosmo",
		});
		expect(projectRecord.content.trim()).toContain("1. Tag.");
		expect(userRecord.content.trim()).toBe(
			"Review urgent threads first, then archive informational mail.",
		);

		const validationFactory = vi.fn(() => memoryStore({}));
		const validationPi = createMockPi({ cwd: projectRoot });
		createAgentMemoryExtension({
			userCosmonautsRoot: join(tmp.path, "playbook-validation-user"),
			storeFactory: validationFactory,
		})(validationPi as never);
		await validationPi.fireEvent("before_agent_start", {
			systemPrompt: buildAgentIdentityMarker("main/cosmo"),
		});
		for (const params of [
			{ type: "playbook", content: "Missing title.", scope: "project" },
			{ type: "playbook", content: "Missing scope.", title: "No scope" },
			{
				type: "playbook",
				content: "Wrong kind.",
				title: "Wrong kind",
				scope: "project",
				kind: "semantic",
			},
			{
				type: "playbook",
				content: "Wrong branch field.",
				title: "Wrong field",
				scope: "project",
				changeSummary: "Profiles only.",
			},
		]) {
			const invalid = (await validationPi.callTool(
				"remember",
				params,
			)) as ToolResult;
			expect(invalid.details).toMatchObject({ status: "invalid_request" });
		}
		expect(validationFactory).not.toHaveBeenCalled();
	});

	test("declined or unanswered proposals write nothing and persist no pending state @cosmo-behavior plan:profile-playbooks#B-007", async () => {
		const projectRoot = join(tmp.path, "proposal-state-project");
		const userRoot = join(tmp.path, "proposal-state-user");
		const storeFactory = vi.fn((options) => createMarkdownMemoryStore(options));
		const pi = createMockPi({ cwd: projectRoot });
		createAgentMemoryExtension({ userCosmonautsRoot: userRoot, storeFactory })(
			pi as never,
		);

		await pi.fireEvent("session_start");
		await pi.fireEvent(
			"before_agent_start",
			{ systemPrompt: buildAgentIdentityMarker("main/not-cosmo") },
			{ cwd: projectRoot },
		);
		await pi.fireEvent("session_shutdown");
		expect(storeFactory).not.toHaveBeenCalled();
		expect(pi.entries).toEqual([]);
		await expect(readdir(join(projectRoot, "memory"))).rejects.toMatchObject({
			code: "ENOENT",
		});
		await expect(readdir(join(userRoot, "memory"))).rejects.toMatchObject({
			code: "ENOENT",
		});

		await pi.fireEvent(
			"before_agent_start",
			{ systemPrompt: buildAgentIdentityMarker("main/cosmo") },
			{ cwd: projectRoot },
		);
		expect(storeFactory).toHaveBeenCalledTimes(1);
		const laterExplicitSave = (await pi.callTool("remember", {
			type: "playbook",
			title: "Current Request Only",
			scope: "project",
			description: "Created only by the later explicit request.",
			content:
				"Perform the current request without reconstructed proposal state.",
		})) as ToolResult;
		expect(laterExplicitSave.details).toMatchObject({ status: "created" });
		expect(storeFactory).toHaveBeenCalledTimes(2);
		expect(pi.entries).toEqual([]);
		expect(
			await readdir(join(projectRoot, "memory", "agent", "playbooks")),
		).toEqual(["current-request-only.md"]);
	});

	test("requires confirmation before updating a canonical playbook name @cosmo-behavior plan:profile-playbooks#B-009", async () => {
		const projectRoot = join(tmp.path, "playbook-confirm-project");
		const userRoot = join(tmp.path, "playbook-confirm-user");
		let currentTime = "2026-07-13T12:00:00.000Z";
		const pi = await cosmoPi({
			projectRoot,
			userRoot,
			now: () => new Date(currentTime),
		});
		const initial = (await pi.callTool("remember", {
			type: "playbook",
			title: "Release Deploy",
			scope: "project",
			description: "Original release procedure.",
			content: "Original release steps.",
		})) as ToolResult;
		const initialPath = stringDetail(initial.details, "path");
		const parsedInitial = matter(await readFile(initialPath, "utf-8"));
		const retitled = matter.stringify(parsedInitial.content.trim(), {
			...parsedInitial.data,
			title: "Production Ship",
			description: "Human-retitled release procedure.",
		});
		await writeFile(initialPath, retitled, "utf-8");

		currentTime = "2026-07-13T13:00:00.000Z";
		const collision = (await pi.callTool("remember", {
			type: "playbook",
			title: "production---ship",
			scope: "project",
			description: "Replacement release procedure.",
			content: "Replacement release steps.",
		})) as ToolResult;
		expect(collision.details).toMatchObject({
			status: "confirmation_required",
			type: "playbook",
			title: "Production Ship",
			requestedTitle: "production---ship",
			scope: "project",
			path: initialPath,
			humanPath: "memory/agent/playbooks/release-deploy.md",
		});
		expect(resultText(collision)).toMatch(/confirm.*update/i);
		expect(await readFile(initialPath, "utf-8")).toBe(retitled);
		expect(pi.entries).toEqual([]);

		const confirmed = (await pi.callTool("remember", {
			type: "playbook",
			title: "production---ship",
			scope: "project",
			description: "Replacement release procedure.",
			content: "Replacement release steps.",
			confirmUpdate: true,
		})) as ToolResult;
		expect(confirmed.details).toMatchObject({
			status: "updated",
			type: "playbook",
			title: "production---ship",
			scope: "project",
			path: initialPath,
			timestamp: "2026-07-13T13:00:00.000Z",
		});
		expect(resultText(confirmed)).toMatch(/updated.*playbook/i);
		expect(
			await readdir(join(projectRoot, "memory", "agent", "playbooks")),
		).toEqual(["release-deploy.md"]);
		const updatedRecord = matter(await readFile(initialPath, "utf-8"));
		expect(updatedRecord.data.title).toBe("production---ship");
		expect(updatedRecord.content.trim()).toBe("Replacement release steps.");

		const renamed = (await pi.callTool("remember", {
			type: "playbook",
			title: "Release Rollback",
			scope: "project",
			description: "A separate recovery procedure.",
			content: "Rollback the release safely.",
		})) as ToolResult;
		expect(renamed.details).toMatchObject({
			status: "created",
			title: "Release Rollback",
		});
		expect(
			(await readdir(join(projectRoot, "memory", "agent", "playbooks"))).sort(),
		).toEqual(["release-deploy.md", "release-rollback.md"]);
		expect(pi.entries).toEqual([]);
	});

	test("registers remember as sequential so same batch saves cannot bypass collision confirmation @cosmo-behavior plan:profile-playbooks#B-021", async () => {
		const projectRoot = join(tmp.path, "sequential-save-project");
		const userRoot = join(tmp.path, "sequential-save-user");
		const pi = await cosmoPi({ projectRoot, userRoot });
		const rememberTool = registeredTool(pi, "remember");
		const recallTool = registeredTool(pi, "recall");

		expect(rememberTool.executionMode).toBe("sequential");
		expect(recallTool).not.toHaveProperty("executionMode");
		expect(rememberTool.parameters).toMatchObject({
			type: "object",
			required: ["content"],
			properties: {
				type: expect.any(Object),
				content: expect.any(Object),
				title: expect.any(Object),
				description: expect.any(Object),
				tags: expect.any(Object),
				scope: expect.any(Object),
				kind: expect.any(Object),
				changeSummary: expect.any(Object),
				confirmUpdate: expect.any(Object),
			},
		});
		expect(rememberTool.parameters).not.toHaveProperty("anyOf");
		expect(rememberTool.parameters).not.toHaveProperty("oneOf");

		const sameBatch = [
			{
				type: "playbook",
				title: "Batch Deploy",
				scope: "project",
				description: "First same-batch save.",
				content: "First same-batch body.",
			},
			{
				type: "playbook",
				title: "batch---deploy",
				scope: "project",
				description: "Second same-batch save.",
				content: "Second same-batch body.",
			},
		];
		const results: ToolResult[] = [];
		if (rememberTool.executionMode === "sequential") {
			for (const params of sameBatch) {
				results.push((await pi.callTool("remember", params)) as ToolResult);
			}
		} else {
			results.push(
				...((await Promise.all(
					sameBatch.map((params) => pi.callTool("remember", params)),
				)) as ToolResult[]),
			);
		}
		expect(results[0]?.details).toMatchObject({ status: "created" });
		expect(results[1]?.details).toMatchObject({
			status: "confirmation_required",
		});
		expect(
			await readdir(join(projectRoot, "memory", "agent", "playbooks")),
		).toEqual(["batch-deploy.md"]);
	});

	test("renders profile and playbook write failures visibly while the session continues @cosmo-behavior plan:profile-playbooks#B-024", async () => {
		const projectRoot = join(tmp.path, "visible-failure-project");
		const userRoot = join(tmp.path, "visible-failure-user");
		await mkdir(join(projectRoot, "memory", "agent", "index.md"), {
			recursive: true,
		});
		await mkdir(join(userRoot, "memory", "agent", "index.md"), {
			recursive: true,
		});
		const pi = await cosmoPi({ projectRoot, userRoot });

		const profileFailure = (await pi.callTool("remember", {
			type: "profile",
			content: "This profile write must fail atomically.",
			changeSummary: "Attempted a blocked profile create.",
		})) as ToolResult;
		const playbookFailure = (await pi.callTool("remember", {
			type: "playbook",
			title: "Blocked Playbook",
			scope: "project",
			description: "This playbook write must fail atomically.",
			content: "Blocked procedural body.",
		})) as ToolResult;

		for (const [result, type, scope, humanPath] of [
			[
				profileFailure,
				"profile",
				"user",
				".cosmonauts/memory/agent/profile.md",
			],
			[
				playbookFailure,
				"playbook",
				"project",
				"memory/agent/playbooks/blocked-playbook.md",
			],
		] as const) {
			expect(result.details).toMatchObject({
				status: "failed",
				type,
				scope,
				humanPath,
				reason: expect.stringMatching(/EISDIR|directory/i),
			});
			expect(resultText(result)).toContain(type);
			expect(resultText(result)).toContain(scope);
			expect(resultText(result)).toContain(humanPath);
			expect(resultText(result)).toMatch(/EISDIR|directory/i);
		}
		await expect(
			readFile(join(userRoot, "memory", "agent", "profile.md"), "utf-8"),
		).rejects.toMatchObject({ code: "ENOENT" });
		await expect(
			readdir(join(projectRoot, "memory", "agent", "playbooks")),
		).resolves.toEqual([]);

		const laterRecall = (await pi.callTool("recall", {
			query: "anything",
		})) as ToolResult;
		expect(laterRecall.details).toMatchObject({ status: "no_match" });
	});

	test("registers remember and recall at factory load with short host-safe descriptions @cosmo-behavior plan:memory-interface#B-012", () => {
		const pi = createMockPi({ cwd: tmp.path });
		agentMemoryExtension(pi as never);

		expect(pi.tools.has("remember")).toBe(true);
		expect(pi.tools.has("recall")).toBe(true);
		expect(pi.tools.get("remember")).toMatchObject({
			description: "Save an explicit note to agent memory.",
		});
		expect(pi.tools.get("recall")).toMatchObject({
			description: "Search authored agent-memory notes.",
		});
		expect(pi.tools.get("remember")).not.toHaveProperty("promptSnippet");
		expect(pi.tools.get("recall")).not.toHaveProperty("promptSnippet");
	});

	test("guards tool execution by current main/cosmo turn and resets on lifecycle events @cosmo-behavior plan:memory-interface#B-012", async () => {
		const storeFactory = vi.fn(() => memoryStore({}));
		const pi = createMockPi({ cwd: tmp.path });
		createAgentMemoryExtension({
			userCosmonautsRoot: join(tmp.path, "user-cosmonauts"),
			storeFactory,
			now: () => new Date("2026-07-08T14:00:00.000Z"),
		})(pi as never);

		await pi.fireEvent("before_agent_start", {
			systemPrompt: buildAgentIdentityMarker("main/cosmo"),
		});
		await pi.callTool("remember", { content: "Cosmo-owned note" });
		expect(storeFactory).toHaveBeenCalledTimes(1);

		await pi.fireEvent("before_agent_start", {
			systemPrompt: buildAgentIdentityMarker("main/not-cosmo"),
		});
		const nonCosmo = (await pi.callTool("recall", {
			query: "Cosmo-owned",
		})) as ToolResult;
		expect(resultText(nonCosmo)).toContain("not authorized");
		expect(nonCosmo.details).toMatchObject({ status: "unauthorized" });
		expect(storeFactory).toHaveBeenCalledTimes(1);
		await expect(readdir(join(tmp.path, "memory"))).rejects.toMatchObject({
			code: "ENOENT",
		});

		await pi.fireEvent("before_agent_start", {
			systemPrompt: buildAgentIdentityMarker("main/cosmo"),
		});
		await pi.fireEvent("session_start");
		const afterSessionStart = (await pi.callTool("remember", {
			content: "Should be unauthorized",
		})) as ToolResult;
		expect(afterSessionStart.details).toMatchObject({
			status: "unauthorized",
		});
		expect(storeFactory).toHaveBeenCalledTimes(1);

		await pi.fireEvent("before_agent_start", {
			systemPrompt: buildAgentIdentityMarker("main/cosmo"),
		});
		await pi.fireEvent("session_shutdown");
		const afterShutdown = (await pi.callTool("recall", {
			query: "anything",
		})) as ToolResult;
		expect(afterShutdown.details).toMatchObject({ status: "unauthorized" });
		expect(storeFactory).toHaveBeenCalledTimes(1);
	});

	test("remember writes explicit OKF notes to project and user stores @cosmo-behavior plan:memory-interface#B-005", async () => {
		const projectRoot = join(tmp.path, "project");
		const userRoot = join(tmp.path, "user-cosmonauts");
		const pi = await cosmoPi({ projectRoot, userRoot });

		const projectSave = (await pi.callTool("remember", {
			content: "Release deploys use the release branch.",
			title: "Release deploys",
			description: "Staging deploy branch.",
			tags: ["deploys", "release"],
			scope: "project",
			kind: "semantic",
		})) as ToolResult;
		const userSave = (await pi.callTool("remember", {
			content: "Prefer concise review notes.",
			title: "Review preference",
			scope: "user",
			kind: "procedural",
		})) as ToolResult;

		expect(resultText(projectSave)).toContain('Saved "Release deploys"');
		expect(resultText(projectSave)).toContain("project");
		expect(resultText(userSave)).toContain('Saved "Review preference"');
		expect(resultText(userSave)).toContain("user");
		expect(projectSave.details).toMatchObject({
			status: "saved",
			title: "Release deploys",
			scope: "project",
			kind: "semantic",
		});
		expect(userSave.details).toMatchObject({
			status: "saved",
			title: "Review preference",
			scope: "user",
			kind: "procedural",
		});

		const projectPath = stringDetail(projectSave.details, "path");
		const userPath = stringDetail(userSave.details, "path");
		const parsedProject = matter(await readFile(projectPath, "utf-8"));
		const parsedUser = matter(await readFile(userPath, "utf-8"));
		expect(parsedProject.data).toMatchObject({
			type: "note",
			title: "Release deploys",
			description: "Staging deploy branch.",
			tags: ["deploys", "release"],
			timestamp: "2026-07-08T14:00:00.000Z",
			scope: "project",
			kind: "semantic",
			source: "main/cosmo",
		});
		expect(parsedProject.content.trim()).toBe(
			"Release deploys use the release branch.",
		);
		expect(parsedUser.data).toMatchObject({
			type: "note",
			title: "Review preference",
			description: "Review preference",
			tags: [],
			timestamp: "2026-07-08T14:00:00.000Z",
			scope: "user",
			kind: "procedural",
			source: "main/cosmo",
		});
	});

	test("remember supports deterministic minimal content saves @cosmo-behavior plan:memory-interface#B-005", async () => {
		const projectRoot = join(tmp.path, "minimal-project");
		const pi = await cosmoPi({
			projectRoot,
			userRoot: join(tmp.path, "minimal-user"),
		});
		const longFirstLine = `${"x".repeat(70)}\nsecond line`;

		const save = (await pi.callTool("remember", {
			content: longFirstLine,
		})) as ToolResult;

		expect(save.details).toMatchObject({
			status: "saved",
			title: "x".repeat(60),
			scope: "project",
			kind: "semantic",
			tags: [],
			timestamp: "2026-07-08T14:00:00.000Z",
		});
		const parsed = matter(
			await readFile(stringDetail(save.details, "path"), "utf-8"),
		);
		expect(parsed.data).toMatchObject({
			title: "x".repeat(60),
			description: "x".repeat(60),
			scope: "project",
			kind: "semantic",
			tags: [],
			timestamp: "2026-07-08T14:00:00.000Z",
		});
		expect(parsed.content.trim()).toBe(longFirstLine);
	});

	test("failed remember reports path and reason without leaving a partial note @cosmo-behavior plan:memory-interface#B-005", async () => {
		const projectRoot = join(tmp.path, "failed-write-project");
		const pi = await cosmoPi({
			projectRoot,
			userRoot: join(tmp.path, "failed-write-user"),
		});
		await mkdir(join(projectRoot, "memory", "agent", "index.md"), {
			recursive: true,
		});

		const failed = (await pi.callTool("remember", {
			content:
				"This write cannot finish because the index path is a directory.",
			title: "Blocked index",
		})) as ToolResult;

		expect(failed.details).toMatchObject({
			status: "failed",
			title: "Blocked index",
			scope: "project",
		});
		expect(stringDetail(failed.details, "path")).toContain(
			join("memory", "agent", "notes"),
		);
		expect(stringDetail(failed.details, "reason")).toMatch(/EISDIR|directory/i);
		await expect(
			readdir(join(projectRoot, "memory", "agent", "notes")),
		).resolves.toEqual([]);
	});

	test("recall searches notes over project and user scopes with default and capped limits @cosmo-behavior plan:memory-interface#B-007", async () => {
		const projectRoot = join(tmp.path, "recall-project");
		const userRoot = join(tmp.path, "recall-user");
		const pi = await cosmoPi({ projectRoot, userRoot });

		for (let index = 0; index < 25; index += 1) {
			await pi.callTool("remember", {
				content: `Searchable recall fact ${index}`,
				title: `Recall fact ${index.toString().padStart(2, "0")}`,
				scope: index % 2 === 0 ? "project" : "user",
			});
		}

		const defaultRecall = (await pi.callTool("recall", {
			query: "Searchable recall fact",
		})) as ToolResult;
		expect(defaultRecall.details).toMatchObject({
			status: "matched",
			query: "Searchable recall fact",
			limit: 5,
			searchedScopes: ["project", "user"],
		});
		expect(records(defaultRecall.details)).toHaveLength(5);
		expect(resultText(defaultRecall)).toContain("Recall fact 00");
		expect(resultText(defaultRecall)).toContain("scope: project");
		expect(resultText(defaultRecall)).toContain("kind: semantic");
		expect(resultText(defaultRecall)).toContain("timestamp:");
		expect(resultText(defaultRecall)).toContain("path:");

		const capped = (await pi.callTool("recall", {
			query: "Searchable recall fact",
			limit: 200,
		})) as ToolResult;
		expect(capped.details).toMatchObject({ status: "matched", limit: 20 });
		expect(records(capped.details)).toHaveLength(20);
	});

	test("recall rejects empty query and returns honest no-match scopes @cosmo-behavior plan:memory-interface#B-007", async () => {
		const pi = await cosmoPi({
			projectRoot: join(tmp.path, "no-match-project"),
			userRoot: join(tmp.path, "no-match-user"),
		});
		await pi.callTool("remember", {
			content: "Deploys use release branches.",
			title: "Deploy branch",
		});

		const empty = (await pi.callTool("recall", {
			query: "  ",
		})) as ToolResult;
		expect(empty.details).toMatchObject({ status: "invalid_request" });
		expect(resultText(empty)).toContain("requires non-empty query text");

		const noMatch = (await pi.callTool("recall", {
			query: "missing phrase",
			limit: 10,
		})) as ToolResult;
		expect(noMatch.details).toMatchObject({
			status: "no_match",
			query: "missing phrase",
			limit: 10,
			searchedScopes: ["project", "user"],
		});
		expect(resultText(noMatch)).toContain("No authored memory notes matched");
		expect(resultText(noMatch)).toContain("project, user");
	});

	test("recall text reports skipped malformed notes for matched and no-match results @cosmo-behavior plan:memory-interface#B-007", async () => {
		const projectRoot = join(tmp.path, "warning-recall-project");
		const userRoot = join(tmp.path, "warning-recall-user");
		const pi = await cosmoPi({ projectRoot, userRoot });
		await pi.callTool("remember", {
			content: "Visible warning recall fact.",
			title: "Warning recall fact",
		});
		await writeMalformedProjectNote(projectRoot, "bad-note.md");

		const matched = (await pi.callTool("recall", {
			query: "Visible warning",
		})) as ToolResult;
		expect(matched.details).toMatchObject({ status: "matched" });
		expect(resultText(matched)).toContain(
			"Warning: 1 memory note was skipped because it could not be read; see details.warnings.",
		);
		expect(warnings(matched.details)).toEqual([
			expect.objectContaining({
				path: expect.stringContaining("bad-note.md"),
				message: expect.any(String),
			}),
		]);

		const noMatch = (await pi.callTool("recall", {
			query: "missing warning fact",
		})) as ToolResult;
		expect(noMatch.details).toMatchObject({ status: "no_match" });
		expect(resultText(noMatch)).toContain(
			"Warning: 1 memory note was skipped because it could not be read; see details.warnings.",
		);
		expect(warnings(noMatch.details)).toEqual(warnings(matched.details));
	});

	test("injects one hidden current disk note index for main/cosmo and filters stale context @cosmo-behavior plan:memory-interface#B-006", async () => {
		const projectRoot = join(tmp.path, "index-project");
		const userRoot = join(tmp.path, "index-user");
		const store = createMarkdownMemoryStore({
			projectRoot,
			userCosmonautsRoot: userRoot,
		});
		await writeMemoryNote(store, {
			scope: "project",
			kind: "semantic",
			title: "Project deploy preference",
			description: "Deployment branch note.",
			content: "PROJECT_BODY_SHOULD_NOT_BE_IN_INDEX",
			timestamp: "2026-07-08T14:00:00.000Z",
		});
		await writeMemoryNote(store, {
			scope: "user",
			kind: "procedural",
			title: "User review style",
			description: "Review tone preference.",
			content: "USER_BODY_SHOULD_NOT_BE_IN_INDEX",
			timestamp: "2026-07-08T15:00:00.000Z",
		});
		const pi = createMockPi({ cwd: projectRoot });
		createAgentMemoryExtension({
			userCosmonautsRoot: userRoot,
			now: () => new Date("2026-07-08T16:00:00.000Z"),
		})(pi as never);

		const result = (await pi.fireEvent(
			"before_agent_start",
			{ systemPrompt: buildAgentIdentityMarker("main/cosmo") },
			{ cwd: projectRoot },
		)) as {
			message: { customType: string; content: string; display: boolean };
		};

		expect(result.message).toMatchObject({
			customType: "agent-memory-context",
			display: false,
		});
		expect(result.message.content).toContain("Agent memory index context");
		expect(result.message.content).toContain("Use recall(query)");
		expect(result.message.content).toContain("title: User review style");
		expect(result.message.content).toContain("scope: user");
		expect(result.message.content).toContain("kind: procedural");
		expect(result.message.content).toContain(
			"timestamp: 2026-07-08T15:00:00.000Z",
		);
		expect(result.message.content).toContain(
			"description: Review tone preference.",
		);
		expect(result.message.content).toContain(
			"path: .cosmonauts/memory/agent/notes/",
		);
		expect(result.message.content).toContain(
			"title: Project deploy preference",
		);
		expect(result.message.content).toContain("scope: project");
		expect(result.message.content).toContain("kind: semantic");
		expect(result.message.content).toContain(
			"description: Deployment branch note.",
		);
		expect(result.message.content).toContain("path: memory/agent/notes/");
		expect(result.message.content).not.toContain(
			"PROJECT_BODY_SHOULD_NOT_BE_IN_INDEX",
		);
		expect(result.message.content).not.toContain(
			"USER_BODY_SHOULD_NOT_BE_IN_INDEX",
		);

		const filtered = (await pi.fireEvent("context", {
			messages: [
				{ customType: "agent-memory-context", content: "old memory" },
				{ role: "user", content: "keep this" },
			],
		})) as { messages: unknown[] };
		expect(filtered.messages).toEqual([{ role: "user", content: "keep this" }]);
	});

	test("empty stores inject nothing and create no files @cosmo-behavior plan:memory-interface#B-006", async () => {
		const projectRoot = join(tmp.path, "empty-index-project");
		const userRoot = join(tmp.path, "empty-index-user");
		const pi = createMockPi({ cwd: projectRoot });
		createAgentMemoryExtension({
			userCosmonautsRoot: userRoot,
			now: () => new Date("2026-07-08T16:00:00.000Z"),
		})(pi as never);

		const result = await pi.fireEvent(
			"before_agent_start",
			{ systemPrompt: buildAgentIdentityMarker("main/cosmo") },
			{ cwd: projectRoot },
		);

		expect(result).toBeUndefined();
		await expect(readdir(join(projectRoot, "memory"))).rejects.toMatchObject({
			code: "ENOENT",
		});
		await expect(readdir(join(userRoot, "memory"))).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("memory index injection uses list mode capped to the 50 most recent records before truncation @cosmo-behavior plan:memory-interface#B-006", async () => {
		const projectRoot = join(tmp.path, "index-cap-project");
		const userRoot = join(tmp.path, "index-cap-user");
		const store = createMarkdownMemoryStore({
			projectRoot,
			userCosmonautsRoot: userRoot,
		});
		for (let index = 0; index < 55; index += 1) {
			await writeMemoryNote(store, {
				scope: index % 2 === 0 ? "project" : "user",
				kind: "semantic",
				title: `Cap note ${index.toString().padStart(2, "0")}`,
				description: `Cap note ${index} metadata.`,
				content: `Full note body ${index} should stay out of injected index.`,
				timestamp: new Date(Date.UTC(2026, 6, 8, 14, 0, index)).toISOString(),
			});
		}
		const pi = createMockPi({ cwd: projectRoot });
		createAgentMemoryExtension({
			userCosmonautsRoot: userRoot,
			now: () => new Date("2026-07-08T16:00:00.000Z"),
		})(pi as never);

		const result = (await pi.fireEvent(
			"before_agent_start",
			{ systemPrompt: buildAgentIdentityMarker("main/cosmo") },
			{ cwd: projectRoot },
		)) as { message: { content: string } };

		expect(result.message.content.match(/^- title:/gm)).toHaveLength(50);
		expect(result.message.content).toContain("title: Cap note 54");
		expect(result.message.content).toContain("title: Cap note 05");
		expect(result.message.content).not.toContain("title: Cap note 04");
		expect(result.message.content).not.toContain("Full note body");
	});

	test("memory index truncation is UTF-8 safe and stays under the independent 12000 byte budget @cosmo-behavior plan:memory-interface#B-013", async () => {
		const projectRoot = join(tmp.path, "utf8-budget-project");
		const userRoot = join(tmp.path, "utf8-budget-user");
		const pi = createMockPi({ cwd: projectRoot });
		createAgentMemoryExtension({
			userCosmonautsRoot: userRoot,
			storeFactory: () =>
				memoryStore({
					retrieve: async () => ({
						records: [
							record({
								title: "UTF-8 truncation target",
								description: `Fresh metadata ${"😀".repeat(4_000)}`,
								content: "FULL_BODY_SHOULD_NOT_BE_IN_CONTEXT",
								path: join(projectRoot, "memory", "agent", "notes", "utf8.md"),
							}),
						],
						searchedScopes: ["project", "user"],
						skippedScopes: [],
						warnings: [],
					}),
				}),
			now: () => new Date("2026-07-08T16:00:00.000Z"),
		})(pi as never);

		const result = (await pi.fireEvent(
			"before_agent_start",
			{ systemPrompt: buildAgentIdentityMarker("main/cosmo") },
			{ cwd: projectRoot },
		)) as { message: { content: string } };

		expect(
			Buffer.byteLength(result.message.content, "utf-8"),
		).toBeLessThanOrEqual(12_000);
		expect(result.message.content).toContain("Truncated memory index");
		expect(result.message.content).toContain("Use recall(query)");
		expect(result.message.content).toContain("scope: project");
		expect(result.message.content).toContain(
			"timestamp: 2026-07-08T14:00:00.000Z",
		);
		expect(result.message.content).not.toContain("�");
		expect(result.message.content).not.toContain(
			"FULL_BODY_SHOULD_NOT_BE_IN_CONTEXT",
		);
	});

	test("truncation footer mutation target never pushes memory index over 12000 bytes @cosmo-behavior plan:memory-interface#B-013", async () => {
		const projectRoot = join(tmp.path, "footer-budget-project");
		const userRoot = join(tmp.path, "footer-budget-user");
		const pi = createMockPi({ cwd: projectRoot });
		createAgentMemoryExtension({
			userCosmonautsRoot: userRoot,
			storeFactory: () =>
				memoryStore({
					retrieve: async () => ({
						records: Array.from({ length: 50 }, (_, index) =>
							record({
								title: `Footer budget note ${index.toString().padStart(2, "0")}`,
								description: `Footer-sensitive metadata ${index} ${"中".repeat(120)}`,
								content: `Hidden body ${index}`,
								path: join(
									projectRoot,
									"memory",
									"agent",
									"notes",
									`footer-${index}.md`,
								),
								timestamp: new Date(
									Date.UTC(2026, 6, 8, 14, 0, index),
								).toISOString(),
							}),
						),
						searchedScopes: ["project", "user"],
						skippedScopes: [],
						warnings: [],
					}),
				}),
			now: () => new Date("2026-07-08T16:00:00.000Z"),
		})(pi as never);

		const result = (await pi.fireEvent(
			"before_agent_start",
			{ systemPrompt: buildAgentIdentityMarker("main/cosmo") },
			{ cwd: projectRoot },
		)) as { message: { content: string } };

		expect(
			Buffer.byteLength(result.message.content, "utf-8"),
		).toBeLessThanOrEqual(12_000);
		expect(result.message.content).toContain("Truncated memory index");
		expect(result.message.content).toContain("Use recall(query)");
		expect(result.message.content).not.toContain("�");
	});
});

interface ToolResult {
	content: { type: "text"; text: string }[];
	details: unknown;
}

function resultText(result: ToolResult): string {
	return result.content.map((entry) => entry.text).join("\n");
}

async function cosmoPi(options: {
	readonly projectRoot: string;
	readonly userRoot: string;
	readonly now?: () => Date;
}) {
	const pi = createMockPi({ cwd: options.projectRoot });
	createAgentMemoryExtension({
		userCosmonautsRoot: options.userRoot,
		now: options.now ?? (() => new Date("2026-07-08T14:00:00.000Z")),
	})(pi as never);
	await pi.fireEvent("before_agent_start", {
		systemPrompt: buildAgentIdentityMarker("main/cosmo"),
	});
	return pi;
}

function registeredTool(
	pi: ReturnType<typeof createMockPi>,
	name: string,
): {
	readonly executionMode?: "sequential" | "parallel";
	readonly parameters: unknown;
} {
	const tool = pi.tools.get(name);
	if (!tool) throw new Error(`Expected registered tool ${name}`);
	return tool as unknown as {
		readonly executionMode?: "sequential" | "parallel";
		readonly parameters: unknown;
	};
}

function memoryStore(options: {
	readonly write?: MemoryStore["write"];
	readonly retrieve?: MemoryStore["retrieve"];
}): MemoryStore {
	return {
		write:
			options.write ??
			(async (record): Promise<MemoryWriteResult> => ({
				kind: "written",
				path: join(tmp.path, "memory", "agent", "notes", "spy.md"),
				record: {
					type: record.type,
					scope: record.scope,
					kind: record.kind,
					title: record.title,
					description: record.description,
					resource: "memory/agent/notes/spy.md",
					tags: record.tags,
					timestamp: record.timestamp ?? "2026-07-08T14:00:00.000Z",
					content: record.content,
					path: join(tmp.path, "memory", "agent", "notes", "spy.md"),
				},
			})),
		retrieve:
			options.retrieve ??
			(async () => ({
				records: [],
				searchedScopes: ["project", "user"],
				skippedScopes: [],
				warnings: [],
			})),
		consolidate: async () => ({
			kind: "noop",
			reason:
				"W1 performs no background memory consolidation, pruning, decay, or dreaming.",
		}),
	};
}

function stringDetail(details: unknown, key: string): string {
	if (!details || typeof details !== "object") {
		throw new Error("Expected object details");
	}
	const value = (details as Record<string, unknown>)[key];
	if (typeof value !== "string") {
		throw new Error(`Expected string detail ${key}`);
	}
	return value;
}

function records(details: unknown): unknown[] {
	if (!details || typeof details !== "object") {
		throw new Error("Expected object details");
	}
	const value = (details as Record<string, unknown>).records;
	if (!Array.isArray(value)) throw new Error("Expected records array");
	return value;
}

function warnings(details: unknown): unknown[] {
	if (!details || typeof details !== "object") {
		throw new Error("Expected object details");
	}
	const value = (details as Record<string, unknown>).warnings;
	if (!Array.isArray(value)) throw new Error("Expected warnings array");
	return value;
}

async function writeMalformedProjectNote(
	projectRoot: string,
	fileName: string,
): Promise<void> {
	const notesDir = join(projectRoot, "memory", "agent", "notes");
	await mkdir(notesDir, { recursive: true });
	await writeFile(join(notesDir, fileName), "not an OKF note\n");
}

async function writeMemoryNote(
	store: MemoryStore,
	options: {
		readonly scope: Exclude<MemoryScopeName, "session">;
		readonly kind: MemoryKind;
		readonly title: string;
		readonly description: string;
		readonly content: string;
		readonly timestamp: string;
	},
): Promise<void> {
	const result = await store.write({
		type: "note",
		scope: options.scope,
		kind: options.kind,
		title: options.title,
		description: options.description,
		content: options.content,
		tags: [],
		timestamp: options.timestamp,
		source: "test",
	});
	expect(result.kind).toBe("written");
}

function record(
	overrides: Partial<RetrievedMemoryRecord>,
): RetrievedMemoryRecord {
	return {
		type: "note",
		scope: "project",
		kind: "semantic",
		title: "Memory note",
		description: "Memory metadata.",
		resource: "memory/agent/notes/note.md",
		tags: [],
		timestamp: "2026-07-08T14:00:00.000Z",
		content: "Full memory body.",
		path: join(tmp.path, "memory", "agent", "notes", "note.md"),
		...overrides,
	};
}
