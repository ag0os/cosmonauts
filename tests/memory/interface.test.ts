import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { describe, expect, test, vi } from "vitest";
import type { ArchitectureMapRetrievalDetails } from "../../lib/architecture-map/index.ts";
import { createArchitectureMapMemoryStore } from "../../lib/architecture-map/index.ts";
import { recordEpisode } from "../../lib/memory/episode.ts";
import {
	createEpisodeRecord,
	EPISODE_ACTIONS,
	isEpisodeAction,
	parseEpisodeRecord,
} from "../../lib/memory/episodic-records.ts";
import {
	createMarkdownMemoryStore,
	MEMORY_KINDS,
	MEMORY_SCOPES,
	type MemoryStore,
	type RetrievedMemoryRecord,
} from "../../lib/memory/index.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("memory-interface-");

describe("memory interface", () => {
	test("recordEpisode creates and warns nothing when episodicLog is disabled @cosmo-behavior plan:episodic-log#B-002", async () => {
		const projectRoot = join(tmp.path, "disabled-project");
		const userCosmonautsRoot = join(tmp.path, "disabled-user");
		const loadConfig = vi.fn(async () => ({}));
		const createStore = vi.fn();
		const reportWarning = vi.fn();
		const writeStderr = vi.fn();

		await expect(
			recordEpisode({
				projectRoot,
				userCosmonautsRoot,
				event: episodeEvent(),
				reportWarning,
				dependencies: { loadConfig, createStore, writeStderr },
			}),
		).resolves.toEqual({ kind: "disabled" });

		expect(loadConfig).toHaveBeenCalledOnce();
		expect(createStore).not.toHaveBeenCalled();
		expect(reportWarning).not.toHaveBeenCalled();
		expect(writeStderr).not.toHaveBeenCalled();
		for (const path of [
			join(projectRoot, "memory"),
			join(userCosmonautsRoot, "memory"),
			join(projectRoot, "memory", "agent", "index.md"),
			join(userCosmonautsRoot, "memory", "agent", "index.md"),
			join(projectRoot, "memory", "agent", "episodes"),
			join(userCosmonautsRoot, "memory", "agent", "episodes"),
		]) {
			await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
		}
	});

	// @cosmo-behavior plan:episodic-log#B-003
	test("retrieves episode actor and envelope through the narrowly extended MemoryStore result", async () => {
		const projectRoot = join(tmp.path, "episode-envelope-project");
		const userCosmonautsRoot = join(tmp.path, "episode-envelope-user");
		await mkdir(join(projectRoot, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			JSON.stringify({ episodicLog: { enabled: true } }),
			"utf-8",
		);
		const reportWarning = vi.fn();

		await expect(
			recordEpisode({
				projectRoot,
				userCosmonautsRoot,
				event: {
					...episodeEvent(),
					timestamp: "2026-07-21T12:00:00.000Z",
				},
				reportWarning,
			}),
		).resolves.toMatchObject({ kind: "recorded" });
		await expect(
			recordEpisode({
				projectRoot,
				userCosmonautsRoot,
				event: {
					scope: "user",
					source: "main/cosmo",
					action: "memory.saved",
					outcome: "succeeded",
					subject: { kind: "memory", id: "preference-42" },
					summary: "Saved the user's review preference.",
					details: "The preference remains human-readable after restart.",
					tags: ["preferences"],
					timestamp: "2026-07-21T13:00:00.000Z",
				},
				reportWarning,
			}),
		).resolves.toMatchObject({ kind: "recorded" });
		expect(reportWarning).not.toHaveBeenCalled();

		const freshStore: MemoryStore = createMarkdownMemoryStore({
			projectRoot,
			userCosmonautsRoot,
		});
		const retrieved = await freshStore.retrieve(
			{ projectRoot, scopes: ["project", "user"] },
			{ recordTypes: ["episode"] },
		);

		expect(retrieved.warnings).toEqual([]);
		expect(retrieved.records).toHaveLength(2);
		expect(retrieved.records[0]).toMatchObject({
			type: "episode",
			scope: "user",
			kind: "episodic",
			title: "Saved the user's review preference.",
			description: "memory.saved succeeded for memory:preference-42.",
			resource: expect.stringMatching(
				/^memory\/agent\/episodes\/20260721T130000000Z-memory-saved-[a-f0-9]{8}\.md$/u,
			),
			tags: expect.arrayContaining([
				"preferences",
				"action:memory.saved",
				"outcome:succeeded",
				"subject:memory:preference-42",
				"writer:cosmonauts",
			]),
			timestamp: "2026-07-21T13:00:00.000Z",
			source: "main/cosmo",
			content: expect.stringContaining(
				"The preference remains human-readable after restart.",
			),
			path: expect.stringMatching(/episode-envelope-user.+episodes.+\.md$/u),
		});
		expect(retrieved.records[1]).toMatchObject({
			type: "episode",
			scope: "project",
			kind: "episodic",
			source: "example/worker",
			timestamp: "2026-07-21T12:00:00.000Z",
			content: expect.stringContaining("Started verification chain."),
			path: expect.stringMatching(/episode-envelope-project.+episodes.+\.md$/u),
		});

		await writeArchitectureMap(projectRoot);
		const architecture = createArchitectureMapMemoryStore({
			projectRoot,
			checkFreshness: async () => ({ kind: "current", hash: "episode-proof" }),
		});
		const architectureResult = await architecture.retrieve(
			{ projectRoot, scopes: ["project"] },
			{ recordTypes: ["code-structure-index"] },
		);
		expect(architectureResult.records[0]?.source).toBeUndefined();
	});

	test("stamps and parses the writer:cosmonauts provenance tag and leaves human episodes untagged @cosmo-behavior plan:episodic-log#B-004", async () => {
		const machineDraft = createEpisodeRecord(
			{
				...episodeEvent(),
				tags: [
					"release",
					"action:raw.turn",
					"outcome:forged",
					"subject:forged:id",
					"payload:forged:id",
					"writer:someone-else",
				],
			},
			"2026-07-21T12:00:00.000Z",
		);
		const machineRecord = retrievedEpisode(machineDraft.tags);
		const humanRecord = retrievedEpisode(
			machineDraft.tags.filter((tag) => tag !== "writer:cosmonauts"),
		);

		expect(machineDraft.tags).toContain("writer:cosmonauts");
		expect(
			machineDraft.tags.filter((tag) => tag.startsWith("writer:")),
		).toEqual(["writer:cosmonauts"]);
		expect(machineDraft.tags).not.toContain("action:raw.turn");
		expect(machineDraft.tags).not.toContain("outcome:forged");
		expect(machineDraft.tags).not.toContain("subject:forged:id");
		expect(machineDraft.tags).not.toContain("payload:forged:id");
		expect(parseEpisodeRecord(machineRecord)).toMatchObject({
			action: "chain.run",
			writer: "cosmonauts",
		});
		const parsedHuman = parseEpisodeRecord(humanRecord);
		expect(parsedHuman).toMatchObject({ action: "chain.run" });
		expect(parsedHuman).not.toHaveProperty("writer");

		const projectRoot = join(tmp.path, "episode-provenance-project");
		const writer = createMarkdownMemoryStore({ projectRoot });
		const machineWrite = await writer.write(machineDraft);
		expect(machineWrite).toMatchObject({ kind: "written" });
		if (machineWrite.kind !== "written") {
			throw new Error("expected machine episode write");
		}
		const humanPath = join(
			projectRoot,
			"memory",
			"agent",
			"episodes",
			"20260721T130000000Z-chain-run-human.md",
		);
		await mkdir(join(humanPath, ".."), { recursive: true });
		await writeFile(
			humanPath,
			matter.stringify("A human-authored episode remains recallable.", {
				type: "episode",
				title: "Human observation",
				description: "chain.run observed for run:run-human.",
				resource:
					"memory/agent/episodes/20260721T130000000Z-chain-run-human.md",
				tags: ["action:chain.run", "outcome:observed", "subject:run:run-human"],
				timestamp: "2026-07-21T13:00:00.000Z",
				scope: "project",
				kind: "episodic",
				source: "human/operator",
			}),
			"utf-8",
		);

		const freshStore = createMarkdownMemoryStore({ projectRoot });
		const roundTrip = await freshStore.retrieve(
			{ projectRoot, scopes: ["project"] },
			{ recordTypes: ["episode"] },
		);
		const machineRoundTrip = roundTrip.records.find(
			(record) => record.path === machineWrite.path,
		);
		const humanRoundTrip = roundTrip.records.find(
			(record) => record.path === humanPath,
		);
		if (!machineRoundTrip || !humanRoundTrip) {
			throw new Error("expected machine and human episode round trips");
		}
		expect(machineRoundTrip.tags).toContain("writer:cosmonauts");
		expect(parseEpisodeRecord(machineRoundTrip)).toMatchObject({
			writer: "cosmonauts",
		});
		expect(humanRoundTrip.tags).not.toContain("writer:cosmonauts");
		expect(parseEpisodeRecord(humanRoundTrip)).not.toHaveProperty("writer");

		const [recordSource, publicSource] = await Promise.all([
			readFile(
				join(process.cwd(), "lib", "memory", "episodic-records.ts"),
				"utf-8",
			),
			readFile(join(process.cwd(), "lib", "memory", "index.ts"), "utf-8"),
		]);
		expect(recordSource).not.toMatch(
			/(?:sha-?256|integrity|edit.?detect|safe.?prune)/iu,
		);
		expect(publicSource).not.toMatch(
			/(?:verifyEpisode|safePrune|uneditedEpisode)/u,
		);
		expect(
			recordSource.split("\n").filter((line) => line.startsWith("import ")),
		).toEqual([
			'import type { MemoryRecordDraft, RetrievedMemoryRecord } from "./types.ts";',
		]);
	});

	// @cosmo-behavior plan:episodic-log#B-005
	test("reconstructs latest wake state from stable trigger payload outcome and timestamp fields", async () => {
		const projectRoot = join(tmp.path, "wake-restart-project");
		const writer = createMarkdownMemoryStore({ projectRoot });
		const events = [
			{
				outcome: "failed",
				subject: { kind: "trigger", id: "github:issue/42" },
				payload: { kind: "job", id: "triage/github:issue/42" },
				summary: "Wake attempt failed.",
				details: "Attempt 1 failed before the job completed.",
				timestamp: "2026-07-21T10:00:00.000Z",
			},
			{
				outcome: "succeeded",
				subject: { kind: "trigger", id: "schedule:daily" },
				payload: { kind: "job", id: "maintenance/daily" },
				summary: "Daily maintenance wake completed.",
				details: "Attempt 1 completed for the other trigger.",
				timestamp: "2026-07-21T12:00:00.000Z",
			},
			{
				outcome: "succeeded",
				subject: { kind: "trigger", id: "github:issue/42" },
				payload: { kind: "job", id: "triage/github:issue/42" },
				summary: "Wake retry completed.",
				details: "Attempt 2 completed after restart-safe retry.",
				timestamp: "2026-07-21T12:00:00.000Z",
			},
		] as const;

		for (const event of events) {
			await expect(
				writer.write(
					createEpisodeRecord(
						{
							scope: "project",
							source: "autonomy/host",
							action: "autonomy.wake",
							...event,
						},
						event.timestamp,
					),
				),
			).resolves.toMatchObject({ kind: "written" });
		}

		const freshStore = createMarkdownMemoryStore({ projectRoot });
		const retrieved = await freshStore.retrieve(
			{ projectRoot, scopes: ["project"] },
			{ recordTypes: ["episode"] },
		);
		expect(retrieved.records.map((record) => record.timestamp)).toEqual([
			"2026-07-21T12:00:00.000Z",
			"2026-07-21T12:00:00.000Z",
			"2026-07-21T10:00:00.000Z",
		]);
		const tiedPaths = retrieved.records
			.slice(0, 2)
			.map((record) => record.path);
		expect(tiedPaths).toEqual(
			[...tiedPaths].sort((a, b) => a.localeCompare(b)),
		);

		const matchingWakes = retrieved.records.filter((record) => {
			const metadata = parseEpisodeRecord(record);
			return (
				record.source === "autonomy/host" &&
				metadata?.action === "autonomy.wake" &&
				metadata.outcome !== undefined &&
				metadata.subject.kind === "trigger" &&
				metadata.subject.id === "github:issue/42" &&
				metadata.payload?.kind === "job" &&
				metadata.payload.id === "triage/github:issue/42"
			);
		});
		expect(matchingWakes).toHaveLength(2);
		const latestWake = matchingWakes[0];
		if (!latestWake) throw new Error("expected latest matching wake");
		expect(latestWake).toMatchObject({
			timestamp: "2026-07-21T12:00:00.000Z",
			source: "autonomy/host",
			content: expect.stringContaining(
				"Attempt 2 completed after restart-safe retry.",
			),
		});
		expect(parseEpisodeRecord(latestWake)).toEqual({
			action: "autonomy.wake",
			outcome: "succeeded",
			subject: { kind: "trigger", id: "github:issue/42" },
			payload: { kind: "job", id: "triage/github:issue/42" },
			writer: "cosmonauts",
		});
		expect(await readdir(join(projectRoot, "memory", "agent"))).toEqual([
			"episodes",
		]);
	});

	test("records through the sole serializer with the resolved store threshold", async () => {
		const path = join(tmp.path, "memory", "agent", "episodes", "recorded.md");
		const write = vi.fn<MemoryStore["write"]>(async (draft) => ({
			kind: "written",
			path,
			record: {
				...retrievedEpisode(draft.tags),
				scope: draft.scope,
				source: draft.source,
			},
		}));
		const createStore = vi.fn(() => episodeStore(write));

		await expect(
			recordEpisode({
				projectRoot: tmp.path,
				event: episodeEvent(),
				dependencies: {
					loadConfig: enabledEpisodeConfig,
					createStore,
					now: () => new Date("2026-07-21T12:00:00.000Z"),
				},
			}),
		).resolves.toEqual({ kind: "recorded", path });
		expect(createStore).toHaveBeenCalledWith({
			projectRoot: tmp.path,
			userCosmonautsRoot: undefined,
			episodeWarningThreshold: 17,
		});
		expect(write).toHaveBeenCalledOnce();
		expect(write.mock.calls[0]?.[0]).toMatchObject({
			type: "episode",
			kind: "episodic",
			source: "example/worker",
			timestamp: "2026-07-21T12:00:00.000Z",
			tags: expect.arrayContaining([
				"action:chain.run",
				"outcome:started",
				"writer:cosmonauts",
			]),
		});

		const memorySources = await Promise.all(
			(await readdir(join(process.cwd(), "lib", "memory")))
				.filter((file) => file.endsWith(".ts"))
				.map((file) =>
					readFile(join(process.cwd(), "lib", "memory", file), "utf-8"),
				),
		);
		expect(
			memorySources.join("\n").match(/export async function recordEpisode/gu),
		).toHaveLength(1);
		expect(
			memorySources.join("\n").match(/export function createEpisodeRecord/gu),
		).toHaveLength(1);
	});

	test("converts setup write and awaitable warning-reporter failures into one non-fatal result @cosmo-behavior plan:episodic-log#B-011", async () => {
		const cases = [
			{
				name: "config load",
				loadConfig: vi.fn(async () => {
					throw new Error("config exploded");
				}),
				createStore: vi.fn(),
			},
			{
				name: "store construction",
				loadConfig: enabledEpisodeConfig,
				createStore: vi.fn(() => {
					throw new Error("construction exploded");
				}),
			},
			{
				name: "failed write result",
				loadConfig: enabledEpisodeConfig,
				createStore: vi.fn(() =>
					episodeStore(async () => ({
						kind: "failed",
						path: "/episodes/partial.md",
						reason: "write failed",
					})),
				),
			},
			{
				name: "unsupported write result",
				loadConfig: enabledEpisodeConfig,
				createStore: vi.fn(() =>
					episodeStore(async () => ({
						kind: "unsupported",
						reason: "episode unsupported",
					})),
				),
			},
			{
				name: "thrown write",
				loadConfig: enabledEpisodeConfig,
				createStore: vi.fn(() =>
					episodeStore(async () => {
						throw new Error("write exploded ".repeat(100));
					}),
				),
			},
		] as const;

		for (const testCase of cases) {
			const reportWarning = vi.fn(async () => {});
			const writeStderr = vi.fn();
			const result = await recordEpisode({
				projectRoot: tmp.path,
				event: episodeEvent(),
				reportWarning,
				dependencies: {
					loadConfig: testCase.loadConfig,
					createStore: testCase.createStore,
					writeStderr,
				},
			});

			expect(result.kind, testCase.name).toBe("warning");
			if (result.kind !== "warning") throw new Error("expected warning");
			expect(result.warning.message.length, testCase.name).toBeLessThanOrEqual(
				500,
			);
			expect(reportWarning, testCase.name).toHaveBeenCalledOnce();
			expect(writeStderr, testCase.name).not.toHaveBeenCalled();
		}

		const reportWarning = vi.fn(async () => {
			throw new Error("reporter rejected");
		});
		const writeStderr = vi.fn();
		await expect(
			recordEpisode({
				projectRoot: tmp.path,
				event: episodeEvent(),
				reportWarning,
				dependencies: {
					loadConfig: enabledEpisodeConfig,
					createStore: () =>
						episodeStore(async () => ({
							kind: "failed",
							reason: "write failed",
						})),
					writeStderr,
				},
			}),
		).resolves.toMatchObject({ kind: "warning" });
		expect(reportWarning).toHaveBeenCalledOnce();
		expect(writeStderr).toHaveBeenCalledOnce();
		expect(writeStderr.mock.calls[0]?.[0]).toMatch(
			/^\[warning\] Episode capture skipped:/u,
		);

		const unavailableReporterStderr = vi.fn();
		await expect(
			recordEpisode({
				projectRoot: tmp.path,
				event: episodeEvent(),
				dependencies: {
					loadConfig: enabledEpisodeConfig,
					createStore: () =>
						episodeStore(async () => ({
							kind: "unsupported",
							reason: "episode unsupported",
						})),
					writeStderr: unavailableReporterStderr,
				},
			}),
		).resolves.toMatchObject({ kind: "warning" });
		expect(unavailableReporterStderr).toHaveBeenCalledOnce();
		await expect(
			access(join(tmp.path, "memory", "agent", "episodes")),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	test("accepts only the ratified consequential event vocabulary and rejects chatter @cosmo-behavior plan:episodic-log#B-020", () => {
		expect(EPISODE_ACTIONS).toEqual([
			"chain.run",
			"drive.run",
			"plan.created",
			"plan.status-changed",
			"task.created",
			"task.status-changed",
			"memory.saved",
			"autonomy.wake",
		]);
		for (const action of EPISODE_ACTIONS)
			expect(isEpisodeAction(action)).toBe(true);
		for (const chatter of [
			"session.started",
			"session.ended",
			"turn.started",
			"tool.called",
			"chain.stage",
			"drive.task-chatter",
			"task.edited",
			"plan.edited",
			"memory.rejected",
			"file.edited",
			"arbitrary",
		]) {
			expect(isEpisodeAction(chatter), chatter).toBe(false);
			expect(() =>
				createEpisodeRecord(
					{ ...episodeEvent(), action: chatter } as never,
					"2026-07-21T12:00:00.000Z",
				),
			).toThrow("Unsupported episode action");
		}

		expect(() =>
			createEpisodeRecord(
				{ ...episodeEvent(), action: "autonomy.wake", payload: undefined },
				"2026-07-21T12:00:00.000Z",
			),
		).toThrow("autonomy.wake requires a stable payload");
		const wake = createEpisodeRecord(
			{
				...episodeEvent(),
				action: "autonomy.wake",
				payload: { kind: "trigger", id: "github:issue/42" },
			},
			"2026-07-21T12:00:00.000Z",
		);
		expect(parseEpisodeRecord(retrievedEpisode(wake.tags))?.payload).toEqual({
			kind: "trigger",
			id: "github:issue/42",
		});
	});

	test("supports note profile and playbook through the unchanged MemoryStore contract @cosmo-behavior plan:profile-playbooks#B-002", async () => {
		const projectRoot = join(tmp.path, "authored-types-project");
		const userRoot = join(tmp.path, "authored-types-user");
		const store: MemoryStore = createMarkdownMemoryStore({
			projectRoot,
			userCosmonautsRoot: userRoot,
			now: () => new Date("2026-07-13T14:00:00.000Z"),
		});
		const [typesSource, indexSource, storeSource, architectureAdapterSource] =
			await Promise.all([
				readFile(join(process.cwd(), "lib", "memory", "types.ts"), "utf-8"),
				readFile(join(process.cwd(), "lib", "memory", "index.ts"), "utf-8"),
				readFile(
					join(process.cwd(), "lib", "memory", "markdown-store.ts"),
					"utf-8",
				),
				readFile(
					join(process.cwd(), "lib", "architecture-map", "retrieval.ts"),
					"utf-8",
				),
			]);

		// W2 shipped with types.ts byte-identical to W1 (its proof point). The
		// memory-hardening added optional MemoryRetrieveStats; episodic-log then
		// added only optional RetrievedMemoryRecord.source. Re-pin that narrow seam.
		expect(createHash("sha256").update(typesSource).digest("hex")).toBe(
			"46d5548e22af81209095f9cda25b6fb6a0d7d8ffb20b4f978415cab046e4d607",
		);
		expect(
			createHash("sha256").update(architectureAdapterSource).digest("hex"),
		).toBe("12831c7ee41a852da7b667a0dfa7a2baa0d58799490eb5c782589d7a5f573ba8");
		expect(typesSource).toContain("readonly type: string;");
		expect(typesSource).toContain("readonly recordTypes?: readonly string[];");
		expect(typesSource).toContain('readonly kind: "written";');
		expect(typesSource).toContain('readonly kind: "unsupported";');
		expect(typesSource).toContain('readonly kind: "failed";');
		expect(
			[typesSource, indexSource, storeSource, architectureAdapterSource].join(
				"\n",
			),
		).not.toMatch(/\b(?:registry|backend|plugin|dispatch)\b/i);

		const writes = [
			await store.write({
				type: "note",
				scope: "project",
				kind: "semantic",
				title: "Release branch",
				description: "Project deployment fact.",
				content: "Deploy releases from the release branch.",
				tags: ["deploys"],
				timestamp: "2026-07-13T13:00:00.000Z",
			}),
			await store.write({
				type: "profile",
				scope: "user",
				kind: "semantic",
				title: "User profile",
				description: "Durable user preferences.",
				content: "Prefer concise technical explanations.",
				tags: ["preferences"],
				timestamp: "2026-07-13T15:00:00.000Z",
			}),
			await store.write({
				type: "playbook",
				scope: "project",
				kind: "procedural",
				title: "Ship a release",
				description: "Release procedure.",
				content: "When releasing, verify, tag, then deploy.",
				tags: ["releases"],
				timestamp: "2026-07-13T14:00:00.000Z",
			}),
		];
		const retrieved = await store.retrieve(
			{ projectRoot, scopes: ["project", "user"] },
			{ recordTypes: ["note", "profile", "playbook"] },
		);
		const consolidated = await store.consolidate();

		expect(consolidated).toEqual({
			kind: "noop",
			reason:
				"W1 performs no background memory consolidation, pruning, decay, or dreaming.",
		});
		expect.soft(writes[0]).toMatchObject({
			kind: "written",
			record: { type: "note" },
		});
		expect.soft(writes[1]).toMatchObject({
			kind: "written",
			record: { type: "profile" },
		});
		expect.soft(writes[2]).toMatchObject({
			kind: "written",
			record: { type: "playbook" },
		});
		expect
			.soft(retrieved.records.map((record) => record.type))
			.toEqual(["profile", "playbook", "note"]);
	});

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

		const markdownIndexPath = join(tmp.path, "memory", "agent", "index.md");
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
		expect(architectureRetrieved.records[0]?.source).toBeUndefined();

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
			kind: "architecture-map",
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

	test("keeps episodic storage config-free and disk-authoritative without prune or integrity APIs", async () => {
		const memoryDir = join(process.cwd(), "lib", "memory");
		const storageFiles = [
			"authored-records.ts",
			"episodic-records.ts",
			"markdown-store.ts",
			"okf.ts",
			"paths.ts",
			"types.ts",
		] as const;
		const sources = new Map(
			await Promise.all(
				storageFiles.map(
					async (file) =>
						[file, await readFile(join(memoryDir, file), "utf-8")] as const,
				),
			),
		);
		const forbiddenImports = [
			"../config",
			"@earendil-works/pi",
			"../domains",
			"../orchestration",
			"../driver",
			"../plans",
			"../tasks",
		];
		for (const [file, source] of sources) {
			for (const forbiddenImport of forbiddenImports) {
				expect(source, `${file} imports ${forbiddenImport}`).not.toContain(
					forbiddenImport,
				);
			}
		}

		const storeSource = sources.get("markdown-store.ts");
		const episodicRecordSource = sources.get("episodic-records.ts");
		if (!storeSource || !episodicRecordSource) {
			throw new Error("expected episodic storage source fixtures");
		}
		expect(storeSource).not.toMatch(
			/episode(?:Cache|Registry|CountMap)|latestWake|deleteEpisode|pruneEpisode|verifyEpisodeIntegrity/u,
		);
		expect(episodicRecordSource).not.toMatch(
			/(?:sha-?256|integrity|safe.?prune|edit.?detect)/iu,
		);
		expect(storeSource).toContain('createHash("sha256")');
		expect(storeSource).toContain("function episodeFileName");
		const publicSource = await readFile(join(memoryDir, "index.ts"), "utf-8");
		expect(publicSource).not.toMatch(
			/deleteEpisode|pruneEpisode|verifyEpisode|safePrune/u,
		);
	});
});

function episodeEvent() {
	return {
		scope: "project" as const,
		source: "example/worker",
		action: "chain.run" as const,
		outcome: "started",
		subject: { kind: "run", id: "run-42" },
		summary: "Started verification chain.",
		details: "The chain has one worker stage.",
	};
}

async function enabledEpisodeConfig() {
	return { episodicLog: { enabled: true, warningThreshold: 17 } } as const;
}

function episodeStore(write: MemoryStore["write"]): MemoryStore {
	return {
		write,
		retrieve: async () => ({
			records: [],
			searchedScopes: [],
			skippedScopes: [],
			warnings: [],
		}),
		consolidate: async () => ({ kind: "noop", reason: "test store" }),
	};
}

function retrievedEpisode(tags: readonly string[]): RetrievedMemoryRecord {
	return {
		type: "episode",
		scope: "project",
		kind: "episodic",
		title: "Started verification chain.",
		description: "chain.run started for run:run-42",
		resource: "memory/agent/episodes/example.md",
		tags,
		timestamp: "2026-07-21T12:00:00.000Z",
		source: "example/worker",
		content: "Started verification chain.",
		path: "/project/memory/agent/episodes/example.md",
	};
}

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
