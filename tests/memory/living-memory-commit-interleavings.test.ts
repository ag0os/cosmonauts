import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type {
	ConsolidationProposalMaterialization,
	ConsolidationProposalStoreWithMaterializations,
} from "../../lib/memory/consolidation-proposals.ts";
import type { ConsolidationSourceRecord } from "../../lib/memory/consolidation-sources.ts";
import {
	type AcceptedJudgmentReceipt,
	type ConsolidationSource,
	type CorpusJudgmentProvider,
	createAcceptedJudgmentReceiptStore,
	createConsolidationProposalStore,
	createDurableMachineFiles,
	createDurableRetirementFiles,
	createLivingMemoryConsolidator,
	createProjectEpisodeConsolidationSource,
	DEFAULT_LIVING_MEMORY_LIMITS,
	type LivingMemoryConsolidatorDependencies,
} from "../../lib/memory/index.ts";
import { useTempDir } from "../helpers/fs.ts";

type FsOperation = (...args: never[]) => Promise<unknown>;

const fsFault = vi.hoisted(() => ({
	conflictContent: undefined as string | undefined,
	conflictLinkDestinationPath: undefined as string | undefined,
	failDirectory: undefined as string | undefined,
	failLinkDestinationRoot: undefined as string | undefined,
	failLinkMode: undefined as "directory-sync" | "temporary-unlink" | undefined,
	failUnlinkPath: undefined as string | undefined,
	receiptPath: undefined as string | undefined,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	return {
		...actual,
		async link(...args: never[]) {
			const destinationPath = String(args[1]);
			if (destinationPath === fsFault.conflictLinkDestinationPath) {
				await actual.writeFile(
					destinationPath,
					fsFault.conflictContent ?? "conflicting bytes\n",
					"utf-8",
				);
			}
			const result = await (actual.link as unknown as FsOperation)(...args);
			if (
				fsFault.failLinkDestinationRoot !== undefined &&
				destinationPath.startsWith(fsFault.failLinkDestinationRoot)
			) {
				if (fsFault.failLinkMode === "directory-sync") {
					fsFault.failDirectory = dirname(destinationPath);
				} else if (fsFault.failLinkMode === "temporary-unlink") {
					fsFault.failUnlinkPath = String(args[0]);
				}
			}
			return result;
		},
		async rename(...args: never[]) {
			const result = await (actual.rename as unknown as FsOperation)(...args);
			if (String(args[1]) === fsFault.receiptPath) {
				fsFault.failDirectory = dirname(String(args[1]));
			}
			return result;
		},
		async open(...args: never[]) {
			const handle = await (actual.open as unknown as FsOperation)(...args);
			if (String(args[0]) !== fsFault.failDirectory) return handle;
			fsFault.failDirectory = undefined;
			return new Proxy(handle as object, {
				get(target, property) {
					if (property === "sync") {
						return async () => {
							throw new Error(
								"simulated receipt parent-directory sync failure",
							);
						};
					}
					const value = Reflect.get(target, property, target);
					return typeof value === "function" ? value.bind(target) : value;
				},
			});
		},
		async unlink(...args: never[]) {
			if (String(args[0]) === fsFault.failUnlinkPath) {
				fsFault.failUnlinkPath = undefined;
				throw new Error("simulated temporary unlink failure");
			}
			return (actual.unlink as unknown as FsOperation)(...args);
		},
	};
});

const tmp = useTempDir("living-memory-commit-interleavings-");

afterEach(() => {
	fsFault.conflictContent = undefined;
	fsFault.conflictLinkDestinationPath = undefined;
	fsFault.failDirectory = undefined;
	fsFault.failLinkDestinationRoot = undefined;
	fsFault.failLinkMode = undefined;
	fsFault.failUnlinkPath = undefined;
	fsFault.receiptPath = undefined;
});

describe("living-memory committed-write interleavings", () => {
	test("does not tag an exclusive-write EEXIST identity conflict as committed", async () => {
		const directory = join(tmp.path, "exclusive-write-identity-conflict");
		const destinationPath = join(directory, "destination.md");
		await mkdir(directory, { recursive: true });
		fsFault.conflictContent = "racing winner bytes\n";
		fsFault.conflictLinkDestinationPath = destinationPath;
		let thrown: unknown;

		try {
			await createDurableMachineFiles().writeText({
				path: destinationPath,
				content: "losing writer bytes\n",
			});
		} catch (error: unknown) {
			thrown = error;
		}

		await expect(readFile(destinationPath, "utf-8")).resolves.toBe(
			"racing winner bytes\n",
		);
		expect(thrown).toMatchObject({
			message: `Durable file identity conflict at ${destinationPath}.`,
		});
		expect(thrown).not.toHaveProperty("writesCommitted", true);
	});

	test("tags a restored destination when its directory sync fails", async () => {
		const directory = join(tmp.path, "durable-restore-sync-failure");
		const sourcePath = join(directory, "source.tombstone");
		const destinationPath = join(directory, "destination.md");
		await mkdir(directory, { recursive: true });
		await writeFile(sourcePath, "restored bytes\n", "utf-8");
		fsFault.failLinkDestinationRoot = destinationPath;
		fsFault.failLinkMode = "directory-sync";
		let thrown: unknown;

		try {
			await createDurableMachineFiles().restoreFile({
				sourcePath,
				destinationPath,
			});
		} catch (error: unknown) {
			thrown = error;
		}

		await expect(readFile(sourcePath, "utf-8")).resolves.toBe(
			"restored bytes\n",
		);
		await expect(readFile(destinationPath, "utf-8")).resolves.toBe(
			"restored bytes\n",
		);
		expect(thrown).toMatchObject({
			message: "simulated receipt parent-directory sync failure",
			writesCommitted: true,
		});
	});

	test("tags a renamed destination when its directory sync fails", async () => {
		const directory = join(tmp.path, "durable-rename-sync-failure");
		const sourcePath = join(directory, "source.md");
		const destinationPath = join(directory, "destination.md");
		await mkdir(directory, { recursive: true });
		await writeFile(sourcePath, "renamed bytes\n", "utf-8");
		fsFault.receiptPath = destinationPath;
		let thrown: unknown;

		try {
			await createDurableMachineFiles().renameFile({
				sourcePath,
				destinationPath,
			});
		} catch (error: unknown) {
			thrown = error;
		}

		await expect(readFile(destinationPath, "utf-8")).resolves.toBe(
			"renamed bytes\n",
		);
		expect(thrown).toMatchObject({
			message: "simulated receipt parent-directory sync failure",
			writesCommitted: true,
		});
	});

	test("tags a linked destination when its directory sync fails", async () => {
		const directory = join(tmp.path, "durable-link-sync-failure");
		const sourcePath = join(directory, "source.md");
		const destinationPath = join(directory, "destination.md");
		await mkdir(directory, { recursive: true });
		await writeFile(sourcePath, "linked bytes\n", "utf-8");
		fsFault.failLinkDestinationRoot = destinationPath;
		fsFault.failLinkMode = "directory-sync";
		let thrown: unknown;

		try {
			await createDurableRetirementFiles().linkFile({
				sourcePath,
				destinationPath,
			});
		} catch (error: unknown) {
			thrown = error;
		}

		await expect(readFile(destinationPath, "utf-8")).resolves.toBe(
			"linked bytes\n",
		);
		expect(thrown).toMatchObject({
			message: "simulated receipt parent-directory sync failure",
			writesCommitted: true,
		});
	});

	test("reports an accepted receipt when its destination-directory sync fails", async () => {
		const projectRoot = join(tmp.path, "receipt-link-sync-failure");
		const records = [
			record({
				id: "receipt-link-input",
				sourceId: "corpus",
				path: "knowledge/receipt-link-input.md",
				kind: "knowledge",
				content: "# Receipt link input\n",
			}),
			record({
				id: "receipt-link-context",
				sourceId: "corpus",
				path: "knowledge/receipt-link-context.md",
				kind: "knowledge",
				content: "# Receipt link context\n",
			}),
		];
		const receiptStore = createAcceptedJudgmentReceiptStore({ projectRoot });
		fsFault.failLinkDestinationRoot = join(
			projectRoot,
			"memory/agent/consolidations",
		);
		fsFault.failLinkMode = "directory-sync";
		const judgmentProvider = {
			id: "fake/no-tools",
			judge: vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
				schemaVersion: 1,
				observations: [],
			})),
		};

		const result = await createHarness(
			[source("corpus", records)],
			judgmentProvider,
			{ acceptedJudgmentReceiptStore: receiptStore },
		)();

		const receipts = await receiptStore.list();
		expect(receipts).toHaveLength(1);
		expect(receipts[0]).toMatchObject({ state: "accepted" });
		expect(result).toMatchObject({
			kind: "failed",
			reason: "simulated receipt parent-directory sync failure",
			details: { writesCommitted: true },
		});
	});

	test("reports a deterministic proposal when temporary cleanup fails after linking", async () => {
		const projectRoot = join(tmp.path, "proposal-link-cleanup-failure");
		await mkdir(projectRoot, { recursive: true });
		const proposalRoot = join(
			projectRoot,
			"memory/agent/proposals/living-memory",
		);
		fsFault.failLinkDestinationRoot = proposalRoot;
		fsFault.failLinkMode = "temporary-unlink";
		const proposalStore = createConsolidationProposalStore({ projectRoot });
		const stale = ["first", "second"].map((suffix) =>
			record({
				id: `cleanup-stale-${suffix}`,
				sourceId: "corpus",
				path: `knowledge/cleanup-stale-${suffix}.md`,
				kind: "knowledge",
				content: `# Cleanup stale ${suffix}\n\n[Missing](../docs/missing-cleanup-${suffix}.md)\n`,
				metadata: {
					type: "gotcha",
					title: `Cleanup stale ${suffix}`,
					description: `Stale citation ${suffix} for cleanup failure.`,
					tags: ["memory"],
					scopeRoot: projectRoot,
				},
			}),
		);

		const result = await createHarness([source("corpus", stale)], undefined, {
			proposalStore,
		})({ modelMode: "deterministic-only" });

		const proposalFiles = (await readdir(proposalRoot)).filter(
			(entry) => !entry.startsWith(".") && entry.endsWith(".md"),
		);
		expect(proposalFiles).toHaveLength(1);
		await expect(
			readFile(join(proposalRoot, proposalFiles[0] ?? "missing"), "utf-8"),
		).resolves.toContain("proposalKind: merge");
		expect(result).toMatchObject({
			kind: "failed",
			reason: "simulated temporary unlink failure",
			details: { writesCommitted: true },
		});
	});

	test("retains the receipt commit when fail-closed validation rejects the written output", async () => {
		const records = ["input", "context"].map((suffix) =>
			record({
				id: `validation-${suffix}`,
				sourceId: "corpus",
				path: `knowledge/validation-${suffix}.md`,
				kind: "knowledge",
				content: `# Validation ${suffix}\n`,
			}),
		);
		const baseReceiptStore = inMemoryReceiptStore();
		const write = vi.fn<
			LivingMemoryConsolidatorDependencies["acceptedJudgmentReceiptStore"]["write"]
		>(async (receipt) => ({
			receipt: {
				...receipt,
				output: {
					schemaVersion: 1,
					observations: [
						{
							kind: "duplicate",
							inputIds: ["missing-after-write"],
							reason:
								"Exercise fail-closed validation after receipt acceptance.",
						},
					],
				},
			},
			writesCommitted: true,
		}));
		const judgmentProvider = {
			id: "fake/no-tools",
			judge: vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
				schemaVersion: 1,
				observations: [],
			})),
		};

		const result = await createHarness(
			[source("corpus", records)],
			judgmentProvider,
			{
				acceptedJudgmentReceiptStore: { ...baseReceiptStore, write },
			},
		)();

		expect(write).toHaveBeenCalledOnce();
		expect(result).toMatchObject({
			kind: "failed",
			reason:
				"Judgment output references unknown input id missing-after-write.",
			details: { writesCommitted: true },
		});
	});

	test("reports receipt materialization when its parent-directory sync fails", async () => {
		const projectRoot = join(tmp.path, "materialization-sync-failure");
		const input = record({
			id: "materialization-evidence",
			sourceId: "corpus",
			path: "knowledge/materialization.md",
			kind: "knowledge",
			content: "# Materialization evidence\n",
		});
		const context = record({
			id: "materialization-context",
			sourceId: "corpus",
			path: "knowledge/materialization-context.md",
			kind: "knowledge",
			content: "# Materialization context\n",
		});
		const records = [input, context];
		const receiptStore = createAcceptedJudgmentReceiptStore({ projectRoot });
		const proposalStore = createConsolidationProposalStore({ projectRoot });
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [
				{
					kind: "merge-candidate",
					inputIds: [input.id],
					reason: "Materialize the durable proposal.",
					proposal: {
						proposalKind: "create",
						record: proposed("Materialization sync failure"),
					},
				},
			],
		}));
		const judgmentProvider = { id: "fake/no-tools", judge };
		const interrupted = await createHarness(
			[source("corpus", records)],
			judgmentProvider,
			{
				acceptedJudgmentReceiptStore: receiptStore,
				proposalStore: {
					...proposalStore,
					async persist(proposalInput) {
						await proposalStore.persist(proposalInput);
						throw new Error("interrupt after proposal write");
					},
				},
			},
		)();
		const accepted = (await receiptStore.list()).find(
			(receipt) => receipt.state === "accepted",
		);
		if (accepted === undefined) {
			throw new Error(
				`missing accepted receipt fixture: ${JSON.stringify(interrupted)}`,
			);
		}
		fsFault.receiptPath = accepted.path;

		const result = await createHarness(
			[source("corpus", records)],
			judgmentProvider,
			{
				acceptedJudgmentReceiptStore: receiptStore,
				proposalStore,
			},
		)();

		expect(JSON.parse(await readFile(accepted.path, "utf-8"))).toMatchObject({
			state: "materialized",
		});
		expect(result).toMatchObject({
			kind: "failed",
			reason: "simulated receipt parent-directory sync failure",
			details: { writesCommitted: true },
		});
	});

	test("reports an earlier deterministic proposal when the next persist fails", async () => {
		const projectRoot = join(tmp.path, "deterministic-proposal-failure");
		await mkdir(projectRoot, { recursive: true });
		const records = ["first", "second"].map((suffix) =>
			record({
				id: `stale-${suffix}`,
				sourceId: "corpus",
				path: `knowledge/stale-${suffix}.md`,
				kind: "knowledge",
				content: `# Stale ${suffix}\n\n[Missing](../docs/missing-${suffix}.md)\n`,
				metadata: {
					type: "gotcha",
					title: `Stale ${suffix}`,
					description: `Stale citation ${suffix}.`,
					tags: ["memory"],
					scopeRoot: projectRoot,
				},
			}),
		);
		const proposalStore = createConsolidationProposalStore({ projectRoot });
		let persistCount = 0;
		let firstProposalPath: string | undefined;

		const result = await createHarness([source("corpus", records)], undefined, {
			proposalStore: {
				...proposalStore,
				async persist(input) {
					persistCount += 1;
					if (persistCount === 2) {
						throw new Error("simulated second deterministic proposal conflict");
					}
					const persisted = await proposalStore.persist(input);
					firstProposalPath = persisted.path;
					expect(persisted.status).toBe("written");
					return persisted;
				},
			},
		})({ modelMode: "deterministic-only" });

		if (firstProposalPath === undefined) {
			throw new Error(
				`missing first deterministic proposal path: ${JSON.stringify(result)}`,
			);
		}
		await expect(readFile(firstProposalPath, "utf-8")).resolves.toContain(
			"proposalKind: merge",
		);
		expect(result).toMatchObject({
			kind: "failed",
			reason: "simulated second deterministic proposal conflict",
			details: { writesCommitted: true },
		});
	});

	test("reports an earlier model proposal when the next persist fails", async () => {
		const projectRoot = join(tmp.path, "model-proposal-failure");
		const records = ["first", "second", "context"].map((suffix) =>
			record({
				id: `model-${suffix}`,
				sourceId: "corpus",
				path: `knowledge/model-${suffix}.md`,
				kind: "knowledge",
				content: `# Model ${suffix}\n`,
			}),
		);
		const receiptStore = createAcceptedJudgmentReceiptStore({ projectRoot });
		const proposalStore = createConsolidationProposalStore({ projectRoot });
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: records.slice(0, 2).map((input, index) => ({
				kind: "merge-candidate" as const,
				inputIds: [input.id],
				reason: `Persist model proposal ${index + 1}.`,
				proposal: {
					proposalKind: "create" as const,
					record: proposed(`Model proposal ${index + 1}`),
				},
			})),
		}));
		const judgmentProvider = { id: "fake/no-tools", judge };
		const seeded = await createHarness(
			[source("corpus", records)],
			judgmentProvider,
			{
				acceptedJudgmentReceiptStore: receiptStore,
				proposalStore: {
					...proposalStore,
					async persist() {
						throw new Error("interrupt after accepted receipt");
					},
				},
			},
		)();
		expect(seeded).toMatchObject({
			kind: "failed",
			reason: "interrupt after accepted receipt",
			details: { writesCommitted: true },
		});

		let persistCount = 0;
		let firstProposalPath: string | undefined;
		const result = await createHarness(
			[source("corpus", records)],
			judgmentProvider,
			{
				acceptedJudgmentReceiptStore: receiptStore,
				proposalStore: {
					...proposalStore,
					async persist(input) {
						persistCount += 1;
						if (persistCount === 2) {
							throw new Error("simulated second model proposal conflict");
						}
						const persisted = await proposalStore.persist(input);
						firstProposalPath = persisted.path;
						expect(persisted.status).toBe("written");
						return persisted;
					},
				},
			},
		)();

		if (firstProposalPath === undefined) {
			throw new Error(
				`missing first model proposal path: ${JSON.stringify(result)}`,
			);
		}
		await expect(readFile(firstProposalPath, "utf-8")).resolves.toContain(
			"proposalKind: create",
		);
		expect(result).toMatchObject({
			kind: "failed",
			reason: "simulated second model proposal conflict",
			details: { writesCommitted: true },
		});
		expect(judge).toHaveBeenCalledOnce();
	});

	test("reports a recovered episode prune when receipt materialization fails", async () => {
		const episode = record({
			id: "recovered-episode",
			sourceId: "episodes",
			path: "memory/agent/episodes/recovered-episode.md",
			kind: "episode",
			content: "# Recovered episode\n",
		});
		const batchKey = createHash("sha256")
			.update("recovered episode receipt")
			.digest("hex");
		const evidence = {
			id: episode.id,
			sourceId: episode.sourceId,
			scope: episode.scope,
			path: episode.path,
			digest: episode.digest,
		};
		const receipt: AcceptedJudgmentReceipt = {
			schemaVersion: 1,
			batchKey,
			state: "accepted",
			inputDigests: [episode.digest],
			inputs: [evidence],
			output: { schemaVersion: 1, observations: [] },
			path: `/tmp/${batchKey}.json`,
		};
		const proposal: ConsolidationProposalMaterialization = {
			proposalKind: "create",
			key: batchKey,
			path: "/tmp/recovered-proposal.md",
			inputs: [evidence],
			contentDigest: createHash("sha256").update("proposal").digest("hex"),
			status: "existing",
			outputType: "note",
		};
		const finalize = vi.fn(async () => ({
			episodePrunes: [episode.id],
			writesCommitted: true,
		}));
		const markMaterialized = vi.fn(async () => {
			throw new Error("simulated recovery receipt materialization failure");
		});
		const receiptStore = {
			pathFor: (key: string) => `/tmp/${key}.json`,
			list: async () => [receipt],
			dischargeStale: async () => ({ paths: [], writesCommitted: false }),
			read: async () => ({ receipt, writesCommitted: false }),
			write: async (input: AcceptedJudgmentReceipt) => ({
				receipt: input,
				writesCommitted: true,
			}),
			markMaterialized,
		};
		const episodeSource: ConsolidationSource = {
			id: "episodes",
			async collect() {
				return {
					records: [episode],
					inventoryComplete: true,
					omitted: 0,
					deferred: 0,
				};
			},
			finalize,
		};
		const recoveryProposalStore: ConsolidationProposalStoreWithMaterializations =
			{
				readEvidence: async () => proposal.inputs,
				readMaterializations: async () => [proposal],
				persist: async () => {
					throw new Error("unexpected proposal persist");
				},
			};

		const result = await createHarness([episodeSource], undefined, {
			acceptedJudgmentReceiptStore: receiptStore,
			proposalStore: recoveryProposalStore,
		})();

		expect(finalize).toHaveBeenCalledOnce();
		expect(markMaterialized).toHaveBeenCalledOnce();
		expect(result).toMatchObject({
			kind: "failed",
			reason: "simulated recovery receipt materialization failure",
			details: {
				episodePrunes: [episode.id],
				writesCommitted: true,
			},
		});
	});
});

function createHarness(
	sources: readonly ConsolidationSource[],
	judgmentProvider?: CorpusJudgmentProvider,
	overrides: Partial<
		Pick<
			LivingMemoryConsolidatorDependencies,
			"acceptedJudgmentReceiptStore" | "proposalStore"
		>
	> = {},
) {
	return createLivingMemoryConsolidator({
		lockPath: "/tmp/living-memory-commit-interleavings.lock",
		withLock: async <T>(_path: string, action: () => Promise<T>) => action(),
		sources,
		judgmentProvider,
		proposalStore: overrides.proposalStore ?? {
			readEvidence: async () => [],
			persist: async (input) => ({
				proposalKind: input.proposal.proposalKind,
				key: input.batchKey,
				inputs: input.observation.inputs,
				contentDigest: createHash("sha256")
					.update(JSON.stringify(input.proposal))
					.digest("hex"),
				status: input.dryRun ? ("preview" as const) : ("written" as const),
				writesCommitted: !input.dryRun,
			}),
		},
		acceptedJudgmentReceiptStore:
			overrides.acceptedJudgmentReceiptStore ?? inMemoryReceiptStore(),
		retirementStore: {
			inspect: async () => ({
				recovery: "none",
				warnings: [],
				representedKeys: [],
			}),
			apply: async () => ({
				kind: "completed",
				details: {
					retirements: [],
					declines: [],
					warnings: [],
					recovery: "none",
					writesCommitted: false,
				},
			}),
		},
		durableFiles: {
			writeText: async () => {
				throw new Error("unexpected direct durable write");
			},
		},
		indexPressure: {
			measure: () => ({
				kind: "measured",
				targetSatisfied: true,
				recordCount: 1,
				maxRecords: 50,
				renderedBytes: 1,
				guaranteedBytes: 8_000,
				headroomBytes: 7_999,
			}),
		},
		clock: () => new Date("2026-09-01T12:00:00.000Z"),
		limits: DEFAULT_LIVING_MEMORY_LIMITS,
		lockOptions: {
			retryMs: 50,
			timeoutMs: 10_000,
			onReleaseUnconfirmed: () => undefined,
		},
	});
}

function inMemoryReceiptStore() {
	return {
		pathFor: (batchKey: string) => `/tmp/${batchKey}.json`,
		list: async () => [],
		dischargeStale: async () => ({ paths: [], writesCommitted: false }),
		read: async () => ({ receipt: undefined, writesCommitted: false }),
		write: async (
			receipt: Parameters<
				LivingMemoryConsolidatorDependencies["acceptedJudgmentReceiptStore"]["write"]
			>[0],
		) => ({ receipt, writesCommitted: true }),
		markMaterialized: async (batchKey: string) => ({
			receipt: {
				schemaVersion: 1 as const,
				batchKey,
				state: "materialized" as const,
				inputDigests: [],
				output: { schemaVersion: 1 as const, observations: [] },
				path: `/tmp/${batchKey}.json`,
			},
			writesCommitted: true,
		}),
	};
}

function source(
	id: string,
	records: readonly ConsolidationSourceRecord[],
): ConsolidationSource {
	return {
		id,
		async collect() {
			return {
				records,
				inventoryComplete: true,
				knowledgeIndex: {
					records: records
						.filter((record) => record.kind === "knowledge")
						.map((record) => ({
							type: "decision" as const,
							scope: record.scope,
							kind: "semantic" as const,
							title: record.id,
							description: `${record.id} description.`,
							resource: record.path,
							tags: ["memory"],
							timestamp: "2026-09-01T12:00:00.000Z",
							content: "",
							path: record.path,
						})),
					warnings: [],
				},
				omitted: 0,
				deferred: 0,
			};
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

function proposed(title: string) {
	return {
		type: "decision" as const,
		title,
		description: `${title} description.`,
		content: `# ${title}\n\nComplete replacement.\n`,
		tags: ["memory"],
	};
}

describe("living-memory committed-write overstatement", () => {
	test("does not report a proposal publication this pass lost to an identical winner", async () => {
		const projectRoot = join(tmp.path, "proposal-identical-winner");
		const baseFiles = createDurableMachineFiles();
		let installedWinner = false;
		const proposalStore = createConsolidationProposalStore({
			projectRoot,
			durableFiles: {
				...baseFiles,
				async writeText(options) {
					if (!installedWinner) {
						installedWinner = true;
						await mkdir(dirname(options.path), { recursive: true });
						await writeFile(options.path, options.content, "utf-8");
					}
					return baseFiles.writeText(options);
				},
			},
		});

		const persisted = await proposalStore.persist(overstatementProposalInput());

		expect(installedWinner).toBe(true);
		expect(persisted.writesCommitted).toBe(false);
	});

	test("reports a proposal publication this pass actually linked", async () => {
		const projectRoot = join(tmp.path, "proposal-first-publication");
		const proposalStore = createConsolidationProposalStore({ projectRoot });

		const persisted = await proposalStore.persist(overstatementProposalInput());

		expect(persisted.status).toBe("written");
		expect(persisted.writesCommitted).toBe(true);
	});

	test("does not report an accepted receipt returned by the store's own pre-read", async () => {
		const projectRoot = join(tmp.path, "receipt-existing-pre-read");
		const receiptStore = createAcceptedJudgmentReceiptStore({ projectRoot });
		const batchKey = overstatementBatchKey("receipt-pre-read");
		const draft = overstatementReceiptDraft(
			batchKey,
			receiptStore.pathFor(batchKey),
		);

		const first = await receiptStore.write(draft);
		const second = await receiptStore.write(draft);

		expect(first.writesCommitted).toBe(true);
		expect(second.writesCommitted).toBe(false);
		expect(second.receipt).toEqual(first.receipt);
	});

	test("does not report an accepted receipt this pass lost to an identical winner", async () => {
		const projectRoot = join(tmp.path, "receipt-identical-winner");
		const baseFiles = createDurableMachineFiles();
		let installedWinner = false;
		const receiptStore = createAcceptedJudgmentReceiptStore({
			projectRoot,
			durableFiles: {
				...baseFiles,
				async writeText(options) {
					if (!installedWinner) {
						installedWinner = true;
						await mkdir(dirname(options.path), { recursive: true });
						await writeFile(options.path, options.content, "utf-8");
					}
					return baseFiles.writeText(options);
				},
			},
		});
		const batchKey = overstatementBatchKey("receipt-race");

		const written = await receiptStore.write(
			overstatementReceiptDraft(batchKey, receiptStore.pathFor(batchKey)),
		);

		expect(installedWinner).toBe(true);
		expect(written.writesCommitted).toBe(false);
	});

	test("does not report a stale discharge whose every removal was a no-op", async () => {
		const projectRoot = join(tmp.path, "discharge-already-removed");
		const batchKey = overstatementBatchKey("discharge-noop");
		const seedStore = createAcceptedJudgmentReceiptStore({ projectRoot });
		const stalePath = seedStore.pathFor(batchKey);
		await seedStore.write(overstatementReceiptDraft(batchKey, stalePath));
		await seedStore.markMaterialized(batchKey);

		const baseFiles = createDurableMachineFiles();
		const dischargeStore = createAcceptedJudgmentReceiptStore({
			projectRoot,
			durableFiles: {
				...baseFiles,
				async removeFile(path) {
					await baseFiles.removeFile(path);
					return baseFiles.removeFile(path);
				},
			},
		});

		const discharged = await dischargeStore.dischargeStale(
			overstatementDischargeInput(),
		);

		expect(discharged.paths).toEqual([stalePath]);
		expect(discharged.writesCommitted).toBe(false);
	});

	test("reports a stale discharge that actually removed the receipt", async () => {
		const projectRoot = join(tmp.path, "discharge-real-removal");
		const batchKey = overstatementBatchKey("discharge-real");
		const receiptStore = createAcceptedJudgmentReceiptStore({ projectRoot });
		const stalePath = receiptStore.pathFor(batchKey);
		await receiptStore.write(overstatementReceiptDraft(batchKey, stalePath));
		await receiptStore.markMaterialized(batchKey);

		const discharged = await receiptStore.dischargeStale(
			overstatementDischargeInput(),
		);

		expect(discharged.paths).toEqual([stalePath]);
		expect(discharged.writesCommitted).toBe(true);
	});

	test("does not report episode recovery whose journal removal was a no-op", async () => {
		const projectRoot = await overstatementEpisodeFixture(
			join(tmp.path, "episode-recovery-already-removed"),
		);
		const baseFiles = createDurableMachineFiles();
		const source = createProjectEpisodeConsolidationSource({
			projectRoot,
			durableFiles: {
				...baseFiles,
				async removeFile(path) {
					await baseFiles.removeFile(path);
					return baseFiles.removeFile(path);
				},
			},
		});

		const recovered = await source.recover?.();

		expect(recovered).toEqual({ episodePrunes: [], writesCommitted: false });
	});

	test("reports episode recovery that actually removed the journal", async () => {
		const projectRoot = await overstatementEpisodeFixture(
			join(tmp.path, "episode-recovery-real-removal"),
		);
		const source = createProjectEpisodeConsolidationSource({ projectRoot });

		const recovered = await source.recover?.();

		expect(recovered).toEqual({ episodePrunes: [], writesCommitted: true });
	});
});

function overstatementBatchKey(seed: string): string {
	return createHash("sha256").update(seed).digest("hex");
}

function overstatementProposalInput(): Parameters<
	ConsolidationProposalStoreWithMaterializations["persist"]
>[0] {
	const evidence = {
		id: "knowledge/overstatement.md",
		sourceId: "corpus",
		scope: "project" as const,
		path: "knowledge/overstatement.md",
		digest: "a".repeat(64),
	};
	return {
		batchKey: overstatementBatchKey("proposal-overstatement"),
		observation: {
			id: "deterministic-1",
			kind: "stale-reference" as const,
			inputs: [evidence],
			reason: "Fixture evidence.",
		},
		proposal: {
			proposalKind: "create" as const,
			record: {
				type: "decision" as const,
				title: "Overstatement probe",
				description: "Overstatement probe description.",
				content: "# Overstatement probe\n\nComplete replacement.\n",
				tags: ["memory"],
			},
		},
		dryRun: false,
	};
}

function overstatementReceiptDraft(
	batchKey: string,
	path: string,
): AcceptedJudgmentReceipt {
	return {
		schemaVersion: 1,
		batchKey,
		state: "accepted",
		inputDigests: Object.freeze(["b".repeat(64)]),
		output: { schemaVersion: 1, observations: [] },
		path,
	};
}

function overstatementDischargeInput() {
	return {
		currentKeys: Object.freeze([]),
		lockOptions: {
			retryMs: 50,
			timeoutMs: 10_000,
			onReleaseUnconfirmed: () => undefined,
		},
		lockHeld: true,
	};
}

async function overstatementEpisodeFixture(
	projectRoot: string,
): Promise<string> {
	const episodeDirectory = join(projectRoot, "memory", "agent", "episodes");
	await mkdir(episodeDirectory, { recursive: true });
	const content = "# Episode one\n";
	await writeFile(join(episodeDirectory, "episode-one.md"), content, "utf-8");
	await writeFile(
		join(episodeDirectory, ".living-memory-episode-prune.json"),
		`${JSON.stringify({
			schemaVersion: 1,
			originalPath: "memory/agent/episodes/episode-one.md",
			tombstonePath:
				"memory/agent/episodes/.episode-one.md.4f1d0f2e-0000-4000-8000-000000000000.tombstone",
			digest: createHash("sha256").update(content).digest("hex"),
			fileIdentity: { device: "1", inode: "2" },
		})}\n`,
		"utf-8",
	);
	return projectRoot;
}

describe("living-memory committed-write confirmation republication", () => {
	test("reports an existing proposal this pass had to republish", async () => {
		const projectRoot = join(tmp.path, "proposal-confirmation-republish");
		const input = overstatementProposalInput();
		await createConsolidationProposalStore({ projectRoot }).persist(input);

		const baseFiles = createDurableMachineFiles();
		let removedBeforeConfirmation = false;
		const republishing = createConsolidationProposalStore({
			projectRoot,
			durableFiles: {
				...baseFiles,
				async writeText(options) {
					if (!removedBeforeConfirmation) {
						removedBeforeConfirmation = true;
						await rm(options.path);
					}
					return baseFiles.writeText(options);
				},
			},
		});

		const persisted = await republishing.persist(input);

		expect(removedBeforeConfirmation).toBe(true);
		expect(persisted.status).toBe("existing");
		expect(persisted.writesCommitted).toBe(true);
	});

	test("reports an accepted receipt this pass had to republish while reading", async () => {
		const projectRoot = join(tmp.path, "receipt-read-republish");
		const batchKey = overstatementBatchKey("receipt-read");
		const seed = createAcceptedJudgmentReceiptStore({ projectRoot });
		await seed.write(
			overstatementReceiptDraft(batchKey, seed.pathFor(batchKey)),
		);

		const baseFiles = createDurableMachineFiles();
		let removedBeforeConfirmation = false;
		const republishing = createAcceptedJudgmentReceiptStore({
			projectRoot,
			durableFiles: {
				...baseFiles,
				async writeText(options) {
					if (!removedBeforeConfirmation) {
						removedBeforeConfirmation = true;
						await rm(options.path);
					}
					return baseFiles.writeText(options);
				},
			},
		});

		const read = await republishing.read(batchKey);

		expect(removedBeforeConfirmation).toBe(true);
		expect(read.receipt).toMatchObject({ batchKey, state: "accepted" });
		expect(read.writesCommitted).toBe(true);
	});

	test("reports an episode proposal republished before the episode-changed skip", async () => {
		const projectRoot = join(tmp.path, "episode-proposal-republish");
		const proposalPath = join(
			projectRoot,
			"memory/agent/proposals/living-memory/represented.md",
		);
		await mkdir(join(projectRoot, "memory/agent/episodes"), {
			recursive: true,
		});
		await mkdir(join(projectRoot, "memory/agent/proposals/living-memory"), {
			recursive: true,
		});
		await writeFile(proposalPath, "# Durable representation\n", "utf-8");

		const baseFiles = createDurableMachineFiles();
		let removedBeforeConfirmation = false;
		const source = createProjectEpisodeConsolidationSource({
			projectRoot,
			durableFiles: {
				...baseFiles,
				async writeText(options) {
					if (!removedBeforeConfirmation) {
						removedBeforeConfirmation = true;
						await rm(options.path);
					}
					return baseFiles.writeText(options);
				},
			},
		});

		// The episode itself is already gone, so finalization skips its journal and
		// prune work — which is exactly the path that used to return false having
		// just republished the proposal.
		const finalized = await source.finalize?.([
			{
				id: "memory/agent/episodes/vanished.md",
				digest: "c".repeat(64),
				fileIdentity: { device: "1", inode: "2" },
				proposalPaths: [proposalPath],
			},
		]);

		expect(removedBeforeConfirmation).toBe(true);
		expect(finalized).toEqual({ episodePrunes: [], writesCommitted: true });
	});
});

describe("living-memory consolidator carries the store-owned commit bit", () => {
	test("does not report a proposal the store persisted without committing", async () => {
		const projectRoot = join(tmp.path, "consumer-proposal-bit");
		await mkdir(projectRoot, { recursive: true });
		const persist = vi.fn(async (input: ProposalPersistInput) => ({
			proposalKind: input.proposal.proposalKind,
			key: input.batchKey,
			path: "/tmp/already-published.md",
			inputs: input.observation.inputs,
			contentDigest: createHash("sha256").update("body").digest("hex"),
			// The proposal exists and this pass published none of it.
			status: "written" as const,
			writesCommitted: false,
		}));

		const result = await createHarness(
			[
				source(
					"corpus",
					["first", "second"].map((suffix) =>
						staleCitationRecord(`consumer-proposal-${suffix}`, projectRoot),
					),
				),
			],
			undefined,
			{ proposalStore: { readEvidence: async () => [], persist } },
		)({ modelMode: "deterministic-only" });

		expect(persist).toHaveBeenCalled();
		expect(result).toMatchObject({ details: { writesCommitted: false } });
	});

	test("does not report a discharge that returned paths without removing them", async () => {
		const result = await createHarness(
			[source("corpus", [staleCitationRecord("consumer-discharge", tmp.path)])],
			undefined,
			{
				acceptedJudgmentReceiptStore: {
					...inMemoryReceiptStore(),
					dischargeStale: async () => ({
						paths: ["/tmp/already-removed.json"],
						writesCommitted: false,
					}),
				},
				proposalStore: {
					readEvidence: async () => [],
					persist: async (input) => ({
						proposalKind: input.proposal.proposalKind,
						key: input.batchKey,
						inputs: input.observation.inputs,
						contentDigest: createHash("sha256").update("body").digest("hex"),
						status: "preview" as const,
						writesCommitted: false,
					}),
				},
			},
		)({ modelMode: "deterministic-only", dryRun: false });

		expect(result).toMatchObject({ details: { writesCommitted: false } });
	});

	test("reports a receipt read that had to republish nothing else committed", async () => {
		const result = await createHarness(
			[source("corpus", judgedRecords("read-bit"))],
			acceptingJudge(),
			{
				acceptedJudgmentReceiptStore: {
					...nonCommittingReceiptStore(),
					read: async () => ({ receipt: undefined, writesCommitted: true }),
				},
				proposalStore: nonCommittingProposalStore(),
			},
		)();

		// The only committed write in this pass is the read's republication, so
		// dropping that bit at the consumer turns the result false.
		expect(result).toMatchObject({ details: { writesCommitted: true } });
	});

	test("does not report an accepted receipt the store returned without writing", async () => {
		const result = await createHarness(
			[source("corpus", judgedRecords("write-bit"))],
			acceptingJudge(),
			{
				acceptedJudgmentReceiptStore: nonCommittingReceiptStore(),
				proposalStore: nonCommittingProposalStore(),
			},
		)();

		// Every store operation reports false, so any consumer that asserts a
		// commit from a successful return turns the result true.
		expect(result).toMatchObject({ details: { writesCommitted: false } });
	});
});

function acceptingJudge(): CorpusJudgmentProvider {
	return {
		id: "fake/no-tools",
		judge: async () => ({ schemaVersion: 1, observations: [] }),
	};
}

/** No stale citation, so nothing is deterministic and the judgment path runs. */
function judgedRecords(suffix: string): readonly ConsolidationSourceRecord[] {
	return ["evidence", "context"].map((part) =>
		record({
			id: `consumer-${suffix}-${part}`,
			sourceId: "corpus",
			path: `knowledge/consumer-${suffix}-${part}.md`,
			kind: "knowledge",
			content: `# Consumer ${suffix} ${part}\n`,
		}),
	);
}

function nonCommittingProposalStore() {
	return {
		readEvidence: async () => [],
		persist: async (input: ProposalPersistInput) => ({
			proposalKind: input.proposal.proposalKind,
			key: input.batchKey,
			path: `/tmp/${input.batchKey}.md`,
			inputs: input.observation.inputs,
			contentDigest: createHash("sha256").update("body").digest("hex"),
			status: "existing" as const,
			writesCommitted: false,
		}),
	};
}

/** Every operation reports that it wrote nothing, so any inferred commit shows. */
function nonCommittingReceiptStore() {
	const base = inMemoryReceiptStore();
	return {
		...base,
		read: async () => ({ receipt: undefined, writesCommitted: false }),
		write: async (
			receipt: Parameters<
				LivingMemoryConsolidatorDependencies["acceptedJudgmentReceiptStore"]["write"]
			>[0],
		) => ({ receipt, writesCommitted: false }),
		markMaterialized: async (batchKey: string) => ({
			receipt: {
				schemaVersion: 1 as const,
				batchKey,
				state: "materialized" as const,
				inputDigests: [],
				output: { schemaVersion: 1 as const, observations: [] },
				path: `/tmp/${batchKey}.json`,
			},
			writesCommitted: false,
		}),
	};
}

type ProposalPersistInput = Parameters<
	LivingMemoryConsolidatorDependencies["proposalStore"]["persist"]
>[0];

function staleCitationRecord(
	id: string,
	scopeRoot: string,
): ConsolidationSourceRecord {
	return record({
		id,
		sourceId: "corpus",
		path: `knowledge/${id}.md`,
		kind: "knowledge",
		content: `# ${id}\n\n[Missing](../docs/missing-${id}.md)\n`,
		metadata: {
			type: "gotcha",
			title: id,
			description: `Stale citation for ${id}.`,
			tags: ["memory"],
			scopeRoot,
		},
	});
}
