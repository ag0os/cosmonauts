import { createHash } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import { createArchitectureMapMemoryStore } from "../../lib/architecture-map/index.ts";
import {
	type ConsolidationSource,
	type ConsolidationSourceRecord,
	type CorpusJudgmentProvider,
	createKnowledgeMemoryStore,
	createLivingMemoryConsolidator,
	createMarkdownMemoryStore,
	DEFAULT_LIVING_MEMORY_LIMITS,
	type KnowledgeConsolidator,
	type LivingMemoryConsolidatorDependencies,
	type MemoryStore,
} from "../../lib/memory/index.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("living-memory-");

describe("living memory", () => {
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
): {
	readonly consolidator: KnowledgeConsolidator;
	readonly dependencies: LivingMemoryConsolidatorDependencies;
} {
	const dependencies = {
		sources,
		judgmentProvider,
		proposalStore: {
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
}): ConsolidationSourceRecord {
	return {
		...options,
		scope: "project",
		digest: createHash("sha256").update(options.content).digest("hex"),
		metadata: {},
	};
}
