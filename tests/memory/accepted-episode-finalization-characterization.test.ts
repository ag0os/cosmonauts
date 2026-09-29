import { createHash } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import type { ConsolidationProposalMaterialization } from "../../lib/memory/consolidation-proposals.ts";
import {
	type AcceptedJudgmentReceipt,
	type ConsolidationSource,
	type ConsolidationSourceRecord,
	createLivingMemoryConsolidator,
	DEFAULT_LIVING_MEMORY_LIMITS,
	type LivingMemoryConsolidatorDependencies,
} from "../../lib/memory/index.ts";

/**
 * Characterization of `recoverAcceptedEpisodeFinalization`, observed through
 * a non-dry-run consolidation pass: the recovery either short-circuits the
 * pass (`kind: "ran"` with the recovered proposals) or falls through.
 */

function sha(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function episode(
	name: string,
	overrides: Partial<ConsolidationSourceRecord> = {},
): ConsolidationSourceRecord {
	const path = `memory/agent/episodes/${name}.md`;
	const content = `# ${name}\n`;
	return {
		id: path,
		sourceId: "episodes",
		scope: "project",
		path,
		digest: sha(content),
		kind: "episode",
		content,
		fileIdentity: { device: "1", inode: name },
		metadata: {},
		...overrides,
	};
}

function receipt(
	batchKey: string,
	inputs: readonly ConsolidationSourceRecord[],
	overrides: Partial<AcceptedJudgmentReceipt> = {},
): AcceptedJudgmentReceipt {
	return {
		schemaVersion: 1,
		batchKey,
		state: "accepted",
		inputDigests: inputs.map((input) => input.digest),
		output: { schemaVersion: 1, observations: [] },
		path: `/tmp/consolidations/${batchKey}.json`,
		...overrides,
	};
}

function proposal(
	batchKey: string,
	inputs: readonly ConsolidationSourceRecord[],
	overrides: Partial<ConsolidationProposalMaterialization> = {},
): ConsolidationProposalMaterialization {
	return {
		proposalKind: "create",
		outputType: "note",
		key: batchKey,
		path: `/tmp/proposals/${batchKey}.md`,
		contentDigest: sha(batchKey),
		status: "existing",
		inputs: inputs.map((input) => ({
			id: input.id,
			sourceId: input.sourceId,
			scope: input.scope,
			path: input.path,
			digest: input.digest,
		})),
		...overrides,
	};
}

type Finalize = NonNullable<ConsolidationSource["finalize"]>;

function source(
	id: string,
	records: readonly ConsolidationSourceRecord[],
	finalize?: Finalize,
): ConsolidationSource {
	return {
		id,
		async collect() {
			return {
				records,
				inventory: records.map(({ content: _content, ...rest }) => rest),
				inventoryComplete: true,
				omitted: 0,
				deferred: 0,
			};
		},
		...(finalize === undefined ? {} : { finalize }),
	};
}

function prunes(...ids: string[]): ReturnType<Finalize> {
	return Promise.resolve({
		episodePrunes: Object.freeze(ids),
		writesCommitted: ids.length > 0,
	});
}

function run(options: {
	readonly sources: readonly ConsolidationSource[];
	readonly receipts: readonly AcceptedJudgmentReceipt[];
	readonly proposals: readonly ConsolidationProposalMaterialization[];
	readonly markMaterialized?: (batchKey: string) => Promise<void>;
	readonly dryRun?: boolean;
}) {
	const markMaterialized = vi.fn(async (batchKey: string) => {
		await options.markMaterialized?.(batchKey);
		const found = options.receipts.find((entry) => entry.batchKey === batchKey);
		return {
			receipt: {
				...(found as AcceptedJudgmentReceipt),
				state: "materialized" as const,
			},
			writesCommitted: true,
		};
	});
	const dependencies = {
		lockPath: "/tmp/living-memory.lock",
		withLock: async <T>(_path: string, action: () => Promise<T>) => action(),
		sources: options.sources,
		proposalStore: {
			readEvidence: vi.fn(async () =>
				options.proposals.flatMap((entry) => entry.inputs),
			),
			readMaterializations: vi.fn(async () => options.proposals),
			persist: vi.fn(async () => {
				throw new Error("persist is not expected");
			}),
		},
		acceptedJudgmentReceiptStore: {
			pathFor: (batchKey: string) => `/tmp/consolidations/${batchKey}.json`,
			list: vi.fn(async () => options.receipts),
			dischargeStale: vi.fn(async () => ({
				paths: [],
				writesCommitted: false,
			})),
			read: vi.fn(async () => ({ receipt: undefined, writesCommitted: false })),
			write: vi.fn(async (entry: AcceptedJudgmentReceipt) => ({
				receipt: entry,
				writesCommitted: true,
			})),
			markMaterialized,
		},
		retirementStore: {
			inspect: vi.fn(async () => ({
				recovery: "none" as const,
				warnings: [],
				representedKeys: [],
			})),
			apply: vi.fn(async () => ({
				kind: "completed" as const,
				details: {
					retirements: [],
					declines: [],
					warnings: [],
					recovery: "none" as const,
					writesCommitted: false,
				},
			})),
		},
		durableFiles: { writeText: vi.fn() },
		indexPressure: {
			measure: vi.fn(() => ({
				kind: "measured" as const,
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
	} as unknown as LivingMemoryConsolidatorDependencies;
	return {
		markMaterialized,
		result: createLivingMemoryConsolidator(dependencies)({
			modelMode: "deterministic-only",
			...(options.dryRun === undefined ? {} : { dryRun: options.dryRun }),
		}),
	};
}

describe("recoverAcceptedEpisodeFinalization (via consolidation pass)", () => {
	test("finalizes represented episodes, materializes the receipt, and short-circuits the pass", async () => {
		const one = episode("one");
		const finalize = vi.fn<Finalize>(() => prunes(one.id));
		const accepted = receipt("batch-a", [one]);
		const created = proposal("batch-a", [one]);
		const { result, markMaterialized } = run({
			sources: [source("episodes", [one], finalize)],
			receipts: [accepted],
			proposals: [created],
		});
		await expect(result).resolves.toMatchObject({
			kind: "ran",
			details: {
				proposals: [created],
				acceptedJudgmentReceiptPath: accepted.path,
				episodePrunes: [one.id],
				writesCommitted: true,
			},
		});
		expect(finalize).toHaveBeenCalledOnce();
		expect(finalize.mock.calls[0]?.[0]).toEqual([
			{
				id: one.id,
				digest: one.digest,
				fileIdentity: one.fileIdentity,
				proposalPaths: [created.path],
			},
		]);
		expect(Object.isFrozen(finalize.mock.calls[0]?.[0])).toBe(true);
		expect(markMaterialized).toHaveBeenCalledExactlyOnceWith("batch-a");
	});

	test("omits fileIdentity from the finalize request when the record has none", async () => {
		const one = episode("one");
		const { fileIdentity: _drop, ...bare } = one;
		const finalize = vi.fn<Finalize>(() => prunes());
		await run({
			sources: [source("episodes", [bare], finalize)],
			receipts: [receipt("batch-a", [bare])],
			proposals: [proposal("batch-a", [bare])],
		}).result;
		const request = finalize.mock.calls[0]?.[0][0];
		expect(request).toBeDefined();
		expect(request).not.toHaveProperty("fileIdentity");
	});

	test("reports recovered proposals without a receipt path when finalize prunes nothing", async () => {
		const one = episode("one");
		const finalize = vi.fn<Finalize>(() => prunes());
		const created = proposal("batch-a", [one]);
		const { result, markMaterialized } = run({
			sources: [source("episodes", [one], finalize)],
			receipts: [receipt("batch-a", [one])],
			proposals: [created],
		});
		const outcome = await result;
		expect(outcome).toMatchObject({
			kind: "ran",
			details: { proposals: [created], episodePrunes: [] },
		});
		expect(outcome.details).not.toHaveProperty("acceptedJudgmentReceiptPath");
		expect(markMaterialized).not.toHaveBeenCalled();
	});

	test("materializes a receipt only after every episode it represents is pruned", async () => {
		const one = episode("one");
		const two = episode("two");
		const accepted = receipt("batch-a", [one, two]);
		const created = proposal("batch-a", [one, two]);

		const partial = run({
			sources: [source("episodes", [one, two], () => prunes(one.id))],
			receipts: [accepted],
			proposals: [created],
		});
		const partialOutcome = await partial.result;
		expect(partialOutcome).toMatchObject({ kind: "ran" });
		expect(partialOutcome.details).not.toHaveProperty(
			"acceptedJudgmentReceiptPath",
		);
		expect(partial.markMaterialized).not.toHaveBeenCalled();

		const full = run({
			sources: [source("episodes", [one, two], () => prunes(one.id, two.id))],
			receipts: [accepted],
			proposals: [created],
		});
		await expect(full.result).resolves.toMatchObject({
			kind: "ran",
			details: { acceptedJudgmentReceiptPath: accepted.path },
		});
		expect(full.markMaterialized).toHaveBeenCalledExactlyOnceWith("batch-a");
	});

	test("groups every proposal path that represents one episode", async () => {
		const one = episode("one");
		const finalize = vi.fn<Finalize>(() => prunes(one.id));
		const first = proposal("batch-a", [one], {
			path: "/tmp/proposals/first.md",
		});
		const second = proposal("batch-a", [one], {
			path: "/tmp/proposals/second.md",
		});
		await run({
			sources: [source("episodes", [one], finalize)],
			receipts: [receipt("batch-a", [one])],
			proposals: [first, second],
		}).result;
		expect(finalize.mock.calls[0]?.[0]).toHaveLength(1);
		expect(finalize.mock.calls[0]?.[0][0]?.proposalPaths).toEqual([
			"/tmp/proposals/first.md",
			"/tmp/proposals/second.md",
		]);
	});

	test("keeps receipts independent and reports the first completed receipt's path", async () => {
		const one = episode("one");
		const two = episode("two");
		const receiptA = receipt("batch-a", [one]);
		const receiptB = receipt("batch-b", [two]);
		const { result, markMaterialized } = run({
			sources: [source("episodes", [one, two], () => prunes(two.id))],
			receipts: [receiptA, receiptB],
			proposals: [proposal("batch-a", [one]), proposal("batch-b", [two])],
		});
		await expect(result).resolves.toMatchObject({
			kind: "ran",
			details: {
				acceptedJudgmentReceiptPath: receiptB.path,
				proposals: [{ key: "batch-a" }, { key: "batch-b" }],
			},
		});
		expect(markMaterialized).toHaveBeenCalledExactlyOnceWith("batch-b");
	});

	test("finalizes only the sources that own represented episodes", async () => {
		const one = episode("one");
		const other = episode("other", { sourceId: "other-episodes" });
		const first = vi.fn<Finalize>(() => prunes(one.id));
		const second = vi.fn<Finalize>(() => prunes());
		await run({
			sources: [
				source("episodes", [one], first),
				source("other-episodes", [other], second),
			],
			receipts: [receipt("batch-a", [one])],
			proposals: [proposal("batch-a", [one])],
		}).result;
		expect(first).toHaveBeenCalledOnce();
		expect(second).not.toHaveBeenCalled();
	});

	test("recovers only the matching evidence of a proposal that also cites other records", async () => {
		const one = episode("one");
		const foreign = episode("foreign");
		const finalize = vi.fn<Finalize>(() => prunes(one.id));
		await run({
			sources: [source("episodes", [one], finalize)],
			receipts: [receipt("batch-a", [one])],
			proposals: [proposal("batch-a", [foreign, one])],
		}).result;
		expect(finalize.mock.calls[0]?.[0].map((entry) => entry.id)).toEqual([
			one.id,
		]);
	});

	test("fails the pass when a source with represented episodes cannot finalize", async () => {
		const one = episode("one");
		const { result, markMaterialized } = run({
			sources: [source("episodes", [one])],
			receipts: [receipt("batch-a", [one])],
			proposals: [proposal("batch-a", [one])],
		});
		await expect(result).resolves.toMatchObject({
			kind: "failed",
			reason: "Episode source episodes cannot finalize represented records.",
		});
		expect(markMaterialized).not.toHaveBeenCalled();
	});

	test("carries a finalize failure out as a failed pass without materializing", async () => {
		const one = episode("one");
		const { result, markMaterialized } = run({
			sources: [
				source("episodes", [one], () =>
					Promise.reject(new Error("prune failed")),
				),
			],
			receipts: [receipt("batch-a", [one])],
			proposals: [proposal("batch-a", [one])],
		});
		await expect(result).resolves.toMatchObject({
			kind: "failed",
			reason: "prune failed",
		});
		expect(markMaterialized).not.toHaveBeenCalled();
	});

	test("fails the pass when materializing the receipt fails after the prune committed", async () => {
		const one = episode("one");
		const { result } = run({
			sources: [source("episodes", [one], () => prunes(one.id))],
			receipts: [receipt("batch-a", [one])],
			proposals: [proposal("batch-a", [one])],
			markMaterialized: async () => {
				throw new Error("receipt write failed");
			},
		});
		await expect(result).resolves.toMatchObject({
			kind: "failed",
			reason: "receipt write failed",
			details: { episodePrunes: [one.id], writesCommitted: true },
		});
	});

	test("does not recover when the receipt is not accepted", async () => {
		const one = episode("one");
		const finalize = vi.fn<Finalize>(() => prunes(one.id));
		await expect(
			run({
				sources: [source("episodes", [one], finalize)],
				receipts: [receipt("batch-a", [one], { state: "materialized" })],
				proposals: [proposal("batch-a", [one])],
			}).result,
		).resolves.toMatchObject({ kind: "noop" });
		expect(finalize).not.toHaveBeenCalled();
	});

	test.each([
		[
			"a proposal keyed to no accepted receipt",
			(p: ConsolidationProposalMaterialization) => ({ ...p, key: "other" }),
		],
		[
			"a non-create proposal",
			(p: ConsolidationProposalMaterialization) => ({
				...p,
				proposalKind: "merge" as const,
			}),
		],
		[
			"a proposal with a non-note output",
			(p: ConsolidationProposalMaterialization) => ({
				...p,
				outputType: "decision" as const,
			}),
		],
		[
			"a proposal without an output type",
			({ outputType: _o, ...p }: ConsolidationProposalMaterialization) => p,
		],
	])("does not recover for %s", async (_name, mutate) => {
		const one = episode("one");
		const finalize = vi.fn<Finalize>(() => prunes(one.id));
		const { markMaterialized, result } = run({
			sources: [source("episodes", [one], finalize)],
			receipts: [receipt("batch-a", [one])],
			proposals: [mutate(proposal("batch-a", [one]))],
		});
		await expect(result).resolves.toMatchObject({ kind: "noop" });
		expect(finalize).not.toHaveBeenCalled();
		expect(markMaterialized).not.toHaveBeenCalled();
	});

	test("does not recover evidence outside the accepted receipt's digests", async () => {
		const one = episode("one");
		const finalize = vi.fn<Finalize>(() => prunes(one.id));
		await expect(
			run({
				sources: [source("episodes", [one], finalize)],
				receipts: [receipt("batch-a", [one], { inputDigests: [sha("other")] })],
				proposals: [proposal("batch-a", [one])],
			}).result,
		).resolves.toMatchObject({ kind: "noop" });
		expect(finalize).not.toHaveBeenCalled();
	});

	test.each([
		["a different source", { sourceId: "episodes-b" }],
		["a different record id", { id: "memory/agent/episodes/elsewhere.md" }],
		["a different digest", { digest: sha("changed") }],
		["a non-episode kind", { kind: "knowledge" as const }],
		["a user scope", { scope: "user" as const }],
	])("does not recover when the collected record is %s", async (_name, drift) => {
		const one = episode("one");
		const collected = episode("one", drift);
		const finalize = vi.fn<Finalize>(() => prunes(one.id));
		await run({
			sources: [
				source("episodes", [collected], finalize),
				source(
					"episodes-b",
					[],
					vi.fn<Finalize>(() => prunes()),
				),
			],
			receipts: [receipt("batch-a", [one])],
			proposals: [proposal("batch-a", [one])],
		}).result;
		expect(finalize).not.toHaveBeenCalled();
	});

	test("never recovers during a dry run", async () => {
		const one = episode("one");
		const finalize = vi.fn<Finalize>(() => prunes(one.id));
		const { markMaterialized, result } = run({
			sources: [source("episodes", [one], finalize)],
			receipts: [receipt("batch-a", [one])],
			proposals: [proposal("batch-a", [one])],
			dryRun: true,
		});
		await result;
		expect(finalize).not.toHaveBeenCalled();
		expect(markMaterialized).not.toHaveBeenCalled();
	});
});
