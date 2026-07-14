import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
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
	PROFILE_WRITE_MAX_BYTES,
	type RetrievedMemoryRecord,
} from "../../lib/memory/index.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi } from "../helpers/mocks/index.ts";

const tmp = useTempDir("agent-memory-");

describe("agent-memory extension", () => {
	test("keeps the newest injected memory context provider visible through the context transform @cosmo-behavior plan:profile-playbooks#B-020", async () => {
		const projectRoot = join(tmp.path, "context-pipeline-project");
		const userRoot = join(tmp.path, "context-pipeline-user");
		const store = createMarkdownMemoryStore({
			projectRoot,
			userCosmonautsRoot: userRoot,
		});
		await writeMemoryNote(store, {
			scope: "project",
			kind: "semantic",
			title: "Newest provider-visible memory",
			description: "Proves the composed context pipeline.",
			content: "The hidden index omits this full body.",
			timestamp: "2026-07-13T12:00:00.000Z",
		});
		const pi = createMockPi({ cwd: projectRoot });
		createAgentMemoryExtension({ userCosmonautsRoot: userRoot })(pi as never);

		const injected = (await pi.fireEvent(
			"before_agent_start",
			{ systemPrompt: buildAgentIdentityMarker("main/cosmo") },
			{ cwd: projectRoot },
		)) as {
			message: { customType: string; content: string; display: boolean };
		};
		const userMessage = { role: "user", content: "Keep the user message." };
		const assistantMessage = {
			role: "assistant",
			content: "Keep the assistant message.",
		};
		const providerContext = (await pi.fireEvent("context", {
			messages: [
				{ customType: "agent-memory-context", content: "older memory" },
				userMessage,
				injected.message,
				assistantMessage,
			],
		})) as { messages: unknown[] };

		expect(providerContext.messages).toEqual([
			userMessage,
			injected.message,
			assistantMessage,
		]);
		expect(providerContext.messages[0]).toBe(userMessage);
		expect(providerContext.messages[1]).toBe(injected.message);
		expect(providerContext.messages[2]).toBe(assistantMessage);
		expect(injected.message.content).toContain(
			"title: Newest provider-visible memory",
		);

		await pi.fireEvent(
			"before_agent_start",
			{ systemPrompt: buildAgentIdentityMarker("main/not-cosmo") },
			{ cwd: projectRoot },
		);
		const nonCosmoContext = (await pi.fireEvent("context", {
			messages: [injected.message, userMessage],
		})) as { messages: unknown[] };
		expect(nonCosmoContext.messages).toEqual([userMessage]);
	});

	test("creates a user profile and injects it in a different project session @cosmo-behavior plan:profile-playbooks#B-003", async () => {
		const projectA = join(tmp.path, "profile-cross-project-a");
		const projectB = join(tmp.path, "profile-cross-project-b");
		const userRoot = join(tmp.path, "profile-cross-project-user");
		const profileBody =
			"I prefer direct status updates.\n\nUse UTC timestamps in technical reports.";
		const piA = await cosmoPi({ projectRoot: projectA, userRoot });

		const created = (await piA.callTool("remember", {
			type: "profile",
			content: profileBody,
			changeSummary: "Added communication and timestamp preferences.",
		})) as ToolResult;
		expect(created.details).toMatchObject({
			status: "created",
			type: "profile",
			scope: "user",
			kind: "semantic",
			changeSummary: "Added communication and timestamp preferences.",
			humanPath: ".cosmonauts/memory/agent/profile.md",
		});
		expect(resultText(created)).toContain("Created profile");
		expect(resultText(created)).toContain(
			"Added communication and timestamp preferences.",
		);
		expect(resultText(created)).toContain(
			".cosmonauts/memory/agent/profile.md",
		);

		const profilePath = stringDetail(created.details, "path");
		const profileFiles = (
			await readdir(join(userRoot, "memory", "agent"))
		).filter((name) => name === "profile.md");
		expect(profileFiles).toEqual(["profile.md"]);
		const parsed = matter(await readFile(profilePath, "utf-8"));
		expect(parsed.data).toMatchObject({
			type: "profile",
			scope: "user",
			kind: "semantic",
			title: "User profile",
		});
		expect(parsed.content.trim()).toBe(profileBody);

		await piA.callTool("remember", {
			content: "PROJECT_A_ONLY_MEMORY",
			title: "Project A only",
			scope: "project",
		});
		const piB = createMockPi({ cwd: projectB });
		createAgentMemoryExtension({ userCosmonautsRoot: userRoot })(piB as never);
		const injected = await injectionFor(piB, projectB);

		expect(injected).toContain(profileBody);
		expect(injected).not.toContain("PROJECT_A_ONLY_MEMORY");
		expect(injected).not.toContain("Project A only");
		const projectBStore = createMarkdownMemoryStore({
			projectRoot: projectB,
			userCosmonautsRoot: userRoot,
		});
		const visible = await projectBStore.retrieve(
			{ projectRoot: projectB, scopes: ["project", "user"] },
			{ text: "", recordTypes: ["profile"] },
		);
		expect(visible.records).toHaveLength(1);
		expect(visible.records[0]?.content).toBe(profileBody);
	});

	test("indexes playbooks and recalls their full steps in a later session @cosmo-behavior plan:profile-playbooks#B-010", async () => {
		const projectRoot = join(tmp.path, "playbook-later-session-project");
		const userRoot = join(tmp.path, "playbook-later-session-user");
		let currentTime = "2026-07-13T08:00:00.000Z";
		const authorPi = await cosmoPi({
			projectRoot,
			userRoot,
			now: () => new Date(currentTime),
		});
		await authorPi.callTool("remember", {
			type: "profile",
			content: "The constellation-search preference belongs in my profile.",
			changeSummary: "Added the constellation-search preference.",
		});
		currentTime = "2026-07-13T09:00:00.000Z";
		const playbookBody = [
			"When to use: before a production release.",
			"",
			"1. Run the full verification suite.",
			"2. Confirm the release tag.",
			"3. Publish the release notes.",
		].join("\n");
		const savedPlaybook = (await authorPi.callTool("remember", {
			type: "playbook",
			title: "Production release ritual",
			description: "Constellation-search release procedure.",
			content: playbookBody,
			scope: "project",
		})) as ToolResult;
		const playbookPath = stringDetail(savedPlaybook.details, "path");

		for (let index = 0; index < 21; index += 1) {
			currentTime = new Date(Date.UTC(2026, 6, 13, 10, 0, index)).toISOString();
			await authorPi.callTool("remember", {
				content: `Constellation-search note body ${index}.`,
				title: `Constellation-search note ${index.toString().padStart(2, "0")}`,
				scope: "project",
			});
		}

		const laterPi = createMockPi({ cwd: projectRoot });
		createAgentMemoryExtension({ userCosmonautsRoot: userRoot })(
			laterPi as never,
		);
		const injected = await injectionFor(laterPi, projectRoot);
		expect(injected).toContain("- type: playbook");
		expect(injected).toContain("name: Production release ritual");
		expect(injected).toContain("scope: project");
		expect(injected).toContain("timestamp: 2026-07-13T09:00:00.000Z");
		expect(injected).toContain(
			"description: Constellation-search release procedure.",
		);
		expect(injected).toContain("path: memory/agent/playbooks/");
		expect(injected).not.toContain("Run the full verification suite");

		const recalledByName = (await laterPi.callTool("recall", {
			query: "Production release ritual",
		})) as ToolResult;
		expect(recalledByName.details).toMatchObject({
			status: "matched",
			limit: 5,
		});
		expect(records(recalledByName.details)).toEqual([
			expect.objectContaining({
				type: "playbook",
				title: "Production release ritual",
				scope: "project",
				kind: "procedural",
				timestamp: "2026-07-13T09:00:00.000Z",
				path: playbookPath,
				content: playbookBody,
			}),
		]);
		expect(resultText(recalledByName)).toContain("authored memory record");
		expect(resultText(recalledByName)).toContain("type: playbook");
		expect(resultText(recalledByName)).toContain(
			"name: Production release ritual",
		);
		expect(resultText(recalledByName)).toContain(playbookBody);

		const defaultRecall = (await laterPi.callTool("recall", {
			query: "constellation-search",
		})) as ToolResult;
		expect(records(defaultRecall.details)).toHaveLength(6);
		expect(records(defaultRecall.details)[0]).toMatchObject({
			type: "profile",
		});
		const cappedRecall = (await laterPi.callTool("recall", {
			query: "constellation-search",
			limit: 200,
		})) as ToolResult;
		expect(cappedRecall.details).toMatchObject({ limit: 20 });
		expect(records(cappedRecall.details)).toHaveLength(21);
		expect(records(cappedRecall.details)[0]).toMatchObject({ type: "profile" });
		expect(
			Object.keys(
				(
					registeredTool(laterPi, "recall").parameters as {
						properties: Record<string, unknown>;
					}
				).properties,
			),
		).toEqual(["query", "limit"]);
	});

	test("reflects profile edits and deletion on the next injected context and recall @cosmo-behavior plan:profile-playbooks#B-013", async () => {
		const projectRoot = join(tmp.path, "human-profile-project");
		const userRoot = join(tmp.path, "human-profile-user");
		const pi = await cosmoPi({ projectRoot, userRoot });
		const created = (await pi.callTool("remember", {
			type: "profile",
			content: "I prefer status summaries.",
			changeSummary: "Added the initial status preference.",
		})) as ToolResult;
		const profilePath = stringDetail(created.details, "path");
		const editedBody =
			"I prefer status summaries with explicit risk callouts.\n\nHuman edit wins immediately.";
		const originalRaw = await readFile(profilePath, "utf-8");
		await writeFile(
			profilePath,
			originalRaw
				.replace("I prefer status summaries.", editedBody)
				.replace("2026-07-08T14:00:00.000Z", "2026-07-13T12:30:00.000Z"),
			"utf-8",
		);

		const editedInjection = await injectionFor(pi, projectRoot);
		expect(editedInjection).toContain(editedBody);
		expect(editedInjection).not.toContain("I prefer status summaries.\n");
		const editedRecall = (await pi.callTool("recall", {
			query: "Human edit wins immediately",
		})) as ToolResult;
		expect(editedRecall.details).toMatchObject({ status: "matched" });
		expect(records(editedRecall.details)).toEqual([
			expect.objectContaining({
				type: "profile",
				content: editedBody,
				timestamp: "2026-07-13T12:30:00.000Z",
			}),
		]);

		await unlink(profilePath);
		const afterDeletion = await pi.fireEvent(
			"before_agent_start",
			{ systemPrompt: buildAgentIdentityMarker("main/cosmo") },
			{ cwd: projectRoot },
		);
		expect(afterDeletion).toBeUndefined();
		const deletedRecall = (await pi.callTool("recall", {
			query: "Human edit wins immediately",
		})) as ToolResult;
		expect(deletedRecall.details).toMatchObject({
			status: "no_match",
			records: [],
			warnings: [],
		});
		await expect(readFile(profilePath, "utf-8")).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("reflects playbook renames edits and deletion in injected context and recall @cosmo-behavior plan:profile-playbooks#B-023", async () => {
		const projectRoot = join(tmp.path, "human-playbook-project");
		const userRoot = join(tmp.path, "human-playbook-user");
		const pi = await cosmoPi({ projectRoot, userRoot });
		const created = (await pi.callTool("remember", {
			type: "playbook",
			title: "Old incident ritual",
			description: "Original incident response.",
			content: "1. Read the old dashboard.\n2. Notify the old channel.",
			scope: "project",
		})) as ToolResult;
		const playbookPath = stringDetail(created.details, "path");
		const editedBody =
			"When to use: for a live incident.\n\n1. Open the current dashboard.\n2. Notify the incident commander.";
		const originalRaw = await readFile(playbookPath, "utf-8");
		await writeFile(
			playbookPath,
			originalRaw
				.replace("Old incident ritual", "Current incident response")
				.replace(
					"Original incident response.",
					"Human-edited incident procedure.",
				)
				.replace(
					"1. Read the old dashboard.\n2. Notify the old channel.",
					editedBody,
				),
			"utf-8",
		);

		const editedInjection = await injectionFor(pi, projectRoot);
		expect(editedInjection).toContain("name: Current incident response");
		expect(editedInjection).toContain(
			"description: Human-edited incident procedure.",
		);
		expect(editedInjection).not.toContain("name: Old incident ritual");
		expect(editedInjection).not.toContain("Open the current dashboard");
		const editedRecall = (await pi.callTool("recall", {
			query: "incident commander",
		})) as ToolResult;
		expect(records(editedRecall.details)).toEqual([
			expect.objectContaining({
				type: "playbook",
				title: "Current incident response",
				content: editedBody,
				path: playbookPath,
			}),
		]);

		await unlink(playbookPath);
		const afterDeletion = await pi.fireEvent(
			"before_agent_start",
			{ systemPrompt: buildAgentIdentityMarker("main/cosmo") },
			{ cwd: projectRoot },
		);
		expect(afterDeletion).toBeUndefined();
		const deletedRecall = (await pi.callTool("recall", {
			query: "incident commander",
		})) as ToolResult;
		expect(deletedRecall.details).toMatchObject({
			status: "no_match",
			records: [],
			warnings: [],
		});
		await expect(readFile(playbookPath, "utf-8")).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("injects profile before the recency ordered note and playbook index within one 12000 byte budget @cosmo-behavior plan:profile-playbooks#B-016", async () => {
		const projectRoot = join(tmp.path, "combined-budget-project");
		const userRoot = join(tmp.path, "combined-budget-user");
		const profileBody = "PROFILE_BODY_PRECEDES_ALL_INDEX_METADATA";
		const indexRecords = Array.from({ length: 52 }, (_, index) => {
			const isPlaybook = index % 2 === 1 && index < 50;
			const tiedNewest = index >= 50;
			const fileName =
				index === 50 ? "b.md" : index === 51 ? "a.md" : `${index}.md`;
			return record({
				type: isPlaybook ? "playbook" : "note",
				title: `Ordered record ${index.toString().padStart(2, "0")}`,
				description: `Compact metadata ${index}.`,
				resource: `memory/agent/${isPlaybook ? "playbooks" : "notes"}/${fileName}`,
				path: join(
					projectRoot,
					"memory",
					"agent",
					isPlaybook ? "playbooks" : "notes",
					fileName,
				),
				kind: isPlaybook ? "procedural" : "semantic",
				timestamp: tiedNewest
					? "2026-07-13T14:59:59.000Z"
					: new Date(Date.UTC(2026, 6, 13, 14, 0, index)).toISOString(),
				content: `BODY_${index}_MUST_NOT_BE_INDEXED`,
			});
		});
		const retrieve = vi.fn(async () => ({
			records: [
				...indexRecords,
				record({
					type: "profile",
					scope: "user",
					kind: "semantic",
					title: "User profile",
					description: "Durable user profile and preferences.",
					resource: "memory/agent/profile.md",
					path: join(userRoot, "memory", "agent", "profile.md"),
					timestamp: "2020-01-01T00:00:00.000Z",
					content: profileBody,
				}),
			],
			searchedScopes: ["project", "user"] as const,
			skippedScopes: [],
			warnings: [],
		}));
		const pi = createMockPi({ cwd: projectRoot });
		createAgentMemoryExtension({
			userCosmonautsRoot: userRoot,
			storeFactory: () => memoryStore({ retrieve }),
		})(pi as never);

		const injected = await injectionFor(pi, projectRoot);
		expect(retrieve).toHaveBeenCalledTimes(1);
		expect(retrieve).toHaveBeenCalledWith(
			{ projectRoot, scopes: ["project", "user"] },
			{
				text: "",
				recordTypes: ["note", "profile", "playbook"],
			},
		);
		expect(Buffer.byteLength(injected, "utf-8")).toBeLessThanOrEqual(12_000);
		expect(injected.indexOf(profileBody)).toBeLessThan(
			injected.indexOf("- type:"),
		);
		expect(injected.match(/^- type:/gm)).toHaveLength(50);
		expect(injected.indexOf("Ordered record 51")).toBeLessThan(
			injected.indexOf("Ordered record 50"),
		);
		expect(injected.indexOf("Ordered record 50")).toBeLessThan(
			injected.indexOf("Ordered record 49"),
		);
		expect(injected).toContain("Ordered record 02");
		expect(injected).not.toContain("Ordered record 01");
		expect(injected).not.toContain("Ordered record 00");
		expect(injected).not.toContain("MUST_NOT_BE_INDEXED");

		const indexOnlyPi = createMockPi({ cwd: projectRoot });
		createAgentMemoryExtension({
			userCosmonautsRoot: userRoot,
			storeFactory: () =>
				memoryStore({
					retrieve: async () => ({
						records: [
							record({
								title: "Index-only full-budget record",
								description: `Large metadata ${"中".repeat(6_000)}`,
								path: join(projectRoot, "memory", "agent", "notes", "large.md"),
							}),
						],
						searchedScopes: ["project", "user"],
						skippedScopes: [],
						warnings: [],
					}),
				}),
		})(indexOnlyPi as never);
		const indexOnly = await injectionFor(indexOnlyPi, projectRoot);
		expect(indexOnly).not.toContain("## User profile");
		expect(Buffer.byteLength(indexOnly, "utf-8")).toBeGreaterThan(10_000);
		expect(Buffer.byteLength(indexOnly, "utf-8")).toBeLessThanOrEqual(12_000);
		expect(indexOnly).toContain("Memory index truncated");
		expect(indexOnly).not.toContain("�");

		const emptyProjectRoot = join(tmp.path, "combined-budget-empty-project");
		const emptyUserRoot = join(tmp.path, "combined-budget-empty-user");
		const emptyPi = createMockPi({ cwd: emptyProjectRoot });
		createAgentMemoryExtension({ userCosmonautsRoot: emptyUserRoot })(
			emptyPi as never,
		);
		const emptyInjection = await emptyPi.fireEvent(
			"before_agent_start",
			{ systemPrompt: buildAgentIdentityMarker("main/cosmo") },
			{ cwd: emptyProjectRoot },
		);
		expect(emptyInjection).toBeUndefined();
		await expect(
			readdir(join(emptyProjectRoot, "memory")),
		).rejects.toMatchObject({ code: "ENOENT" });
		await expect(readdir(join(emptyUserRoot, "memory"))).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("keeps the injected context within the byte budget when human profile framing is pathological", async () => {
		const projectRoot = join(tmp.path, "pathological-framing-project");
		const userRoot = join(tmp.path, "pathological-framing-user");
		// Bodies are bounded on write, but a human can edit frontmatter freely: an
		// unbounded metadata value must not escape the budget or throw the turn.
		const profileRecord = record({
			type: "profile",
			scope: "user",
			kind: "semantic",
			title: "User profile",
			description: "Durable user profile and preferences.",
			resource: "memory/agent/profile.md",
			path: join(userRoot, "memory", "agent", "profile.md"),
			timestamp: `2026-07-13T14:00:00.000Z${"時".repeat(5_000)}`,
			content: "Terse answers. Mornings blocked for deep work.",
		});

		const profileOnlyPi = createMockPi({ cwd: projectRoot });
		createAgentMemoryExtension({
			userCosmonautsRoot: userRoot,
			storeFactory: () =>
				memoryStore({
					retrieve: async () => ({
						records: [profileRecord],
						searchedScopes: ["project", "user"],
						skippedScopes: [],
						warnings: [],
					}),
				}),
		})(profileOnlyPi as never);
		const profileOnly = await injectionFor(profileOnlyPi, projectRoot);
		expect(Buffer.byteLength(profileOnly, "utf-8")).toBeLessThanOrEqual(12_000);
		expect(profileOnly).toContain("## User profile");
		expect(profileOnly).toContain("Terse answers.");
		expect(profileOnly).not.toContain("�");

		const withIndexPi = createMockPi({ cwd: projectRoot });
		createAgentMemoryExtension({
			userCosmonautsRoot: userRoot,
			storeFactory: () =>
				memoryStore({
					retrieve: async () => ({
						records: [
							profileRecord,
							record({
								title: "Companion note",
								description: "Compact metadata.",
								path: join(projectRoot, "memory", "agent", "notes", "n.md"),
							}),
						],
						searchedScopes: ["project", "user"],
						skippedScopes: [],
						warnings: [],
					}),
				}),
		})(withIndexPi as never);
		const withIndex = await injectionFor(withIndexPi, projectRoot);
		expect(Buffer.byteLength(withIndex, "utf-8")).toBeLessThanOrEqual(12_000);
		expect(withIndex).toContain("## User profile");
		expect(withIndex).not.toContain("�");
	});

	test("injects recalls and protects oversized human profiles honestly @cosmo-behavior plan:profile-playbooks#B-022", async () => {
		const projectRoot = join(tmp.path, "oversized-profile-project");
		const userRoot = join(tmp.path, "oversized-profile-user");
		const authorPi = await cosmoPi({ projectRoot, userRoot });
		const created = (await authorPi.callTool("remember", {
			type: "profile",
			content: "Small profile body.",
			changeSummary: "Created the profile before a human edit.",
		})) as ToolResult;
		const profilePath = stringDetail(created.details, "path");
		const oversizedBody = [
			"OVERSIZED_PROFILE_START",
			"oversized-shadow-query",
			"😀".repeat(1_100),
			"FULL_PROFILE_TAIL_ONLY_AFTER_EXCERPT",
		].join("\n");
		const originalBytes = Buffer.byteLength(oversizedBody, "utf-8");
		expect(originalBytes).toBeGreaterThan(PROFILE_WRITE_MAX_BYTES);
		const expectedExcerpt = truncateUtf8ForTest(
			oversizedBody,
			PROFILE_WRITE_MAX_BYTES,
		);
		const initialRaw = await readFile(profilePath, "utf-8");
		await writeFile(
			profilePath,
			initialRaw
				.replace("Small profile body.", oversizedBody)
				.replace("2026-07-08T14:00:00.000Z", "2020-01-01T00:00:00.000Z"),
			"utf-8",
		);

		const store = createMarkdownMemoryStore({
			projectRoot,
			userCosmonautsRoot: userRoot,
		});
		for (let index = 0; index < 25; index += 1) {
			await writeMemoryNote(store, {
				scope: "project",
				kind: "semantic",
				title: `Oversized shadow note ${index.toString().padStart(2, "0")}`,
				description: `Oversized index metadata ${index} ${"界".repeat(180)}`,
				content: `oversized-shadow-query note ${index}`,
				timestamp: new Date(Date.UTC(2026, 6, 13, 16, 0, index)).toISOString(),
			});
		}
		const currentRecords = await store.retrieve(
			{ projectRoot, scopes: ["project", "user"] },
			{ text: "", recordTypes: ["note", "profile", "playbook"] },
		);
		const expectedIndexBody = `${currentRecords.records
			.filter((record) => record.type === "note" || record.type === "playbook")
			.slice(0, 50)
			.map((record) =>
				[
					`- type: ${record.type}`,
					`  ${record.type === "playbook" ? "name" : "title"}: ${record.title}`,
					`  scope: ${record.scope}`,
					`  kind: ${record.kind ?? "unknown"}`,
					`  timestamp: ${record.timestamp}`,
					`  description: ${record.description}`,
					`  path: ${relative(projectRoot, record.path).split(sep).join("/")}`,
				].join("\n"),
			)
			.join("\n")}\n`;

		const laterPi = createMockPi({ cwd: projectRoot });
		createAgentMemoryExtension({ userCosmonautsRoot: userRoot })(
			laterPi as never,
		);
		const injected = await injectionFor(laterPi, projectRoot);
		const includedBytes = Buffer.byteLength(expectedExcerpt, "utf-8");
		expect(includedBytes).toBeLessThanOrEqual(PROFILE_WRITE_MAX_BYTES);
		expect(injected).toContain(expectedExcerpt);
		expect(injected).not.toContain("FULL_PROFILE_TAIL_ONLY_AFTER_EXCERPT");
		expect(injected).toContain(
			`Profile truncated: original body ${originalBytes} UTF-8 bytes; included ${includedBytes} bytes.`,
		);
		expect(injected).toContain("path: .cosmonauts/memory/agent/profile.md");
		expect(injected).toContain("Use recall(query)");
		expect(injected).toContain(
			"Do not update the profile from this excerpt; first call recall(query) for the full body.",
		);
		expect(injected).toContain("Memory index truncated");
		const indexNotice = injected.match(
			/Truncated memory index from (\d+) UTF-8 bytes to (\d+) bytes\./,
		);
		expect(indexNotice).not.toBeNull();
		const originalIndexBytes = Number(indexNotice?.[1]);
		const includedIndexBytes = Number(indexNotice?.[2]);
		expect(originalIndexBytes).toBe(
			Buffer.byteLength(expectedIndexBody, "utf-8"),
		);
		const indexExcerptStart = injected.indexOf("- type: note");
		const indexNoticeStart = injected.indexOf("\n[Memory index truncated.");
		expect(indexExcerptStart).toBeGreaterThanOrEqual(0);
		expect(indexNoticeStart).toBeGreaterThan(indexExcerptStart);
		expect(includedIndexBytes).toBe(
			Buffer.byteLength(
				injected.slice(indexExcerptStart, indexNoticeStart),
				"utf-8",
			),
		);
		expect(injected.indexOf("OVERSIZED_PROFILE_START")).toBeLessThan(
			injected.indexOf("- type: note"),
		);
		expect(Buffer.byteLength(injected, "utf-8")).toBeLessThanOrEqual(12_000);
		expect(injected).not.toContain("�");

		const recalled = (await laterPi.callTool("recall", {
			query: "oversized-shadow-query",
			limit: 20,
		})) as ToolResult;
		expect(records(recalled.details)).toHaveLength(21);
		expect(records(recalled.details)[0]).toMatchObject({
			type: "profile",
			path: profilePath,
			content: oversizedBody,
		});
		expect(resultText(recalled)).toContain(
			"FULL_PROFILE_TAIL_ONLY_AFTER_EXCERPT",
		);

		const beforeReplacement = await readFile(profilePath, "utf-8");
		const refused = (await laterPi.callTool("remember", {
			type: "profile",
			content: "x".repeat(PROFILE_WRITE_MAX_BYTES + 1),
			changeSummary: "Attempted an over-bound complete replacement.",
		})) as ToolResult;
		expect(refused.details).toMatchObject({
			status: "unsupported",
			type: "profile",
			scope: "user",
			reason: expect.stringContaining(`${PROFILE_WRITE_MAX_BYTES}`),
		});
		expect(resultText(refused)).toMatch(/shorten/i);
		expect(resultText(refused)).toMatch(/intentional.*replacement/i);
		expect(await readFile(profilePath, "utf-8")).toBe(beforeReplacement);
	});

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
		).toEqual(["profile.md", "profile.md.prev"]);

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
		expect(resultText(noMatch)).toContain("No authored memory records matched");
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
			"Warning: 1 authored memory record was skipped because it could not be read; see details.warnings.",
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
			"Warning: 1 authored memory record was skipped because it could not be read; see details.warnings.",
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
				{ customType: "agent-memory-context", content: "older memory" },
				{ customType: "agent-memory-context", content: "newer memory" },
				{ role: "user", content: "keep this" },
			],
		})) as { messages: unknown[] };
		expect(filtered.messages).toEqual([
			{ customType: "agent-memory-context", content: "newer memory" },
			{ role: "user", content: "keep this" },
		]);
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

		expect(result.message.content.match(/^- type:/gm)).toHaveLength(50);
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

async function injectionFor(
	pi: ReturnType<typeof createMockPi>,
	projectRoot: string,
): Promise<string> {
	const result = (await pi.fireEvent(
		"before_agent_start",
		{ systemPrompt: buildAgentIdentityMarker("main/cosmo") },
		{ cwd: projectRoot },
	)) as { message?: { content?: unknown } } | undefined;
	const content = result?.message?.content;
	if (typeof content !== "string") {
		throw new Error("Expected an injected agent-memory context message.");
	}
	return content;
}

function truncateUtf8ForTest(value: string, maxBytes: number): string {
	let result = "";
	let bytes = 0;
	for (const char of value) {
		const charBytes = Buffer.byteLength(char, "utf-8");
		if (bytes + charBytes > maxBytes) break;
		result += char;
		bytes += charBytes;
	}
	return result;
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
