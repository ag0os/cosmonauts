import {
	mkdir,
	readdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { FileRunStore } from "../../lib/durable-runtime/index.ts";
import { parseEpisodeRecord } from "../../lib/memory/episodic-records.ts";
import { createMarkdownMemoryStore } from "../../lib/memory/markdown-store.ts";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";
import { runChain } from "../../lib/orchestration/chain-runner.ts";
import { runDurableChain } from "../../lib/orchestration/durable-chain-runner.ts";
import type {
	ChainEvent,
	ChainResult,
	SpawnConfig,
	SpawnResult,
} from "../../lib/orchestration/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const spawnerMocks = vi.hoisted(() => ({
	createPiSpawner: vi.fn(),
	dispose: vi.fn(),
	spawn: vi.fn(),
}));

const cryptoMocks = vi.hoisted(() => ({
	randomUUID: vi.fn(() => "00000000-0000-4000-8000-000000000001"),
}));

vi.mock("node:crypto", async () => {
	const actual =
		await vi.importActual<typeof import("node:crypto")>("node:crypto");
	return { ...actual, randomUUID: cryptoMocks.randomUUID };
});

vi.mock("../../lib/orchestration/agent-spawner.ts", () => ({
	createPiSpawner: spawnerMocks.createPiSpawner,
}));

const temp = useTempDir("run-start-chain-characterization-");
const registry = new AgentRegistry([
	agent("planner"),
	agent("reviewer"),
	agent("quality-manager"),
]);

describe("runStart durable chain characterization", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		cryptoMocks.randomUUID.mockReturnValue(
			"00000000-0000-4000-8000-000000000001",
		);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// @cosmo-behavior plan:orchestration-surface-consolidation#B-002
	// @cosmo-behavior plan:orchestration-surface-consolidation#B-005
	test("preserves durable chain run files and ChainResult through runStart", async () => {
		spawnerMocks.spawn.mockImplementation(async (config: SpawnConfig) => {
			config.onEvent?.({
				type: "turn_start",
				sessionId: `session-${config.role}`,
			});
			return {
				success: true,
				sessionId: `session-${config.role}`,
				messages: [
					{
						role: "assistant",
						content: [
							{
								type: "text",
								text: `${config.role} durable summary`,
							},
						],
					},
				],
			};
		});
		spawnerMocks.createPiSpawner.mockReturnValue({
			spawn: spawnerMocks.spawn,
			dispose: spawnerMocks.dispose,
		});
		const projectRoot = join(temp.path, "project");

		const result = await runDurableChain({
			steps: parseChain("planner -> reviewer -> quality-manager", registry),
			projectRoot,
			registry,
		});
		expect(Object.keys(result).sort()).toEqual([
			"errors",
			"run",
			"stageResults",
			"success",
			"totalDurationMs",
		]);

		expect(result).toMatchObject({
			run: {
				runId: expect.stringMatching(/^chain-/),
				scope: "chain",
			},
			success: true,
			errors: [],
			stageResults: [
				expect.objectContaining({
					stage: { name: "planner", loop: false },
					summary: "planner durable summary",
				}),
				expect.objectContaining({
					stage: { name: "reviewer", loop: false },
					summary: "reviewer durable summary",
				}),
				expect.objectContaining({
					stage: { name: "quality-manager", loop: false },
					summary: "quality-manager durable summary",
				}),
			],
		});

		const store = new FileRunStore({
			rootDir: join(projectRoot, "missions", "sessions"),
		});
		const runs = await store.listRecentRuns({ scope: "chain", limit: 1 });
		expect(runs).toHaveLength(1);
		const run = runs[0];
		if (!run) {
			throw new Error("Expected a persisted chain run.");
		}
		expect(result.run).toEqual({ runId: run.runId, scope: "chain" });
		expect(run.metadata).toEqual({ source: "chain_run", stageCount: 3 });
		const graph = await store.readRunGraph(run);
		const steps = await store.listStepRecords(run);
		const events = await store.readEvents(run);
		expect(graph.graph.steps.map((step) => step.id)).toEqual([
			"chain-1-planner",
			"chain-2-reviewer",
			"chain-3-quality-manager",
		]);
		expect(steps.map((step) => [step.id, step.status])).toEqual([
			["chain-1-planner", "completed"],
			["chain-2-reviewer", "completed"],
			["chain-3-quality-manager", "completed"],
		]);
		expect(events.events.at(0)?.event).toEqual({
			type: "run_started",
			runId: run.runId,
		});
		expect(events.events.map((stored) => stored.event.type)).toEqual(
			expect.arrayContaining([
				"step_ready",
				"step_started",
				"step_tool_activity",
				"step_completed",
				"run_completed",
			]),
		);
		expect(spawnerMocks.dispose).toHaveBeenCalledTimes(1);
		await expect(stat(join(projectRoot, "memory"))).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("records durable chain episodes with the persisted run id and unchanged reconstruction @cosmo-behavior plan:episodic-log#B-016", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-21T12:00:00.000Z"));
		const successRoot = join(temp.path, "episode-success");
		await writeEpisodicConfig(successRoot, true);
		configureSpawner(async (config) => successfulSpawn(config));

		const success = await runDurableChain({
			steps: parseChain("[planner, reviewer] -> quality-manager", registry),
			projectRoot: successRoot,
			registry,
		});
		const successEpisodes = await readProjectChainEpisodes(successRoot);
		expect(successEpisodes).toHaveLength(2);
		expect(success.run?.runId).toMatch(/^chain-/u);
		expect(
			new Set(successEpisodes.map((episode) => episode.subject.id)),
		).toEqual(new Set([success.run?.runId]));
		expect(successEpisodes.map((episode) => episode.outcome).sort()).toEqual([
			"started",
			"succeeded",
		]);
		expect(successEpisodes.map((episode) => episode.source)).toEqual([
			"coding/planner",
			"coding/planner",
		]);

		const successStore = new FileRunStore({
			rootDir: join(successRoot, "missions", "sessions"),
		});
		const successRef = success.run;
		if (!successRef) throw new Error("Expected durable success run identity");
		const [{ graph }, steps, events] = await Promise.all([
			successStore.readRunGraph(successRef),
			successStore.listStepRecords(successRef),
			successStore.readEvents(successRef),
		]);
		expect(graph.steps).toHaveLength(3);
		expect(steps.map((step) => step.status)).toEqual([
			"completed",
			"completed",
			"completed",
		]);
		expect(events.events.at(0)?.event).toEqual({
			type: "run_started",
			runId: successRef.runId,
		});
		expect(events.events.at(-1)?.event).toEqual(
			expect.objectContaining({
				type: "run_completed",
				runId: successRef.runId,
			}),
		);
		expect(success).toMatchObject({
			success: true,
			errors: [],
			stageResults: [
				expect.objectContaining({
					stage: expect.objectContaining({ name: "planner" }),
				}),
				expect.objectContaining({
					stage: expect.objectContaining({ name: "reviewer" }),
				}),
				expect.objectContaining({
					stage: expect.objectContaining({ name: "quality-manager" }),
				}),
			],
		});

		const failureRoot = join(temp.path, "episode-failure");
		await writeEpisodicConfig(failureRoot, true);
		configureSpawner(async (config) =>
			config.role === "reviewer"
				? {
						success: false,
						sessionId: "session-reviewer",
						messages: [],
						error: "review failed",
					}
				: successfulSpawn(config),
		);
		const failure = await runDurableChain({
			steps: parseChain("planner -> reviewer", registry),
			projectRoot: failureRoot,
			registry,
		});
		const failureEpisodes = await readProjectChainEpisodes(failureRoot);
		expect(failure.success).toBe(false);
		expect(failure.errors).toEqual(["review failed"]);
		expect(failureEpisodes).toHaveLength(2);
		expect(
			new Set(failureEpisodes.map((episode) => episode.subject.id)),
		).toEqual(new Set([failure.run?.runId]));
		expect(failureEpisodes.map((episode) => episode.outcome).sort()).toEqual([
			"failed",
			"started",
		]);
		expect(failureEpisodes.map((episode) => episode.source)).toEqual([
			"coding/planner",
			"coding/planner",
		]);

		const captureFailureRoot = join(temp.path, "episode-capture-failure");
		await writeEpisodicConfig(captureFailureRoot, true);
		await writeFile(join(captureFailureRoot, "memory"), "path collision");
		const warnings: unknown[] = [];
		configureSpawner(async (config) => successfulSpawn(config));
		const withCaptureFailure = await runDurableChain({
			steps: parseChain("planner -> reviewer", registry),
			projectRoot: captureFailureRoot,
			registry,
			reportEpisodeWarning: async (warning) => {
				await Promise.resolve();
				warnings.push(warning);
			},
		});
		expect(withCaptureFailure.success).toBe(true);
		expect(withCaptureFailure.stageResults).toHaveLength(2);
		expect(withCaptureFailure.errors).toEqual([]);
		expect(warnings).toHaveLength(2);
		expect(warnings).toEqual([
			expect.objectContaining({
				message: expect.stringContaining("Episode capture skipped"),
			}),
			expect.objectContaining({
				message: expect.stringContaining("Episode capture skipped"),
			}),
		]);
		const captureStore = new FileRunStore({
			rootDir: join(captureFailureRoot, "missions", "sessions"),
		});
		const captureRef = withCaptureFailure.run;
		if (!captureRef) throw new Error("Expected durable capture-failure run");
		const [captureSteps, captureEvents] = await Promise.all([
			captureStore.listStepRecords(captureRef),
			captureStore.readEvents(captureRef),
		]);
		expect(captureSteps.map((step) => step.status)).toEqual([
			"completed",
			"completed",
		]);
		expect(captureEvents.events.at(-1)?.event.type).toBe("run_completed");
	});

	test("keeps disabled inline and durable chain outputs events and files unchanged @cosmo-behavior plan:episodic-log#B-027", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-21T12:00:00.000Z"));
		const projectRoot = join(temp.path, "disabled-parity");
		configureSpawner(async (config) =>
			config.role === "reviewer"
				? {
						success: false,
						sessionId: "session-reviewer",
						messages: [],
						error: "review failed",
					}
				: successfulSpawn(config),
		);

		const absent = await captureDisabledBaselines(projectRoot);
		expect(absent.inline.result.success).toBe(false);
		expect(absent.inline.result.errors).toEqual(["review failed"]);
		expect(absent.inline.events.map((event) => event.type)).toEqual([
			"chain_start",
			"stage_start",
			"agent_spawned",
			"agent_turn",
			"agent_completed",
			"stage_end",
			"stage_start",
			"stage_end",
			"chain_end",
		]);
		expect(absent.durable.result.success).toBe(false);
		expect(absent.durable.result.errors).toEqual(["review failed"]);
		expect(absent.durable.events.at(0)?.type).toBe("chain_start");
		expect(absent.durable.events.at(-1)?.type).toBe("chain_end");
		expect(
			Object.keys(absent.files).some((path) => path.startsWith("memory/")),
		).toBe(false);

		await rm(projectRoot, { recursive: true, force: true });
		await writeEpisodicConfig(projectRoot, false);
		configureSpawner(async (config) =>
			config.role === "reviewer"
				? {
						success: false,
						sessionId: "session-reviewer",
						messages: [],
						error: "review failed",
					}
				: successfulSpawn(config),
		);
		const explicitlyDisabled = await captureDisabledBaselines(
			projectRoot,
			true,
		);

		expect(explicitlyDisabled).toEqual(absent);
		expect(
			Object.keys(explicitlyDisabled.files).some((path) =>
				path.startsWith("memory/"),
			),
		).toBe(false);
	});
});

function configureSpawner(
	spawn: (config: SpawnConfig) => Promise<SpawnResult>,
): void {
	spawnerMocks.spawn.mockImplementation(spawn);
	spawnerMocks.createPiSpawner.mockReturnValue({
		spawn: spawnerMocks.spawn,
		dispose: spawnerMocks.dispose,
	});
}

async function successfulSpawn(config: SpawnConfig) {
	config.onEvent?.({
		type: "turn_start",
		sessionId: `session-${config.role}`,
	});
	return {
		success: true,
		sessionId: `session-${config.role}`,
		messages: [
			{
				role: "assistant",
				content: [
					{
						type: "text",
						text: `${config.role} durable summary`,
					},
				],
			},
		],
	};
}

async function writeEpisodicConfig(
	projectRoot: string,
	enabled: boolean,
): Promise<void> {
	const configDir = join(projectRoot, ".cosmonauts");
	await mkdir(configDir, { recursive: true });
	await writeFile(
		join(configDir, "config.json"),
		JSON.stringify({ episodicLog: { enabled } }),
		"utf-8",
	);
}

async function readProjectChainEpisodes(projectRoot: string) {
	const records = (
		await createMarkdownMemoryStore({ projectRoot }).retrieve(
			{ projectRoot, scopes: ["project"] },
			{ text: "", recordTypes: ["episode"] },
		)
	).records;

	return records.map((record) => {
		const metadata = parseEpisodeRecord(record);
		if (!metadata) throw new Error(`Invalid episode record: ${record.path}`);
		return { ...metadata, source: record.source };
	});
}

async function captureDisabledBaselines(
	projectRoot: string,
	skipConfig = false,
): Promise<{
	inline: { result: ChainResult; events: ChainEvent[] };
	durable: { result: ChainResult; events: ChainEvent[] };
	files: Record<string, string>;
}> {
	const inlineEvents: ChainEvent[] = [];
	const inlineResult = await runChain({
		steps: parseChain("planner -> reviewer", registry),
		projectRoot,
		registry,
		onEvent: (event) => inlineEvents.push(event),
	});
	const durableEvents: ChainEvent[] = [];
	const durableResult = await runDurableChain({
		steps: parseChain("planner -> reviewer", registry),
		projectRoot,
		registry,
		onEvent: (event) => durableEvents.push(event),
	});

	return {
		inline: { result: inlineResult, events: inlineEvents },
		durable: { result: durableResult, events: durableEvents },
		files: await readFileTree(projectRoot, skipConfig),
	};
}

async function readFileTree(
	root: string,
	skipConfig: boolean,
): Promise<Record<string, string>> {
	const files: Record<string, string> = {};
	await visit(root);
	return files;

	async function visit(directory: string): Promise<void> {
		const entries = await readdir(directory, { withFileTypes: true });
		for (const entry of entries) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				await visit(path);
				continue;
			}
			const relativePath = relative(root, path);
			if (skipConfig && relativePath === ".cosmonauts/config.json") continue;
			files[relativePath] = await readFile(path, "utf-8");
		}
	}
}

function agent(id: string): AgentDefinition {
	return {
		id,
		description: `Test ${id}`,
		capabilities: [],
		model: "test/model",
		tools: "none",
		extensions: [],
		skills: ["*"],
		projectContext: false,
		session: "ephemeral",
		loop: false,
		domain: "coding",
	};
}
