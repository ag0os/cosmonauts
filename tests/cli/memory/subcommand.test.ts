import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test, vi } from "vitest";

const piMocks = vi.hoisted(() => ({
	createAgentSession: vi.fn(),
	inMemory: vi.fn(() => ({ kind: "in-memory-session-manager" })),
	reload: vi.fn(async () => undefined),
	resourceOptions: [] as unknown[],
}));

vi.mock("@earendil-works/pi-co" + "ding-agent", () => ({
	AuthStorage: { create: vi.fn(() => ({ kind: "auth" })) },
	ModelRegistry: {
		create: vi.fn(() => ({
			find: vi.fn((provider: string, id: string) => ({ provider, id })),
		})),
	},
	DefaultResourceLoader: class {
		constructor(options: unknown) {
			piMocks.resourceOptions.push(options);
		}

		reload = piMocks.reload;
	},
	getAgentDir: vi.fn(() => "/fixture-agent"),
	SessionManager: { inMemory: piMocks.inMemory },
	createAgentSession: piMocks.createAgentSession,
}));

import {
	createPiCorpusJudgmentProvider,
	type PiJudgmentSession,
} from "../../../cli/memory/judgment-provider.ts";
import {
	createMemoryProgram,
	executeMemoryConsolidate,
	type MemoryConsolidationStoreOptions,
} from "../../../cli/memory/subcommand.ts";
import {
	createConsolidationProposalStore,
	type MemoryConsolidateOptions,
	type MemoryConsolidateResult,
} from "../../../lib/memory/index.ts";
import { captureCliOutput } from "../../helpers/cli.ts";
import { useTempDir } from "../../helpers/fs.ts";

const tmp = useTempDir("memory-cli-");
const execFileAsync = promisify(execFile);

describe("memory owner CLI", () => {
	test("runs the production corpus source before episodes in a deterministic dry run", async () => {
		const projectRoot = join(tmp.path, "corpus-cli-project");
		const home = join(tmp.path, "corpus-cli-home");
		const knowledgePath = join(projectRoot, "knowledge", "retirable.md");
		const userKnowledgePath = join(
			home,
			".cosmonauts",
			"knowledge",
			"user-retirable.md",
		);
		const raw = [
			"---",
			"type: gotcha",
			"title: Retirable fixture",
			"description: A deterministic corpus observation fixture.",
			"resource: retirable.md",
			"timestamp: 2026-09-02T12:00:00.000Z",
			"scope: project",
			"kind: semantic",
			"tags: [fixture]",
			"retire-when:",
			"  condition: Remove after the legacy path disappears.",
			"  check:",
			"    kind: path-absent",
			"    path: docs/legacy.md",
			"---",
			"",
			"# Retirable fixture",
			"",
			"The legacy path is gone.",
			"",
		].join("\n");
		const userRaw = raw
			.replace("title: Retirable fixture", "title: User retirable fixture")
			.replace(
				"description: A deterministic corpus observation fixture.",
				"description: A measured user-scope fixture.",
			)
			.replace("resource: retirable.md", "resource: user-retirable.md")
			.replace("scope: project", "scope: user")
			.replace("# Retirable fixture", "# User retirable fixture");
		await Promise.all([
			mkdir(join(projectRoot, "knowledge"), { recursive: true }),
			mkdir(join(home, ".cosmonauts", "knowledge"), { recursive: true }),
		]);
		await Promise.all([
			writeFile(knowledgePath, raw),
			writeFile(userKnowledgePath, userRaw),
		]);

		const { stdout } = await execFileAsync(
			"bun",
			[
				join(process.cwd(), "bin", "cosmonauts"),
				"memory",
				"consolidate",
				"--dry-run",
				"--no-model",
				"--json",
			],
			{
				cwd: projectRoot,
				env: { ...process.env, HOME: home },
			},
		);
		const result = JSON.parse(stdout);

		expect(result).toMatchObject({
			kind: "ran",
			details: {
				dryRun: true,
				modelMode: "deterministic-only",
				sources: [
					{ sourceId: "project-corpus", admitted: 2, omitted: 0 },
					{ sourceId: "project-episodes", admitted: 0, omitted: 0 },
				],
				observations: [
					expect.objectContaining({ kind: "retire-condition-met" }),
				],
				writesCommitted: false,
			},
		});
		expect(
			await Promise.all([
				readFile(knowledgePath, "utf-8"),
				readFile(userKnowledgePath, "utf-8"),
			]),
		).toEqual([raw, userRaw]);
		expect(await readdir(projectRoot)).toEqual(["knowledge"]);
		expect(await readdir(join(home, ".cosmonauts"))).toEqual(["knowledge"]);
	});

	// @cosmo-behavior plan:living-memory#B-007
	test("actions or rejects improve proposals through a reachable closed lifecycle", async () => {
		const projectRoot = join(tmp.path, "improve-project");
		await mkdir(join(projectRoot, "missions", "tasks"), { recursive: true });
		await mkdir(join(projectRoot, "domains", "main", "prompts"), {
			recursive: true,
		});
		await mkdir(join(projectRoot, ".agents", "skills", "fixture"), {
			recursive: true,
		});
		await writeFile(
			join(projectRoot, "ROADMAP.md"),
			"# Roadmap\n\n## Planned work\n\n- Ship it.\n",
		);
		await writeFile(
			join(projectRoot, "missions", "tasks", "TASK-900 - Fixture.md"),
			[
				"---",
				"id: TASK-900",
				"title: Fixture",
				"status: To Do",
				"priority: medium",
				"labels: []",
				"dependencies: []",
				"createdAt: '2026-09-01T00:00:00.000Z'",
				"updatedAt: '2026-09-01T00:00:00.000Z'",
				"---",
				"",
				"## Description",
				"",
				"Fixture task.",
				"",
			].join("\n"),
		);
		await writeFile(
			join(projectRoot, "domains", "main", "prompts", "fixture.md"),
			"# Fixture prompt\n",
		);
		await writeFile(
			join(projectRoot, ".agents", "skills", "fixture", "SKILL.md"),
			"---\nname: fixture\ndescription: Fixture.\n---\n",
		);

		const proposalStore = createConsolidationProposalStore({ projectRoot });
		const proposals = await Promise.all(
			Array.from({ length: 6 }, (_, index) =>
				proposalStore.persist({
					batchKey: createHash("sha256").update(`batch-${index}`).digest("hex"),
					observation: {
						id: `improvement-${index + 1}`,
						kind: "improvement",
						inputs: [
							{
								id: `input-${index + 1}`,
								sourceId: "fixture",
								scope: "project",
								path: `memory/agent/episodes/input-${index + 1}.md`,
								digest: createHash("sha256")
									.update(`input-${index}`)
									.digest("hex"),
							},
						],
						reason: "A bounded owner action is needed.",
					},
					proposal: {
						proposalKind: "improve",
						observedProblem: "The workflow stalled.",
						whatHappened: "The run exposed a missing owner step.",
						suggestedImprovement: "Record the owner decision.",
						whyItHelps: "The proposal can close.",
					},
					dryRun: false,
				}),
			),
		);
		const paths = proposals.map((proposal) => {
			if (!proposal.path) throw new Error("expected persisted proposal path");
			return proposal.path;
		});
		const output = captureCliOutput();
		try {
			const actions = [
				["roadmap", "Planned work"],
				["task", "TASK-900"],
				["prompt", "domains/main/prompts/fixture.md"],
				["skill", ".agents/skills/fixture/SKILL.md"],
			] as const;
			for (const [index, [kind, pointer]] of actions.entries()) {
				await createMemoryProgram({
					projectRoot,
					now: () => new Date("2026-09-02T12:00:00.000Z"),
				})
					.exitOverride()
					.parseAsync(
						[
							"improve",
							"action",
							paths[index] ?? "",
							"--kind",
							kind,
							"--pointer",
							pointer,
							"--json",
						],
						{ from: "user" },
					);
			}
			await createMemoryProgram({
				projectRoot,
				now: () => new Date("2026-09-02T12:00:00.000Z"),
			})
				.exitOverride()
				.parseAsync(
					[
						"improve",
						"reject",
						paths[4] ?? "",
						"--reason",
						"The owner declined this change.",
						"--plain",
					],
					{ from: "user" },
				);
		} finally {
			output.restore();
		}

		const historyDir = join(
			projectRoot,
			"memory",
			"agent",
			"proposals",
			"living-memory",
			"resolutions",
		);
		const histories = (await readdir(historyDir)).sort();
		expect(histories).toHaveLength(5);
		const historyBytes = await Promise.all(
			histories.map((name) => readFile(join(historyDir, name), "utf-8")),
		);
		expect(historyBytes.map((raw) => JSON.parse(raw))).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					history: [
						expect.objectContaining({ status: "actioned" }),
						expect.objectContaining({ status: "closed" }),
					],
				}),
				expect.objectContaining({
					history: [
						expect.objectContaining({ status: "rejected" }),
						expect.objectContaining({ status: "closed" }),
					],
				}),
			]),
		);

		const retryOutput = captureCliOutput();
		try {
			await createMemoryProgram({ projectRoot })
				.exitOverride()
				.parseAsync(
					[
						"improve",
						"action",
						paths[0] ?? "",
						"--kind",
						"roadmap",
						"--pointer",
						"Planned work",
						"--json",
					],
					{ from: "user" },
				);
			expect(JSON.parse(retryOutput.stdout())).toMatchObject({
				kind: "actioned",
				status: "closed",
				existing: true,
			});
		} finally {
			retryOutput.restore();
		}

		await expect(
			createMemoryProgram({ projectRoot })
				.exitOverride()
				.parseAsync(
					[
						"improve",
						"reject",
						paths[0] ?? "",
						"--reason",
						"Conflicting resolution.",
					],
					{ from: "user" },
				),
		).rejects.toThrow(/conflict/iu);
		await expect(
			createMemoryProgram({ projectRoot })
				.exitOverride()
				.parseAsync(
					[
						"improve",
						"action",
						paths[5] ?? "",
						"--kind",
						"task",
						"--pointer",
						"TASK-404",
					],
					{ from: "user" },
				),
		).rejects.toThrow(/pointer/iu);
		expect(await readdir(historyDir)).toHaveLength(5);
		await expect(readdir(join(projectRoot, "knowledge"))).rejects.toMatchObject(
			{
				code: "ENOENT",
			},
		);
	});

	// @cosmo-behavior plan:living-memory#B-013
	test("runs renders validates and cancels manual consolidation without autonomy", async () => {
		const signal = new AbortController().signal;
		const calls: Array<{
			factory: unknown;
			options: unknown;
		}> = [];
		const results: MemoryConsolidateResult[] = [
			{
				kind: "ran",
				details: details({ dryRun: false, modelMode: "full" }),
			},
			{
				kind: "noop",
				reason: "Nothing to do.",
				details: details({
					dryRun: false,
					modelMode: "deterministic-only",
				}),
			},
			{
				kind: "ran",
				details: details({ dryRun: true, modelMode: "full" }),
			},
		];
		const createConsolidationStore = vi.fn(
			(factoryOptions: MemoryConsolidationStoreOptions) => ({
				consolidate: vi.fn(async (options) => {
					calls.push({ factory: factoryOptions, options });
					const result = results[calls.length - 1] ?? results[0];
					if (!result) throw new Error("missing fixture result");
					return result;
				}),
			}),
		);

		const full = await executeMemoryConsolidate({
			projectRoot: tmp.path,
			dryRun: false,
			noModel: false,
			outputMode: "json",
			signal,
			createConsolidationStore,
		});
		const deterministic = await executeMemoryConsolidate({
			projectRoot: tmp.path,
			dryRun: false,
			noModel: true,
			outputMode: "plain",
			signal,
			createConsolidationStore,
		});
		const dry = await executeMemoryConsolidate({
			projectRoot: tmp.path,
			dryRun: true,
			noModel: false,
			model: "openai-codex/gpt-5.6-sol",
			outputMode: "human",
			signal,
			createConsolidationStore,
		});

		expect(calls).toEqual([
			{
				factory: {
					projectRoot: tmp.path,
					modelMode: "full",
				},
				options: { dryRun: false, modelMode: "full", signal },
			},
			{
				factory: {
					projectRoot: tmp.path,
					modelMode: "deterministic-only",
				},
				options: {
					dryRun: false,
					modelMode: "deterministic-only",
					signal,
				},
			},
			{
				factory: {
					projectRoot: tmp.path,
					modelMode: "full",
					model: "openai-codex/gpt-5.6-sol",
				},
				options: { dryRun: true, modelMode: "full", signal },
			},
		]);
		expect(full).toMatchObject({
			exitCode: 0,
			rendered: { kind: "json", value: { kind: "ran" } },
		});
		expect(deterministic).toMatchObject({
			exitCode: 0,
			rendered: {
				kind: "lines",
				lines: ["kind=noop", "reason=Nothing to do."],
			},
		});
		expect(dry).toMatchObject({
			exitCode: 0,
			rendered: {
				kind: "lines",
				lines: [expect.stringContaining("completed")],
			},
		});
		for (const recovery of ["pending", "release-unconfirmed"] as const) {
			await expect(
				executeMemoryConsolidate({
					projectRoot: tmp.path,
					dryRun: false,
					noModel: false,
					outputMode: "human",
					createConsolidationStore: () => ({
						async consolidate() {
							return {
								kind: "ran" as const,
								details: {
									...details({ dryRun: false, modelMode: "full" }),
									recovery,
								},
							};
						},
					}),
				}),
			).resolves.toMatchObject({ exitCode: 1 });
		}

		await expect(
			executeMemoryConsolidate({
				projectRoot: tmp.path,
				dryRun: false,
				noModel: true,
				model: "openai-codex/gpt-5.6-sol",
				outputMode: "human",
				createConsolidationStore,
			}),
		).rejects.toThrow(/no-model.*model/iu);
		const beforeConflictAccess = createConsolidationStore.mock.calls.length;
		await expect(
			createMemoryProgram({ createConsolidationStore })
				.exitOverride()
				.parseAsync(["consolidate", "--json", "--plain"], { from: "user" }),
		).rejects.toThrow(/json.*plain/iu);
		await expect(
			createMemoryProgram({ createConsolidationStore })
				.exitOverride()
				.parseAsync(
					["consolidate", "--no-model", "--model", "openai-codex/gpt-5.6-sol"],
					{ from: "user" },
				),
		).rejects.toThrow(/no-model.*model/iu);
		expect(createConsolidationStore).toHaveBeenCalledTimes(
			beforeConflictAccess,
		);

		const cancelled = new AbortController();
		cancelled.abort();
		const cancelStore = vi.fn(() => ({
			async consolidate(options?: MemoryConsolidateOptions) {
				return {
					kind: "failed" as const,
					reason: options?.signal?.aborted ? "cancelled" : "not cancelled",
					details: details({ dryRun: false, modelMode: "full" }),
				};
			},
		}));
		await expect(
			executeMemoryConsolidate({
				projectRoot: tmp.path,
				dryRun: false,
				noModel: false,
				outputMode: "human",
				signal: cancelled.signal,
				createConsolidationStore: cancelStore,
			}),
		).resolves.toMatchObject({ exitCode: 1, result: { kind: "failed" } });

		const output = captureCliOutput();
		try {
			await createMemoryProgram({
				createConsolidationStore: vi.fn(() => ({
					async consolidate() {
						return { kind: "noop" as const, reason: "clean" };
					},
				})),
			})
				.exitOverride()
				.parseAsync(["consolidate", "--json"], { from: "user" });
			expect(JSON.parse(output.stdout())).toEqual({
				kind: "noop",
				reason: "clean",
			});
			expect(output.stderr()).toBe("");
		} finally {
			output.restore();
		}
	});

	test("routes restoration annotations and surfaces failed exits", async () => {
		const restore = vi.fn(async () => ({
			kind: "completed" as const,
			details: {
				path: "knowledge/restored.md",
				digest: "a".repeat(64),
				status: "restored" as const,
				manifestPath: join(tmp.path, "memory/agent/retirements/round-2.md"),
				recovery: "none" as const,
				writesCommitted: true,
			},
		}));
		const output = captureCliOutput();
		try {
			await createMemoryProgram({
				projectRoot: tmp.path,
				now: () => new Date("2026-09-02T12:00:00.000Z"),
				retirementStore: { restore },
			})
				.exitOverride()
				.parseAsync(
					[
						"restore",
						"knowledge/restored.md",
						"--reason",
						"The owner restored it.",
						"--json",
					],
					{ from: "user" },
				);
			expect(JSON.parse(output.stdout())).toMatchObject({
				kind: "completed",
				details: { status: "restored" },
			});
		} finally {
			output.restore();
		}
		expect(restore).toHaveBeenCalledWith({
			path: "knowledge/restored.md",
			reason: "The owner restored it.",
			date: new Date("2026-09-02T12:00:00.000Z"),
			signal: expect.any(AbortSignal),
			lockOptions: {
				retryMs: 50,
				timeoutMs: 10_000,
				onReleaseUnconfirmed: expect.any(Function),
			},
		});

		const originalExitCode = process.exitCode;
		process.exitCode = undefined;
		const failedOutput = captureCliOutput();
		try {
			await createMemoryProgram({
				retirementStore: {
					async restore() {
						return {
							kind: "failed" as const,
							reason: "digest conflict",
							details: {
								path: "knowledge/restored.md",
								recovery: "none" as const,
								writesCommitted: false,
							},
						};
					},
				},
			})
				.exitOverride()
				.parseAsync(
					["restore", "knowledge/restored.md", "--reason", "Retry.", "--plain"],
					{ from: "user" },
				);
			expect(process.exitCode).toBe(1);
			expect(failedOutput.stdout()).toContain("kind=failed");
		} finally {
			failedOutput.restore();
			process.exitCode = originalExitCode;
		}
	});

	test("uses one cancellable no-tools in-memory judgment request and rejects invalid output", async () => {
		const messages: unknown[] = [];
		const prompt = vi.fn(async () => {
			messages.push({
				role: "assistant",
				content: [
					{
						type: "text",
						text: JSON.stringify({ schemaVersion: 1, observations: [] }),
					},
				],
			});
		});
		const session = {
			messages,
			prompt,
			abort: vi.fn(async () => undefined),
			dispose: vi.fn(),
		} satisfies PiJudgmentSession;
		const createSession = vi.fn(async () => session);
		const provider = createPiCorpusJudgmentProvider({
			projectRoot: tmp.path,
			createSession,
		});
		const input = judgmentInput();

		await expect(provider.judge(input, {})).resolves.toEqual({
			schemaVersion: 1,
			observations: [],
		});
		expect(createSession).toHaveBeenCalledTimes(1);
		expect(prompt).toHaveBeenCalledTimes(1);
		expect(session.dispose).toHaveBeenCalledTimes(1);
		await expect(provider.judge(input, {})).rejects.toThrow(/one.*request/iu);
		expect(prompt).toHaveBeenCalledTimes(1);

		const invalidMessages: unknown[] = [];
		const invalidSession = {
			messages: invalidMessages,
			async prompt() {
				invalidMessages.push({
					role: "assistant",
					content: [{ type: "text", text: "not JSON" }],
				});
			},
			abort: vi.fn(async () => undefined),
			dispose: vi.fn(),
		} satisfies PiJudgmentSession;
		await expect(
			createPiCorpusJudgmentProvider({
				projectRoot: tmp.path,
				createSession: async () => invalidSession,
			}).judge(input, {}),
		).rejects.toThrow(/invalid.*JSON|strict JSON/iu);
		expect(invalidSession.dispose).toHaveBeenCalledTimes(1);

		const controller = new AbortController();
		const cancelledMessages: unknown[] = [];
		const cancelledSession = {
			messages: cancelledMessages,
			async prompt() {
				controller.abort();
			},
			abort: vi.fn(async () => undefined),
			dispose: vi.fn(),
		} satisfies PiJudgmentSession;
		await expect(
			createPiCorpusJudgmentProvider({
				projectRoot: tmp.path,
				createSession: async () => cancelledSession,
			}).judge(input, { signal: controller.signal }),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(cancelledSession.abort).toHaveBeenCalledTimes(1);
		expect(cancelledSession.dispose).toHaveBeenCalledTimes(1);

		const realAdapterMessages: unknown[] = [];
		const realAdapterSession = {
			messages: realAdapterMessages,
			async prompt() {
				realAdapterMessages.push({
					role: "assistant",
					content: [
						{
							type: "text",
							text: JSON.stringify({ schemaVersion: 1, observations: [] }),
						},
					],
				});
			},
			abort: vi.fn(async () => undefined),
			dispose: vi.fn(),
		} satisfies PiJudgmentSession;
		piMocks.createAgentSession.mockResolvedValueOnce({
			session: realAdapterSession,
		});
		await expect(
			createPiCorpusJudgmentProvider({
				projectRoot: tmp.path,
				model: "test/model",
			}).judge(input, {}),
		).resolves.toEqual({ schemaVersion: 1, observations: [] });
		expect(piMocks.resourceOptions.at(-1)).toMatchObject({
			cwd: tmp.path,
			noExtensions: true,
			noSkills: true,
			noPromptTemplates: true,
			noThemes: true,
			noContextFiles: true,
			systemPrompt: expect.any(String),
		});
		expect(piMocks.inMemory).toHaveBeenCalledTimes(1);
		expect(piMocks.createAgentSession).toHaveBeenCalledWith(
			expect.objectContaining({
				cwd: tmp.path,
				model: { provider: "test", id: "model" },
				noTools: "all",
				sessionManager: { kind: "in-memory-session-manager" },
			}),
		);
		expect(realAdapterSession.dispose).toHaveBeenCalledTimes(1);
	});
});

function details(options: {
	readonly dryRun: boolean;
	readonly modelMode: "full" | "deterministic-only";
}) {
	return {
		dryRun: options.dryRun,
		modelMode: options.modelMode,
		sources: [],
		observations: [],
		proposals: [],
		retirements: [],
		episodePrunes: [],
		declines: [],
		warnings: [],
		recovery: "none" as const,
		writesCommitted: false,
	};
}

function judgmentInput() {
	return {
		schemaVersion: 1 as const,
		batchKey: "a".repeat(64),
		records: [],
		deterministicObservations: [],
		limits: {
			maxCorpusRecords: 50,
			maxEpisodeRecords: 50,
			maxObservations: 25,
			maxProposals: 10,
			maxRetirements: 5,
			maxModelRequests: 1,
		},
	};
}
