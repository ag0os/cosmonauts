import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import {
	access,
	chmod,
	mkdir,
	readdir,
	readFile,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
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
	createKnowledgeMemoryStore,
	createMarkdownMemoryStore,
	deriveKnowledgeProposalIdentity,
	MEMORY_KINDS,
	MEMORY_SCOPES,
	type MemoryRecordDraft,
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

	test("documents the episodic gate vocabulary cost and consumer contracts @cosmo-behavior plan:episodic-log#B-029", async () => {
		const documentation = await readFile(
			join(process.cwd(), "docs", "memory.md"),
			"utf-8",
		);
		const vocabulary = documentation.slice(
			documentation.indexOf("### Finite Event Vocabulary"),
			documentation.indexOf("### Recall, Injection, And W2 Preservation"),
		);
		const documentedActions = [
			...vocabulary.matchAll(/^\| `([^`]+)` \|/gmu),
		].map((match) => match[1]);

		expect(documentedActions).toEqual(EPISODE_ACTIONS);
		for (const requiredText of [
			"project-gated and OFF by default",
			'"warningThreshold": 500',
			"There is no user-config loader or user-level gate.",
			"Each episode is one independent OKF markdown file",
			"The reserved tag prefixes are exactly `action:`, `outcome:`, `subject:`,",
			"does not capture raw sessions",
			"Episodes are recall-only.",
			"Episodes are never injected",
			"never indexed in `index.md`",
			"W2 remember, recall, injection bytes, tool",
			"remember remains an explicit, sequential tool",
			"W3 is append-forever",
			"Every episode-touching retrieval performs a full, current-disk rescan",
			"There is no episode",
			"cache, retention window, write cap, automatic pruning, or delete API.",
			"strictly greater than the",
			"fresh store's configured threshold",
			"`writer:cosmonauts` is editable provenance only.",
			"no SHA-256 integrity envelope, edit detection, trust decision, or",
			"safe-prune guarantee",
			"`memory-consolidation` plan owns the machine-vs-human",
			"persisted `source`, subject, required payload, outcome, and timestamp",
			"persisted `completedAt` supplies the terminal episode timestamp",
			"never derives identity from the completion file's mtime",
			"hard-killed fire-and-forget `launchDetached` child",
		]) {
			expect(documentation, requiredText).toContain(requiredText);
		}
		expect(documentation).toContain(
			"Recall's visible warning text\nand structured warning details",
		);
		expect(documentation).toContain("Drive publishes a\n`driver_diagnostic`");
		expect(documentation).toContain(
			"Pi session state remains the session-scope answer",
		);
	});

	// @cosmo-behavior plan:episodic-log-detached-hardening#B-013
	test("documents deterministic off-then-enabled terminal-only resume", async () => {
		const documentation = await readFile(
			join(process.cwd(), "docs", "memory.md"),
			"utf-8",
		);
		const normalizedDocumentation = documentation.replace(/\s+/gu, " ");

		for (const requiredText of [
			"off-then-enabled terminal-only resume",
			"deterministic attempt id from the persisted run id",
			"records one terminal without a start",
			"spec and completion bytes and the terminal episode count remain unchanged",
			"emits one bounded warning and honestly skips terminal capture",
			"resume surfaces with a complete frozen or successfully reconstructed identity have terminal evidence",
		]) {
			expect(normalizedDocumentation, requiredText).toContain(requiredText);
		}
		expect(documentation).toContain(
			"resolution failure warns and skips\ncapture instead of inventing a generic actor.",
		);
		expect(documentation).toContain(
			"an externally\nhard-killed fire-and-forget `launchDetached` child has no reconciling parent and\nmay leave a start-only episode.",
		);
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

		// Knowledge proposals extend the shared seam only with optional fields, so
		// existing stores and minimal human records remain source-compatible.
		expect(createHash("sha256").update(typesSource).digest("hex")).toBe(
			"a75046ce0b8dd1d109a0828f4ca8d28fe98860e4ea212e939262f02dae7b4cfd",
		);
		expect(
			createHash("sha256").update(architectureAdapterSource).digest("hex"),
		).toBe("abb7eb2afc9f759bbb2d9f9e58f4a93ad61aba97f503c1e73696b03e12010722");
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

describe("knowledge proposal interface", () => {
	test("contains attributable proposal writes and keys writer while deduplicating same-writer retries without path escape @cosmo-behavior plan:knowledge-surface#B-002", async () => {
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
	test("maps every frozen seed field and body to canonical OKF and leaves no active knowledge JSONL path @cosmo-behavior plan:knowledge-surface#B-003", async () => {
		const projectRoot = process.cwd();
		const inventory = JSON.parse(
			await readFile(
				join(projectRoot, "tests", "fixtures", "knowledge-seed-inventory.json"),
				"utf-8",
			),
		) as SeedInventory;
		const files = await readKnowledgeCorpus(projectRoot);
		const activeLegacyPaths = await findActiveLegacyKnowledgePaths(projectRoot);

		expect(auditMigratedSeed(inventory, files, activeLegacyPaths)).toEqual([]);

		const jsonDestination = `knowledge/${inventory.bundles[0]?.header.planSlug}/${inventory.bundles[0]?.records[0]?.id}.md`;
		const markdownDestination = inventory.markdown[0]?.path.replace(
			/^memory\//u,
			"knowledge/",
		);
		if (!jsonDestination || !markdownDestination) {
			throw new Error(
				"Frozen inventory must contain markdown and JSONL records.",
			);
		}

		const fieldDeletion = mutateFrontmatter(files, jsonDestination, (data) => {
			delete data.planTitle;
		});
		expect(
			auditMigratedSeed(inventory, fieldDeletion, activeLegacyPaths),
		).toContain(`metadata:${jsonDestination}`);

		const bodyChange = new Map(files);
		bodyChange.set(
			markdownDestination,
			`${bodyChange.get(markdownDestination) ?? ""}\nmutated body`,
		);
		expect(
			auditMigratedSeed(inventory, bodyChange, activeLegacyPaths),
		).toContain(`body:${markdownDestination}`);

		const timestampChange = mutateFrontmatter(
			files,
			jsonDestination,
			(data) => {
				data.timestamp = "2026-05-22T18:45:37Z";
			},
		);
		expect(
			auditMigratedSeed(inventory, timestampChange, activeLegacyPaths),
		).toContain(`metadata:${jsonDestination}`);

		const missingDestination = new Map(files);
		missingDestination.delete(jsonDestination);
		expect(
			auditMigratedSeed(inventory, missingDestination, activeLegacyPaths),
		).toContain(`destination:${jsonDestination}`);

		expect(
			auditMigratedSeed(inventory, files, [
				...activeLegacyPaths,
				"lib/sessions/knowledge.ts",
			]),
		).toContain("active-jsonl:lib/sessions/knowledge.ts");

		// Legacy bodies migrate byte-for-byte (Design §6). Mutating one must be
		// caught. The mutation is asserted to have actually applied so this
		// negative can never silently degrade into a no-op replace.
		const mutatedDestination = "knowledge/session-lineage.md";
		const originalBody = files.get(mutatedDestination) ?? "";
		const bodyMutation = new Map(files);
		const mutatedBody = originalBody.replace(
			"matching the future SQLite/vector-ingestion shape.",
			"matching some other shape.",
		);
		expect(mutatedBody).not.toBe(originalBody);
		bodyMutation.set(mutatedDestination, mutatedBody);
		expect(
			auditMigratedSeed(inventory, bodyMutation, activeLegacyPaths),
		).toContain(`body:${mutatedDestination}`);
	});

	test("records a passing 20-turn recurring scan-cost gate against the migrated corpus", async () => {
		const raw = await readFile(
			join(
				process.cwd(),
				"missions",
				"reviews",
				"knowledge-surface-scan-cost.md",
			),
			"utf-8",
		);
		const evidence = matter(raw);
		expect(evidence.data).toMatchObject({
			kind: "knowledge-surface-scan-cost",
			plan: "knowledge-surface",
			turns: 20,
			verdict: "pass",
		});
		const capturedAt =
			evidence.data.capturedAt instanceof Date
				? evidence.data.capturedAt.toISOString()
				: String(evidence.data.capturedAt);
		expect(new Date(capturedAt).toISOString()).toBe(capturedAt);
		expect(evidence.data.p95DurationMs).toBeLessThanOrEqual(250);
		expect(evidence.data.maxBytesRead).toBeLessThanOrEqual(10 * 1024 * 1024);
		expect(evidence.data.maxFilesScanned).toBeLessThanOrEqual(
			evidence.data.corpusFiles,
		);
		expect(evidence.data.maxBytesRead).toBeLessThanOrEqual(
			evidence.data.corpusBytes,
		);

		const rows = [
			...evidence.content.matchAll(
				/^\| (\d+) \| (\d+) \| (\d+) \| ([\d.]+) \| (\d+) \| (\d+) \|$/gmu,
			),
		].map((match) => ({
			turn: Number(match[1]),
			filesScanned: Number(match[2]),
			bytesRead: Number(match[3]),
			durationMs: Number(match[4]),
			records: Number(match[5]),
			warnings: Number(match[6]),
		}));
		expect(rows).toHaveLength(20);
		expect(rows.map((row) => row.turn)).toEqual(
			Array.from({ length: 20 }, (_, index) => index + 1),
		);
		const durations = rows
			.map((row) => row.durationMs)
			.sort((left, right) => left - right);
		expect(durations[Math.ceil(durations.length * 0.95) - 1]).toBe(
			evidence.data.p95DurationMs,
		);
		expect(Math.max(...rows.map((row) => row.filesScanned))).toBe(
			evidence.data.maxFilesScanned,
		);
		expect(Math.max(...rows.map((row) => row.bytesRead))).toBe(
			evidence.data.maxBytesRead,
		);
		expect(evidence.content).toContain(
			"migrated project knowledge corpus from `tests/fixtures/knowledge-seed-inventory.json`",
		);
		const measuredAgentId = `${["cod", "ing"].join("")}/worker`;
		expect(evidence.content).toContain(
			`enabled \`${measuredAgentId}\` session`,
		);
		expect(evidence.content).toMatch(
			/verdict would be `amend`[^.]+Stage 7[^.]+blocked/is,
		);
	});
});

interface SeedInventory {
	readonly migrationTimestamp: string;
	readonly markdown: readonly FrozenMarkdown[];
	readonly bundles: readonly FrozenBundle[];
}

interface FrozenMarkdown {
	readonly path: string;
	readonly sha256: string;
	readonly distilledAtRaw: string;
	readonly legacySource: string;
	readonly legacyPlan: string;
	readonly title: string;
	readonly body: string;
}

interface FrozenBundle {
	readonly path: string;
	readonly sha256: string;
	readonly header: {
		readonly planSlug: string;
		readonly planTitle: string;
		readonly distilledAt: string;
		readonly distilledBy: string;
	};
	readonly records: readonly FrozenRecord[];
}

interface FrozenRecord {
	readonly ordinal: number;
	readonly id: string;
	readonly rawTimestamp: string;
	readonly fields: {
		readonly id: string;
		readonly planSlug: string;
		readonly taskId?: string;
		readonly sourceRole: string;
		readonly type: string;
		readonly content: string;
		readonly files: readonly string[];
		readonly tags: readonly string[];
		readonly createdAt: string;
	};
}

function auditMigratedSeed(
	inventory: SeedInventory,
	files: ReadonlyMap<string, string>,
	activeLegacyPaths: readonly string[],
): string[] {
	const issues: string[] = [];
	const expectedPaths = new Set<string>(["knowledge/index.md"]);

	for (const frozen of inventory.markdown) {
		const destination = frozen.path.replace(/^memory\//u, "knowledge/");
		expectedPaths.add(destination);
		checkDestination({
			files,
			path: destination,
			expectedMetadata: {
				type: "decision",
				title: frozen.title,
				description: `Archived plan distillation for ${frozen.legacyPlan}.`,
				resource: destination,
				tags: [`plan:${frozen.legacyPlan}`, "source:legacy-distillation"],
				timestamp: canonicalFrozenTimestamp(frozen.distilledAtRaw),
				scope: "project",
				kind: "semantic",
				writer: "knowledge-surface-migration",
				source: frozen.path,
				date: inventory.migrationTimestamp,
				legacySource: frozen.legacySource,
				legacyPlan: frozen.legacyPlan,
				legacyDistilledAt: frozen.distilledAtRaw,
				legacySourceSha256: frozen.sha256,
			},
			expectedBody: frozen.body,
			issues,
		});
	}

	for (const bundle of inventory.bundles) {
		for (const record of bundle.records) {
			const mappedType = mapLegacyKnowledgeType(record.fields.type);
			const destination = `knowledge/${bundle.header.planSlug}/${record.id}.md`;
			expectedPaths.add(destination);
			checkDestination({
				files,
				path: destination,
				expectedMetadata: {
					type: mappedType,
					title: `${bundle.header.planTitle} — ${mappedType} ${record.ordinal}`,
					description: `Migrated ${record.fields.type} record ${record.id} from ${bundle.header.planSlug}.`,
					resource: destination,
					tags: [...record.fields.tags],
					timestamp: canonicalFrozenTimestamp(record.rawTimestamp),
					scope: "project",
					kind: "semantic",
					writer: bundle.header.distilledBy,
					source: `${bundle.path}#${record.id}`,
					date: canonicalFrozenTimestamp(bundle.header.distilledAt),
					id: record.fields.id,
					planSlug: record.fields.planSlug,
					planTitle: bundle.header.planTitle,
					...(record.fields.taskId === undefined
						? {}
						: { taskId: record.fields.taskId }),
					sourceRole: record.fields.sourceRole,
					files: [...record.fields.files],
					legacyType: record.fields.type,
					legacyCreatedAt: record.rawTimestamp,
					legacyBundleDistilledAt: bundle.header.distilledAt,
					legacyBundleDistilledBy: bundle.header.distilledBy,
					legacySourceSha256: bundle.sha256,
				},
				expectedBody: record.fields.content,
				issues,
			});
		}
	}

	const actualPaths = [...files.keys()].sort();
	const expectedSorted = [...expectedPaths].sort();
	for (const path of expectedSorted) {
		if (!files.has(path)) issues.push(`destination:${path}`);
	}
	for (const path of actualPaths) {
		if (!expectedPaths.has(path) || !path.endsWith(".md")) {
			issues.push(`unexpected:${path}`);
		}
	}

	const indexRaw = files.get("knowledge/index.md");
	if (indexRaw === undefined) {
		issues.push("destination:knowledge/index.md");
	} else {
		const index = matter(indexRaw);
		const expectedIndexMetadata = {
			type: "convention",
			title: "Knowledge seed migration index",
			description: "One-to-one map from the frozen legacy seed corpus.",
			resource: "knowledge/index.md",
			tags: ["knowledge", "migration", "index"],
			timestamp: inventory.migrationTimestamp,
			scope: "project",
			kind: "semantic",
			writer: "knowledge-surface-migration",
			source: "tests/fixtures/knowledge-seed-inventory.json",
			date: inventory.migrationTimestamp,
		};
		if (stableJson(index.data) !== stableJson(expectedIndexMetadata)) {
			issues.push("metadata:knowledge/index.md");
		}
		for (const frozen of inventory.markdown) {
			const destination = frozen.path.replace(/^memory\//u, "knowledge/");
			if (
				!index.content.includes(
					`| \`${frozen.path}\` | — | \`${destination}\` |`,
				)
			) {
				issues.push(`index:${frozen.path}`);
			}
		}
		for (const bundle of inventory.bundles) {
			for (const record of bundle.records) {
				const destination = `knowledge/${bundle.header.planSlug}/${record.id}.md`;
				if (
					!index.content.includes(
						`| \`${bundle.path}\` | \`${record.id}\` | \`${destination}\` |`,
					)
				) {
					issues.push(`index:${bundle.path}#${record.id}`);
				}
			}
		}
	}

	for (const path of activeLegacyPaths) issues.push(`active-jsonl:${path}`);
	return [...new Set(issues)].sort();
}

function checkDestination(options: {
	readonly files: ReadonlyMap<string, string>;
	readonly path: string;
	readonly expectedMetadata: Record<string, unknown>;
	readonly expectedBody: string;
	readonly issues: string[];
}): void {
	const raw = options.files.get(options.path);
	if (raw === undefined) return;
	const parsed = matter(raw);
	if (stableJson(parsed.data) !== stableJson(options.expectedMetadata)) {
		options.issues.push(`metadata:${options.path}`);
	}
	if (parsed.content !== options.expectedBody) {
		options.issues.push(`body:${options.path}`);
	}
}

function canonicalFrozenTimestamp(raw: string): string {
	const value =
		raw.startsWith("'") && raw.endsWith("'") ? raw.slice(1, -1) : raw;
	if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) return `${value}T00:00:00.000Z`;
	if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value)) {
		return value.replace(/Z$/u, ".000Z");
	}
	if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
		const canonical = new Date(value).toISOString();
		if (canonical === value) return canonical;
	}
	throw new Error(`Uninventoried or invalid frozen timestamp: ${raw}`);
}

function mapLegacyKnowledgeType(type: string): string {
	if (["decision", "trade-off", "gotcha", "convention"].includes(type)) {
		return type;
	}
	if (type === "rationale") return "decision";
	if (type === "pattern") return "convention";
	throw new Error(`Uninventoried legacy knowledge type: ${type}`);
}

async function readKnowledgeCorpus(
	projectRoot: string,
): Promise<Map<string, string>> {
	const root = join(projectRoot, "knowledge");
	const files = new Map<string, string>();
	for (const path of await listFiles(root, "knowledge")) {
		files.set(path, await readFile(join(projectRoot, path), "utf-8"));
	}
	return files;
}

async function findActiveLegacyKnowledgePaths(
	projectRoot: string,
): Promise<string[]> {
	const candidates = [
		...(await listFiles(join(projectRoot, "lib"), "lib")),
		...(await listFiles(join(projectRoot, "domains"), "domains")),
		...(await listFiles(join(projectRoot, "bundled"), "bundled")),
		...(await listFiles(join(projectRoot, "docs"), "docs")),
		"AGENTS.md",
		"README.md",
		"ROADMAP.md",
	];
	const legacy =
		/\.knowledge\.jsonl|\b(?:read|write)KnowledgeBundle\b|\breadAllKnowledge\b|\bKnowledgeBundle\b/u;
	const matches: string[] = [];
	for (const path of candidates) {
		try {
			if (legacy.test(await readFile(join(projectRoot, path), "utf-8"))) {
				matches.push(path);
			}
		} catch (error: unknown) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
	return matches.sort();
}

async function listFiles(root: string, prefix: string): Promise<string[]> {
	let entries: Dirent[];
	try {
		entries = await readdir(root, { withFileTypes: true });
	} catch (error: unknown) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
	const paths: string[] = [];
	for (const entry of entries) {
		const relativePath = `${prefix}/${entry.name}`;
		if (entry.isDirectory()) {
			paths.push(...(await listFiles(join(root, entry.name), relativePath)));
		} else if (entry.isFile()) {
			paths.push(relativePath);
		}
	}
	return paths.sort();
}

function mutateFrontmatter(
	files: ReadonlyMap<string, string>,
	path: string,
	mutate: (data: Record<string, unknown>) => void,
): Map<string, string> {
	const mutated = new Map(files);
	const parsed = matter(mutated.get(path) ?? "");
	mutate(parsed.data);
	mutated.set(path, renderExactBody(parsed.content, parsed.data));
	return mutated;
}

function renderExactBody(body: string, data: Record<string, unknown>): string {
	const rendered = matter.stringify(body, data);
	return body.endsWith("\n") || !rendered.endsWith("\n")
		? rendered
		: rendered.slice(0, -1);
}

function stableJson(value: unknown): string {
	return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
	if (value instanceof Date) return value.toISOString();
	if (Array.isArray(value)) return value.map(sortValue);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, sortValue(entry)]),
		);
	}
	return value;
}
