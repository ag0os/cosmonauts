import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import type { ConsolidationSource } from "../../lib/memory/consolidation-sources.ts";
import {
	createLivingMemoryConsolidator,
	DEFAULT_LIVING_MEMORY_LIMITS,
} from "../../lib/memory/living-memory.ts";
import type {
	AcceptedJudgmentReceipt,
	CorpusJudgmentProvider,
	LivingMemoryConsolidatorDependencies,
} from "../../lib/memory/types.ts";

function fixture(options: {
	readonly sources?: readonly ConsolidationSource[];
	readonly judgmentProvider?: CorpusJudgmentProvider;
	readonly retirementStore?: LivingMemoryConsolidatorDependencies["retirementStore"];
	readonly proposalPath?: string;
}) {
	const receipts: AcceptedJudgmentReceipt[] = [];
	let lockAcquisitions = 0;
	const withLock: LivingMemoryConsolidatorDependencies["withLock"] = async <T>(
		_path: string,
		action: () => Promise<T>,
	): Promise<T> => {
		lockAcquisitions++;
		return action();
	};
	const apply = vi.fn<
		LivingMemoryConsolidatorDependencies["retirementStore"]["apply"]
	>(async () => ({
		kind: "completed",
		details: {
			retirements: [],
			declines: [],
			warnings: [],
			recovery: "none",
			writesCommitted: false,
		},
	}));
	const dependencies: LivingMemoryConsolidatorDependencies = {
		lockPath: "/tmp/run-pass-characterization.lock",
		lockOptions: {
			retryMs: 50,
			timeoutMs: 10_000,
			onReleaseUnconfirmed: () => undefined,
		},
		withLock,
		clock: () => new Date("2026-09-01T00:00:00Z"),
		limits: DEFAULT_LIVING_MEMORY_LIMITS,
		sources: options.sources ?? [],
		...(options.judgmentProvider === undefined
			? {}
			: { judgmentProvider: options.judgmentProvider }),
		indexPressure: {
			measure: () => ({
				kind: "measured",
				targetSatisfied: true,
				recordCount: 0,
				maxRecords: 50,
				renderedBytes: 0,
				guaranteedBytes: 8000,
				headroomBytes: 0,
			}),
		},
		retirementStore: options.retirementStore ?? {
			apply,
			inspect: async () => ({
				recovery: "none",
				warnings: [],
				representedKeys: [],
			}),
		},
		proposalStore: {
			readEvidence: async () => [],
			persist: async (input) => ({
				proposalKind: input.proposal.proposalKind,
				key: input.batchKey,
				status: input.dryRun ? "preview" : "written",
				inputs: input.observation.inputs,
				contentDigest: "digest",
				...(options.proposalPath === undefined
					? {}
					: { path: options.proposalPath }),
				writesCommitted: !input.dryRun,
			}),
		},
		acceptedJudgmentReceiptStore: {
			pathFor: (key) => `/tmp/${key}.json`,
			list: async () => receipts,
			dischargeStale: async () => ({ paths: [], writesCommitted: false }),
			read: async (key) => ({
				receipt: receipts.find((receipt) => receipt.batchKey === key),
				writesCommitted: false,
			}),
			write: async (receipt) => {
				receipts.push(receipt);
				return { receipt, writesCommitted: true };
			},
			markMaterialized: async (key) => {
				const index = receipts.findIndex((receipt) => receipt.batchKey === key);
				const current = receipts[index];
				if (current === undefined) throw new Error("missing accepted receipt");
				const receipt = { ...current, state: "materialized" as const };
				receipts[index] = receipt;
				return { receipt, writesCommitted: true };
			},
		},
		durableFiles: {
			writeText: async () => {
				throw new Error("unexpected write");
			},
		},
	};
	return {
		run: createLivingMemoryConsolidator(dependencies),
		lockAcquisitions: () => lockAcquisitions,
		apply,
		receipts,
	};
}

function corpus(): ConsolidationSource {
	const content = "# A source\n";
	return {
		id: "corpus",
		async collect() {
			return {
				records: [
					{
						id: "one",
						sourceId: "corpus",
						scope: "project",
						path: "memory/one.md",
						digest: createHash("sha256").update(content).digest("hex"),
						content,
						kind: "artifact",
						metadata: {},
					},
				],
				inventoryComplete: true,
				omitted: 0,
				deferred: 0,
			};
		},
	};
}

describe("living-memory runPass through the consolidator", () => {
	test("dry-run on empty sources neither acquires a lock nor performs retirement recovery", async () => {
		const { run, lockAcquisitions, apply } = fixture({});
		await expect(
			run({ dryRun: true, modelMode: "deterministic-only" }),
		).resolves.toMatchObject({
			kind: "noop",
			details: { dryRun: true, writesCommitted: false, recovery: "none" },
		});
		expect(lockAcquisitions()).toBe(0);
		expect(apply).not.toHaveBeenCalled();
	});

	test("persisted source recovery reports committed episode prunes even when no new records are admitted", async () => {
		const { run } = fixture({
			sources: [
				{
					id: "episodes",
					recover: async () => ({
						writesCommitted: true,
						episodePrunes: ["recovered-episode"],
					}),
					collect: async () => ({
						records: [],
						inventoryComplete: true,
						omitted: 0,
						deferred: 0,
					}),
				},
			],
		});
		await expect(
			run({ modelMode: "deterministic-only" }),
		).resolves.toMatchObject({
			kind: "ran",
			details: {
				recovery: "none",
				writesCommitted: true,
				episodePrunes: ["recovered-episode"],
			},
		});
	});

	test("incomplete inventory fails rather than treating omitted records as absent", async () => {
		const { run } = fixture({
			sources: [
				{
					id: "incomplete",
					collect: async () => ({
						records: [],
						inventoryComplete: false,
						omitted: 2,
						deferred: 1,
					}),
				},
			],
		});
		await expect(
			run({ modelMode: "deterministic-only" }),
		).resolves.toMatchObject({
			kind: "failed",
			reason: "Consolidation source inventory is incomplete.",
			details: {
				declines: expect.arrayContaining([
					expect.objectContaining({
						code: "source-inventory-incomplete",
						count: 1,
					}),
				]),
			},
		});
	});

	test("full mode without a judgment provider fails without accepting a receipt", async () => {
		const { run, receipts } = fixture({ sources: [corpus()] });
		await expect(run()).resolves.toMatchObject({
			kind: "failed",
			reason: "Full living-memory consolidation requires a judgment provider.",
			details: { writesCommitted: false },
		});
		expect(receipts).toHaveLength(0);
	});

	test("failed persisted retirement recovery returns its reason and committed state without collecting", async () => {
		const collect = vi.fn(corpus().collect);
		const { run } = fixture({
			sources: [{ id: "corpus", collect }],
			retirementStore: {
				inspect: async () => {
					throw new Error("unexpected inspect");
				},
				apply: async () => ({
					kind: "failed",
					reason: "persisted restore conflicts",
					details: {
						retirements: [],
						declines: [],
						warnings: [],
						recovery: "rolled-back",
						writesCommitted: true,
					},
				}),
			},
		});
		await expect(run()).resolves.toMatchObject({
			kind: "failed",
			reason: "persisted restore conflicts",
			details: { recovery: "rolled-back", writesCommitted: true },
		});
		expect(collect).not.toHaveBeenCalled();
	});

	test("invalid model evidence fails before an accepted receipt is written", async () => {
		const { run, receipts } = fixture({
			sources: [corpus()],
			judgmentProvider: {
				id: "fixture",
				judge: async () => ({
					schemaVersion: 1,
					observations: [
						{
							kind: "duplicate",
							inputIds: ["unknown"],
							reason: "No matching record.",
						},
					],
				}),
			},
		});
		await expect(run()).resolves.toMatchObject({
			kind: "failed",
			details: { writesCommitted: false },
		});
		expect(receipts).toHaveLength(0);
	});

	test("a previously accepted judgment is replayed from the receipt rather than sent to the model", async () => {
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [],
		}));
		const { run, receipts } = fixture({
			sources: [corpus()],
			judgmentProvider: { id: "fixture", judge },
		});
		const first = await run();
		expect(first).toMatchObject({
			kind: "ran",
			details: {
				writesCommitted: true,
				acceptedJudgmentReceiptPath: expect.stringMatching(/^\/tmp\/.+\.json$/),
			},
		});
		expect(receipts).toHaveLength(1);
		expect(receipts[0]?.state).toBe("materialized");
		const second = await run();
		expect(second).toMatchObject({
			kind: "noop",
			details: { writesCommitted: false },
		});
		expect(judge).toHaveBeenCalledTimes(1);
		expect(receipts).toHaveLength(1);
	});

	test("a failed model-path retirement retains the accepted receipt and retirement reason", async () => {
		const root = await mkdtemp(join(tmpdir(), "run-pass-retirement-"));
		try {
			await mkdir(join(root, "knowledge"));
			await writeFile(join(root, "fixed.txt"), "fixed\n");
			await writeFile(
				join(root, "knowledge", "retire.md"),
				"---\ntype: gotcha\ntitle: Retire\ndescription: Fixed\nresource: knowledge/retire.md\nscope: project\n---\n\n# Retire when fixed\n",
			);
			const content = "# Retire when fixed\n";
			const record = {
				id: "retire",
				sourceId: "corpus",
				scope: "project" as const,
				path: "knowledge/retire.md",
				digest: createHash("sha256").update(content).digest("hex"),
				content,
				kind: "knowledge" as const,
				metadata: {
					type: "gotcha",
					title: "Retire",
					description: "Fixed",
					tags: ["memory"],
					scopeRoot: root,
					retireWhen: {
						condition: "fixed",
						check: { kind: "path-exists", path: "fixed.txt" },
					},
				},
			};
			const { run, receipts } = fixture({
				sources: [
					{
						id: "corpus",
						collect: async () => ({
							records: [record],
							knowledgeIndex: { records: [], warnings: [] },
							inventoryComplete: true,
							omitted: 0,
							deferred: 0,
						}),
					},
				],
				judgmentProvider: {
					id: "fixture",
					judge: async () => ({ schemaVersion: 1, observations: [] }),
				},
				retirementStore: {
					inspect: async () => ({
						recovery: "none",
						warnings: [],
						representedKeys: [],
					}),
					apply: async (input) =>
						input.candidates.length === 0
							? {
									kind: "completed",
									details: {
										retirements: [],
										declines: [],
										warnings: [],
										recovery: "none",
										writesCommitted: false,
									},
								}
							: {
									kind: "failed",
									reason: "retirement conflict",
									details: {
										retirements: [],
										declines: [],
										warnings: [],
										recovery: "rolled-back",
										writesCommitted: false,
									},
								},
				},
			});
			const result = await run();
			expect(result).toMatchObject({
				kind: "failed",
				reason: "retirement conflict",
				details: {
					writesCommitted: true,
					acceptedJudgmentReceiptPath: expect.any(String),
				},
			});
			expect(receipts).toHaveLength(1);
			expect(receipts[0]?.state).toBe("accepted");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("a missing episode finalizer fails after recording the accepted receipt and proposal", async () => {
		const episode = corpus();
		const { run, receipts } = fixture({
			sources: [
				{
					...episode,
					id: "episodes",
					async collect() {
						const snapshot = await episode.collect({
							limit: 50,
							representedKeys: [],
							maxCorpusRecordBytes: 65_536,
							maxCorpusBytes: 262_144,
							maxEpisodeRecordBytes: 65_536,
							maxEpisodeBytes: 262_144,
						});
						return {
							...snapshot,
							records: [
								...snapshot.records.map((record) => ({
									...record,
									sourceId: "episodes",
									kind: "episode" as const,
									path: "memory/agent/episodes/one.md",
								})),
								{
									id: "two",
									sourceId: "episodes",
									scope: "project" as const,
									path: "memory/agent/episodes/two.md",
									digest: createHash("sha256").update("# Two\n").digest("hex"),
									content: "# Two\n",
									kind: "episode" as const,
									metadata: {},
								},
							],
						};
					},
				},
			],
			proposalPath: "/tmp/proposals/note.md",
			judgmentProvider: {
				id: "fixture",
				judge: async () => ({
					schemaVersion: 1,
					observations: [
						{
							kind: "improvement",
							inputIds: ["one"],
							reason: "note",
							proposal: {
								proposalKind: "create",
								record: {
									type: "note",
									title: "Captured",
									description: "A note",
									content: "# Captured\n",
									tags: ["memory"],
								},
							},
						},
					],
				}),
			},
		});
		await expect(run()).resolves.toMatchObject({
			kind: "failed",
			reason: expect.stringContaining("cannot finalize represented records"),
			details: {
				writesCommitted: true,
				acceptedJudgmentReceiptPath: expect.any(String),
			},
		});
		expect(receipts[0]?.state).toBe("accepted");
	});

	test("an abort after model judgment does not materialize a receipt", async () => {
		const abort = new AbortController();
		const { run, receipts } = fixture({
			sources: [corpus()],
			judgmentProvider: {
				id: "fixture",
				async judge() {
					abort.abort();
					return { schemaVersion: 1, observations: [] };
				},
			},
		});
		await expect(run({ signal: abort.signal })).resolves.toMatchObject({
			kind: "failed",
			details: { writesCommitted: false },
		});
		expect(receipts).toHaveLength(0);
	});
});
