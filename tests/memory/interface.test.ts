import { createHash } from "node:crypto";
import {
	access,
	chmod,
	mkdir,
	readdir,
	readFile,
	stat,
	symlink,
	unlink,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { describe, expect, test, vi } from "vitest";
import type { ArchitectureMapRetrievalDetails } from "../../lib/architecture-map/index.ts";
import {
	computeArchitectureMapStatFingerprint,
	createArchitectureMapMemoryStore,
	loadArchitectureMapConfig,
} from "../../lib/architecture-map/index.ts";
import { recordEpisode } from "../../lib/memory/episode.ts";
import {
	createEpisodeRecord,
	EPISODE_ACTIONS,
	isEpisodeAction,
	parseEpisodeRecord,
} from "../../lib/memory/episodic-records.ts";
import {
	type ConsolidationSource,
	type ConsolidationSourceFinalization,
	type ConsolidationSourceRecord,
	type CorpusJudgmentProvider,
	createAcceptedJudgmentReceiptStore,
	createConsolidationProposalStore,
	createKnowledgeMemoryStore,
	createLivingMemoryConsolidator,
	createMarkdownMemoryStore,
	createProjectEpisodeConsolidationSource,
	DEFAULT_LIVING_MEMORY_LIMITS,
	deriveKnowledgeProposalIdentity,
	type LivingMemoryConsolidatorDependencies,
	type LivingMemoryRetirementStore,
	MEMORY_KINDS,
	MEMORY_SCOPES,
	type MemoryRecordDraft,
	type MemoryStore,
	type RetrievedMemoryRecord,
} from "../../lib/memory/index.ts";
import { readRetirementReceiptInventory } from "../../lib/memory/retirement-receipts.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("memory-interface-");

describe("memory interface", () => {
	test("recordEpisode creates and warns nothing when episodicLog is disabled", async () => {
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

	test("stamps and parses the writer:cosmonauts provenance tag and leaves human episodes untagged", async () => {
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

	test("converts setup write and awaitable warning-reporter failures into one non-fatal result", async () => {
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

	test("accepts only the ratified consequential event vocabulary and rejects chatter", () => {
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

	test("supports note profile and playbook through the unchanged MemoryStore contract", async () => {
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

		// Knowledge proposals extend the shared seam only with optional fields, so
		// existing stores and minimal human records remain source-compatible.
		expect(typesSource).toContain("readonly type: string;");
		expect(typesSource).toContain("readonly recordTypes?: readonly string[];");
		expect(typesSource).toContain("readonly proposalIdentity?:");
		expect(typesSource).toContain("readonly writer?: string;");
		expect(typesSource).toContain("readonly date?: string;");
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

	test("consolidate reports an honest W1 no-op for markdown and architecture stores", async () => {
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

	test("exposes exact living-memory outcomes through configured knowledge consolidate only", async () => {
		const fullRoot = join(tmp.path, "public-consolidate-full");
		const corpusContents = [
			"# Retry policy\n\nRetry only idempotent work.\n",
			"# Superseded note\n\nThis note needs owner review.\n",
			"# Retry context\n\nRetries require a bounded attempt count.\n",
		] as const;
		const corpusRecords = corpusContents.map((content, index) =>
			livingMemorySourceRecord({
				id: `corpus-${index + 1}`,
				path: `knowledge/corpus-${index + 1}.md`,
				content,
			}),
		);
		await mkdir(join(fullRoot, ".cosmonauts"), { recursive: true });
		await mkdir(join(fullRoot, "knowledge"), { recursive: true });
		for (const record of corpusRecords) {
			await writeFile(join(fullRoot, record.path), record.content);
		}
		const authored = createMarkdownMemoryStore({ projectRoot: fullRoot });
		const episodeWrite = await authored.write(
			createEpisodeRecord(
				{
					...episodeEvent(),
					outcome: "completed",
					summary: "Completed verification.",
					details: "The verification run completed with all checks green.",
				},
				"2026-09-02T12:00:00.000Z",
			),
		);
		if (episodeWrite.kind !== "written") {
			throw new Error("expected temporary episode fixture write");
		}
		const corpusPaths = corpusRecords.map((record) =>
			join(fullRoot, record.path),
		);
		const beforeCorpus = await readTrackedFiles(corpusPaths);
		const corpusSource = livingMemoryCorpusSource(corpusRecords, 2);
		const episodeSource = createProjectEpisodeConsolidationSource({
			projectRoot: fullRoot,
		});
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async (input) => {
			const episode = input.records.find((record) => record.kind === "episode");
			if (episode === undefined) throw new Error("missing admitted episode");
			return {
				schemaVersion: 1,
				observations: [
					{
						kind: "merge-candidate",
						inputIds: ["corpus-1", "corpus-3"],
						reason: "The retry rule should become a concise proposal.",
						proposal: {
							proposalKind: "merge",
							replacement: {
								type: "gotcha",
								title: "Retry only idempotent work",
								description: "The bounded retry rule.",
								content:
									"# Retry only idempotent work\n\nRetry only idempotent work.\n",
								tags: ["retries"],
							},
						},
					},
					{
						kind: "superseded",
						inputIds: ["corpus-2"],
						reason: "Human retirement authority is still required.",
						proposal: {
							proposalKind: "retire",
							reason: "superseded",
						},
					},
					{
						kind: "merge-candidate",
						inputIds: [episode.id],
						reason: "Fold the episode into one lossy authored-note proposal.",
						proposal: {
							proposalKind: "create",
							record: {
								type: "note",
								title: "Verification summary",
								description: "A lossy summary of completed verification.",
								content:
									"# Verification summary\n\nThe verification run completed successfully.\n",
								tags: ["verification"],
							},
						},
					},
				],
			};
		});
		const indexPressure = {
			measure: vi.fn(() => ({
				kind: "measured" as const,
				targetSatisfied: false,
				recordCount: 53,
				maxRecords: 50,
				renderedBytes: 8_200,
				guaranteedBytes: 8_000,
				headroomBytes: 512,
			})),
		};
		const dependencies = livingMemoryDependencies({
			projectRoot: fullRoot,
			sources: [corpusSource, episodeSource],
			judgmentProvider: { id: "fixture/no-tools", judge },
			indexPressure,
		});
		const fullStore = createKnowledgeMemoryStore({
			projectRoot: fullRoot,
			consolidator: createLivingMemoryConsolidator(dependencies),
		});
		const full = await fullStore.consolidate({ modelMode: "full" });
		if (full.kind === "failed") throw new Error(full.reason);
		expect(full).toMatchObject({
			kind: "ran",
			details: {
				dryRun: false,
				modelMode: "full",
				sources: [
					{ sourceId: "corpus", admitted: 3, omitted: 2 },
					{ sourceId: "project-episodes", admitted: 1, omitted: 0 },
				],
				observations: expect.arrayContaining([
					expect.objectContaining({ kind: "merge-candidate" }),
					expect.objectContaining({ kind: "superseded" }),
				]),
				proposals: expect.arrayContaining([
					expect.objectContaining({ proposalKind: "merge", status: "written" }),
					expect.objectContaining({
						proposalKind: "retire",
						status: "written",
					}),
					expect.objectContaining({
						proposalKind: "create",
						status: "written",
					}),
				]),
				retirements: [
					expect.objectContaining({
						path: "knowledge/corpus-2.md",
						status: "deferred",
						reason: "superseded",
					}),
				],
				episodePrunes: [expect.stringContaining("memory/agent/episodes/")],
				acceptedJudgmentReceiptPath: expect.stringContaining(
					"memory/agent/consolidations/",
				),
				declines: expect.arrayContaining([
					expect.objectContaining({ code: "source-deferred" }),
					expect.objectContaining({ code: "retirement-authority-deferred" }),
					expect.objectContaining({ code: "target-unmet" }),
				]),
				warnings: [],
				indexPressure: {
					kind: "measured",
					targetSatisfied: false,
					renderedBytes: 8_200,
				},
				recovery: "none",
				writesCommitted: true,
			},
		});
		if (full.kind !== "ran") throw new Error("expected full pass to run");
		expect(Object.keys(full.details).sort()).toEqual([
			"acceptedJudgmentReceiptPath",
			"declines",
			"dryRun",
			"episodePrunes",
			"indexPressure",
			"modelMode",
			"observations",
			"proposals",
			"recovery",
			"retirements",
			"sources",
			"warnings",
			"writesCommitted",
		]);
		expect(judge).toHaveBeenCalledOnce();
		expect(indexPressure.measure).toHaveBeenCalledOnce();
		await expect(readTrackedFiles(corpusPaths)).resolves.toEqual(beforeCorpus);
		await expect(access(episodeWrite.path)).rejects.toMatchObject({
			code: "ENOENT",
		});

		const freshStore = createKnowledgeMemoryStore({
			projectRoot: fullRoot,
			consolidator: createLivingMemoryConsolidator(
				livingMemoryDependencies({
					projectRoot: fullRoot,
					sources: [
						livingMemoryCorpusSource(corpusRecords, 2),
						createProjectEpisodeConsolidationSource({ projectRoot: fullRoot }),
					],
					judgmentProvider: { id: "fixture/no-tools", judge },
					indexPressure,
				}),
			),
		});
		await expect(freshStore.consolidate()).resolves.toMatchObject({
			kind: "noop",
			details: { writesCommitted: false },
		});
		expect(judge).toHaveBeenCalledOnce();

		const deterministicRoot = join(tmp.path, "public-consolidate-no-model");
		await mkdir(join(deterministicRoot, ".cosmonauts"), { recursive: true });
		const deterministicEpisode = createMarkdownMemoryStore({
			projectRoot: deterministicRoot,
		});
		const deterministicWrite = await deterministicEpisode.write(
			createEpisodeRecord(
				{
					...episodeEvent(),
					summary: "No-model fixture.",
					details: "No model should be called.",
				},
				"2026-09-02T13:00:00.000Z",
			),
		);
		if (deterministicWrite.kind !== "written") {
			throw new Error("expected deterministic episode fixture write");
		}
		const deterministicCorpus = livingMemorySourceRecord({
			id: "deterministic-corpus",
			path: "knowledge/deterministic.md",
			content: "# Deterministic fixture\n",
		});
		const deterministicJudge = vi.fn<CorpusJudgmentProvider["judge"]>();
		const deterministicStore = createKnowledgeMemoryStore({
			projectRoot: deterministicRoot,
			consolidator: createLivingMemoryConsolidator(
				livingMemoryDependencies({
					projectRoot: deterministicRoot,
					sources: [
						livingMemoryCorpusSource([deterministicCorpus]),
						createProjectEpisodeConsolidationSource({
							projectRoot: deterministicRoot,
						}),
					],
					judgmentProvider: {
						id: "fixture/must-not-run",
						judge: deterministicJudge,
					},
				}),
			),
		});
		await expect(
			deterministicStore.consolidate({ modelMode: "deterministic-only" }),
		).resolves.toMatchObject({
			kind: "noop",
			details: {
				dryRun: false,
				modelMode: "deterministic-only",
				sources: [
					{ sourceId: "corpus", admitted: 1, omitted: 0 },
					{ sourceId: "project-episodes", admitted: 1, omitted: 0 },
				],
				writesCommitted: false,
			},
		});
		expect(deterministicJudge).not.toHaveBeenCalled();
		await expect(access(deterministicWrite.path)).resolves.toBeUndefined();

		const dryRoot = join(tmp.path, "public-consolidate-dry");
		await mkdir(join(dryRoot, ".cosmonauts"), { recursive: true });
		const dryEpisodeStore = createMarkdownMemoryStore({ projectRoot: dryRoot });
		const dryEpisode = await dryEpisodeStore.write(
			createEpisodeRecord(
				{
					...episodeEvent(),
					summary: "Dry-run fixture.",
					details: "Preview this episode without writing machine state.",
				},
				"2026-09-02T14:00:00.000Z",
			),
		);
		if (dryEpisode.kind !== "written") {
			throw new Error("expected dry-run episode fixture write");
		}
		const dryCorpus = livingMemorySourceRecord({
			id: "dry-corpus",
			path: "knowledge/dry.md",
			content: "# Dry-run corpus\n",
		});
		await mkdir(join(dryRoot, "knowledge"), { recursive: true });
		await writeFile(join(dryRoot, dryCorpus.path), dryCorpus.content);
		const dryBefore = await readTrackedFiles([
			join(dryRoot, dryCorpus.path),
			dryEpisode.path,
		]);
		const dryJudge = vi.fn<CorpusJudgmentProvider["judge"]>(async (input) => ({
			schemaVersion: 1,
			observations: [
				{
					kind: "merge-candidate",
					inputIds: input.records.map((record) => record.id),
					reason: "Preview one lossy note across the bounded inputs.",
					proposal: {
						proposalKind: "create",
						record: {
							type: "note",
							title: "Dry consolidation summary",
							description: "A preview only.",
							content: "# Dry consolidation summary\n",
							tags: [],
						},
					},
				},
			],
		}));
		const dryStore = createKnowledgeMemoryStore({
			projectRoot: dryRoot,
			consolidator: createLivingMemoryConsolidator(
				livingMemoryDependencies({
					projectRoot: dryRoot,
					sources: [
						livingMemoryCorpusSource([dryCorpus]),
						createProjectEpisodeConsolidationSource({ projectRoot: dryRoot }),
					],
					judgmentProvider: { id: "fixture/no-tools", judge: dryJudge },
				}),
			),
		});
		await expect(
			dryStore.consolidate({ dryRun: true, modelMode: "full" }),
		).resolves.toMatchObject({
			kind: "ran",
			details: {
				dryRun: true,
				modelMode: "full",
				proposals: [expect.objectContaining({ status: "preview" })],
				episodePrunes: [],
				writesCommitted: false,
			},
		});
		await expect(
			readTrackedFiles([join(dryRoot, dryCorpus.path), dryEpisode.path]),
		).resolves.toEqual(dryBefore);
		for (const path of [
			join(dryRoot, "memory", "agent", "consolidations"),
			join(dryRoot, "memory", "agent", "proposals", "living-memory"),
			join(dryRoot, "memory", "agent", "retirements"),
			join(dryRoot, ".cosmonauts", "living-memory.lock"),
		]) {
			await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
		}

		const abortController = new AbortController();
		abortController.abort(new Error("owner cancelled consolidation"));
		await expect(
			fullStore.consolidate({ signal: abortController.signal }),
		).resolves.toMatchObject({
			kind: "failed",
			reason: "owner cancelled consolidation",
			details: { writesCommitted: false, recovery: "none" },
		});

		for (const failure of [
			{
				name: "pre-commit timeout",
				reason: "Living-memory lock acquisition timed out.",
				recovery: "concurrent-mutation" as const,
				writesCommitted: false,
			},
			{
				name: "release unconfirmed",
				reason: "Living-memory lock release could not be confirmed.",
				recovery: "release-unconfirmed" as const,
				writesCommitted: true,
				manifestPath: join(
					fullRoot,
					"memory",
					"agent",
					"retirements",
					"round-1.md",
				),
			},
		] as const) {
			const failedRetirementStore: LivingMemoryRetirementStore = {
				inspect: vi.fn(async () => ({
					recovery: "none" as const,
					warnings: [],
					representedKeys: [],
				})),
				apply: vi.fn(async () => ({
					kind: "failed" as const,
					reason: failure.reason,
					details: {
						retirements: [],
						declines: [],
						warnings: [{ message: failure.name }],
						recovery: failure.recovery,
						writesCommitted: failure.writesCommitted,
						...(failure.manifestPath === undefined
							? {}
							: { manifestPath: failure.manifestPath }),
					},
				})),
			};
			const failedStore = createKnowledgeMemoryStore({
				projectRoot: fullRoot,
				consolidator: createLivingMemoryConsolidator(
					livingMemoryDependencies({
						projectRoot: fullRoot,
						sources: [livingMemoryCorpusSource([])],
						retirementStore: failedRetirementStore,
					}),
				),
			});
			await expect(failedStore.consolidate()).resolves.toMatchObject({
				kind: "failed",
				reason: failure.reason,
				details: {
					warnings: [{ message: failure.name }],
					recovery: failure.recovery,
					writesCommitted: failure.writesCommitted,
					...(failure.manifestPath === undefined
						? {}
						: { manifestPath: failure.manifestPath }),
				},
			});
		}

		const options = { dryRun: true, modelMode: "deterministic-only" as const };
		const unconfigured = createKnowledgeMemoryStore({ projectRoot: fullRoot });
		await expect(unconfigured.consolidate(options)).resolves.toEqual({
			kind: "noop",
			reason:
				"The knowledge store does not consolidate, promote, retain, or prune records.",
		});
		for (const store of [
			createMarkdownMemoryStore({ projectRoot: fullRoot }),
			createArchitectureMapMemoryStore({ projectRoot: fullRoot }),
		]) {
			await expect(store.consolidate(options)).resolves.toEqual({
				kind: "noop",
				reason:
					"W1 performs no background memory consolidation, pruning, decay, or dreaming.",
			});
		}
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
		expect(failed.reason).toMatch(/ENOTDIR|EEXIST/);

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

	test("exports the source finalization result from the public memory barrel", async () => {
		const finalization = {
			episodePrunes: [],
			writesCommitted: false,
		} satisfies ConsolidationSourceFinalization;
		const indexSource = await readFile(
			join(process.cwd(), "lib", "memory", "index.ts"),
			"utf-8",
		);
		const sourceContractExport = indexSource.match(
			/export \{[\s\S]*?\} from "\.\/consolidation-sources\.ts";/u,
		)?.[0];

		expect(sourceContractExport).toContain(
			"type ConsolidationSourceFinalization,",
		);
		expect(finalization.writesCommitted).toBe(false);
	});

	test("retrieves markdown notes and architecture maps through the shared MemoryStore interface", async () => {
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

	test("accounts for real architecture config freshness and map IO across index unknown-module and missing-index retrievals", async () => {
		const projectRoot = join(tmp.path, "architecture-scan-stats");
		const configRaw = `${JSON.stringify({
			architectureMap: { sourceRoots: ["src"] },
		})}\n`;
		const packageRaw = '{ "name": "architecture-scan-fixture" }\n';
		const tsconfigRaw = '{ "compilerOptions": { "module": "NodeNext" } }\n';
		await mkdir(join(projectRoot, ".cosmonauts"), { recursive: true });
		await mkdir(join(projectRoot, "src", "nested"), { recursive: true });
		await mkdir(join(projectRoot, "memory", "architecture", "modules", "src"), {
			recursive: true,
		});
		await writeFile(
			join(projectRoot, ".cosmonauts", "config.json"),
			configRaw,
			"utf-8",
		);
		await writeFile(join(projectRoot, "package.json"), packageRaw, "utf-8");
		await writeFile(join(projectRoot, "tsconfig.json"), tsconfigRaw, "utf-8");
		await writeFile(
			join(projectRoot, "src", "alpha.ts"),
			"export const alpha = 1;\n",
			"utf-8",
		);
		await writeFile(
			join(projectRoot, "src", "nested", "beta.tsx"),
			"export const beta = <span />;\n",
			"utf-8",
		);

		const config = await loadArchitectureMapConfig(projectRoot);
		const fingerprint = await computeArchitectureMapStatFingerprint({
			projectRoot,
			config,
			analyzer: {
				getConfigInputs: async () => ["package.json", "tsconfig.json"],
			},
		});
		const indexRaw = [
			"---",
			"type: code-structure-index",
			"resource: memory/architecture/index.md",
			`statFingerprint: ${fingerprint.hash}`,
			"---",
			"",
			"# Architecture scan fixture",
			"",
		].join("\n");
		const alphaShard =
			"---\ntype: code-structure-module\nresource: src/alpha\n---\n\n# alpha\n";
		const betaShard =
			"---\ntype: code-structure-module\nresource: src/beta\n---\n\n# beta\n";
		const indexPath = join(projectRoot, "memory", "architecture", "index.md");
		await writeFile(indexPath, indexRaw, "utf-8");
		await writeFile(
			join(projectRoot, "memory", "architecture", "modules", "src", "alpha.md"),
			alphaShard,
			"utf-8",
		);
		await writeFile(
			join(projectRoot, "memory", "architecture", "modules", "src", "beta.md"),
			betaShard,
			"utf-8",
		);

		const store = createArchitectureMapMemoryStore({ projectRoot });
		const index = await store.retrieve(
			{ projectRoot, scopes: ["project"] },
			{ recordTypes: ["code-structure-index"], limit: 1 },
		);
		const expectedIndexBytes = Buffer.byteLength(
			configRaw + indexRaw + tsconfigRaw + indexRaw,
			"utf-8",
		);
		expect(index.stats).toMatchObject({
			filesScanned: 12,
			bytesRead: expectedIndexBytes,
			durationMs: expect.any(Number),
		});
		expect(index.records).toHaveLength(1);
		expect(index.records[0]?.content).toContain(
			"Architecture map freshness: current",
		);
		expect(index.records[0]?.content).not.toHaveLength(indexRaw.length);

		const unknown = await store.retrieve(
			{ projectRoot, scopes: ["project"] },
			{ resource: "src/missing" },
		);
		expect(unknown.details).toMatchObject({
			kind: "architecture-map",
			status: "unknown-module",
			availableModules: ["src/alpha", "src/beta"],
		});
		expect(unknown.stats).toMatchObject({
			filesScanned: 13,
			bytesRead: Buffer.byteLength(
				configRaw + indexRaw + tsconfigRaw + alphaShard + betaShard,
				"utf-8",
			),
		});

		await unlink(indexPath);
		const missing = await store.retrieve(
			{ projectRoot, scopes: ["project"] },
			{},
		);
		expect(missing.details).toMatchObject({
			kind: "architecture-map",
			status: "missing-index",
		});
		expect(missing.stats).toMatchObject({
			filesScanned: 1,
			bytesRead: Buffer.byteLength(configRaw, "utf-8"),
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

describe("knowledge proposal interface", () => {
	test("contains attributable proposal writes and keys writer while deduplicating same-writer retries without path escape", async () => {
		const projectRoot = join(tmp.path, "proposal-project");
		const userRoot = join(tmp.path, "proposal-user");
		const store: MemoryStore = createKnowledgeMemoryStore({
			projectRoot,
			userCosmonautsRoot: userRoot,
		});
		const stable = {
			planSlug: "knowledge-surface",
			type: "decision" as const,
			title: "Keep proposals outside knowledge",
			description: "Machine knowledge waits for human promotion.",
			content: "Dedicated machine writes land under the proposal tree.",
			tags: ["review", "boundary", "review"],
			source: "missions/plans/knowledge-surface/plan.md",
			writer: " example/distiller ",
		};
		const identity = deriveKnowledgeProposalIdentity(stable);
		const firstDraft = {
			type: stable.type,
			scope: "project" as const,
			kind: "semantic" as const,
			title: stable.title,
			description: stable.description,
			content: stable.content,
			tags: identity.tags,
			timestamp: "2026-08-20T10:00:00.000Z",
			resource: identity.resource,
			writer: identity.writer,
			source: stable.source,
			date: "2026-08-20T10:00:00.000Z",
			proposalIdentity: identity.proposalIdentity,
		};

		const first = await store.write(firstDraft);
		expect(first).toMatchObject({
			kind: "written",
			path: join(
				projectRoot,
				"memory",
				"agent",
				"proposals",
				"knowledge-surface",
				identity.resource.slice(identity.resource.lastIndexOf("/") + 1),
			),
			record: {
				writer: "example/distiller",
				source: stable.source,
				date: "2026-08-20T10:00:00.000Z",
				tags: ["boundary", "review"],
			},
		});
		if (first.kind !== "written") throw new Error("expected proposal write");
		const firstBytes = await readFile(first.path, "utf-8");
		const firstStat = await stat(first.path);
		const parsed = matter(firstBytes);
		expect(parsed.data).toMatchObject({
			type: "decision",
			resource: identity.resource,
			tags: ["boundary", "review"],
			timestamp: "2026-08-20T10:00:00.000Z",
			scope: "project",
			kind: "semantic",
			writer: "example/distiller",
			source: stable.source,
			date: "2026-08-20T10:00:00.000Z",
		});
		await expect(access(join(projectRoot, "knowledge"))).rejects.toMatchObject({
			code: "ENOENT",
		});

		const retry = await store.write({
			...firstDraft,
			timestamp: "2026-08-20T11:00:00.000Z",
			date: "2026-08-20T11:00:00.000Z",
		});
		expect(retry).toMatchObject({ kind: "written", path: first.path });
		expect(await readFile(first.path, "utf-8")).toBe(firstBytes);
		expect((await stat(first.path)).mtimeMs).toBe(firstStat.mtimeMs);

		const alternate = deriveKnowledgeProposalIdentity({
			...stable,
			writer: "main/cosmo",
		});
		const writerChanged = await store.write({
			...firstDraft,
			writer: alternate.writer,
			resource: alternate.resource,
			proposalIdentity: alternate.proposalIdentity,
		});
		expect(writerChanged).toMatchObject({ kind: "written" });
		if (writerChanged.kind !== "written") {
			throw new Error("expected writer-keyed proposal write");
		}
		expect(writerChanged.path).not.toBe(first.path);

		const sourceDated = deriveKnowledgeProposalIdentity({
			...stable,
			sourceDate: "2026-08-20T12:00:00Z",
		});
		expect(sourceDated.proposalIdentity.sourceDate).toBe(
			"2026-08-20T12:00:00.000Z",
		);
		expect(sourceDated.resource).not.toBe(identity.resource);
		const identityMutations = [
			deriveKnowledgeProposalIdentity({ ...stable, planSlug: "other-plan" }),
			deriveKnowledgeProposalIdentity({ ...stable, type: "gotcha" }),
			deriveKnowledgeProposalIdentity({ ...stable, title: "Changed title" }),
			deriveKnowledgeProposalIdentity({
				...stable,
				description: "Changed description.",
			}),
			deriveKnowledgeProposalIdentity({
				...stable,
				content: "Changed content.",
			}),
			deriveKnowledgeProposalIdentity({ ...stable, tags: ["changed"] }),
			deriveKnowledgeProposalIdentity({ ...stable, source: "another-source" }),
			alternate,
			sourceDated,
		];
		expect(
			new Set([
				identity.resource,
				...identityMutations.map((item) => item.resource),
			]).size,
		).toBe(10);

		const raceStable = { ...stable, title: "Concurrent proposal" };
		const raceIdentity = deriveKnowledgeProposalIdentity(raceStable);
		const raceDraft = {
			...firstDraft,
			title: raceStable.title,
			resource: raceIdentity.resource,
			proposalIdentity: raceIdentity.proposalIdentity,
		};
		const raced = await Promise.all([
			store.write({
				...raceDraft,
				timestamp: "2026-08-20T13:00:00.000Z",
				date: "2026-08-20T13:00:00.000Z",
			}),
			store.write({
				...raceDraft,
				timestamp: "2026-08-20T14:00:00.000Z",
				date: "2026-08-20T14:00:00.000Z",
			}),
		]);
		if (raced[0]?.kind !== "written" || raced[1]?.kind !== "written") {
			throw new Error("expected concurrent proposal writes to converge");
		}
		expect(raced[1].path).toBe(raced[0].path);
		const raceFiles = (
			await readdir(
				join(projectRoot, "memory", "agent", "proposals", "knowledge-surface"),
			)
		).filter((name) => name.includes(raceIdentity.proposalIdentity.key));
		expect(raceFiles).toHaveLength(1);

		for (const field of [
			"title",
			"description",
			"content",
			"tags",
			"resource",
			"writer",
			"source",
			"date",
			"timestamp",
			"proposalIdentity",
		] as const) {
			const missing: Partial<MemoryRecordDraft> = { ...firstDraft };
			delete missing[field];
			await expect(
				store.write(missing as MemoryRecordDraft),
			).resolves.toMatchObject({ kind: "unsupported" });
		}

		const invalidDrafts = [
			{ ...firstDraft, scope: "user" as const },
			{ ...firstDraft, type: "note" },
			{ ...firstDraft, kind: "procedural" as const },
			{ ...firstDraft, resource: "../knowledge/escape.md" },
			{ ...firstDraft, resource: "/absolute/escape.md" },
			{
				...firstDraft,
				proposalIdentity: { ...identity.proposalIdentity, key: "000000000000" },
			},
			{
				...firstDraft,
				proposalIdentity: {
					...identity.proposalIdentity,
					planSlug: "../escape",
				},
			},
			{
				...firstDraft,
				proposalIdentity: {
					...identity.proposalIdentity,
					sourceDate: "not-a-date",
				},
			},
		] as const;
		for (const invalid of invalidDrafts) {
			await expect(store.write(invalid)).resolves.toMatchObject({
				kind: "unsupported",
			});
		}
		await expect(access(join(userRoot, "knowledge"))).rejects.toMatchObject({
			code: "ENOENT",
		});
		await expect(access(join(tmp.path, "escape.md"))).rejects.toMatchObject({
			code: "ENOENT",
		});

		const symlinkRoot = join(tmp.path, "symlink-proposal-project");
		const external = join(tmp.path, "external-proposals");
		await mkdir(join(symlinkRoot, "memory", "agent"), { recursive: true });
		await mkdir(external, { recursive: true });
		await symlink(external, join(symlinkRoot, "memory", "agent", "proposals"));
		const symlinkStore = createKnowledgeMemoryStore({
			projectRoot: symlinkRoot,
		});
		await expect(symlinkStore.write(firstDraft)).resolves.toMatchObject({
			kind: "failed",
			reason: expect.stringContaining("symlink"),
		});
		expect(await readdir(external)).toEqual([]);

		const interruptedStable = {
			...stable,
			title: "Interrupted proposal",
		};
		const interruptedIdentity =
			deriveKnowledgeProposalIdentity(interruptedStable);
		const proposalPlanDirectory = join(
			projectRoot,
			"memory",
			"agent",
			"proposals",
			"knowledge-surface",
		);
		const interruptedPath = join(
			proposalPlanDirectory,
			interruptedIdentity.resource.slice(
				interruptedIdentity.resource.lastIndexOf("/") + 1,
			),
		);
		let interrupted: Awaited<ReturnType<MemoryStore["write"]>>;
		await chmod(proposalPlanDirectory, 0o500);
		try {
			interrupted = await store.write({
				...firstDraft,
				title: interruptedStable.title,
				resource: interruptedIdentity.resource,
				proposalIdentity: interruptedIdentity.proposalIdentity,
			});
		} finally {
			await chmod(proposalPlanDirectory, 0o700);
		}
		expect(interrupted).toMatchObject({
			kind: "failed",
			path: interruptedPath,
		});
		await expect(access(interruptedPath)).rejects.toMatchObject({
			code: "ENOENT",
		});
		expect(
			(await readdir(proposalPlanDirectory)).filter((name) =>
				name.includes(".tmp"),
			),
		).toEqual([]);

		const collisionStable = { ...stable, title: "Occupied proposal" };
		const collisionIdentity = deriveKnowledgeProposalIdentity(collisionStable);
		const collisionPath = join(
			projectRoot,
			"memory",
			"agent",
			"proposals",
			collisionIdentity.proposalIdentity.planSlug,
			collisionIdentity.resource.slice(
				collisionIdentity.resource.lastIndexOf("/") + 1,
			),
		);
		await mkdir(join(collisionPath, ".."), { recursive: true });
		await writeFile(
			collisionPath,
			"interrupted or foreign occupant\n",
			"utf-8",
		);
		const collision = await store.write({
			...firstDraft,
			title: collisionStable.title,
			resource: collisionIdentity.resource,
			proposalIdentity: collisionIdentity.proposalIdentity,
		});
		expect(collision).toMatchObject({ kind: "failed", path: collisionPath });
		expect(await readFile(collisionPath, "utf-8")).toBe(
			"interrupted or foreign occupant\n",
		);
		expect(
			(await readdir(join(collisionPath, ".."))).filter((name) =>
				name.includes(".tmp"),
			),
		).toEqual([]);

		await expect(store.consolidate()).resolves.toEqual({
			kind: "noop",
			reason: expect.stringContaining("does not consolidate"),
		});
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

function livingMemorySourceRecord(options: {
	readonly id: string;
	readonly path: string;
	readonly content: string;
}): ConsolidationSourceRecord {
	return {
		id: options.id,
		sourceId: "corpus",
		scope: "project",
		path: options.path,
		digest: sha256(options.content),
		kind: "knowledge",
		content: options.content,
		metadata: {
			type: "decision",
			title: options.id,
			description: `${options.id} fixture.`,
			resource: options.path.slice("knowledge/".length),
			tags: ["fixture"],
			timestamp: "2026-09-02T12:00:00.000Z",
		},
	};
}

function livingMemoryCorpusSource(
	records: readonly ConsolidationSourceRecord[],
	omitted = 0,
): ConsolidationSource {
	const inventory =
		omitted === 0
			? undefined
			: [
					...records.map(({ content: _content, ...record }) => record),
					...Array.from({ length: omitted }, (_, index) => ({
						id: `inventoried-omission-${index}`,
						sourceId: "corpus",
						scope: "project" as const,
						path: `memory/inventoried-omission-${index}.md`,
						digest: sha256(`inventoried-omission-${index}`),
						kind: "artifact" as const,
						metadata: {},
					})),
				];
	return {
		id: "corpus",
		async collect() {
			return {
				records,
				...(inventory === undefined ? {} : { inventory }),
				inventoryComplete: true,
				knowledgeIndex: {
					records: records.map((record) => ({
						type: String(record.metadata.type),
						scope: record.scope,
						kind: "semantic" as const,
						title: String(record.metadata.title),
						description: String(record.metadata.description),
						resource: String(record.metadata.resource),
						tags: Array.isArray(record.metadata.tags)
							? record.metadata.tags.map(String)
							: [],
						timestamp: String(record.metadata.timestamp),
						content: "",
						path: record.path,
					})),
					warnings: [],
				},
				omitted,
				deferred: omitted,
			};
		},
	};
}

function livingMemoryDependencies(options: {
	readonly projectRoot: string;
	readonly sources: readonly ConsolidationSource[];
	readonly judgmentProvider?: CorpusJudgmentProvider;
	readonly indexPressure?: LivingMemoryConsolidatorDependencies["indexPressure"];
	readonly retirementStore?: LivingMemoryRetirementStore;
}): LivingMemoryConsolidatorDependencies {
	const retirementStore: LivingMemoryRetirementStore =
		options.retirementStore ?? {
			async inspect() {
				return {
					recovery: "none",
					warnings: [],
					representedKeys: [],
				};
			},
			async apply() {
				return {
					kind: "completed",
					details: {
						retirements: [],
						declines: [],
						warnings: [],
						recovery: "none",
						writesCommitted: false,
					},
				};
			},
		};
	return {
		lockPath: join(options.projectRoot, ".cosmonauts", "living-memory.lock"),
		withLock: async (_path, action) => action(),
		sources: options.sources,
		...(options.judgmentProvider === undefined
			? {}
			: { judgmentProvider: options.judgmentProvider }),
		proposalStore: createConsolidationProposalStore({
			projectRoot: options.projectRoot,
		}),
		acceptedJudgmentReceiptStore: createAcceptedJudgmentReceiptStore({
			projectRoot: options.projectRoot,
		}),
		retirementStore,
		durableFiles: {
			async writeText() {
				throw new Error("unexpected direct durable write");
			},
		},
		indexPressure: options.indexPressure ?? {
			measure() {
				return {
					kind: "measured" as const,
					targetSatisfied: true,
					recordCount: 0,
					maxRecords: 50,
					renderedBytes: 0,
					guaranteedBytes: 8_000,
					headroomBytes: 0,
				};
			},
		},
		clock: () => new Date("2026-09-02T12:00:00.000Z"),
		limits: DEFAULT_LIVING_MEMORY_LIMITS,
		lockOptions: {
			retryMs: 50,
			timeoutMs: 10_000,
			onReleaseUnconfirmed: () => undefined,
		},
	};
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

describe("frozen knowledge seed migration", () => {
	test("reads manifest-backed relocation and ledger-backed deletion receipts and rejects malformed receipt state", async () => {
		const relocatedPath = "knowledge/relocated.md";
		const deletedPath = "knowledge/deleted.md";
		const baselinePath = "knowledge/baseline.md";
		const restoredPath = "knowledge/restored.md";
		const relocatedDigest = sha256("relocated record");
		const baselineDigest = sha256("baseline record");
		const restoredDigest = sha256("restored record");
		const evidenceDigest = sha256("fixture evidence");
		const ledger = promotionLedger({
			relocatedPath,
			relocatedDigest,
			deletedPath,
			baselinePath,
			baselineDigest,
		});
		const retired = retiredManifest({
			round: 1,
			id: "retirement-relocated",
			path: relocatedPath,
			digest: relocatedDigest,
			evidenceDigest,
		});
		const restoredRetirement = retiredManifest({
			round: 2,
			id: "retirement-restored",
			path: restoredPath,
			digest: restoredDigest,
			evidenceDigest,
		});
		const restored = restoredManifest({
			round: 3,
			id: "retirement-restored",
			path: restoredPath,
			digest: restoredDigest,
		});
		const fixtureRoot = join(tmp.path, "receipt-floor");
		await writeReceiptFixture(fixtureRoot, {
			ledgers: [ledger],
			manifests: [retired, restoredRetirement, restored],
		});

		await expect(
			readRetirementReceiptInventory({ projectRoot: fixtureRoot }),
		).resolves.toMatchObject({
			kind: "healthy",
			inventory: {
				promotionRounds: [1],
				curatedRecords: [],
				retiredRecords: [deletedPath],
				activeBaselines: expect.arrayContaining([
					expect.objectContaining({
						path: relocatedPath,
						sha256: relocatedDigest,
						source: "promotion",
					}),
					expect.objectContaining({
						path: baselinePath,
						sha256: baselineDigest,
						source: "ratified-baseline",
					}),
				]),
				retirementStates: expect.arrayContaining([
					expect.objectContaining({
						id: "retirement-relocated",
						path: relocatedPath,
						status: "retired",
					}),
					expect.objectContaining({
						id: "retirement-restored",
						path: restoredPath,
						status: "restored",
					}),
				]),
			},
		});

		const unhealthyCases = [
			{
				name: "malformed-ledger-row",
				ledgers: [ledger.replace(`  - ${deletedPath}`, "  - 42")],
				manifests: [retired],
			},
			{
				name: "malformed-ratified-baseline",
				ledgers: [ledger.replace(baselineDigest, "not-a-digest")],
				manifests: [retired],
			},
			{
				name: "duplicate-ledger-round",
				ledgers: [ledger, ledger],
				manifests: [retired],
			},
			{
				name: "noncontiguous-manifest-round",
				ledgers: [ledger],
				manifests: [retired, restored.replace("round: 3", "round: 3")],
				manifestRounds: [1, 3],
			},
			{
				name: "unknown-restoration",
				ledgers: [ledger],
				manifests: [
					restoredManifest({
						round: 1,
						id: "unknown-retirement",
						path: restoredPath,
						digest: restoredDigest,
					}),
				],
			},
			{
				name: "unsafe-path",
				ledgers: [ledger.replace(baselinePath, "knowledge/../escape.md")],
				manifests: [retired],
			},
			{
				name: "unknown-event",
				ledgers: [ledger],
				manifests: [retired.replace("kind: retired", "kind: erased")],
			},
			{
				name: "duplicate-retirement-id",
				ledgers: [ledger],
				manifests: [
					retired,
					retiredManifest({
						round: 2,
						id: "retirement-relocated",
						path: baselinePath,
						digest: baselineDigest,
						evidenceDigest,
					}),
				],
			},
		] as const;
		for (const fixture of unhealthyCases) {
			const root = join(tmp.path, fixture.name);
			await writeReceiptFixture(root, fixture);
			const result = await readRetirementReceiptInventory({
				projectRoot: root,
			});
			expect(result, fixture.name).toMatchObject({ kind: "unhealthy" });
		}

		const unreadableRoot = join(tmp.path, "unreadable-state");
		await writeReceiptFixture(unreadableRoot, {
			ledgers: [ledger],
			manifests: [retired],
		});
		await mkdir(
			join(unreadableRoot, "memory", "agent", "retirements", "round-2.md"),
		);
		await expect(
			readRetirementReceiptInventory({ projectRoot: unreadableRoot }),
		).resolves.toMatchObject({ kind: "unhealthy" });
	});
});

async function writeReceiptFixture(
	projectRoot: string,
	options: {
		readonly ledgers: readonly string[];
		readonly manifests?: readonly string[];
		readonly manifestRounds?: readonly number[];
	},
): Promise<void> {
	const reviews = join(projectRoot, "missions", "reviews");
	const retirements = join(projectRoot, "memory", "agent", "retirements");
	await Promise.all([
		mkdir(reviews, { recursive: true }),
		mkdir(retirements, { recursive: true }),
	]);
	await Promise.all([
		...options.ledgers.map((raw, index) =>
			writeFile(
				join(reviews, `knowledge-surface-promotion-${index + 1}.md`),
				raw,
				"utf-8",
			),
		),
		...(options.manifests ?? []).map((raw, index) =>
			writeFile(
				join(
					retirements,
					`round-${options.manifestRounds?.[index] ?? index + 1}.md`,
				),
				raw,
				"utf-8",
			),
		),
	]);
}

function promotionLedger(options: {
	readonly relocatedPath: string;
	readonly relocatedDigest: string;
	readonly deletedPath: string;
	readonly baselinePath: string;
	readonly baselineDigest: string;
}): string {
	return [
		"---",
		"kind: knowledge-surface-promotion",
		"round: 1",
		"promotedCount: 1",
		"promotions:",
		"  - from: memory/agent/proposals/fixture/record.md",
		`    to: ${options.relocatedPath}`,
		`    sha256: ${options.relocatedDigest}`,
		"curatedRecords: []",
		"retiredRecords:",
		`  - ${options.deletedPath}`,
		"ratifiedBaselines:",
		`  - path: ${options.baselinePath}`,
		`    sha256: ${options.baselineDigest}`,
		"---",
		"",
		"# Human promotion ledger fixture",
		"",
	].join("\n");
}

function retiredManifest(options: {
	readonly round: number;
	readonly id: string;
	readonly path: string;
	readonly digest: string;
	readonly evidenceDigest: string;
}): string {
	return [
		"---",
		"kind: knowledge-retirement-round",
		`round: ${options.round}`,
		"events:",
		"  - kind: retired",
		`    id: ${options.id}`,
		`    path: ${options.path}`,
		`    digest: ${options.digest}`,
		"    reason: obsolete",
		"    evidence:",
		"      - scope: project",
		"        path: docs/memory.md",
		`        digest: ${options.evidenceDigest}`,
		"    evidenceReason: Synthetic fixture proves the cause is obsolete.",
		"    date: '2026-09-01T12:00:00.000Z'",
		"---",
		"",
		"# Retirement receipt fixture",
		"",
	].join("\n");
}

function restoredManifest(options: {
	readonly round: number;
	readonly id: string;
	readonly path: string;
	readonly digest: string;
}): string {
	return [
		"---",
		"kind: knowledge-retirement-round",
		`round: ${options.round}`,
		"events:",
		"  - kind: restored",
		`    retirementId: ${options.id}`,
		`    path: ${options.path}`,
		`    digest: ${options.digest}`,
		"    reason: Human veto restored the record.",
		"    date: '2026-09-01T13:00:00.000Z'",
		"---",
		"",
		"# Restoration receipt fixture",
		"",
	].join("\n");
}

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}
