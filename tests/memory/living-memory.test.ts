import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { createArchitectureMapMemoryStore } from "../../lib/architecture-map/index.ts";
import {
	type ConsolidationSource,
	type ConsolidationSourceRecord,
	type CorpusJudgmentProvider,
	createAcceptedJudgmentReceiptStore,
	createConsolidationProposalStore,
	createDurableMachineFiles,
	createKnowledgeMemoryStore,
	createLivingMemoryConsolidator,
	createMarkdownMemoryStore,
	DEFAULT_LIVING_MEMORY_LIMITS,
	inspectLivingMemoryCitationInventory,
	type KnowledgeConsolidator,
	type LivingMemoryConsolidatorDependencies,
	type MemoryStore,
} from "../../lib/memory/index.ts";
import { parseHumanKnowledgeRecord } from "../../lib/memory/knowledge-records.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("living-memory-");

describe("living memory", () => {
	// @cosmo-behavior plan:living-memory#B-008
	test("evaluates supported gotcha retire-when checks without adding a knowledge type", async () => {
		const projectRoot = join(tmp.path, "retire-when-project");
		await mkdir(join(projectRoot, "knowledge"), { recursive: true });
		await writeFile(join(projectRoot, "fixed.txt"), "fixed\n", "utf-8");
		const raw = [
			"---",
			"type: gotcha",
			"title: Retire when fixed",
			"description: The cause has a safe deterministic check.",
			"retire-when:",
			"  condition: The replacement file exists.",
			"  check:",
			"    kind: path-exists",
			"    path: fixed.txt",
			"---",
			"",
			"# Retire when fixed",
			"",
			"Keep until fixed.",
			"",
		].join("\n");
		const parsed = parseHumanKnowledgeRecord({
			raw,
			physicalResource: "retire-when.md",
			physicalScope: "project",
			mtime: new Date("2026-09-01T12:00:00.000Z"),
		});
		expect(parsed).toMatchObject({
			ok: true,
			record: {
				type: "gotcha",
				retireWhen: {
					condition: "The replacement file exists.",
					check: { kind: "path-exists", path: "fixed.txt" },
				},
			},
		});

		const freeText = record({
			id: "free-text",
			sourceId: "corpus",
			path: "knowledge/free-text.md",
			kind: "knowledge",
			content: "# Free text\n",
			metadata: {
				type: "gotcha",
				retireWhen: "Retire after a human confirms the migration.",
				scopeRoot: projectRoot,
			},
		});
		const unsafe = record({
			id: "unsafe",
			sourceId: "corpus",
			path: "knowledge/unsafe.md",
			kind: "knowledge",
			content: "# Unsafe\n",
			metadata: {
				type: "gotcha",
				retireWhen: {
					condition: "Never escape the scope.",
					check: { kind: "path-absent", path: "../outside" },
				},
				scopeRoot: projectRoot,
			},
		});
		const commandLike = record({
			id: "command-like",
			sourceId: "corpus",
			path: "knowledge/command-like.md",
			kind: "knowledge",
			content: "# Command-like\n",
			metadata: {
				type: "gotcha",
				retireWhen: {
					condition: "Never execute repository commands.",
					check: { kind: "command", command: "test -f fixed.txt" },
				},
				scopeRoot: projectRoot,
			},
		});
		const checked = record({
			id: "checked",
			sourceId: "corpus",
			path: "knowledge/checked.md",
			kind: "knowledge",
			content: raw,
			metadata: {
				type: "gotcha",
				retireWhen: {
					condition: "The replacement file exists.",
					check: { kind: "path-exists", path: "fixed.txt" },
				},
				scopeRoot: projectRoot,
			},
		});
		const harness = createHarness([
			source("corpus", [freeText, unsafe, commandLike, checked]),
		]);

		const result = await harness.consolidator({
			modelMode: "deterministic-only",
		});

		expect(result).toMatchObject({
			kind: "ran",
			details: {
				observations: [
					{
						kind: "retire-condition-met",
						inputs: [{ id: "checked", digest: checked.digest }],
						reason: expect.stringContaining(
							"path-exists fixed.txt observed true",
						),
					},
				],
				retirements: [
					{
						path: "knowledge/checked.md",
						digest: checked.digest,
						status: "deferred",
						reason: "retire-when-met",
					},
				],
			},
		});
	});

	// @cosmo-behavior plan:living-memory#B-009
	test("turns stale citations into deterministic N=1 edits without a model call", async () => {
		const projectRoot = join(tmp.path, "stale-citation-project");
		const knowledgePath = join(projectRoot, "knowledge", "stale.md");
		await mkdir(join(projectRoot, "knowledge"), { recursive: true });
		await mkdir(join(projectRoot, "docs"), { recursive: true });
		await writeFile(join(projectRoot, "docs", "current.md"), "# Current\n");
		const raw = [
			"---",
			"type: gotcha",
			"title: Stale paths",
			"description: Preserve surrounding content while marking stale paths.",
			"files:",
			"  - docs/missing-from-files.md",
			"  - docs/current.md",
			"---",
			"",
			"# Stale paths",
			"",
			"Keep [the current doc](../docs/current.md#stable), mark [the missing doc](../docs/missing-link.md?view=1#old), and mark `lib/missing-backtick.ts` while preserving this sentence.",
			"",
		].join("\n");
		await writeFile(knowledgePath, raw, "utf-8");
		const input = record({
			id: "stale-record",
			sourceId: "corpus",
			path: "knowledge/stale.md",
			kind: "knowledge",
			content: raw,
			metadata: {
				type: "gotcha",
				title: "Stale paths",
				description: "Preserve surrounding content while marking stale paths.",
				tags: ["memory"],
				files: ["docs/missing-from-files.md", "docs/current.md"],
				scopeRoot: projectRoot,
			},
		});
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [],
		}));
		const proposalStore = createConsolidationProposalStore({ projectRoot });
		const harness = createHarness(
			[source("corpus", [input])],
			{ id: "fake/no-tools", judge },
			{ proposalStore },
		);

		const before = await readFile(knowledgePath, "utf-8");
		const result = await harness.consolidator({
			modelMode: "deterministic-only",
		});

		expect(result).toMatchObject({
			kind: "ran",
			details: {
				observations: [
					{
						kind: "stale-reference",
						inputs: [{ id: "stale-record", digest: input.digest }],
						reason: expect.stringContaining("3 unresolved citation"),
					},
				],
				proposals: [{ proposalKind: "merge", status: "written" }],
			},
		});
		expect(judge).not.toHaveBeenCalled();
		await expect(readFile(knowledgePath, "utf-8")).resolves.toBe(before);
		if (
			result.kind !== "ran" ||
			result.details.proposals[0]?.path === undefined
		) {
			throw new Error("expected one persisted deterministic proposal");
		}
		const proposalRaw = await readFile(
			result.details.proposals[0].path,
			"utf-8",
		);
		for (const path of [
			"docs/missing-from-files.md",
			"docs/missing-link.md",
			"lib/missing-backtick.ts",
		]) {
			expect(proposalRaw).toContain(`stale reference: ${path}`);
		}
		expect(proposalRaw).toContain("while preserving this sentence");
		expect(proposalRaw).toContain("../docs/current.md#stable");
	});

	test("persists closed proposal variants and accepted receipts through one safe durable writer", async () => {
		const projectRoot = join(tmp.path, "durable-proposal-project");
		await mkdir(projectRoot, { recursive: true });
		const durableFiles = createDurableMachineFiles();
		expect(Object.keys(durableFiles).sort()).toEqual([
			"replaceText",
			"writeText",
		]);
		const proposalStore = createConsolidationProposalStore({
			projectRoot,
			durableFiles,
		});
		const input = record({
			id: "evidence",
			sourceId: "corpus",
			path: "knowledge/evidence.md",
			kind: "knowledge",
			content: "# Evidence\n",
		});
		const evidence = {
			id: input.id,
			sourceId: input.sourceId,
			scope: input.scope,
			path: input.path,
			digest: input.digest,
		};
		const observation = {
			id: "deterministic-1",
			kind: "stale-reference" as const,
			inputs: [evidence],
			reason: "Fixture evidence.",
		};
		const proposals = [
			{
				proposalKind: "create" as const,
				record: proposed("Created record"),
			},
			{
				proposalKind: "merge" as const,
				replacement: proposed("Merged record"),
			},
			{ proposalKind: "retire" as const, reason: "obsolete" as const },
			{
				proposalKind: "improve" as const,
				observedProblem: "A repeated dead end.",
				whatHappened: "The run retried an invalid path.",
				suggestedImprovement: "Validate the path before dispatch.",
				whyItHelps: "The run avoids repeated failed work.",
			},
		];
		for (const [index, proposal] of proposals.entries()) {
			const batchKey = createHash("sha256")
				.update(`proposal-${index}`)
				.digest("hex");
			const first = await proposalStore.persist({
				batchKey,
				observation: { ...observation, id: `deterministic-${index + 1}` },
				proposal,
				dryRun: false,
			});
			const retry = await proposalStore.persist({
				batchKey,
				observation: { ...observation, id: `deterministic-${index + 1}` },
				proposal,
				dryRun: false,
			});
			expect(first).toMatchObject({
				proposalKind: proposal.proposalKind,
				status: "written",
			});
			expect(retry).toMatchObject({
				path: first.path,
				status: "existing",
			});
		}

		const batchKey = createHash("sha256").update("receipt").digest("hex");
		const receiptStore = createAcceptedJudgmentReceiptStore({
			projectRoot,
			durableFiles,
		});
		const receipt = {
			schemaVersion: 1 as const,
			batchKey,
			state: "accepted" as const,
			inputDigests: [input.digest],
			output: { schemaVersion: 1 as const, observations: [] },
			path: receiptStore.pathFor(batchKey),
		};
		await expect(receiptStore.write(receipt)).resolves.toEqual(receipt);
		await expect(receiptStore.write(receipt)).resolves.toEqual(receipt);
		await expect(
			receiptStore.markMaterialized(batchKey),
		).resolves.toMatchObject({
			state: "materialized",
		});
		await expect(receiptStore.read(batchKey)).resolves.toMatchObject({
			state: "materialized",
			inputDigests: [input.digest],
		});
		expect(
			(
				await readdir(join(projectRoot, "memory", "agent", "consolidations"))
			).filter((name) => name.endsWith(".tmp")),
		).toEqual([]);

		const symlinkProject = join(tmp.path, "durable-symlink-project");
		const external = join(tmp.path, "durable-symlink-external");
		await mkdir(join(symlinkProject, "memory", "agent"), { recursive: true });
		await mkdir(external, { recursive: true });
		await symlink(
			external,
			join(symlinkProject, "memory", "agent", "proposals"),
		);
		const firstProposal = proposals[0];
		if (firstProposal === undefined)
			throw new Error("missing proposal fixture");
		await expect(
			createConsolidationProposalStore({ projectRoot: symlinkProject }).persist(
				{
					batchKey: createHash("sha256").update("symlink").digest("hex"),
					observation,
					proposal: firstProposal,
					dryRun: false,
				},
			),
		).rejects.toThrow(/symlink/u);
	});

	test("builds the exact live citation inventory and blocks retirement on incomplete discovery", async () => {
		const projectRoot = join(tmp.path, "citation-inventory-project");
		const userRoot = join(tmp.path, "citation-inventory-user");
		for (const directory of [
			"knowledge/retired",
			"docs",
			"missions/plans/active",
			"missions/architecture",
			"missions/archive/plans/old",
			"missions/sessions/run",
			"memory/agent/consolidations",
		]) {
			await mkdir(join(projectRoot, directory), { recursive: true });
		}
		await mkdir(join(userRoot, "knowledge"), { recursive: true });
		await writeFile(
			join(projectRoot, "AGENTS.md"),
			"See [docs](docs/root.md).\n",
		);
		await writeFile(
			join(projectRoot, "docs", "guide.md"),
			"Use `lib/guide.ts`.\n",
		);
		await writeFile(
			join(projectRoot, "missions", "plans", "active", "plan.md"),
			"See [knowledge](../../../knowledge/live.md).\n",
		);
		await writeFile(
			join(projectRoot, "missions", "architecture", "memory.md"),
			"See `knowledge/live.md`.\n",
		);
		await writeFile(
			join(projectRoot, "knowledge", "live.md"),
			knowledgeFixture({
				resource: "knowledge/live.md",
				files: ["docs/guide.md"],
			}),
		);
		await writeFile(
			join(userRoot, "knowledge", "user.md"),
			knowledgeFixture({ resource: "knowledge/user.md", scope: "user" }),
		);
		for (const excluded of [
			join(projectRoot, "knowledge", "index.md"),
			join(projectRoot, "knowledge", "retired", "old.md"),
			join(projectRoot, "missions", "archive", "plans", "old", "plan.md"),
			join(projectRoot, "missions", "sessions", "run", "session.md"),
			join(projectRoot, "memory", "agent", "consolidations", "receipt.md"),
		]) {
			await writeFile(excluded, "[excluded](knowledge/live.md)\n");
		}

		const healthy = await inspectLivingMemoryCitationInventory({
			projectRoot,
			userCosmonautsRoot: userRoot,
		});
		expect(healthy.healthy).toBe(true);
		expect(
			healthy.entries.map((entry) => `${entry.scope}:${entry.path}`),
		).toEqual([
			"project:AGENTS.md",
			"project:docs/guide.md",
			"project:knowledge/live.md",
			"project:missions/architecture/memory.md",
			"project:missions/plans/active/plan.md",
			"user:knowledge/user.md",
		]);
		expect(healthy.entries.flatMap((entry) => entry.targets)).toEqual(
			expect.arrayContaining([
				"docs/guide.md",
				"docs/root.md",
				"knowledge/live.md",
				"lib/guide.ts",
			]),
		);

		await writeFile(
			join(projectRoot, "docs", "malformed.md"),
			"[escape](../../outside.md)\n",
		);
		const incomplete = await inspectLivingMemoryCitationInventory({
			projectRoot,
			userCosmonautsRoot: userRoot,
		});
		expect(incomplete).toMatchObject({
			healthy: false,
			warnings: [
				expect.objectContaining({
					path: join(projectRoot, "docs", "malformed.md"),
					message: expect.stringMatching(/escapes|malformed/u),
				}),
			],
		});

		await writeFile(join(projectRoot, "fixed.txt"), "fixed\n");
		const checked = record({
			id: "blocked-retirement",
			sourceId: "corpus",
			path: "knowledge/blocked.md",
			kind: "knowledge",
			content: "# Blocked\n",
			metadata: {
				type: "gotcha",
				retireWhen: {
					condition: "Fixed file exists.",
					check: { kind: "path-exists", path: "fixed.txt" },
				},
				scopeRoot: projectRoot,
			},
		});
		await expect(
			createHarness([source("corpus", [checked])]).consolidator({
				modelMode: "deterministic-only",
			}),
		).resolves.toMatchObject({
			kind: "ran",
			details: {
				observations: [{ kind: "retire-condition-met" }],
				retirements: [],
				declines: [
					expect.objectContaining({ code: "citation-inventory-incomplete" }),
				],
			},
		});
	});

	// @cosmo-behavior plan:living-memory#B-018
	test("accepts valid fake source snapshots and rejects contract violations", async () => {
		const content =
			"# Future reflection\n\nA source adapter owns only snapshots.\n";
		const valid = source("future-reflections", [
			record({
				id: "reflection-1",
				sourceId: "future-reflections",
				path: "memory/reflections/reflection-1.md",
				kind: "reflection",
				content,
			}),
		]);
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async (input) => {
			const { records } = input;
			expect(Object.isFrozen(records)).toBe(true);
			expect(Object.isFrozen(records[0])).toBe(true);
			return { schemaVersion: 1 as const, observations: [] };
		});
		await expect(
			createConsolidator([valid], {
				id: "fake/no-tools",
				judge,
			})(),
		).resolves.toMatchObject({ kind: "ran" });
		expect(judge).toHaveBeenCalledOnce();

		const duplicate = record({
			id: "duplicate",
			sourceId: "future-reflections",
			path: "memory/reflections/duplicate.md",
			kind: "reflection",
			content,
		});
		const invalidSources = [
			{
				label: "over-limit output",
				source: source(
					"future-reflections",
					Array.from({ length: 51 }, (_, index) =>
						record({
							id: `reflection-${index}`,
							sourceId: "future-reflections",
							path: `memory/reflections/${index}.md`,
							kind: "reflection",
							content: `${content}${index}`,
						}),
					),
				),
			},
			{
				label: "duplicate ids",
				source: source("future-reflections", [duplicate, duplicate]),
			},
			{
				label: "unsafe paths",
				source: source("future-reflections", [
					record({
						id: "unsafe",
						sourceId: "future-reflections",
						path: "../knowledge/escape.md",
						kind: "reflection",
						content,
					}),
				]),
			},
			{
				label: "invalid digests",
				source: source("future-reflections", [
					{
						...record({
							id: "bad-digest",
							sourceId: "future-reflections",
							path: "memory/reflections/bad-digest.md",
							kind: "reflection",
							content,
						}),
						digest: "not-a-sha256",
					},
				]),
			},
			{
				label: "unsupported scopes",
				source: source("future-reflections", [
					{
						...record({
							id: "session-record",
							sourceId: "future-reflections",
							path: "memory/reflections/session.md",
							kind: "reflection",
							content,
						}),
						scope: "session" as unknown as "project",
					},
				]),
			},
		] as const;

		for (const invalid of invalidSources) {
			await expect(
				createConsolidator([invalid.source as ConsolidationSource], {
					id: "fake/no-tools",
					judge,
				})(),
			).resolves.toMatchObject({
				kind: "failed",
				reason: expect.stringMatching(new RegExp(invalid.label, "i")),
			});
		}
	});

	// @cosmo-behavior plan:living-memory#B-010
	test("rejects source contract violations and enforces bounded lossy passes", async () => {
		const corpus = Array.from({ length: 50 }, (_, index) =>
			record({
				id: `corpus-${index}`,
				sourceId: "corpus",
				path: `knowledge/corpus-${index}.md`,
				kind: "knowledge",
				content: `# Corpus ${index}\n`,
			}),
		);
		const episodes = Array.from({ length: 50 }, (_, index) =>
			record({
				id: `episode-${index}`,
				sourceId: "episodes",
				path: `memory/agent/episodes/episode-${index}.md`,
				kind: "episode",
				content: `# Episode ${index}\n`,
			}),
		);
		const boundedOutput = {
			schemaVersion: 1 as const,
			observations: Array.from({ length: 25 }, (_, index) => ({
				kind: "superseded" as const,
				inputIds: [`corpus-${index}`],
				reason: `Bounded observation ${index}.`,
				...(index < 5
					? {
							proposal: {
								proposalKind: "retire" as const,
								reason: "superseded" as const,
							},
						}
					: index < 10
						? {
								proposal: {
									proposalKind: "merge" as const,
									replacement: {
										type: "decision" as const,
										title: `Merged ${index}`,
										description: "A lossy replacement.",
										content: "# Merged\n\nComplete replacement.\n",
										tags: ["memory"],
									},
								},
							}
						: {}),
			})),
		};
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(
			async () => boundedOutput,
		);
		const bounded = createHarness(
			[source("corpus", corpus, 7), source("episodes", episodes)],
			{ id: "fake/no-tools", judge },
		);
		const ran = await bounded.consolidator();

		expect(ran).toMatchObject({
			kind: "ran",
			details: {
				sources: [
					{ sourceId: "corpus", admitted: 50, omitted: 7 },
					{ sourceId: "episodes", admitted: 50, omitted: 0 },
				],
				declines: expect.arrayContaining([
					expect.objectContaining({ code: "source-deferred" }),
					expect.objectContaining({ code: "proposal-deferred" }),
				]),
				writesCommitted: false,
			},
		});
		if (ran.kind !== "ran") throw new Error("expected bounded pass to run");
		expect(ran.details.observations).toHaveLength(25);
		expect(ran.details.retirements).toHaveLength(5);
		expect(judge).toHaveBeenCalledOnce();

		const invalidOutputs = [
			{
				label: "observation cap",
				output: {
					schemaVersion: 1 as const,
					observations: Array.from({ length: 26 }, (_, index) => ({
						kind: "duplicate" as const,
						inputIds: [`corpus-${index}`],
						reason: "Too many observations.",
					})),
				},
			},
			{
				label: "proposal cap",
				output: {
					schemaVersion: 1 as const,
					observations: Array.from({ length: 11 }, (_, index) => ({
						kind: "merge-candidate" as const,
						inputIds: [`corpus-${index}`],
						reason: "Too many proposals.",
						proposal: {
							proposalKind: "retire" as const,
							reason: "merged" as const,
						},
					})),
				},
			},
			{
				label: "retirement cap",
				output: {
					schemaVersion: 1 as const,
					observations: Array.from({ length: 6 }, (_, index) => ({
						kind: "superseded" as const,
						inputIds: [`corpus-${index}`],
						reason: "Too many retirements.",
						proposal: {
							proposalKind: "retire" as const,
							reason: "superseded" as const,
						},
					})),
				},
			},
			{
				label: "lossy-pass contract",
				output: {
					schemaVersion: 1 as const,
					observations: [
						{
							kind: "duplicate" as const,
							inputIds: ["corpus-0"],
							reason: "One output for the first input.",
						},
						{
							kind: "duplicate" as const,
							inputIds: ["corpus-1"],
							reason: "One output for the second input.",
						},
					],
				},
				records: corpus.slice(0, 2),
			},
			{
				label: "model-supplied paths",
				output: {
					schemaVersion: 1 as const,
					observations: [
						{
							kind: "superseded" as const,
							inputIds: ["corpus-0"],
							reason: "The model must not choose a destination.",
							proposal: {
								proposalKind: "retire" as const,
								reason: "superseded" as const,
								path: "knowledge/model-chosen.md",
							},
						},
					],
				},
			},
		] as const;
		for (const invalid of invalidOutputs) {
			const invalidJudge = vi.fn<CorpusJudgmentProvider["judge"]>(
				async () => invalid.output,
			);
			const harness = createHarness(
				[source("corpus", "records" in invalid ? invalid.records : corpus)],
				{ id: "fake/no-tools", judge: invalidJudge },
			);
			await expect(harness.consolidator()).resolves.toMatchObject({
				kind: "failed",
				reason: expect.stringMatching(new RegExp(invalid.label, "i")),
			});
			expect(invalidJudge).toHaveBeenCalledOnce();
		}

		const emptyJudge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [],
		}));
		const empty = createHarness([source("empty-corpus", [], 3)], {
			id: "fake/no-tools",
			judge: emptyJudge,
		});
		await expect(empty.consolidator()).resolves.toMatchObject({
			kind: "noop",
			details: {
				sources: [{ sourceId: "empty-corpus", admitted: 0, omitted: 3 }],
				writesCommitted: false,
			},
		});
		expect(emptyJudge).not.toHaveBeenCalled();
		expect(empty.dependencies.proposalStore.persist).not.toHaveBeenCalled();
		expect(
			empty.dependencies.acceptedJudgmentReceiptStore.write,
		).not.toHaveBeenCalled();
		expect(empty.dependencies.durableFiles.writeText).not.toHaveBeenCalled();
	});

	test("delegates configured knowledge consolidation and preserves exact store noops", async () => {
		const configuredResult = {
			kind: "noop" as const,
			reason: "The configured living-memory pass found nothing to do.",
		};
		const consolidator = vi.fn(async () => configuredResult);
		const configuredStoreOptions = {
			projectRoot: tmp.path,
			userCosmonautsRoot: `${tmp.path}/user`,
			consolidator,
		};
		const configured = createKnowledgeMemoryStore(configuredStoreOptions);
		const options = {
			dryRun: true,
			modelMode: "deterministic-only" as const,
		};
		await expect(configured.consolidate(options)).resolves.toEqual(
			configuredResult,
		);
		expect(consolidator).toHaveBeenCalledWith(options);

		const stores = [
			createKnowledgeMemoryStore({
				projectRoot: tmp.path,
				userCosmonautsRoot: `${tmp.path}/user`,
			}),
			createMarkdownMemoryStore({
				projectRoot: tmp.path,
				userCosmonautsRoot: `${tmp.path}/user`,
			}),
			createArchitectureMapMemoryStore({ projectRoot: tmp.path }),
		] satisfies readonly MemoryStore[];
		await expect(stores[0]?.consolidate(options)).resolves.toEqual({
			kind: "noop",
			reason:
				"The knowledge store does not consolidate, promote, retain, or prune records.",
		});
		for (const store of stores.slice(1)) {
			await expect(store.consolidate(options)).resolves.toEqual({
				kind: "noop",
				reason:
					"W1 performs no background memory consolidation, pruning, decay, or dreaming.",
			});
		}
	});
});

function createConsolidator(
	sources: readonly ConsolidationSource[],
	judgmentProvider?: CorpusJudgmentProvider,
): KnowledgeConsolidator {
	return createHarness(sources, judgmentProvider).consolidator;
}

function createHarness(
	sources: readonly ConsolidationSource[],
	judgmentProvider?: CorpusJudgmentProvider,
	overrides: Partial<
		Pick<LivingMemoryConsolidatorDependencies, "proposalStore">
	> = {},
): {
	readonly consolidator: KnowledgeConsolidator;
	readonly dependencies: LivingMemoryConsolidatorDependencies;
} {
	const dependencies = {
		sources,
		judgmentProvider,
		proposalStore: overrides.proposalStore ?? {
			persist: vi.fn(async () => {
				throw new Error("proposal persistence is not expected");
			}),
		},
		acceptedJudgmentReceiptStore: {
			read: vi.fn(async () => undefined),
			write: vi.fn(async (receipt) => receipt),
			markMaterialized: vi.fn(async () => {
				throw new Error("receipt materialization is not expected");
			}),
		},
		retirementStore: {
			inspect: vi.fn(async () => ({ recovery: "none" as const, warnings: [] })),
		},
		durableFiles: {
			writeText: vi.fn(async () => {
				throw new Error("durable writes are not expected");
			}),
		},
		indexPressure: {
			measure: vi.fn(() => ({
				targetSatisfied: true,
				recordCount: 0,
				maxRecords: 50,
				renderedBytes: 0,
				guaranteedBytes: 8_000,
				headroomBytes: 0,
			})),
		},
		clock: () => new Date("2026-09-01T12:00:00.000Z"),
		limits: DEFAULT_LIVING_MEMORY_LIMITS,
		lockOptions: {
			retryMs: 50,
			timeoutMs: 10_000,
			onReleaseUnconfirmed: () => undefined,
		},
	} satisfies LivingMemoryConsolidatorDependencies;
	return {
		consolidator: createLivingMemoryConsolidator(dependencies),
		dependencies,
	};
}

function proposed(title: string) {
	return {
		type: "decision" as const,
		title,
		description: `${title} description.`,
		content: `# ${title}\n\nComplete replacement.\n`,
		tags: ["memory"],
	};
}

function knowledgeFixture(options: {
	readonly resource: string;
	readonly files?: readonly string[];
	readonly scope?: "project" | "user";
}): string {
	return [
		"---",
		"type: decision",
		"title: Inventory fixture",
		"description: Inventory fixture record.",
		`resource: ${options.resource}`,
		`scope: ${options.scope ?? "project"}`,
		"kind: semantic",
		...(options.files === undefined
			? []
			: ["files:", ...options.files.map((path) => `  - ${path}`)]),
		"---",
		"",
		"# Inventory fixture",
		"",
		"Body.",
		"",
	].join("\n");
}

function source(
	id: string,
	records: readonly ConsolidationSourceRecord[],
	omitted = 0,
): ConsolidationSource {
	return {
		id,
		async collect() {
			return { records, omitted };
		},
	};
}

function record(options: {
	readonly id: string;
	readonly sourceId: string;
	readonly path: string;
	readonly kind: ConsolidationSourceRecord["kind"];
	readonly content: string;
	readonly metadata?: Readonly<Record<string, unknown>>;
}): ConsolidationSourceRecord {
	return {
		...options,
		scope: "project",
		digest: createHash("sha256").update(options.content).digest("hex"),
		metadata: options.metadata ?? {},
	};
}
