import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
	link,
	lstat,
	mkdir,
	readdir,
	readFile,
	rename,
	symlink,
	writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { createArchitectureMapMemoryStore } from "../../lib/architecture-map/index.ts";
import type { EntityFileLockOptions } from "../../lib/entity-file-lock.ts";
import { EntityFileLockTimeoutError } from "../../lib/entity-file-lock.ts";
import {
	createKnowledgeIndexPressurePolicy,
	renderKnowledgeIndex,
} from "../../lib/extensions/knowledge-surface/index-policy.ts";
import {
	createDurableRetirementFiles,
	type DurableRetirementFiles,
} from "../../lib/memory/durable-files.ts";
import {
	type AcceptedJudgmentReceipt,
	type ConsolidationSource,
	type ConsolidationSourceRecord,
	type CorpusJudgmentProvider,
	createAcceptedJudgmentReceiptStore,
	createConsolidationProposalStore,
	createDurableMachineFiles,
	createEpisodeRecord,
	createKnowledgeMemoryStore,
	createLivingMemoryConsolidator,
	createLivingMemoryRetirementStore,
	createMarkdownMemoryStore,
	createProjectCorpusConsolidationSource,
	createProjectEpisodeConsolidationSource,
	DEFAULT_LIVING_MEMORY_LIMITS,
	executeLivingMemoryConsolidationJob,
	inspectLivingMemoryCitationInventory,
	KNOWLEDGE_INDEX_RETRIEVAL,
	type KnowledgeConsolidator,
	type KnowledgeIndexPressurePolicy,
	type KnowledgeIndexRenderInput,
	type LivingMemoryConsolidatorDependencies,
	type LivingMemoryRetirementStore,
	type MemoryStore,
	type RetrievedMemoryRecord,
} from "../../lib/memory/index.ts";
import { parseHumanKnowledgeRecord } from "../../lib/memory/knowledge-records.ts";
import { readRetirementReceiptInventory } from "../../lib/memory/retirement-receipts.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("living-memory-");

describe("living memory", () => {
	// @cosmo-behavior plan:living-memory#B-002
	test("soft-retires an eligible record with a complete durable manifest entry", async () => {
		const { projectRoot, livePath, raw, digest, input } =
			await createRetirementFixture("authorized-retirement-project");
		const retiredPath = join(
			projectRoot,
			"knowledge",
			"retired",
			"eligible.md",
		);
		const harness = createHarness([source("corpus", [input])], undefined, {
			retirementStore: createLivingMemoryRetirementStore({ projectRoot }),
		});

		const result = await harness.consolidator({
			modelMode: "deterministic-only",
		});
		if (result.kind === "failed") throw new Error(result.reason);

		expect(result).toMatchObject({
			kind: "ran",
			details: {
				retirements: [
					{
						path: "knowledge/eligible.md",
						digest,
						status: "applied",
						reason: "retire-when-met",
					},
				],
				manifestPath: expect.stringContaining(
					"memory/agent/retirements/round-1.md",
				),
				writesCommitted: true,
			},
		});
		await expect(readFile(livePath)).rejects.toMatchObject({ code: "ENOENT" });
		await expect(readFile(retiredPath, "utf-8")).resolves.toBe(raw);
		await expect(
			readRetirementReceiptInventory({ projectRoot }),
		).resolves.toMatchObject({
			kind: "healthy",
			inventory: {
				retirementEvents: [
					{
						kind: "retired",
						path: "knowledge/eligible.md",
						digest,
						reason: "retire-when-met",
						date: "2026-09-01T12:00:00.000Z",
						evidence: [
							{
								scope: "project",
								path: "knowledge/eligible.md",
								digest,
							},
						],
					},
				],
			},
		});
	});

	test("preserves live bytes when a retirement source changes after manifest commit", async () => {
		for (const race of ["atomic-replace", "in-place-edit"] as const) {
			const fixture = await createRetirementFixture(`retirement-${race}`);
			const changed = `${fixture.raw}human change during retirement\n`;
			const retiredPath = join(
				fixture.projectRoot,
				"knowledge",
				"retired",
				"eligible.md",
			);
			const realDurable =
				createDurableRetirementFiles() as DurableRetirementFiles & {
					renameFile(options: {
						readonly sourcePath: string;
						readonly destinationPath: string;
					}): Promise<void>;
				};
			let racedAtTombstoneRename = false;
			const result = await createLivingMemoryRetirementStore({
				projectRoot: fixture.projectRoot,
				durableFiles: {
					...realDurable,
					async renameFile(options) {
						if (
							options.sourcePath === fixture.livePath &&
							!racedAtTombstoneRename
						) {
							racedAtTombstoneRename = true;
							const journal = JSON.parse(
								await readFile(
									join(
										fixture.projectRoot,
										".cosmonauts",
										"living-memory-retirement.json",
									),
									"utf-8",
								),
							) as { entries: Array<{ tombstonePath: string }> };
							expect(
								relativeFixturePath(
									fixture.projectRoot,
									options.destinationPath,
								),
							).toBe(journal.entries[0]?.tombstonePath);
							if (race === "atomic-replace") {
								const replacementPath = join(
									fixture.projectRoot,
									"knowledge",
									"replacement.tmp",
								);
								await writeFile(replacementPath, changed);
								await rename(replacementPath, fixture.livePath);
							} else {
								await writeFile(fixture.livePath, changed);
							}
						}
						await realDurable.renameFile(options);
					},
				},
			}).apply({
				candidates: [retirementCandidate(fixture.input)],
				dryRun: false,
				date: new Date("2026-09-01T12:00:00.000Z"),
				maxRetirements: 5,
				lockOptions: exactLockOptions(),
			});

			expect(racedAtTombstoneRename).toBe(true);
			expect(result).toMatchObject({
				kind: "failed",
				reason: expect.stringContaining("unlink conflict"),
				details: {
					declines: [
						expect.objectContaining({ code: "retirement-unlink-conflict" }),
					],
					recovery: "pending",
					writesCommitted: true,
				},
			});
			await expect(readFile(fixture.livePath, "utf-8")).resolves.toBe(changed);
			if (race === "atomic-replace") {
				await expect(readFile(retiredPath, "utf-8")).resolves.toBe(fixture.raw);
			}
			await expect(
				fileExists(
					join(
						fixture.projectRoot,
						".cosmonauts",
						"living-memory-retirement.json",
					),
				),
			).resolves.toBe(true);
			expect(
				(await readdir(join(fixture.projectRoot, "knowledge"))).filter((path) =>
					path.endsWith(".tombstone"),
				),
			).toEqual([]);
		}
	});

	test("recovery proves manifest durability and linked live identity before unlink", async () => {
		const unsynced = await createRetirementFixture(
			"recovery-visible-unsynced-manifest",
		);
		await expect(
			runRetirementChild(unsynced.projectRoot, "after-manifest-sync"),
		).resolves.toMatchObject({ code: 86, signal: null });
		const durableFiles = createDurableRetirementFiles();
		const unsyncedResult = await createLivingMemoryRetirementStore({
			projectRoot: unsynced.projectRoot,
			durableFiles: {
				...durableFiles,
				async confirmFileDurability(path) {
					if (path.endsWith("memory/agent/retirements/round-1.md")) {
						throw new Error("simulated manifest directory sync failure");
					}
					await durableFiles.confirmFileDurability(path);
				},
			},
		}).apply({
			candidates: [],
			dryRun: false,
			date: new Date("2026-09-01T12:00:00.000Z"),
			maxRetirements: 5,
			lockOptions: exactLockOptions(),
		});
		expect(unsyncedResult).toMatchObject({
			kind: "failed",
			reason: expect.stringContaining("manifest directory sync failure"),
			details: { recovery: "pending", writesCommitted: true },
		});
		await expect(readFile(unsynced.livePath, "utf-8")).resolves.toBe(
			unsynced.raw,
		);

		const replaced = await createRetirementFixture(
			"recovery-atomic-replaced-live",
		);
		await expect(
			runRetirementChild(replaced.projectRoot, "after-manifest-sync"),
		).resolves.toMatchObject({ code: 86, signal: null });
		const changed = `${replaced.raw}human atomic replacement\n`;
		const replacementPath = join(
			replaced.projectRoot,
			"knowledge",
			"replacement.tmp",
		);
		await writeFile(replacementPath, changed);
		await rename(replacementPath, replaced.livePath);
		const replacedResult = await createLivingMemoryRetirementStore({
			projectRoot: replaced.projectRoot,
		}).apply({
			candidates: [],
			dryRun: false,
			date: new Date("2026-09-01T12:00:00.000Z"),
			maxRetirements: 5,
			lockOptions: exactLockOptions(),
		});
		expect(replacedResult).toMatchObject({
			kind: "failed",
			reason: expect.stringContaining("unlink conflict"),
			details: { recovery: "pending", writesCommitted: true },
		});
		await expect(readFile(replaced.livePath, "utf-8")).resolves.toBe(changed);
	});

	test("recovery restores an unverified transaction tombstone", async () => {
		const fixture = await createRetirementFixture(
			"recovery-unverified-retirement-tombstone",
		);
		await expect(
			runRetirementChild(fixture.projectRoot, "after-live-tombstone-sync"),
		).resolves.toMatchObject({ code: 86, signal: null });
		await expect(fileExists(fixture.livePath)).resolves.toBe(false);
		const knowledgeEntries = await readdir(
			join(fixture.projectRoot, "knowledge"),
		);
		const tombstoneName = knowledgeEntries.find((path) =>
			path.endsWith(".tombstone"),
		);
		if (tombstoneName === undefined) {
			throw new Error("missing transaction tombstone");
		}
		const tombstonePath = join(fixture.projectRoot, "knowledge", tombstoneName);
		const changed = `${fixture.raw}human edit of captured bytes\n`;
		await writeFile(tombstonePath, changed);

		const recovered = await createLivingMemoryRetirementStore({
			projectRoot: fixture.projectRoot,
		}).apply({
			candidates: [],
			dryRun: false,
			date: new Date("2026-09-01T12:00:00.000Z"),
			maxRetirements: 5,
			lockOptions: exactLockOptions(),
		});

		expect(recovered).toMatchObject({
			kind: "failed",
			reason: expect.stringContaining("unlink conflict"),
			details: {
				recovery: "pending",
				writesCommitted: true,
				declines: [
					expect.objectContaining({ code: "retirement-unlink-conflict" }),
				],
			},
		});
		await expect(readFile(fixture.livePath, "utf-8")).resolves.toBe(changed);
		await expect(fileExists(tombstonePath)).resolves.toBe(false);
		await expect(
			fileExists(
				join(
					fixture.projectRoot,
					".cosmonauts",
					"living-memory-retirement.json",
				),
			),
		).resolves.toBe(true);
	});

	test("does not clobber a concurrently recreated live path during retirement restore", async () => {
		const fixture = await createRetirementFixture(
			"recovery-no-clobber-retirement-tombstone",
		);
		await expect(
			runRetirementChild(fixture.projectRoot, "after-live-tombstone-sync"),
		).resolves.toMatchObject({ code: 86, signal: null });
		const knowledgeDirectory = join(fixture.projectRoot, "knowledge");
		const tombstoneName = (await readdir(knowledgeDirectory)).find((path) =>
			path.endsWith(".tombstone"),
		);
		if (tombstoneName === undefined)
			throw new Error("missing transaction tombstone");
		const tombstonePath = join(knowledgeDirectory, tombstoneName);
		const changedTombstone = `${fixture.raw}changed captured bytes\n`;
		const replacementPath = `${tombstonePath}.replacement`;
		await writeFile(replacementPath, changedTombstone);
		await rename(replacementPath, tombstonePath);
		const concurrentLive = `${fixture.raw}concurrently recreated live bytes\n`;
		const realDurable = createDurableRetirementFiles();
		let racedAtRestore = false;

		const recovered = await createLivingMemoryRetirementStore({
			projectRoot: fixture.projectRoot,
			durableFiles: {
				...realDurable,
				async restoreFile(options) {
					if (!racedAtRestore) {
						racedAtRestore = true;
						await writeFile(options.destinationPath, concurrentLive);
					}
					return realDurable.restoreFile(options);
				},
			},
		}).apply({
			candidates: [],
			dryRun: false,
			date: new Date("2026-09-01T12:00:00.000Z"),
			maxRetirements: 5,
			lockOptions: exactLockOptions(),
		});

		expect(racedAtRestore).toBe(true);
		expect(recovered).toMatchObject({
			kind: "failed",
			reason: expect.stringMatching(/restore conflict|occupied/u),
			details: { recovery: "pending", writesCommitted: true },
		});
		await expect(readFile(fixture.livePath, "utf-8")).resolves.toBe(
			concurrentLive,
		);
		await expect(readFile(tombstonePath, "utf-8")).resolves.toBe(
			changedTombstone,
		);
		await expect(
			fileExists(
				join(
					fixture.projectRoot,
					".cosmonauts",
					"living-memory-retirement.json",
				),
			),
		).resolves.toBe(true);
	});

	test("recovers an uncommitted retirement hard-stopped after the restore link", async () => {
		const fixture = await createRetirementFixture(
			"recovery-half-restored-uncommitted-retirement",
		);
		await expect(
			runRetirementChild(fixture.projectRoot, "after-journal-sync"),
		).resolves.toMatchObject({ code: 86, signal: null });
		const journalPath = join(
			fixture.projectRoot,
			".cosmonauts",
			"living-memory-retirement.json",
		);
		const journal = JSON.parse(await readFile(journalPath, "utf-8")) as {
			entries: Array<{ tombstonePath: string }>;
		};
		const tombstoneRelativePath = journal.entries[0]?.tombstonePath;
		if (tombstoneRelativePath === undefined) {
			throw new Error("missing retirement tombstone path");
		}
		const tombstonePath = join(
			fixture.projectRoot,
			...tombstoneRelativePath.split("/"),
		);
		await rename(fixture.livePath, tombstonePath);

		await expect(
			runRetirementChild(fixture.projectRoot, "after-restore-link"),
		).resolves.toMatchObject({ code: 86, signal: null });
		const [liveIdentity, tombstoneIdentity] = await Promise.all([
			lstat(fixture.livePath),
			lstat(tombstonePath),
		]);
		expect([liveIdentity.dev, liveIdentity.ino]).toEqual([
			tombstoneIdentity.dev,
			tombstoneIdentity.ino,
		]);

		const store = createLivingMemoryRetirementStore({
			projectRoot: fixture.projectRoot,
		});
		const recovered = await store.apply({
			candidates: [],
			dryRun: false,
			date: new Date("2026-09-01T12:00:00.000Z"),
			maxRetirements: 5,
			lockOptions: exactLockOptions(),
		});
		expect(recovered).toMatchObject({
			kind: "completed",
			details: { recovery: "rolled-back", writesCommitted: false },
		});
		await expect(
			store.apply({
				candidates: [],
				dryRun: false,
				date: new Date("2026-09-01T12:00:00.000Z"),
				maxRetirements: 5,
				lockOptions: exactLockOptions(),
			}),
		).resolves.toMatchObject({
			kind: "completed",
			details: { recovery: "none", writesCommitted: false },
		});
		await expect(readFile(fixture.livePath, "utf-8")).resolves.toBe(
			fixture.raw,
		);
		await expect(fileExists(tombstonePath)).resolves.toBe(false);
		await expect(fileExists(journalPath)).resolves.toBe(false);
	});

	test("finishes a half-completed committed restore before reporting its semantic conflict", async () => {
		const fixture = await createRetirementFixture(
			"recovery-half-restored-committed-retirement",
		);
		await expect(
			runRetirementChild(fixture.projectRoot, "after-live-tombstone-sync"),
		).resolves.toMatchObject({ code: 86, signal: null });
		const knowledgeDirectory = join(fixture.projectRoot, "knowledge");
		const tombstoneName = (await readdir(knowledgeDirectory)).find((path) =>
			path.endsWith(".tombstone"),
		);
		if (tombstoneName === undefined) {
			throw new Error("missing committed retirement tombstone");
		}
		const tombstonePath = join(knowledgeDirectory, tombstoneName);
		const replacementPath = `${tombstonePath}.replacement`;
		await writeFile(replacementPath, fixture.raw);
		await rename(replacementPath, tombstonePath);
		await link(tombstonePath, fixture.livePath);

		const recovered = await createLivingMemoryRetirementStore({
			projectRoot: fixture.projectRoot,
		}).apply({
			candidates: [],
			dryRun: false,
			date: new Date("2026-09-01T12:00:00.000Z"),
			maxRetirements: 5,
			lockOptions: exactLockOptions(),
		});

		if (recovered.kind !== "failed") {
			throw new Error("expected the committed semantic conflict to remain");
		}
		expect(recovered).toMatchObject({
			kind: "failed",
			reason: expect.stringContaining("unlink conflict"),
			details: { recovery: "pending", writesCommitted: true },
		});
		expect(recovered.reason).not.toContain("live path is occupied");
		await expect(readFile(fixture.livePath, "utf-8")).resolves.toBe(
			fixture.raw,
		);
		await expect(fileExists(tombstonePath)).resolves.toBe(false);
	});

	// @cosmo-behavior plan:living-memory#B-004
	test("annotates a human restoration and reserves hard deletion for the ledger", async () => {
		const fixture = await createRetirementFixture("restoration-project");
		await expect(applyRetirementFixture(fixture)).resolves.toMatchObject({
			kind: "completed",
			details: { retirements: [{ status: "applied" }] },
		});
		const retiredPath = join(
			fixture.projectRoot,
			"knowledge",
			"retired",
			"eligible.md",
		);
		await rename(retiredPath, fixture.livePath);
		const realDurable = createDurableRetirementFiles();
		const durableFiles = {
			...realDurable,
			linkFile: vi.fn(realDurable.linkFile),
			removeFile: vi.fn(realDurable.removeFile),
		} satisfies DurableRetirementFiles;
		const store = createLivingMemoryRetirementStore({
			projectRoot: fixture.projectRoot,
			durableFiles,
		});

		const restored = await store.restore({
			path: "knowledge/eligible.md",
			reason: "The owner vetoed this retirement.",
			date: new Date("2026-09-01T13:00:00.000Z"),
			lockOptions: exactLockOptions(),
		});

		expect(restored).toMatchObject({
			kind: "completed",
			details: {
				path: "knowledge/eligible.md",
				digest: fixture.digest,
				status: "restored",
				manifestPath: expect.stringContaining(
					"memory/agent/retirements/round-2.md",
				),
				recovery: "none",
				writesCommitted: true,
			},
		});
		await expect(readFile(fixture.livePath, "utf-8")).resolves.toBe(
			fixture.raw,
		);
		await expect(readFile(retiredPath)).rejects.toMatchObject({
			code: "ENOENT",
		});
		expect(durableFiles.linkFile).not.toHaveBeenCalled();
		expect(durableFiles.removeFile).not.toHaveBeenCalled();
		await expect(
			readRetirementReceiptInventory({ projectRoot: fixture.projectRoot }),
		).resolves.toMatchObject({
			kind: "healthy",
			inventory: {
				retirementStates: [
					expect.objectContaining({
						path: "knowledge/eligible.md",
						status: "restored",
						digest: fixture.digest,
					}),
				],
			},
		});
		const retrieved = await createKnowledgeMemoryStore({
			projectRoot: fixture.projectRoot,
		}).retrieve({ projectRoot: fixture.projectRoot, scopes: ["project"] }, {});
		expect(retrieved.records).toEqual([
			expect.objectContaining({
				resource: "eligible.md",
				content: expect.stringContaining("# Inventory fixture"),
			}),
		]);
		await expect(applyRetirementFixture(fixture)).resolves.toMatchObject({
			kind: "completed",
			details: {
				retirements: [],
				declines: [expect.objectContaining({ code: "restoration-suppressed" })],
			},
		});

		await expect(
			store.restore({
				path: "knowledge/eligible.md",
				reason: "The owner vetoed this retirement.",
				date: new Date("2026-09-01T14:00:00.000Z"),
				lockOptions: exactLockOptions(),
			}),
		).resolves.toMatchObject({
			kind: "completed",
			details: { status: "existing", writesCommitted: false },
		});
		await expect(
			store.restore({
				path: "knowledge/eligible.md",
				reason: "A conflicting retry reason.",
				date: new Date("2026-09-01T14:00:00.000Z"),
				lockOptions: exactLockOptions(),
			}),
		).resolves.toMatchObject({
			kind: "failed",
			reason: expect.stringContaining("conflict"),
		});
		expect(
			await readdir(
				join(fixture.projectRoot, "memory", "agent", "retirements"),
			),
		).toEqual(["round-1.md", "round-2.md"]);

		const notMoved = await createRetirementFixture("restoration-not-moved");
		await applyRetirementFixture(notMoved);
		await expect(
			createLivingMemoryRetirementStore({
				projectRoot: notMoved.projectRoot,
			}).restore({
				path: "knowledge/eligible.md",
				reason: "The bytes were not moved back.",
				date: new Date("2026-09-01T13:00:00.000Z"),
				lockOptions: exactLockOptions(),
			}),
		).resolves.toMatchObject({ kind: "failed" });

		const mismatched = await createRetirementFixture("restoration-mismatch");
		await applyRetirementFixture(mismatched);
		const mismatchedRetired = join(
			mismatched.projectRoot,
			"knowledge",
			"retired",
			"eligible.md",
		);
		await rename(mismatchedRetired, mismatched.livePath);
		await writeFile(mismatched.livePath, `${mismatched.raw}changed\n`);
		await expect(
			createLivingMemoryRetirementStore({
				projectRoot: mismatched.projectRoot,
			}).restore({
				path: "knowledge/eligible.md",
				reason: "Mismatched bytes must fail.",
				date: new Date("2026-09-01T13:00:00.000Z"),
				lockOptions: exactLockOptions(),
			}),
		).resolves.toMatchObject({
			kind: "failed",
			reason: expect.stringContaining("digest"),
		});

		const raced = await createRetirementFixture("restoration-race");
		await applyRetirementFixture(raced);
		await rename(
			join(raced.projectRoot, "knowledge", "retired", "eligible.md"),
			raced.livePath,
		);
		const raceDurable = createDurableRetirementFiles();
		let mutateBeforeCommit = true;
		const racedResult = await createLivingMemoryRetirementStore({
			projectRoot: raced.projectRoot,
			durableFiles: {
				...raceDurable,
				async ensureDirectory(path) {
					await raceDurable.ensureDirectory(path);
					if (path.endsWith("memory/agent/retirements") && mutateBeforeCommit) {
						mutateBeforeCommit = false;
						await writeFile(
							raced.livePath,
							`${raced.raw}changed during restore\n`,
						);
					}
				},
			},
		}).restore({
			path: "knowledge/eligible.md",
			reason: "A concurrent edit must not receive a restoration receipt.",
			date: new Date("2026-09-01T13:00:00.000Z"),
			lockOptions: exactLockOptions(),
		});
		expect(racedResult).toMatchObject({
			kind: "failed",
			reason: expect.stringContaining("race"),
			details: { writesCommitted: false },
		});
		expect(
			await readdir(join(raced.projectRoot, "memory", "agent", "retirements")),
		).toEqual(["round-1.md"]);

		const timedOut = await createRetirementFixture("restoration-timeout");
		await applyRetirementFixture(timedOut);
		await rename(
			join(timedOut.projectRoot, "knowledge", "retired", "eligible.md"),
			timedOut.livePath,
		);
		const timeoutResult = await createLivingMemoryRetirementStore({
			projectRoot: timedOut.projectRoot,
			async withLock(lockPath, _action, options = {}) {
				expect(options).toMatchObject({
					retryDelayMs: 50,
					waitTimeoutMs: 10_000,
				});
				throw new EntityFileLockTimeoutError(lockPath, 10_000);
			},
		}).restore({
			path: "knowledge/eligible.md",
			reason: "A timed-out command must fail closed.",
			date: new Date("2026-09-01T13:00:00.000Z"),
			lockOptions: exactLockOptions(),
		});
		expect(timeoutResult).toMatchObject({
			kind: "failed",
			details: { recovery: "concurrent-mutation", writesCommitted: false },
		});

		const cancelled = await createRetirementFixture("restoration-cancelled");
		await applyRetirementFixture(cancelled);
		await rename(
			join(cancelled.projectRoot, "knowledge", "retired", "eligible.md"),
			cancelled.livePath,
		);
		const cancelledLock = vi.fn();
		const controller = new AbortController();
		controller.abort();
		await expect(
			createLivingMemoryRetirementStore({
				projectRoot: cancelled.projectRoot,
				withLock: cancelledLock,
			}).restore({
				path: "knowledge/eligible.md",
				reason: "Cancellation must happen before mutation.",
				date: new Date("2026-09-01T13:00:00.000Z"),
				signal: controller.signal,
				lockOptions: exactLockOptions(),
			}),
		).resolves.toMatchObject({
			kind: "failed",
			details: { writesCommitted: false },
		});
		expect(cancelledLock).not.toHaveBeenCalled();

		const release = await createRetirementFixture("restoration-release");
		await applyRetirementFixture(release);
		await rename(
			join(release.projectRoot, "knowledge", "retired", "eligible.md"),
			release.livePath,
		);
		const releaseResult = await createLivingMemoryRetirementStore({
			projectRoot: release.projectRoot,
			async withLock(_lockPath, action, options = {}) {
				const result = await action();
				options.onReleaseUnconfirmed?.(new Error("fixture release failure"));
				return result;
			},
		}).restore({
			path: "knowledge/eligible.md",
			reason: "The owner restored this record.",
			date: new Date("2026-09-01T13:00:00.000Z"),
			lockOptions: exactLockOptions(),
		});
		expect(releaseResult).toMatchObject({
			kind: "failed",
			reason: expect.stringContaining("release could not be confirmed"),
			details: { recovery: "release-unconfirmed", writesCommitted: true },
		});
		await expect(
			readFile(
				join(
					release.projectRoot,
					"memory",
					"agent",
					"retirements",
					"round-2.md",
				),
				"utf-8",
			),
		).resolves.toContain("kind: restored");

		const hardDeleteRoot = join(tmp.path, "human-hard-delete-project");
		await mkdir(join(hardDeleteRoot, "missions", "reviews"), {
			recursive: true,
		});
		await writeFile(
			join(
				hardDeleteRoot,
				"missions",
				"reviews",
				"knowledge-surface-promotion-1.md",
			),
			[
				"---",
				"kind: knowledge-surface-promotion",
				"round: 1",
				"promotedCount: 0",
				"promotions: []",
				"curatedRecords: []",
				"retiredRecords:",
				"  - knowledge/deleted.md",
				"ratifiedBaselines: []",
				"---",
				"",
			].join("\n"),
		);
		await expect(
			readRetirementReceiptInventory({ projectRoot: hardDeleteRoot }),
		).resolves.toMatchObject({
			kind: "healthy",
			inventory: { retiredRecords: ["knowledge/deleted.md"] },
		});
	});

	// @cosmo-behavior plan:living-memory#B-011
	test("previews only a stable snapshot and observes pending recovery without mutating it", async () => {
		const stable = await createRetirementFixture("stable-dry-run-project");
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [],
		}));
		const stableHarness = createHarness(
			[source("corpus", [stable.input])],
			{ id: "fake/no-tools", judge },
			{
				retirementStore: createLivingMemoryRetirementStore({
					projectRoot: stable.projectRoot,
				}),
			},
		);
		const before = await readFile(stable.livePath, "utf-8");
		await expect(
			stableHarness.consolidator({
				dryRun: true,
				modelMode: "deterministic-only",
			}),
		).resolves.toMatchObject({
			kind: "ran",
			details: {
				retirements: [
					{
						path: "knowledge/eligible.md",
						status: "preview",
					},
				],
				recovery: "none",
				writesCommitted: false,
			},
		});
		await expect(readFile(stable.livePath, "utf-8")).resolves.toBe(before);
		await expect(
			readFile(join(stable.projectRoot, ".cosmonauts", "living-memory.lock")),
		).rejects.toMatchObject({ code: "ENOENT" });
		await expect(
			readFile(
				join(
					stable.projectRoot,
					"memory",
					"agent",
					"retirements",
					"round-1.md",
				),
			),
		).rejects.toMatchObject({ code: "ENOENT" });

		const pending = await createRetirementFixture("pending-dry-run-project");
		const journalPath = join(
			pending.projectRoot,
			".cosmonauts",
			"living-memory-retirement.json",
		);
		await mkdir(join(pending.projectRoot, ".cosmonauts"), { recursive: true });
		await writeFile(journalPath, "pending recovery fixture\n");
		const pendingHarness = createHarness(
			[source("corpus", [pending.input])],
			{ id: "fake/no-tools", judge },
			{
				retirementStore: createLivingMemoryRetirementStore({
					projectRoot: pending.projectRoot,
				}),
			},
		);
		await expect(
			pendingHarness.consolidator({
				dryRun: true,
				modelMode: "deterministic-only",
			}),
		).resolves.toMatchObject({
			kind: "failed",
			details: { recovery: "pending", writesCommitted: false },
		});
		await expect(readFile(journalPath, "utf-8")).resolves.toBe(
			"pending recovery fixture\n",
		);

		const locked = await createRetirementFixture("locked-dry-run-project");
		const lockPath = join(
			locked.projectRoot,
			".cosmonauts",
			"living-memory.lock",
		);
		await mkdir(join(locked.projectRoot, ".cosmonauts"), { recursive: true });
		const lockBytes = `${JSON.stringify({
			pid: process.pid,
			uuid: "live-owner",
			startedAt: "2026-09-01T12:00:00.000Z",
		})}\n`;
		await writeFile(lockPath, lockBytes);
		const lockedHarness = createHarness(
			[source("corpus", [locked.input])],
			{ id: "fake/no-tools", judge },
			{
				retirementStore: createLivingMemoryRetirementStore({
					projectRoot: locked.projectRoot,
				}),
			},
		);
		await expect(
			lockedHarness.consolidator({
				dryRun: true,
				modelMode: "deterministic-only",
			}),
		).resolves.toMatchObject({
			kind: "failed",
			details: { recovery: "concurrent-mutation", writesCommitted: false },
		});
		await expect(readFile(lockPath, "utf-8")).resolves.toBe(lockBytes);

		const changed = await createRetirementFixture("changed-dry-run-project");
		let changedDuringObservation = false;
		const changedHarness = createHarness(
			[source("corpus", [changed.input])],
			{ id: "fake/no-tools", judge },
			{
				retirementStore: createLivingMemoryRetirementStore({
					projectRoot: changed.projectRoot,
					async inspectCitations() {
						if (!changedDuringObservation) {
							changedDuringObservation = true;
							await writeFile(changed.livePath, `${changed.raw}changed\n`);
						}
						return { healthy: true, entries: [], warnings: [] };
					},
				}),
			},
		);
		await expect(
			changedHarness.consolidator({
				dryRun: true,
				modelMode: "deterministic-only",
			}),
		).resolves.toMatchObject({
			kind: "failed",
			reason: expect.stringContaining("snapshot changed"),
			details: { recovery: "concurrent-mutation", writesCommitted: false },
		});
		expect(judge).not.toHaveBeenCalled();
	});

	test("bounds direct retirement-store dry-run previews and defers the remainder", async () => {
		const fixture = await createRetirementFixture("direct-store-dry-run-cap");
		const candidate = retirementCandidate(fixture.input);

		const result = await createLivingMemoryRetirementStore({
			projectRoot: fixture.projectRoot,
		}).apply({
			candidates: [candidate, candidate],
			dryRun: true,
			date: new Date("2026-09-01T12:00:00.000Z"),
			maxRetirements: 1,
			lockOptions: exactLockOptions(),
		});

		expect(result).toMatchObject({
			kind: "completed",
			details: {
				retirements: [{ status: "preview" }],
				declines: [
					expect.objectContaining({
						code: "retirement-cap-deferred",
						path: "knowledge/eligible.md",
					}),
				],
				writesCommitted: false,
			},
		});
	});

	test("skips candidate authorization during a clean empty retirement recovery", async () => {
		const projectRoot = join(tmp.path, "empty-retirement-recovery");
		const inspectCitations = vi.fn(async () => ({
			healthy: true,
			entries: [],
			warnings: [],
		}));
		const result = await createLivingMemoryRetirementStore({
			projectRoot,
			inspectCitations,
		}).apply({
			candidates: [],
			dryRun: false,
			date: new Date("2026-09-01T12:00:00.000Z"),
			maxRetirements: 5,
			lockOptions: exactLockOptions(),
		});

		expect(result).toMatchObject({
			kind: "completed",
			details: {
				retirements: [],
				declines: [],
				warnings: [],
				recovery: "none",
				writesCommitted: false,
			},
		});
		expect(inspectCitations).not.toHaveBeenCalled();
	});

	test("freshly revalidates retirement receipts and citations under the lock", async () => {
		const fixture = await createRetirementFixture(
			"fresh-under-lock-retirement-evidence",
		);
		let lockHeld = false;
		async function withLock<T>(
			_lockPath: string,
			action: () => Promise<T>,
			_options: EntityFileLockOptions = {},
		): Promise<T> {
			lockHeld = true;
			try {
				return await action();
			} finally {
				lockHeld = false;
			}
		}
		const inspectCitations = vi.fn(async () => {
			expect(lockHeld).toBe(true);
			return { healthy: true, entries: [], warnings: [] };
		});
		const store = createLivingMemoryRetirementStore({
			projectRoot: fixture.projectRoot,
			inspectCitations,
			withLock,
		});

		await expect(store.inspect([fixture.input])).resolves.toMatchObject({
			recovery: "none",
		});
		await writeFile(
			join(
				fixture.projectRoot,
				"missions",
				"reviews",
				"knowledge-surface-promotion-2.md",
			),
			curationLedger(fixture.input.path),
		);

		await expect(
			store.apply({
				candidates: [retirementCandidate(fixture.input)],
				dryRun: false,
				date: new Date("2026-09-01T12:00:00.000Z"),
				maxRetirements: 5,
				lockOptions: exactLockOptions(),
			}),
		).resolves.toMatchObject({
			kind: "completed",
			details: {
				retirements: [],
				declines: [
					expect.objectContaining({
						code: "retirement-baseline-conflict",
					}),
				],
			},
		});
		expect(inspectCitations).toHaveBeenCalledOnce();
	});

	// @cosmo-behavior plan:living-memory#B-015
	test("recovers hard-stopped retirement at every durable commit boundary", async () => {
		const cases = [
			["after-journal-sync", "rolled-back", true, false],
			["after-retired-link-sync", "rolled-back", true, false],
			["after-manifest-sync", "rolled-forward", false, true],
			["after-live-tombstone-sync", "rolled-forward", false, true],
			["after-live-unlink-sync", "rolled-forward", false, true],
			["before-journal-remove", "rolled-forward", false, true],
		] as const;
		for (const [failpoint, recovery, liveExists, manifestExists] of cases) {
			const fixture = await createRetirementFixture(
				`hard-stop-${failpoint}-project`,
			);
			const child = await runRetirementChild(fixture.projectRoot, failpoint);
			expect(child).toMatchObject({ code: 86, signal: null });

			const recovered = await createLivingMemoryRetirementStore({
				projectRoot: fixture.projectRoot,
				inspectCitations: async () => ({
					healthy: true,
					entries: [],
					warnings: [],
				}),
			}).apply({
				candidates: [],
				dryRun: false,
				date: new Date("2026-09-01T12:00:00.000Z"),
				maxRetirements: 5,
				lockOptions: exactLockOptions(),
			});
			expect(recovered).toMatchObject({
				kind: "completed",
				details: {
					recovery,
					writesCommitted: recovery === "rolled-forward",
				},
			});
			await expect(fileExists(fixture.livePath)).resolves.toBe(liveExists);
			await expect(
				fileExists(
					join(fixture.projectRoot, "knowledge", "retired", "eligible.md"),
				),
			).resolves.toBe(!liveExists);
			await expect(
				fileExists(
					join(
						fixture.projectRoot,
						"memory",
						"agent",
						"retirements",
						"round-1.md",
					),
				),
			).resolves.toBe(manifestExists);
			await expect(
				fileExists(
					join(
						fixture.projectRoot,
						".cosmonauts",
						"living-memory-retirement.json",
					),
				),
			).resolves.toBe(false);
		}

		const ordinaryPreCommit = await createRetirementFixture(
			"ordinary-pre-commit-project",
		);
		const preCommitDurable = createDurableRetirementFiles();
		const preCommitFailure = await createLivingMemoryRetirementStore({
			projectRoot: ordinaryPreCommit.projectRoot,
			durableFiles: {
				...preCommitDurable,
				async linkFile() {
					throw new Error("ordinary pre-commit link failure");
				},
			},
		}).apply({
			candidates: [retirementCandidate(ordinaryPreCommit.input)],
			dryRun: false,
			date: new Date("2026-09-01T12:00:00.000Z"),
			maxRetirements: 5,
			lockOptions: exactLockOptions(),
		});
		expect(preCommitFailure).toMatchObject({
			kind: "failed",
			details: { recovery: "rolled-back", writesCommitted: false },
		});
		await expect(readFile(ordinaryPreCommit.livePath, "utf-8")).resolves.toBe(
			ordinaryPreCommit.raw,
		);

		const ordinaryPostCommit = await createRetirementFixture(
			"ordinary-post-commit-project",
		);
		const postCommitDurable = createDurableRetirementFiles();
		let failLiveRemoval = true;
		const postCommitFailure = await createLivingMemoryRetirementStore({
			projectRoot: ordinaryPostCommit.projectRoot,
			durableFiles: {
				...postCommitDurable,
				async renameFile(options) {
					await postCommitDurable.renameFile(options);
					if (
						options.sourcePath === ordinaryPostCommit.livePath &&
						failLiveRemoval
					) {
						failLiveRemoval = false;
						throw new Error("ordinary post-commit tombstone failure");
					}
				},
			},
		}).apply({
			candidates: [retirementCandidate(ordinaryPostCommit.input)],
			dryRun: false,
			date: new Date("2026-09-01T12:00:00.000Z"),
			maxRetirements: 5,
			lockOptions: exactLockOptions(),
		});
		expect(postCommitFailure).toMatchObject({
			kind: "failed",
			details: { recovery: "rolled-forward", writesCommitted: true },
		});
		await expect(fileExists(ordinaryPostCommit.livePath)).resolves.toBe(false);

		const terminalCleanup = await createRetirementFixture(
			"terminal-cleanup-project",
		);
		const terminalDurable = createDurableRetirementFiles();
		let failTerminalCleanup = true;
		const terminalFailure = await createLivingMemoryRetirementStore({
			projectRoot: terminalCleanup.projectRoot,
			durableFiles: {
				...terminalDurable,
				async removeFile(path) {
					const removal = await terminalDurable.removeFile(path);
					if (
						path.endsWith("living-memory-retirement.json") &&
						failTerminalCleanup
					) {
						failTerminalCleanup = false;
						throw new Error("terminal journal directory sync is unconfirmed");
					}
					return removal;
				},
			},
		}).apply({
			candidates: [retirementCandidate(terminalCleanup.input)],
			dryRun: false,
			date: new Date("2026-09-01T12:00:00.000Z"),
			maxRetirements: 5,
			lockOptions: exactLockOptions(),
		});
		expect(terminalFailure).toMatchObject({
			kind: "failed",
			details: { recovery: "pending", writesCommitted: true },
		});

		const timeout = await createRetirementFixture("retirement-timeout-project");
		async function timeoutLock<T>(
			lockPath: string,
			_action: () => Promise<T>,
			options: EntityFileLockOptions = {},
		): Promise<T> {
			expect(options).toMatchObject({
				retryDelayMs: 50,
				waitTimeoutMs: 10_000,
			});
			throw new EntityFileLockTimeoutError(lockPath, 10_000);
		}
		const timedOut = await createLivingMemoryRetirementStore({
			projectRoot: timeout.projectRoot,
			withLock: timeoutLock,
		}).apply({
			candidates: [retirementCandidate(timeout.input)],
			dryRun: false,
			date: new Date("2026-09-01T12:00:00.000Z"),
			maxRetirements: 5,
			lockOptions: exactLockOptions(),
		});
		expect(timedOut).toMatchObject({
			kind: "failed",
			details: {
				recovery: "concurrent-mutation",
				writesCommitted: false,
			},
		});
		await expect(readFile(timeout.livePath, "utf-8")).resolves.toBe(
			timeout.raw,
		);

		const release = await createRetirementFixture(
			"retirement-release-unconfirmed-project",
		);
		let criticalSections = 0;
		async function releaseUnconfirmedLock<T>(
			_lockPath: string,
			action: () => Promise<T>,
			options: EntityFileLockOptions = {},
		): Promise<T> {
			criticalSections += 1;
			const result = await action();
			options.onReleaseUnconfirmed?.(new Error("fixture release failure"));
			return result;
		}
		const releaseResult = await createLivingMemoryRetirementStore({
			projectRoot: release.projectRoot,
			withLock: releaseUnconfirmedLock,
		}).apply({
			candidates: [retirementCandidate(release.input)],
			dryRun: false,
			date: new Date("2026-09-01T12:00:00.000Z"),
			maxRetirements: 5,
			lockOptions: exactLockOptions(),
		});
		expect(releaseResult).toMatchObject({
			kind: "failed",
			reason: expect.stringContaining("release could not be confirmed"),
			details: {
				recovery: "release-unconfirmed",
				writesCommitted: true,
			},
		});
		expect(criticalSections).toBe(1);
		await expect(fileExists(release.livePath)).resolves.toBe(false);
		await expect(
			readFile(
				join(release.projectRoot, "knowledge", "retired", "eligible.md"),
				"utf-8",
			),
		).resolves.toBe(release.raw);
	});

	// @cosmo-behavior plan:living-memory#B-017
	test("preserves profile authored memory and curated bytes across a full pass", async () => {
		const fixture = await createRetirementFixture("preservation-pass-project");
		const userRoot = join(tmp.path, "preservation-pass-user");
		const profilePath = join(userRoot, "memory", "profile.md");
		const authoredPath = join(
			fixture.projectRoot,
			"memory",
			"authored",
			"note.md",
		);
		const keepPath = join(fixture.projectRoot, "knowledge", "keep.md");
		const blockedPath = join(fixture.projectRoot, "knowledge", "blocked.md");
		const stalePath = join(fixture.projectRoot, "knowledge", "stale.md");
		await mkdir(dirname(profilePath), { recursive: true });
		await mkdir(dirname(authoredPath), { recursive: true });
		await writeFile(profilePath, "PROFILE_BYTES_MUST_STAY_IDENTICAL\n");
		await writeFile(authoredPath, "AUTHORED_BYTES_MUST_STAY_IDENTICAL\n");
		const keepRaw = knowledgeFixture({ resource: "keep.md" });
		const blockedRaw = knowledgeFixture({ resource: "blocked.md" });
		const staleRaw = knowledgeFixture({ resource: "stale.md" }).replace(
			"Body.",
			"The removed guide was `docs/missing-retirement-guide.md`.",
		);
		await writeFile(keepPath, keepRaw);
		await writeFile(blockedPath, blockedRaw);
		await writeFile(stalePath, staleRaw);
		const blocked = record({
			id: "blocked",
			sourceId: "corpus",
			path: "knowledge/blocked.md",
			kind: "knowledge",
			content: blockedRaw,
			metadata: {
				type: "gotcha",
				retireWhen: {
					condition: "The replacement file exists.",
					check: { kind: "path-exists", path: "fixed.txt" },
				},
				scopeRoot: fixture.projectRoot,
			},
		});
		const stale = record({
			id: "stale",
			sourceId: "corpus",
			path: "knowledge/stale.md",
			kind: "knowledge",
			content: staleRaw,
			metadata: {
				type: "gotcha",
				title: "Inventory fixture",
				description: "Inventory fixture record.",
				tags: ["memory"],
				scopeRoot: fixture.projectRoot,
			},
		});
		const syncEvents: string[] = [];
		const realDurable = createDurableRetirementFiles();
		const observedDurable = {
			...realDurable,
			async writeText(options) {
				const result = await realDurable.writeText(options);
				if (options.path.endsWith("memory/agent/retirements/round-1.md")) {
					syncEvents.push("manifest-synced");
				}
				return result;
			},
			async removeFile(path) {
				const removal = await realDurable.removeFile(path);
				if (path.endsWith(".tombstone")) {
					syncEvents.push("tombstone-removed");
				}
				return removal;
			},
		} satisfies DurableRetirementFiles;
		const proposalStore = createConsolidationProposalStore({
			projectRoot: fixture.projectRoot,
		});
		const harness = createHarness(
			[source("corpus", [fixture.input, blocked, stale])],
			undefined,
			{
				proposalStore,
				retirementStore: createLivingMemoryRetirementStore({
					projectRoot: fixture.projectRoot,
					userCosmonautsRoot: userRoot,
					durableFiles: observedDurable,
				}),
			},
		);
		const preserved = new Map(
			await Promise.all(
				[profilePath, authoredPath, keepPath, blockedPath, stalePath].map(
					async (path) => [path, await readFile(path)] as const,
				),
			),
		);

		const result = await harness.consolidator({
			modelMode: "deterministic-only",
		});

		expect(result).toMatchObject({
			kind: "ran",
			details: {
				proposals: [{ proposalKind: "merge", status: "written" }],
				retirements: [
					{
						path: "knowledge/eligible.md",
						status: "applied",
					},
				],
				declines: expect.arrayContaining([
					expect.objectContaining({
						code: "retirement-baseline-conflict",
						path: "knowledge/blocked.md",
					}),
				]),
			},
		});
		for (const [path, bytes] of preserved) {
			await expect(readFile(path)).resolves.toEqual(bytes);
		}
		await expect(
			readFile(
				join(fixture.projectRoot, "knowledge", "retired", "eligible.md"),
			),
		).resolves.toEqual(Buffer.from(fixture.raw));
		expect(syncEvents).toEqual(["manifest-synced", "tombstone-removed"]);
		if (
			result.kind !== "ran" ||
			result.details.proposals[0]?.path === undefined
		) {
			throw new Error("expected the deterministic replacement proposal");
		}
		const proposal = await readFile(result.details.proposals[0].path, "utf-8");
		expect(proposal).toContain(
			"stale reference: docs/missing-retirement-guide.md",
		);
		for (const path of [keepPath, blockedPath, stalePath]) {
			expect(await readFile(path, "utf-8")).not.toContain(
				"stale reference: docs/missing-retirement-guide.md",
			);
		}
	});

	test("revalidates exact baselines citations digests and manifest-state guards under the lock", async () => {
		const promotion = await createRetirementFixture(
			"promotion-baseline-project",
		);
		await writeFile(
			join(
				promotion.projectRoot,
				"missions",
				"reviews",
				"knowledge-surface-promotion-1.md",
			),
			promotionBaselineLedger({
				path: "knowledge/eligible.md",
				digest: promotion.digest,
			}),
		);
		await expect(applyRetirementFixture(promotion)).resolves.toMatchObject({
			kind: "completed",
			details: { retirements: [{ status: "applied" }] },
		});

		const capped = await createRetirementFixture("retirement-cap-project");
		const capResult = await createLivingMemoryRetirementStore({
			projectRoot: capped.projectRoot,
		}).apply({
			candidates: Array.from({ length: 6 }, () =>
				retirementCandidate(capped.input),
			),
			dryRun: false,
			date: new Date("2026-09-01T12:00:00.000Z"),
			maxRetirements: 5,
			lockOptions: exactLockOptions(),
		});
		expect(capResult).toMatchObject({
			kind: "failed",
			reason: expect.stringContaining("bounded cap"),
			details: { writesCommitted: false },
		});
		await expect(readFile(capped.livePath, "utf-8")).resolves.toBe(capped.raw);

		const laterCurated = await createRetirementFixture(
			"later-curated-baseline-project",
		);
		await writeFile(
			join(
				laterCurated.projectRoot,
				"missions",
				"reviews",
				"knowledge-surface-promotion-2.md",
			),
			curationLedger("knowledge/eligible.md"),
		);
		await expect(applyRetirementFixture(laterCurated)).resolves.toMatchObject({
			kind: "completed",
			details: {
				retirements: [],
				declines: [
					expect.objectContaining({ code: "retirement-baseline-conflict" }),
				],
			},
		});
		await expect(readFile(laterCurated.livePath, "utf-8")).resolves.toBe(
			laterCurated.raw,
		);

		const inbound = await createRetirementFixture("inbound-citation-project");
		await mkdir(join(inbound.projectRoot, "docs"), { recursive: true });
		await writeFile(
			join(inbound.projectRoot, "docs", "reference.md"),
			"Keep [the knowledge](../knowledge/eligible.md).\n",
		);
		await expect(applyRetirementFixture(inbound)).resolves.toMatchObject({
			kind: "completed",
			details: {
				declines: [
					expect.objectContaining({ code: "retirement-inbound-citation" }),
				],
			},
		});

		const incomplete = await createRetirementFixture(
			"incomplete-citation-project",
		);
		await mkdir(join(incomplete.projectRoot, "docs"), { recursive: true });
		await writeFile(
			join(incomplete.projectRoot, "docs", "escaping.md"),
			"[escape](../../outside.md)\n",
		);
		await expect(applyRetirementFixture(incomplete)).resolves.toMatchObject({
			kind: "completed",
			details: {
				declines: [
					expect.objectContaining({ code: "citation-inventory-incomplete" }),
				],
			},
		});

		const changed = await createRetirementFixture("changed-digest-project");
		await writeFile(changed.livePath, `${changed.raw}later curation\n`);
		await expect(applyRetirementFixture(changed)).resolves.toMatchObject({
			kind: "completed",
			details: {
				declines: [
					expect.objectContaining({ code: "retirement-digest-conflict" }),
				],
			},
		});

		const incompleteEvidence = await createRetirementFixture(
			"incomplete-evidence-project",
		);
		await expect(
			applyRetirementFixture(incompleteEvidence, {
				candidate: {
					...retirementCandidate(incompleteEvidence.input),
					evidence: [],
				},
			}),
		).resolves.toMatchObject({
			kind: "completed",
			details: {
				declines: [
					expect.objectContaining({ code: "retirement-evidence-incomplete" }),
				],
			},
		});

		const active = await createRetirementFixture("active-retired-project");
		await writeManifestHistory(active, false);
		await expect(applyRetirementFixture(active)).resolves.toMatchObject({
			kind: "completed",
			details: {
				declines: [
					expect.objectContaining({ code: "restoration-in-progress" }),
				],
			},
		});

		const restored = await createRetirementFixture(
			"restored-suppressed-project",
		);
		await writeManifestHistory(restored, true);
		await expect(applyRetirementFixture(restored)).resolves.toMatchObject({
			kind: "completed",
			details: {
				declines: [expect.objectContaining({ code: "restoration-suppressed" })],
			},
		});

		const changedRestored = await createRetirementFixture(
			"changed-restored-project",
		);
		await writeManifestHistory(changedRestored, true);
		const changedRestoredRaw = `${changedRestored.raw}new ratified bytes\n`;
		const changedRestoredDigest = createHash("sha256")
			.update(changedRestoredRaw)
			.digest("hex");
		await writeFile(changedRestored.livePath, changedRestoredRaw);
		await writeFile(
			join(
				changedRestored.projectRoot,
				"missions",
				"reviews",
				"knowledge-surface-promotion-1.md",
			),
			promotionLedger({
				path: "knowledge/eligible.md",
				digest: changedRestoredDigest,
			}),
		);
		const changedRestoredInput = {
			...changedRestored.input,
			content: changedRestoredRaw,
			digest: changedRestoredDigest,
		};
		await expect(
			applyRetirementFixture({
				...changedRestored,
				input: changedRestoredInput,
			}),
		).resolves.toMatchObject({
			kind: "completed",
			details: { retirements: [{ status: "applied" }] },
		});
	});

	test("fails closed when hard links or directory sync are unsupported", async () => {
		for (const capability of ["hard-link", "directory-sync"] as const) {
			const fixture = await createRetirementFixture(
				`unsupported-${capability}-project`,
			);
			const realDurable = createDurableRetirementFiles();
			const operations: string[] = [];
			const unsupported = {
				...realDurable,
				async assertRemovalSupported() {
					operations.push(`unsupported:${capability}`);
					throw new Error(`${capability} capability is unsupported`);
				},
				async linkFile(options) {
					operations.push(`link:${options.destinationPath}`);
					await realDurable.linkFile(options);
				},
				async removeFile(path) {
					operations.push(`remove:${path}`);
					return realDurable.removeFile(path);
				},
			} satisfies DurableRetirementFiles;
			const result = await createLivingMemoryRetirementStore({
				projectRoot: fixture.projectRoot,
				durableFiles: unsupported,
			}).apply({
				candidates: [retirementCandidate(fixture.input)],
				dryRun: false,
				date: new Date("2026-09-01T12:00:00.000Z"),
				maxRetirements: 5,
				lockOptions: exactLockOptions(),
			});
			expect(result).toMatchObject({
				kind: "failed",
				reason: expect.stringContaining("unsupported"),
				details: { writesCommitted: false },
			});
			expect(operations).toEqual([`unsupported:${capability}`]);
			await expect(readFile(fixture.livePath, "utf-8")).resolves.toBe(
				fixture.raw,
			);
			await expect(
				fileExists(
					join(fixture.projectRoot, "knowledge", "retired", "eligible.md"),
				),
			).resolves.toBe(false);
		}
	});

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
		const rejectedBacktickCitations = [
			{
				class: "dotted code identifiers",
				values: [
					"Bun.spawn",
					"Promise.race",
					"JSON.parse",
					"Type.Object",
					"Type.Union",
					"pi.exec",
					"analysis.provider",
					"options.client",
					"query.recordTypes",
					"scope.projectRoot",
					"MemoryQuery.recordTypes",
					"episodicLog.enabled",
					"drive.run",
					"autonomy.wake",
					"MemoryWriteResult.failed",
					"RetrievedMemoryRecord.source",
				],
			},
			{
				class: "slash-namespaced identifiers without file extensions",
				values: [
					"cod" + "ing/worker",
					"main/cosmo",
					"cod" + "ing/quality-manager",
					"example/worker",
					"cosmonauts/cli",
					"knowledge/url",
				],
			},
			{
				class: "brace expansions, globs, and placeholders",
				values: [
					"lib/config/{types,loader}.ts",
					"lib/memory/{types,okf,paths,markdown-store,index}.ts",
					"bundled/cod" + "ing/prompts/{spec-writer,planner}.md",
					"tests/driver/*",
					"memory/**",
					"missions/**",
					".cosmonauts/*.lock",
					"docs/fallow*.md",
					"node_modules/.bin/<tool>",
					"@fallow-cli/<platform>/fallow",
					`\${role}-<uuid>.jsonl`,
					"<userRoot>/memory/agent/profile.md",
					"review-<n>.md",
					"review-round-N.md",
					"missions/reviews/review-round-N.md",
					"~/.cosmonauts",
				],
			},
			{
				class: "git rev ranges and elided paths",
				values: [
					"main..HEAD",
					"51ef662..HEAD",
					"round-1..3",
					".../references/plan-format.md",
				],
			},
			{
				class: "separator-less names and bare extensions",
				values: [
					"types.ts",
					"index.md",
					"config.json",
					"qm.md",
					"store.ts",
					"generator.ts",
					".md",
				],
			},
			{
				class: "line-suffixed source locations",
				values: ["lib/tasks/file-system.ts:105"],
			},
		] as const;
		const rejectedTokens = rejectedBacktickCitations.flatMap(
			(entry) => entry.values,
		);
		const acceptedBacktickCitations = [
			"lib/missing-backtick.ts",
			"memory/episodic-log.md",
		] as const;
		const codeRegionOnlyCitations = [
			"docs/missing-inline-example.md",
			"lib/missing-inline-example.ts",
			"docs/missing-fenced-example.md",
			"lib/missing-fenced-example.ts",
		] as const;
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
			`Keep [the current doc](../docs/current.md#stable), mark [the missing doc](../docs/missing-link.md?view=1#old), mark [the ordinary prose example](../docs/missing-prose-example.md), and mark ${acceptedBacktickCitations.map((path) => `\`${path}\``).join(" plus ")} while preserving this sentence.`,
			"",
			`These code and pattern tokens are not citations: ${rejectedTokens.map((token) => `\`${token}\``).join(", ")}.`,
			"",
			"Inline examples are documentation: `[text](../docs/missing-inline-example.md)` and `` `lib/missing-inline-example.ts` ``.",
			"",
			"```markdown",
			"[text](../docs/missing-fenced-example.md)",
			"`lib/missing-fenced-example.ts`",
			"```",
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
						reason: expect.stringContaining("5 unresolved citations"),
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
			"docs/missing-prose-example.md",
			...acceptedBacktickCitations,
		]) {
			expect(proposalRaw).toContain(`stale reference: ${path}`);
		}
		for (const path of codeRegionOnlyCitations) {
			expect(proposalRaw).not.toContain(`stale reference: ${path}`);
		}
		const observation = result.details.observations.find(
			(item) => item.kind === "stale-reference",
		);
		expect(observation).toBeDefined();
		const reason = observation?.reason;
		if (reason === undefined)
			throw new Error("expected stale-reference reason");
		for (const { class: rejectionClass, values } of rejectedBacktickCitations) {
			for (const value of values) {
				const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
				expect(reason, rejectionClass).not.toMatch(
					new RegExp(`(?:citations?: |, )${escapedValue}(?:, |\\.$)`, "u"),
				);
			}
		}
		expect(proposalRaw).toContain("while preserving this sentence");
		expect(proposalRaw).toContain("../docs/current.md#stable");
	});

	test("persists closed proposal variants and accepted receipts through one safe durable writer", async () => {
		const projectRoot = join(tmp.path, "durable-proposal-project");
		await mkdir(projectRoot, { recursive: true });
		const durableFiles = createDurableMachineFiles();
		expect(Object.keys(durableFiles).sort()).toEqual([
			"removeFile",
			"renameFile",
			"replaceText",
			"restoreFile",
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
		await expect(receiptStore.write(receipt)).resolves.toEqual({
			receipt,
			writesCommitted: true,
		});
		await expect(receiptStore.write(receipt)).resolves.toEqual({
			receipt,
			writesCommitted: false,
		});
		await expect(
			receiptStore.markMaterialized(batchKey),
		).resolves.toMatchObject({
			receipt: { state: "materialized" },
			writesCommitted: true,
		});
		await expect(
			receiptStore.markMaterialized(batchKey),
		).resolves.toMatchObject({
			receipt: { state: "materialized" },
			writesCommitted: false,
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

	test("derives represented proposal evidence from one materialization read per pass", async () => {
		const projectRoot = join(tmp.path, "single-proposal-read-project");
		const input = record({
			id: "represented",
			sourceId: "corpus",
			path: "memory/represented.md",
			kind: "artifact",
			content: "# Represented evidence\n",
		});
		const durableStore = createConsolidationProposalStore({ projectRoot });
		await durableStore.persist({
			batchKey: createHash("sha256")
				.update("single-proposal-read")
				.digest("hex"),
			observation: {
				id: "represented-1",
				kind: "merge-candidate",
				inputs: [
					{
						id: input.id,
						sourceId: input.sourceId,
						scope: input.scope,
						path: input.path,
						digest: input.digest,
					},
				],
				reason: "The evidence is already represented by a proposal.",
			},
			proposal: {
				proposalKind: "merge",
				replacement: proposed("Represented evidence"),
			},
			dryRun: false,
		});
		const readEvidence = vi.fn(() => durableStore.readEvidence());
		const readMaterializations = vi.fn(() =>
			durableStore.readMaterializations(),
		);
		const proposalStore = {
			readEvidence,
			readMaterializations,
			persist: durableStore.persist,
		};
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [],
		}));

		await expect(
			createHarness(
				[source("corpus", [input])],
				{ id: "fake/no-tools", judge },
				{ proposalStore },
			).consolidator(),
		).resolves.toMatchObject({
			kind: "noop",
			reason: "All admitted consolidation evidence is already represented.",
		});
		expect(readMaterializations).toHaveBeenCalledOnce();
		expect(readEvidence).not.toHaveBeenCalled();
		expect(judge).not.toHaveBeenCalled();
	});

	test("makes durable restore idempotent across every persisted internal state", async () => {
		const directory = join(tmp.path, "idempotent-durable-restore");
		await mkdir(directory, { recursive: true });
		const sourcePath = join(directory, "record.tombstone");
		const destinationPath = join(directory, "record.md");
		const original = "original durable restore bytes\n";
		await writeFile(sourcePath, original);
		const durableFiles = createDurableMachineFiles();

		await link(sourcePath, destinationPath);
		await durableFiles.restoreFile({ sourcePath, destinationPath });
		await durableFiles.restoreFile({ sourcePath, destinationPath });

		await expect(readFile(destinationPath, "utf-8")).resolves.toBe(original);
		await expect(fileExists(sourcePath)).resolves.toBe(false);

		const secondSourcePath = join(directory, "second.tombstone");
		const secondDestinationPath = join(directory, "second.md");
		await writeFile(secondSourcePath, original);
		await durableFiles.restoreFile({
			sourcePath: secondSourcePath,
			destinationPath: secondDestinationPath,
		});
		await durableFiles.restoreFile({
			sourcePath: secondSourcePath,
			destinationPath: secondDestinationPath,
		});
		await expect(readFile(secondDestinationPath, "utf-8")).resolves.toBe(
			original,
		);
		await expect(fileExists(secondSourcePath)).resolves.toBe(false);
	});

	test("reports committed receipt removals when a later discharge fails", async () => {
		const projectRoot = join(tmp.path, "partial-receipt-discharge");
		const baseDurableFiles = createDurableMachineFiles();
		let removalCount = 0;
		const durableFiles = {
			...baseDurableFiles,
			async removeFile(path: string) {
				removalCount += 1;
				if (removalCount === 2) {
					throw new Error("simulated second receipt removal failure");
				}
				return baseDurableFiles.removeFile(path);
			},
		};
		const receiptStore = createAcceptedJudgmentReceiptStore({
			projectRoot,
			durableFiles,
		});
		for (const suffix of ["first", "second"]) {
			const batchKey = createHash("sha256").update(suffix).digest("hex");
			await receiptStore.write({
				schemaVersion: 1,
				batchKey,
				state: "accepted",
				inputDigests: [
					createHash("sha256").update(`${suffix}-input`).digest("hex"),
				],
				output: { schemaVersion: 1, observations: [] },
				path: receiptStore.pathFor(batchKey),
			});
			await receiptStore.markMaterialized(batchKey);
		}

		const result = await createHarness([source("empty", [])], undefined, {
			acceptedJudgmentReceiptStore: receiptStore,
		}).consolidator();

		expect(result).toMatchObject({
			kind: "failed",
			reason: expect.stringContaining(
				"simulated second receipt removal failure",
			),
			details: { writesCommitted: true },
		});
	});

	// @cosmo-behavior plan:living-memory-fidelity#B-007
	test("reports a committed first receipt removal when its directory sync fails", async () => {
		const projectRoot = join(tmp.path, "first-receipt-discharge-sync-failure");
		const baseDurableFiles = createDurableMachineFiles();
		const durableFiles = {
			...baseDurableFiles,
			async removeFile(path: string) {
				await baseDurableFiles.removeFile(path);
				throw Object.assign(
					new Error("simulated first receipt directory sync failure"),
					{ writesCommitted: true },
				);
			},
		};
		const receiptStore = createAcceptedJudgmentReceiptStore({
			projectRoot,
			durableFiles,
		});
		const batchKey = createHash("sha256")
			.update("first receipt removal")
			.digest("hex");
		const receiptPath = receiptStore.pathFor(batchKey);
		await receiptStore.write({
			schemaVersion: 1,
			batchKey,
			state: "accepted",
			inputDigests: [createHash("sha256").update("absent input").digest("hex")],
			output: { schemaVersion: 1, observations: [] },
			path: receiptPath,
		});
		await receiptStore.markMaterialized(batchKey);

		const result = await createHarness([source("empty", [])], undefined, {
			acceptedJudgmentReceiptStore: receiptStore,
		}).consolidator();

		expect(result).toMatchObject({
			kind: "failed",
			reason: expect.stringContaining(
				"simulated first receipt directory sync failure",
			),
			details: { writesCommitted: true },
		});
		await expect(fileExists(receiptPath)).resolves.toBe(false);
	});

	test("reports a committed receipt removal when lock release is unconfirmed", async () => {
		const projectRoot = join(tmp.path, "receipt-discharge-release-unconfirmed");
		const initialStore = createAcceptedJudgmentReceiptStore({ projectRoot });
		const batchKey = createHash("sha256")
			.update("receipt removed before unconfirmed release")
			.digest("hex");
		const receiptPath = initialStore.pathFor(batchKey);
		await initialStore.write({
			schemaVersion: 1,
			batchKey,
			state: "accepted",
			inputDigests: [createHash("sha256").update("stale input").digest("hex")],
			output: { schemaVersion: 1, observations: [] },
			path: receiptPath,
		});
		await initialStore.markMaterialized(batchKey);
		const receiptStore = createAcceptedJudgmentReceiptStore({
			projectRoot,
			async withLock<T>(
				_lockPath: string,
				action: () => Promise<T>,
				options: EntityFileLockOptions = {},
			): Promise<T> {
				const result = await action();
				options.onReleaseUnconfirmed?.(
					new Error("simulated receipt lock release failure"),
				);
				return result;
			},
		});

		await expect(
			receiptStore.dischargeStale({
				currentKeys: [],
				lockHeld: false,
				lockOptions: exactLockOptions(),
			}),
		).rejects.toMatchObject({
			message: expect.stringContaining("receipt lock release failure"),
			writesCommitted: true,
		});
		await expect(fileExists(receiptPath)).resolves.toBe(false);
	});

	test("reports a completed receipt discharge when retirement inspection fails", async () => {
		const projectRoot = join(tmp.path, "completed-receipt-discharge");
		const receiptStore = createAcceptedJudgmentReceiptStore({ projectRoot });
		const batchKey = createHash("sha256")
			.update("completed-before-inspection")
			.digest("hex");
		await receiptStore.write({
			schemaVersion: 1,
			batchKey,
			state: "accepted",
			inputDigests: [createHash("sha256").update("absent-input").digest("hex")],
			output: { schemaVersion: 1, observations: [] },
			path: receiptStore.pathFor(batchKey),
		});
		await receiptStore.markMaterialized(batchKey);

		const result = await createHarness([source("empty", [])], undefined, {
			acceptedJudgmentReceiptStore: receiptStore,
			retirementStore: {
				async inspect() {
					throw new Error("simulated post-discharge inspection failure");
				},
				async apply() {
					return {
						kind: "completed" as const,
						details: {
							retirements: [],
							declines: [],
							warnings: [],
							recovery: "none" as const,
							writesCommitted: false,
						},
					};
				},
			},
		}).consolidator();

		expect(result).toMatchObject({
			kind: "failed",
			reason: "simulated post-discharge inspection failure",
			details: { writesCommitted: true },
		});
		await expect(fileExists(receiptStore.pathFor(batchKey))).resolves.toBe(
			false,
		);
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
		const citationWarning = incomplete.warnings[0];
		if (citationWarning === undefined) {
			throw new Error("missing incomplete citation warning");
		}
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
		const sourceWarning = {
			path: "knowledge/source-warning.md",
			message: "Source warning before citation discovery",
		};
		const sourceWithWarning: ConsolidationSource = {
			id: "corpus",
			async collect() {
				return {
					records: [checked],
					inventoryComplete: true,
					knowledgeIndex: knowledgeIndexFixture([checked]),
					omitted: 0,
					deferred: 0,
					warnings: [sourceWarning],
				};
			},
		};
		await expect(
			createHarness([sourceWithWarning]).consolidator({
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
				warnings: [sourceWarning, citationWarning],
			},
		});
	});

	test("declines oversized citation files at the inventory read boundary", async () => {
		const projectRoot = join(tmp.path, "bounded-citation-inventory");
		const oversizedPath = join(projectRoot, "docs", "oversized.md");
		await mkdir(dirname(oversizedPath), { recursive: true });
		await writeFile(oversizedPath, "x".repeat(1_024));

		const inventory = await inspectLivingMemoryCitationInventory({
			projectRoot,
			maxRecordBytes: 128,
			maxBytes: 512,
		} as Parameters<typeof inspectLivingMemoryCitationInventory>[0] & {
			maxRecordBytes: number;
			maxBytes: number;
		});

		expect(inventory).toMatchObject({
			healthy: false,
			entries: [],
			warnings: [
				expect.objectContaining({
					path: oversizedPath,
					message: expect.stringContaining("per-record inlet ceiling"),
				}),
			],
		});
	});

	test("declines citation files beyond the inventory aggregate read boundary", async () => {
		const projectRoot = join(tmp.path, "bounded-citation-inventory-aggregate");
		const docsDirectory = join(projectRoot, "docs");
		await mkdir(docsDirectory, { recursive: true });
		const first = "[first](knowledge/first.md)\n";
		const secondPath = join(docsDirectory, "b.md");
		await writeFile(join(docsDirectory, "a.md"), first);
		await writeFile(secondPath, "[second](knowledge/second.md)\n");

		const inventory = await inspectLivingMemoryCitationInventory({
			projectRoot,
			maxRecordBytes: 1_024,
			maxBytes: Buffer.byteLength(first, "utf-8"),
		});

		expect(inventory.healthy).toBe(false);
		expect(inventory.entries.map((entry) => entry.path)).toEqual(["docs/a.md"]);
		expect(inventory.warnings).toEqual([
			expect.objectContaining({
				path: secondPath,
				message: expect.stringContaining("aggregate inlet allowance"),
			}),
		]);
	});

	// @cosmo-behavior plan:living-memory#B-005
	test("keeps cited 9608b54 live and emits the ruled edit-narrow proposal", async () => {
		const projectRoot = join(tmp.path, "cited-gotcha-project");
		const relativePath = "knowledge/cited-gotcha.md";
		const livePath = join(projectRoot, relativePath);
		const raw = [
			"---",
			"type: gotcha",
			"title: Ephemeral session compaction",
			"description: Session compaction has different within-run and across-run guarantees.",
			"resource: cited-gotcha.md",
			"tags:",
			"  - memory",
			"timestamp: '2026-09-01T12:00:00.000Z'",
			"scope: project",
			"kind: semantic",
			"retire-when:",
			"  condition: Within-run compaction is now fixed.",
			"  check:",
			"    kind: path-exists",
			"    path: fixed-within-run.txt",
			"---",
			"",
			"# Ephemeral session compaction",
			"",
			"Across-run persistence still requires an external durable episode store.",
			"",
			"Within-run compaction is not automatic for ephemeral sessions.",
			"",
		].join("\n");
		const input = record({
			id: "cited-gotcha",
			sourceId: "corpus",
			path: relativePath,
			kind: "knowledge",
			content: raw,
			metadata: {
				type: "gotcha",
				title: "Ephemeral session compaction",
				description:
					"Session compaction has different within-run and across-run guarantees.",
				resource: "cited-gotcha.md",
				tags: ["memory"],
				timestamp: "2026-09-01T12:00:00.000Z",
				retireWhen: {
					condition: "Within-run compaction is now fixed.",
					check: { kind: "path-exists", path: "fixed-within-run.txt" },
				},
				scopeRoot: projectRoot,
			},
		});
		await mkdir(join(projectRoot, "knowledge"), { recursive: true });
		await mkdir(join(projectRoot, "missions", "architecture"), {
			recursive: true,
		});
		await mkdir(join(projectRoot, "missions", "reviews"), {
			recursive: true,
		});
		await writeFile(livePath, raw);
		await writeFile(join(projectRoot, "fixed-within-run.txt"), "fixed\n");
		await writeFile(
			join(projectRoot, "missions", "architecture", "consumer.md"),
			"# Consumer\n\nKeep the [across-run warning](../../knowledge/cited-gotcha.md).\n",
		);
		await writeFile(
			join(
				projectRoot,
				"missions",
				"reviews",
				"knowledge-surface-promotion-1.md",
			),
			promotionLedger({ path: relativePath, digest: input.digest }),
		);
		const replacement = {
			type: "gotcha" as const,
			title: "Ephemeral session compaction",
			description:
				"Across-run persistence still requires an external durable episode store.",
			content:
				"# Ephemeral session compaction\n\nAcross-run persistence still requires an external durable episode store.\n",
			tags: ["memory"],
		};
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async (request) => {
			expect(request.deterministicObservations).toEqual([
				expect.objectContaining({
					kind: "retire-condition-met",
					inputs: expect.arrayContaining([
						expect.objectContaining({
							scope: "project",
							path: relativePath,
							digest: input.digest,
						}),
						expect.objectContaining({
							scope: "project",
							path: "missions/architecture/consumer.md",
							digest: expect.stringMatching(/^[a-f0-9]{64}$/u),
						}),
					]),
				}),
			]);
			return {
				schemaVersion: 1,
				observations: [
					{
						kind: "obsolete-cause",
						inputIds: [input.id],
						reason:
							"The within-run cause is fixed, but the cited across-run warning remains current.",
						proposal: { proposalKind: "merge", replacement },
					},
				],
			};
		});
		const indexPressure = {
			measure: vi.fn(() => ({
				kind: "measured" as const,
				targetSatisfied: false,
				recordCount: 51,
				maxRecords: 50,
				renderedBytes: 8_001,
				guaranteedBytes: 8_000,
				headroomBytes: 512,
			})),
		};
		const result = await createHarness(
			[
				source("corpus", [
					input,
					record({
						id: "unselected-context",
						sourceId: "corpus",
						path: "memory/context.md",
						kind: "artifact",
						content: "# Unselected context\n",
					}),
				]),
			],
			{ id: "fake/no-tools", judge },
			{
				proposalStore: createConsolidationProposalStore({ projectRoot }),
				retirementStore: createLivingMemoryRetirementStore({ projectRoot }),
				indexPressure,
			},
		).consolidator();
		if (result.kind === "failed") throw new Error(result.reason);

		expect(result).toMatchObject({
			kind: "ran",
			details: {
				proposals: [
					{
						proposalKind: "merge",
						status: "written",
						inputs: [{ path: relativePath, digest: input.digest }],
					},
				],
				retirements: [],
				declines: expect.arrayContaining([
					expect.objectContaining({
						code: "retirement-inbound-citation",
						path: relativePath,
					}),
					expect.objectContaining({ code: "target-unmet" }),
				]),
			},
		});
		expect(judge).toHaveBeenCalledOnce();
		expect(indexPressure.measure).toHaveBeenCalledOnce();
		await expect(readFile(livePath, "utf-8")).resolves.toBe(raw);
		if (
			result.kind !== "ran" ||
			result.details.proposals[0]?.path === undefined
		) {
			throw new Error("expected one persisted edit-narrow proposal");
		}
		const proposal = await readFile(result.details.proposals[0].path, "utf-8");
		expect(proposal).toContain(
			"Across-run persistence still requires an external durable episode store.",
		);
		expect(proposal).not.toContain(
			"Within-run compaction is not automatic for ephemeral sessions.",
		);
	});

	// @cosmo-behavior plan:living-memory#B-006
	test("writes evidence-bound merge and parent-edit proposals without changing knowledge", async () => {
		const projectRoot = join(tmp.path, "reflector-project");
		const fixtures = [
			{
				id: "duplicate-a",
				path: "knowledge/duplicate-a.md",
				content: "# Retry boundary\n\nRetry only idempotent operations.\n",
			},
			{
				id: "duplicate-b",
				path: "knowledge/duplicate-b.md",
				content: "# Retry boundary copy\n\nRetry only idempotent operations.\n",
			},
			{
				id: "memory-parent",
				path: "knowledge/memory-parent.md",
				content:
					"# Memory operations\n\nRetries require idempotency. Timeouts must be bounded.\n",
			},
			{
				id: "retry-detail",
				path: "knowledge/details/retry.md",
				content: "# Retry policy\n\nRetries require idempotency.\n",
			},
			{
				id: "timeout-detail",
				path: "knowledge/details/timeouts.md",
				content: "# Timeout policy\n\nTimeouts must be bounded.\n",
			},
		] as const;
		const records = fixtures.map((fixture) =>
			record({
				...fixture,
				sourceId: "corpus",
				kind: "knowledge",
			}),
		);
		for (const fixture of fixtures) {
			const path = join(projectRoot, fixture.path);
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, fixture.content);
		}
		const receiptStore = createAcceptedJudgmentReceiptStore({ projectRoot });
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [
				{
					kind: "duplicate",
					inputIds: ["duplicate-a", "duplicate-b"],
					reason: "Both records encode the same retry boundary.",
					proposal: {
						proposalKind: "merge",
						replacement: {
							type: "gotcha",
							title: "Retry boundary",
							description: "Retry only idempotent operations.",
							content:
								"# Retry boundary\n\nRetry only idempotent operations.\n",
							tags: ["retries", "memory"],
						},
					},
				},
				{
					kind: "merge-candidate",
					inputIds: ["memory-parent"],
					reason:
						"The typed detail records are authoritative and the parent should only link them.",
					proposal: {
						proposalKind: "merge",
						replacement: {
							type: "decision",
							title: "Memory operations",
							description: "Overview of the typed operational records.",
							content: [
								"# Memory operations",
								"",
								"See [Retry policy](details/retry.md) and [Timeout policy](details/timeouts.md).",
								"",
							].join("\n"),
							tags: ["memory", "overview"],
						},
					},
				},
			],
		}));
		const result = await createHarness(
			[source("corpus", records)],
			{ id: "fake/no-tools", judge },
			{
				proposalStore: createConsolidationProposalStore({ projectRoot }),
				acceptedJudgmentReceiptStore: receiptStore,
			},
		).consolidator();
		if (result.kind === "failed") throw new Error(result.reason);

		expect(result).toMatchObject({
			kind: "ran",
			details: {
				proposals: [
					{
						proposalKind: "merge",
						status: "written",
						inputs: [
							{
								scope: "project",
								path: "knowledge/duplicate-a.md",
								digest: records[0]?.digest,
							},
							{
								scope: "project",
								path: "knowledge/duplicate-b.md",
								digest: records[1]?.digest,
							},
						],
					},
					{
						proposalKind: "merge",
						status: "written",
						inputs: [
							{
								scope: "project",
								path: "knowledge/memory-parent.md",
								digest: records[2]?.digest,
							},
						],
					},
				],
			},
		});
		if (result.kind !== "ran") throw new Error("expected Reflector to run");
		const receipt = await receiptStore.read(
			result.details.proposals[0]?.key ?? "missing",
		);
		expect(receipt).toMatchObject({ state: "materialized" });
		const proposalFiles = await Promise.all(
			result.details.proposals.map(async (proposal) => {
				if (proposal.path === undefined)
					throw new Error("missing proposal path");
				return readFile(proposal.path, "utf-8");
			}),
		);
		expect(proposalFiles[0]).toContain('"title": "Retry boundary"');
		expect(proposalFiles[0]).toContain(
			'"content": "# Retry boundary\\n\\nRetry only idempotent operations.\\n"',
		);
		expect(proposalFiles[1]).toContain("[Retry policy](details/retry.md)");
		expect(proposalFiles[1]).toContain("[Timeout policy](details/timeouts.md)");
		expect(proposalFiles[1]).not.toContain(
			"Retries require idempotency. Timeouts must be bounded.",
		);
		for (const fixture of fixtures) {
			await expect(
				readFile(join(projectRoot, fixture.path), "utf-8"),
			).resolves.toBe(fixture.content);
		}
	});

	// @cosmo-behavior plan:living-memory-fidelity#B-012
	test("reports committed writes for a materialization-only retry pass", async () => {
		const projectRoot = join(tmp.path, "materialization-only-retry");
		const inputs = [
			record({
				id: "materialization-only-evidence",
				sourceId: "corpus",
				path: "knowledge/materialization-only.md",
				kind: "knowledge",
				content: "# Materialization-only evidence\n",
			}),
			record({
				id: "materialization-only-context",
				sourceId: "corpus",
				path: "knowledge/materialization-context.md",
				kind: "knowledge",
				content: "# Materialization-only context\n",
			}),
		];
		const input = inputs[0];
		if (input === undefined) throw new Error("missing materialization input");
		const receiptStore = createAcceptedJudgmentReceiptStore({ projectRoot });
		const proposalStore = createConsolidationProposalStore({ projectRoot });
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [
				{
					kind: "merge-candidate",
					inputIds: [input.id],
					reason: "Materialize an already-written proposal.",
					proposal: {
						proposalKind: "create",
						record: proposed("Materialization-only retry"),
					},
				},
			],
		}));
		const interrupted = await createHarness(
			[source("corpus", inputs)],
			{ id: "fake/no-tools", judge },
			{
				acceptedJudgmentReceiptStore: receiptStore,
				proposalStore: {
					...proposalStore,
					async persist(proposalInput) {
						await proposalStore.persist(proposalInput);
						throw new Error("simulated crash after durable proposal write");
					},
				},
			},
		).consolidator();
		expect(interrupted).toMatchObject({
			kind: "failed",
			reason: "simulated crash after durable proposal write",
			details: { writesCommitted: true },
		});
		const accepted = (await receiptStore.list()).find(
			(receipt) => receipt.state === "accepted",
		);
		expect(accepted).toBeDefined();
		const markMaterialized = vi.spyOn(receiptStore, "markMaterialized");

		const retried = await createHarness(
			[source("corpus", inputs)],
			{ id: "fake/no-tools", judge },
			{
				acceptedJudgmentReceiptStore: receiptStore,
				proposalStore,
			},
		).consolidator();

		expect(retried).toMatchObject({
			kind: "ran",
			details: {
				proposals: [{ status: "existing" }],
				episodePrunes: [],
				writesCommitted: true,
			},
		});
		expect(markMaterialized).toHaveBeenCalledOnce();
		expect(judge).toHaveBeenCalledOnce();
		await expect(
			receiptStore.read(accepted?.batchKey ?? "missing"),
		).resolves.toMatchObject({ state: "materialized" });
	});

	test("does not report a competing receipt materialization as its own committed write", async () => {
		const projectRoot = join(tmp.path, "competing-receipt-materialization");
		const inputs = [
			record({
				id: "competing-materialization-evidence",
				sourceId: "corpus",
				path: "knowledge/competing-materialization.md",
				kind: "knowledge",
				content: "# Competing materialization evidence\n",
			}),
			record({
				id: "competing-materialization-context",
				sourceId: "corpus",
				path: "knowledge/competing-materialization-context.md",
				kind: "knowledge",
				content: "# Competing materialization context\n",
			}),
		];
		const input = inputs[0];
		if (input === undefined) throw new Error("missing materialization input");
		const receiptStore = createAcceptedJudgmentReceiptStore({ projectRoot });
		const proposalStore = createConsolidationProposalStore({ projectRoot });
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [
				{
					kind: "merge-candidate",
					inputIds: [input.id],
					reason: "Materialize an already-written proposal.",
					proposal: {
						proposalKind: "create",
						record: proposed("Competing materialization"),
					},
				},
			],
		}));
		await createHarness(
			[source("corpus", inputs)],
			{ id: "fake/no-tools", judge },
			{
				acceptedJudgmentReceiptStore: receiptStore,
				proposalStore: {
					...proposalStore,
					async persist(proposalInput) {
						await proposalStore.persist(proposalInput);
						throw new Error("simulated crash after durable proposal write");
					},
				},
			},
		).consolidator();

		const accepted = (await receiptStore.list()).find(
			(receipt) => receipt.state === "accepted",
		);
		if (accepted === undefined) throw new Error("missing accepted receipt");
		const passMarkMaterialized = vi.fn(async (batchKey: string) => {
			await receiptStore.markMaterialized(batchKey);
			return receiptStore.markMaterialized(batchKey);
		});

		const retried = await createHarness(
			[source("corpus", inputs)],
			{ id: "fake/no-tools", judge },
			{
				acceptedJudgmentReceiptStore: {
					...receiptStore,
					markMaterialized: passMarkMaterialized,
				},
				proposalStore,
			},
		).consolidator();

		expect(retried).toMatchObject({
			kind: "ran",
			details: {
				proposals: [{ status: "existing" }],
				writesCommitted: false,
			},
		});
		expect(passMarkMaterialized).toHaveBeenCalledOnce();
		await expect(receiptStore.read(accepted.batchKey)).resolves.toMatchObject({
			state: "materialized",
		});
	});

	// @cosmo-behavior plan:living-memory#B-016
	test("rehydrates accepted judgment and persisted evidence then converges to noop", async () => {
		const projectRoot = join(tmp.path, "convergence-project");
		const proposalRaw = knowledgeFixture({ resource: "proposal.md" });
		const retirementRaw = knowledgeFixture({ resource: "retire.md" });
		const proposalPath = join(projectRoot, "knowledge", "proposal.md");
		const retirementPath = join(projectRoot, "knowledge", "retire.md");
		await mkdir(join(projectRoot, "knowledge"), { recursive: true });
		await mkdir(join(projectRoot, "missions", "reviews"), {
			recursive: true,
		});
		await writeFile(proposalPath, proposalRaw);
		await writeFile(retirementPath, retirementRaw);
		await writeFile(join(projectRoot, "fixed.txt"), "fixed\n");
		const proposalRecord = record({
			id: "proposal-record",
			sourceId: "corpus",
			path: "knowledge/proposal.md",
			kind: "knowledge",
			content: proposalRaw,
		});
		const retirementRecord = record({
			id: "retirement-record",
			sourceId: "corpus",
			path: "knowledge/retire.md",
			kind: "knowledge",
			content: retirementRaw,
			metadata: {
				type: "gotcha",
				retireWhen: {
					condition: "The replacement exists.",
					check: { kind: "path-exists", path: "fixed.txt" },
				},
				scopeRoot: projectRoot,
			},
		});
		const contextRecord = record({
			id: "context-record",
			sourceId: "corpus",
			path: "memory/context.md",
			kind: "artifact",
			content: "# Context\n",
		});
		const proposalOnlyRecord = record({
			id: "proposal-only-record",
			sourceId: "corpus",
			path: "memory/proposal-only.md",
			kind: "artifact",
			content: "# Proposal-only evidence\n",
		});
		const manifestOnlyRecord = record({
			id: "manifest-only-record",
			sourceId: "corpus",
			path: "knowledge/manifest-only.md",
			kind: "reflection",
			content: "# Manifest-only evidence\n",
		});
		await writeFile(
			join(
				projectRoot,
				"missions",
				"reviews",
				"knowledge-surface-promotion-1.md",
			),
			promotionLedger({
				path: retirementRecord.path,
				digest: retirementRecord.digest,
			}),
		);
		let lastCollectedIds: readonly string[] = [];
		let includeRepresentedFixtures = false;
		const corpus: ConsolidationSource = {
			id: "corpus",
			async collect() {
				const records = [proposalRecord, contextRecord];
				if (await fileExists(retirementPath)) records.push(retirementRecord);
				if (includeRepresentedFixtures) {
					records.push(proposalOnlyRecord, manifestOnlyRecord);
				}
				lastCollectedIds = records.map((item) => item.id);
				return {
					records,
					inventoryComplete: true,
					knowledgeIndex: knowledgeIndexFixture(records),
					omitted: 0,
					deferred: 0,
				};
			},
		};
		const receiptStore = createAcceptedJudgmentReceiptStore({ projectRoot });
		const staleMaterializedKey = createHash("sha256")
			.update("stale-materialized")
			.digest("hex");
		const staleAcceptedKey = createHash("sha256")
			.update("stale-accepted")
			.digest("hex");
		for (const [batchKey, state] of [
			[staleMaterializedKey, "materialized"],
			[staleAcceptedKey, "accepted"],
		] as const) {
			await receiptStore.write({
				schemaVersion: 1,
				batchKey,
				state: "accepted",
				inputDigests: [
					createHash("sha256").update(`stale-${state}`).digest("hex"),
				],
				output: { schemaVersion: 1, observations: [] },
				path: receiptStore.pathFor(batchKey),
			});
			if (state === "materialized") {
				await receiptStore.markMaterialized(batchKey);
			}
		}
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [
				{
					kind: "merge-candidate",
					inputIds: [proposalRecord.id],
					reason: "  The record should become a concise canonical decision.  ",
					proposal: {
						proposalKind: "merge",
						replacement: proposed("Canonical proposal"),
					},
				},
			],
		}));
		const durableProposalStore = createConsolidationProposalStore({
			projectRoot,
		});
		let crashProposalPath: string | undefined;
		const crashed = await createHarness(
			[corpus],
			{ id: "fake/no-tools", judge },
			{
				acceptedJudgmentReceiptStore: receiptStore,
				proposalStore: {
					readEvidence: () => durableProposalStore.readEvidence(),
					async persist(input) {
						const accepted = await receiptStore.read(input.batchKey);
						expect(accepted).toMatchObject({ state: "accepted" });
						const written = await durableProposalStore.persist(input);
						crashProposalPath = written.path;
						throw new Error("simulated crash after durable proposal");
					},
				},
				retirementStore: createLivingMemoryRetirementStore({ projectRoot }),
			},
		).consolidator();
		expect(crashed).toMatchObject({
			kind: "failed",
			reason: "simulated crash after durable proposal",
			details: { writesCommitted: true },
		});
		expect(crashProposalPath).toBeDefined();
		expect(judge).toHaveBeenCalledOnce();
		const acceptedBatchKey = judge.mock.calls[0]?.[0].batchKey;
		if (acceptedBatchKey === undefined) throw new Error("missing accepted key");
		const acceptedReceipt = await receiptStore.read(acceptedBatchKey);
		expect(acceptedReceipt).toMatchObject({
			state: "accepted",
		});
		expect(acceptedReceipt?.output.observations[0]?.reason).toBe(
			"The record should become a concise canonical decision.",
		);

		const completed = await createHarness(
			[corpus],
			{ id: "fake/no-tools", judge },
			{
				acceptedJudgmentReceiptStore: createAcceptedJudgmentReceiptStore({
					projectRoot,
				}),
				proposalStore: createConsolidationProposalStore({ projectRoot }),
				retirementStore: createLivingMemoryRetirementStore({ projectRoot }),
			},
		).consolidator();
		if (completed.kind === "failed") throw new Error(completed.reason);
		expect(completed).toMatchObject({
			kind: "ran",
			details: {
				proposals: [
					{
						path: crashProposalPath,
						status: "existing",
					},
				],
				retirements: [
					{
						path: retirementRecord.path,
						status: "applied",
					},
				],
			},
		});
		expect(judge).toHaveBeenCalledOnce();
		await expect(fileExists(retirementPath)).resolves.toBe(false);
		await expect(
			createAcceptedJudgmentReceiptStore({ projectRoot }).read(
				acceptedBatchKey,
			),
		).resolves.toMatchObject({ state: "materialized" });
		includeRepresentedFixtures = true;
		await durableProposalStore.persist({
			batchKey: createHash("sha256")
				.update("proposal-only-representation")
				.digest("hex"),
			observation: {
				id: "proposal-only-1",
				kind: "merge-candidate",
				inputs: [
					{
						id: proposalOnlyRecord.id,
						sourceId: proposalOnlyRecord.sourceId,
						scope: proposalOnlyRecord.scope,
						path: proposalOnlyRecord.path,
						digest: proposalOnlyRecord.digest,
					},
				],
				reason: "Fixture proposal representation.",
			},
			proposal: {
				proposalKind: "merge",
				replacement: proposed("Proposal-only representation"),
			},
			dryRun: false,
		});
		await writeFile(
			join(projectRoot, "memory", "agent", "retirements", "round-2.md"),
			retiredManifest({
				round: 2,
				id: "manifest-only-representation",
				path: manifestOnlyRecord.path,
				digest: manifestOnlyRecord.digest,
			}),
		);

		const converged = await createHarness(
			[corpus],
			{ id: "fake/no-tools", judge },
			{
				acceptedJudgmentReceiptStore: createAcceptedJudgmentReceiptStore({
					projectRoot,
				}),
				proposalStore: createConsolidationProposalStore({ projectRoot }),
				retirementStore: createLivingMemoryRetirementStore({ projectRoot }),
			},
		).consolidator();
		expect(converged).toMatchObject({
			kind: "noop",
			details: {
				proposals: [],
				retirements: [],
				writesCommitted: false,
			},
		});
		expect(judge).toHaveBeenCalledOnce();
		expect(lastCollectedIds).not.toContain(retirementRecord.id);
		expect(lastCollectedIds).toEqual(
			expect.arrayContaining([
				contextRecord.id,
				proposalOnlyRecord.id,
				manifestOnlyRecord.id,
			]),
		);
		await expect(
			fileExists(receiptStore.pathFor(staleMaterializedKey)),
		).resolves.toBe(false);
		await expect(
			fileExists(receiptStore.pathFor(staleAcceptedKey)),
		).resolves.toBe(true);
		await expect(
			fileExists(receiptStore.pathFor(acceptedBatchKey)),
		).resolves.toBe(true);

		const recoveryFixture = await createRetirementFixture(
			"pipeline-recovery-project",
		);
		const child = await runRetirementChild(
			recoveryFixture.projectRoot,
			"after-manifest-sync",
		);
		expect(child).toMatchObject({ code: 86, signal: null });
		const recoveringSource: ConsolidationSource = {
			id: "corpus",
			async collect() {
				return {
					records: (await fileExists(recoveryFixture.livePath))
						? [recoveryFixture.input]
						: [],
					inventoryComplete: true,
					omitted: 0,
					deferred: 0,
				};
			},
		};
		const recoveryOverrides = {
			retirementStore: createLivingMemoryRetirementStore({
				projectRoot: recoveryFixture.projectRoot,
			}),
		};
		const recovered = await createHarness(
			[recoveringSource],
			undefined,
			recoveryOverrides,
		).consolidator({ modelMode: "deterministic-only" });
		expect(recovered).toMatchObject({
			kind: "ran",
			details: { recovery: "rolled-forward", writesCommitted: true },
		});
		await expect(fileExists(recoveryFixture.livePath)).resolves.toBe(false);
		await expect(
			createHarness(
				[recoveringSource],
				undefined,
				recoveryOverrides,
			).consolidator({ modelMode: "deterministic-only" }),
		).resolves.toMatchObject({ kind: "noop" });
	});

	test("retains negative episode judgments across repeated production passes", async () => {
		const projectRoot = join(tmp.path, "negative-episode-convergence");
		const [episodePath] = await writeEpisodeFixtures(projectRoot, [
			["No durable proposal needed", "2026-09-01T11:30:00.000Z"],
		]);
		if (episodePath === undefined) throw new Error("missing episode fixture");
		const receiptStore = createAcceptedJudgmentReceiptStore({ projectRoot });
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [],
		}));
		const harness = createHarness(
			[createProjectEpisodeConsolidationSource({ projectRoot })],
			{ id: "fake/no-tools", judge },
			{ acceptedJudgmentReceiptStore: receiptStore },
		);

		const first = await harness.consolidator();
		if (first.kind !== "ran") throw new Error("expected first pass to run");
		const batchKey = judge.mock.calls[0]?.[0].batchKey;
		if (batchKey === undefined) throw new Error("missing judgment batch key");
		expect(first.details.proposals).toEqual([]);
		await expect(receiptStore.read(batchKey)).resolves.toMatchObject({
			state: "materialized",
		});

		for (let rerun = 0; rerun < 2; rerun += 1) {
			await expect(harness.consolidator()).resolves.toMatchObject({
				kind: "noop",
				details: { writesCommitted: false },
			});
			await expect(receiptStore.read(batchKey)).resolves.toMatchObject({
				state: "materialized",
			});
		}

		expect(judge).toHaveBeenCalledOnce();
		await expect(fileExists(episodePath)).resolves.toBe(true);
	});

	// @cosmo-behavior plan:living-memory#B-016
	test("retains a live receipt when a later pass exhausts its record limit", async () => {
		const projectRoot = join(tmp.path, "cap-deferred-episode-convergence");
		const [laterPath] = await writeEpisodeFixtures(projectRoot, [
			["Later unchanged episode", "2026-09-01T12:00:00.000Z"],
		]);
		if (laterPath === undefined)
			throw new Error("missing later episode fixture");
		const receiptStore = createAcceptedJudgmentReceiptStore({ projectRoot });
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [],
		}));
		const harness = createHarness(
			[createProjectEpisodeConsolidationSource({ projectRoot })],
			{ id: "fake/no-tools", judge },
			{
				acceptedJudgmentReceiptStore: receiptStore,
				limits: {
					...DEFAULT_LIVING_MEMORY_LIMITS,
					maxCorpusRecords: 1,
					maxEpisodeRecords: 1,
				},
			},
		);

		const first = await harness.consolidator();
		if (first.kind !== "ran") throw new Error("expected first pass to run");
		const laterReceiptKey = judge.mock.calls[0]?.[0].batchKey;
		if (laterReceiptKey === undefined)
			throw new Error("missing later receipt key");

		const [earlierPath] = await writeEpisodeFixtures(projectRoot, [
			["Earlier new episode", "2026-09-01T11:00:00.000Z"],
		]);
		if (earlierPath === undefined)
			throw new Error("missing earlier episode fixture");
		await expect(harness.consolidator()).resolves.toMatchObject({
			kind: "ran",
		});
		await expect(receiptStore.read(laterReceiptKey)).resolves.toMatchObject({
			state: "materialized",
		});

		await expect(harness.consolidator()).resolves.toMatchObject({
			kind: "noop",
			details: { writesCommitted: false },
		});
		expect(judge).toHaveBeenCalledTimes(2);
		await expect(fileExists(laterPath)).resolves.toBe(true);
		await expect(fileExists(earlierPath)).resolves.toBe(true);
	});

	// @cosmo-behavior plan:living-memory#B-016
	test("retains a live receipt when a later pass exhausts its byte allowance", async () => {
		const projectRoot = join(tmp.path, "byte-deferred-episode-convergence");
		const [laterPath] = await writeEpisodeFixtures(projectRoot, [
			["Later unchanged episode", "2026-09-01T12:00:00.000Z"],
		]);
		if (laterPath === undefined)
			throw new Error("missing later episode fixture");
		const laterBytes = (await lstat(laterPath)).size;
		const receiptStore = createAcceptedJudgmentReceiptStore({ projectRoot });
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [],
		}));
		const harness = createHarness(
			[createProjectEpisodeConsolidationSource({ projectRoot })],
			{ id: "fake/no-tools", judge },
			{
				acceptedJudgmentReceiptStore: receiptStore,
				limits: {
					...DEFAULT_LIVING_MEMORY_LIMITS,
					maxEpisodeBytes: laterBytes,
				},
			},
		);

		const first = await harness.consolidator();
		if (first.kind !== "ran") throw new Error("expected first pass to run");
		const laterReceiptKey = judge.mock.calls[0]?.[0].batchKey;
		if (laterReceiptKey === undefined)
			throw new Error("missing later receipt key");

		const [earlierPath] = await writeEpisodeFixtures(projectRoot, [
			["Earlier new episode", "2026-09-01T11:00:00.000Z"],
		]);
		if (earlierPath === undefined)
			throw new Error("missing earlier episode fixture");
		await expect(harness.consolidator()).resolves.toMatchObject({
			kind: "ran",
			details: {
				declines: expect.arrayContaining([
					expect.objectContaining({
						code: "source-aggregate-bytes-deferred",
					}),
				]),
			},
		});
		await expect(receiptStore.read(laterReceiptKey)).resolves.toMatchObject({
			state: "materialized",
		});

		await expect(harness.consolidator()).resolves.toMatchObject({
			kind: "noop",
			details: { writesCommitted: false },
		});
		expect(judge).toHaveBeenCalledTimes(2);
		await expect(fileExists(laterPath)).resolves.toBe(true);
		await expect(fileExists(earlierPath)).resolves.toBe(true);
	});

	// @cosmo-behavior plan:living-memory#B-019
	test("syncs accepted folded note proposals before pruning unchanged episodes", async () => {
		const projectRoot = join(tmp.path, "episode-fold-project");
		const episodePaths = await writeEpisodeFixtures(projectRoot, [
			["First completed task", "2026-09-01T10:00:00.000Z"],
			["Second completed task", "2026-09-01T11:00:00.000Z"],
		]);
		const trace: string[] = [];
		const baseDurableFiles = createDurableMachineFiles();
		const durableFiles = {
			...baseDurableFiles,
			async writeText(options) {
				const existed = await fileExists(options.path);
				const written = await baseDurableFiles.writeText(options);
				trace.push(
					`${existed ? "sync" : "write"}:${relativeFixturePath(projectRoot, options.path)}`,
				);
				return written;
			},
			async replaceText(options) {
				const written = await baseDurableFiles.replaceText(options);
				trace.push(`replace:${relativeFixturePath(projectRoot, options.path)}`);
				return written;
			},
			async removeFile(path) {
				trace.push(`remove:${relativeFixturePath(projectRoot, path)}`);
				return baseDurableFiles.removeFile(path);
			},
		} satisfies ReturnType<typeof createDurableMachineFiles>;
		const receiptStore = createAcceptedJudgmentReceiptStore({
			projectRoot,
			durableFiles,
		});
		const proposalStore = createConsolidationProposalStore({
			projectRoot,
			durableFiles,
		});
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async (input) => ({
			schemaVersion: 1,
			observations: [
				{
					kind: "merge-candidate",
					inputIds: input.records.map((record) => record.id),
					reason: "Fold the bounded task episodes into one durable note.",
					proposal: {
						proposalKind: "create",
						record: {
							type: "note",
							title: "Completed task summary",
							description: "Two task episodes folded lossily.",
							content:
								"# Completed task summary\n\nTwo tasks completed successfully.\n",
							tags: ["tasks", "summary"],
						},
					},
				},
			],
		}));
		const episodeSource = createProjectEpisodeConsolidationSource({
			projectRoot,
			durableFiles,
		});
		const finalize = episodeSource.finalize;
		expect(finalize).toBeTypeOf("function");
		if (finalize === undefined) return;
		let hardStop = true;
		const interruptedSource: ConsolidationSource = {
			...episodeSource,
			async finalize(represented) {
				if (hardStop) {
					hardStop = false;
					const first = represented[0];
					if (first === undefined)
						throw new Error("missing represented episode");
					await finalize([first]);
					throw new Error("simulated hard stop during episode prune");
				}
				return finalize(represented);
			},
		};
		const first = await createHarness(
			[interruptedSource],
			{ id: "fake/no-tools", judge },
			{
				acceptedJudgmentReceiptStore: receiptStore,
				proposalStore,
			},
		).consolidator();
		expect(first).toMatchObject({
			kind: "failed",
			reason: "simulated hard stop during episode prune",
			details: { writesCommitted: true, episodePrunes: [] },
		});
		await expect(fileExists(episodePaths[0] as string)).resolves.toBe(false);
		await expect(fileExists(episodePaths[1] as string)).resolves.toBe(true);
		const accepted = (await receiptStore.list()).find(
			(receipt) => receipt.state === "accepted",
		);
		expect(accepted).toBeDefined();
		expect(judge).toHaveBeenCalledOnce();
		const proposalDirectory = join(
			projectRoot,
			"memory",
			"agent",
			"proposals",
			"living-memory",
		);
		expect(await readdir(proposalDirectory)).toHaveLength(1);

		const retried = await createHarness(
			[createProjectEpisodeConsolidationSource({ projectRoot, durableFiles })],
			{ id: "fake/no-tools", judge },
			{
				acceptedJudgmentReceiptStore: createAcceptedJudgmentReceiptStore({
					projectRoot,
					durableFiles,
				}),
				proposalStore: createConsolidationProposalStore({
					projectRoot,
					durableFiles,
				}),
			},
		).consolidator();
		expect(retried).toMatchObject({
			kind: "ran",
			details: {
				episodePrunes: [
					relativeFixturePath(projectRoot, episodePaths[1] as string),
				],
				proposals: [{ proposalKind: "create", status: "existing" }],
			},
		});
		expect(judge).toHaveBeenCalledOnce();
		for (const path of episodePaths) {
			await expect(fileExists(path)).resolves.toBe(false);
		}
		await expect(
			createAcceptedJudgmentReceiptStore({ projectRoot }).read(
				accepted?.batchKey ?? "missing",
			),
		).resolves.toMatchObject({ state: "materialized" });
		const firstReceiptWrite = trace.findIndex((entry) =>
			entry.startsWith("write:memory/agent/consolidations/"),
		);
		const firstProposalWrite = trace.findIndex((entry) =>
			entry.startsWith("write:memory/agent/proposals/living-memory/"),
		);
		const firstProposalSync = trace.findIndex((entry) =>
			entry.startsWith("sync:memory/agent/proposals/living-memory/"),
		);
		const firstEpisodeRemove = trace.findIndex((entry) =>
			entry.startsWith("remove:memory/agent/episodes/"),
		);
		expect(firstReceiptWrite).toBeGreaterThanOrEqual(0);
		expect(firstProposalWrite).toBeGreaterThan(firstReceiptWrite);
		expect(firstProposalSync).toBeGreaterThan(firstProposalWrite);
		expect(firstEpisodeRemove).toBeGreaterThan(firstProposalSync);

		const changedRoot = join(tmp.path, "changed-episode-project");
		const changedPaths = await writeEpisodeFixtures(changedRoot, [
			["Episode changed during folding", "2026-09-01T12:00:00.000Z"],
			["Episode unchanged during folding", "2026-09-01T13:00:00.000Z"],
		]);
		const changedSource = createProjectEpisodeConsolidationSource({
			projectRoot: changedRoot,
		});
		const changedJudge = vi.fn<CorpusJudgmentProvider["judge"]>(
			async (input) => {
				const original = await readFile(changedPaths[0] as string, "utf-8");
				await writeFile(
					changedPaths[0] as string,
					`${original}\nHuman edit.\n`,
				);
				return foldedEpisodeOutput(input.records.map((record) => record.id));
			},
		);
		const changedResult = await createHarness(
			[changedSource],
			{ id: "fake/no-tools", judge: changedJudge },
			{
				acceptedJudgmentReceiptStore: createAcceptedJudgmentReceiptStore({
					projectRoot: changedRoot,
				}),
				proposalStore: createConsolidationProposalStore({
					projectRoot: changedRoot,
				}),
			},
		).consolidator();
		expect(changedResult).toMatchObject({
			kind: "ran",
			details: {
				episodePrunes: [
					relativeFixturePath(changedRoot, changedPaths[1] as string),
				],
			},
		});
		await expect(fileExists(changedPaths[0] as string)).resolves.toBe(true);
		await expect(fileExists(changedPaths[1] as string)).resolves.toBe(false);

		const replacedRoot = join(tmp.path, "replaced-episode-project");
		const replacedPaths = await writeEpisodeFixtures(replacedRoot, [
			["Episode atomically replaced", "2026-09-01T13:10:00.000Z"],
			["Episode identity unchanged", "2026-09-01T13:20:00.000Z"],
		]);
		const replacedJudge = vi.fn<CorpusJudgmentProvider["judge"]>(
			async (input) => {
				const livePath = replacedPaths[0] as string;
				const replacementPath = `${livePath}.replacement`;
				await writeFile(replacementPath, await readFile(livePath));
				await rename(replacementPath, livePath);
				return foldedEpisodeOutput(input.records.map((record) => record.id));
			},
		);
		const replacedResult = await createHarness(
			[createProjectEpisodeConsolidationSource({ projectRoot: replacedRoot })],
			{ id: "fake/no-tools", judge: replacedJudge },
			{
				acceptedJudgmentReceiptStore: createAcceptedJudgmentReceiptStore({
					projectRoot: replacedRoot,
				}),
				proposalStore: createConsolidationProposalStore({
					projectRoot: replacedRoot,
				}),
			},
		).consolidator();
		expect(replacedResult).toMatchObject({
			kind: "ran",
			details: {
				episodePrunes: [
					relativeFixturePath(replacedRoot, replacedPaths[1] as string),
				],
			},
		});
		await expect(fileExists(replacedPaths[0] as string)).resolves.toBe(true);
		await expect(fileExists(replacedPaths[1] as string)).resolves.toBe(false);

		const failedRoot = join(tmp.path, "failed-episode-proposal-project");
		const failedPaths = await writeEpisodeFixtures(failedRoot, [
			["First write-failure episode", "2026-09-01T14:00:00.000Z"],
			["Second write-failure episode", "2026-09-01T15:00:00.000Z"],
		]);
		const failingFiles = {
			...createDurableMachineFiles(),
			async writeText(
				options: Parameters<
					ReturnType<typeof createDurableMachineFiles>["writeText"]
				>[0],
			) {
				if (options.path.includes("/proposals/living-memory/")) {
					throw new Error("simulated proposal file sync failure");
				}
				return createDurableMachineFiles().writeText(options);
			},
		};
		const failedJudge = vi.fn<CorpusJudgmentProvider["judge"]>((input) =>
			Promise.resolve(
				foldedEpisodeOutput(input.records.map((record) => record.id)),
			),
		);
		await expect(
			createHarness(
				[
					createProjectEpisodeConsolidationSource({
						projectRoot: failedRoot,
					}),
				],
				{ id: "fake/no-tools", judge: failedJudge },
				{
					acceptedJudgmentReceiptStore: createAcceptedJudgmentReceiptStore({
						projectRoot: failedRoot,
					}),
					proposalStore: createConsolidationProposalStore({
						projectRoot: failedRoot,
						durableFiles: failingFiles,
					}),
				},
			).consolidator(),
		).resolves.toMatchObject({
			kind: "failed",
			reason: "simulated proposal file sync failure",
			details: { episodePrunes: [] },
		});
		for (const path of failedPaths) {
			await expect(fileExists(path)).resolves.toBe(true);
		}
	});

	test("restores an episode rewritten at the tombstone boundary", async () => {
		for (const race of ["atomic-replace", "in-place-edit"] as const) {
			const projectRoot = join(tmp.path, `episode-tombstone-${race}`);
			const [episodePath] = await writeEpisodeFixtures(projectRoot, [
				["Episode rewritten during prune", "2026-09-01T16:00:00.000Z"],
			]);
			if (episodePath === undefined) throw new Error("missing episode fixture");
			const changed = `${await readFile(episodePath, "utf-8")}Human rewrite.\n`;
			const baseFiles = createDurableMachineFiles() as ReturnType<
				typeof createDurableMachineFiles
			> & {
				renameFile(options: {
					readonly sourcePath: string;
					readonly destinationPath: string;
				}): Promise<void>;
			};
			let racedAtTombstoneRename = false;
			const source = createProjectEpisodeConsolidationSource({
				projectRoot,
				durableFiles: {
					...baseFiles,
					async renameFile(options) {
						if (options.sourcePath === episodePath && !racedAtTombstoneRename) {
							racedAtTombstoneRename = true;
							const journalPath = join(
								dirname(episodePath),
								".living-memory-episode-prune.json",
							);
							const journal = JSON.parse(
								await readFile(journalPath, "utf-8"),
							) as { tombstonePath: string };
							expect(
								relativeFixturePath(projectRoot, options.destinationPath),
							).toBe(journal.tombstonePath);
							if (race === "atomic-replace") {
								const replacementPath = `${episodePath}.replacement`;
								await writeFile(replacementPath, changed);
								await rename(replacementPath, episodePath);
							} else {
								await writeFile(episodePath, changed);
							}
						}
						await baseFiles.renameFile(options);
					},
				},
			});
			const snapshot = await source.collect({
				limit: 1,
				maxCorpusRecordBytes: 64 * 1024,
				maxCorpusBytes: 256 * 1024,
				maxEpisodeRecordBytes: 64 * 1024,
				maxEpisodeBytes: 256 * 1024,
			});
			const episode = snapshot.records[0];
			if (episode === undefined) throw new Error("missing collected episode");
			const proposalPath = join(
				projectRoot,
				"memory",
				"agent",
				"proposals",
				"living-memory",
				"episode-note.md",
			);
			await mkdir(dirname(proposalPath), { recursive: true });
			await baseFiles.writeText({ path: proposalPath, content: "proposal\n" });

			await expect(
				source.finalize?.([
					{
						id: episode.id,
						digest: episode.digest,
						fileIdentity: episode.fileIdentity,
						proposalPaths: [proposalPath],
					},
				]),
			).resolves.toEqual({ episodePrunes: [], writesCommitted: true });
			expect(racedAtTombstoneRename).toBe(true);
			await expect(readFile(episodePath, "utf-8")).resolves.toBe(changed);
			expect(
				(await readdir(dirname(episodePath))).filter((path) =>
					path.endsWith(".tombstone"),
				),
			).toEqual([]);
			await expect(
				readFile(
					join(dirname(episodePath), ".living-memory-episode-prune.json"),
				),
			).rejects.toMatchObject({ code: "ENOENT" });
		}
	});

	test("reports committed journal and restore writes when finalization prunes no episodes", async () => {
		const projectRoot = join(tmp.path, "episode-empty-prune-write-reporting");
		const episodePaths = await writeEpisodeFixtures(projectRoot, [
			["Episode rewritten during committed prune", "2026-09-01T16:15:00.000Z"],
			["Second rewritten committed prune", "2026-09-01T16:20:00.000Z"],
		]);
		const proposalPath = join(
			projectRoot,
			"memory",
			"agent",
			"proposals",
			"living-memory",
			"episode-note.md",
		);
		await mkdir(dirname(proposalPath), { recursive: true });
		await writeFile(proposalPath, "proposal\n");
		const race = await createEpisodeRestoreRaceSource(
			projectRoot,
			episodePaths,
		);
		const episodeSource = race.source;
		const snapshot = await episodeSource.collect({
			limit: 2,
			maxCorpusRecordBytes: 64 * 1024,
			maxCorpusBytes: 256 * 1024,
			maxEpisodeRecordBytes: 64 * 1024,
			maxEpisodeBytes: 256 * 1024,
		});
		const output = foldedEpisodeOutput(
			snapshot.records.map((record) => record.id),
		);
		const result = await createHarness(
			[episodeSource],
			{
				id: "fake/no-tools",
				judge: async () => {
					throw new Error("existing receipt should bypass judgment");
				},
			},
			{
				acceptedJudgmentReceiptStore: {
					pathFor: (batchKey) => `/tmp/${batchKey}.json`,
					list: async () => [],
					dischargeStale: async () => ({
						paths: [],
						writesCommitted: false,
					}),
					read: async (batchKey) => ({
						schemaVersion: 1,
						batchKey,
						state: "accepted",
						inputDigests: snapshot.records.map((record) => record.digest),
						output,
						path: `/tmp/${batchKey}.json`,
					}),
					write: async () => {
						throw new Error("existing receipt should not be rewritten");
					},
					markMaterialized: async () => {
						throw new Error("empty prune should not materialize receipt");
					},
				},
				proposalStore: {
					readEvidence: async () => [],
					persist: async (input) => ({
						proposalKind: input.proposal.proposalKind,
						key: input.batchKey,
						path: proposalPath,
						inputs: input.observation.inputs,
						contentDigest: createHash("sha256")
							.update("proposal\n")
							.digest("hex"),
						status: "existing",
						writesCommitted: false,
					}),
				},
			},
		).consolidator();
		if (result.kind === "failed") throw new Error(result.reason);

		expect(result).toMatchObject({
			kind: "ran",
			details: { episodePrunes: [], writesCommitted: true },
		});
		expect(race.commits).toEqual({
			journalWrites: 2,
			restores: 2,
			journalRemovals: 2,
		});
		for (const [episodePath, changedBytes] of race.changedBytes) {
			await expect(readFile(episodePath, "utf-8")).resolves.toBe(changedBytes);
		}
		await expect(fileExists(race.journalPath)).resolves.toBe(false);
		expect(
			(await readdir(dirname(episodePaths[0] as string))).filter((path) =>
				path.endsWith(".tombstone"),
			),
		).toEqual([]);
	});

	test("reports committed empty-prune finalization while recovering accepted episodes", async () => {
		const projectRoot = join(
			tmp.path,
			"accepted-episode-empty-prune-reporting",
		);
		const episodePaths = await writeEpisodeFixtures(projectRoot, [
			["First accepted episode rewrite", "2026-09-01T16:25:00.000Z"],
			["Second accepted episode rewrite", "2026-09-01T16:30:00.000Z"],
		]);
		const receiptStore = createAcceptedJudgmentReceiptStore({ projectRoot });
		const proposalStore = createConsolidationProposalStore({ projectRoot });
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>((input) =>
			Promise.resolve(
				foldedEpisodeOutput(input.records.map((record) => record.id)),
			),
		);
		const baseSource = createProjectEpisodeConsolidationSource({ projectRoot });
		const interrupted = await createHarness(
			[
				{
					...baseSource,
					async finalize() {
						throw new Error("stop after accepted output before finalization");
					},
				},
			],
			{ id: "fake/no-tools", judge },
			{ acceptedJudgmentReceiptStore: receiptStore, proposalStore },
		).consolidator();
		expect(interrupted).toMatchObject({
			kind: "failed",
			reason: "stop after accepted output before finalization",
		});

		const race = await createEpisodeRestoreRaceSource(
			projectRoot,
			episodePaths,
		);
		const recovered = await createHarness(
			[race.source],
			{ id: "fake/no-tools", judge },
			{ acceptedJudgmentReceiptStore: receiptStore, proposalStore },
		).consolidator();

		expect(recovered).toMatchObject({
			kind: "ran",
			details: { episodePrunes: [], writesCommitted: true },
		});
		expect(judge).toHaveBeenCalledOnce();
		for (const [episodePath, changedBytes] of race.changedBytes) {
			await expect(readFile(episodePath, "utf-8")).resolves.toBe(changedBytes);
		}
		expect(
			(await readdir(dirname(episodePaths[0] as string))).filter((path) =>
				path.endsWith(".tombstone"),
			),
		).toEqual([]);
		await expect(fileExists(race.journalPath)).resolves.toBe(false);
	});

	test("reports no committed write when finalization skips a changed episode", async () => {
		const projectRoot = join(
			tmp.path,
			"episode-skipped-finalization-reporting",
		);
		const [episodePath] = await writeEpisodeFixtures(projectRoot, [
			["Episode changed before finalization", "2026-09-01T16:35:00.000Z"],
		]);
		if (episodePath === undefined) throw new Error("missing episode fixture");
		const source = createProjectEpisodeConsolidationSource({ projectRoot });
		const snapshot = await source.collect({
			limit: 1,
			maxCorpusRecordBytes: 64 * 1024,
			maxCorpusBytes: 256 * 1024,
			maxEpisodeRecordBytes: 64 * 1024,
			maxEpisodeBytes: 256 * 1024,
		});
		const episode = snapshot.records[0];
		if (episode === undefined) throw new Error("missing collected episode");
		const proposalPath = join(
			projectRoot,
			"memory",
			"agent",
			"proposals",
			"living-memory",
			"episode-note.md",
		);
		await mkdir(dirname(proposalPath), { recursive: true });
		await writeFile(proposalPath, "proposal\n");
		const replacementPath = `${episodePath}.replacement`;
		await writeFile(replacementPath, `${await readFile(episodePath)}changed\n`);
		await rename(replacementPath, episodePath);

		await expect(
			source.finalize?.([
				{
					id: episode.id,
					digest: episode.digest,
					fileIdentity: episode.fileIdentity,
					proposalPaths: [proposalPath],
				},
			]),
		).resolves.toEqual({ episodePrunes: [], writesCommitted: false });
	});

	test("does not clobber a concurrently recreated episode during finalize restore", async () => {
		const projectRoot = join(tmp.path, "episode-finalize-restore-no-clobber");
		const [episodePath] = await writeEpisodeFixtures(projectRoot, [
			["Episode finalize restore race", "2026-09-01T16:30:00.000Z"],
		]);
		if (episodePath === undefined) throw new Error("missing episode fixture");
		const baseFiles = createDurableMachineFiles();
		const capturedBytes = `${await readFile(episodePath, "utf-8")}captured rewrite\n`;
		const concurrentLive = `${await readFile(episodePath, "utf-8")}concurrent live\n`;
		let racedAtRestore = false;
		const source = createProjectEpisodeConsolidationSource({
			projectRoot,
			durableFiles: {
				...baseFiles,
				async renameFile(options) {
					await baseFiles.renameFile(options);
					if (options.sourcePath === episodePath) {
						const replacementPath = `${options.destinationPath}.replacement`;
						await writeFile(replacementPath, capturedBytes);
						await rename(replacementPath, options.destinationPath);
					}
				},
				async restoreFile(options) {
					racedAtRestore = true;
					await writeFile(options.destinationPath, concurrentLive);
					return baseFiles.restoreFile(options);
				},
			},
		});
		const snapshot = await source.collect({
			limit: 1,
			maxCorpusRecordBytes: 64 * 1024,
			maxCorpusBytes: 256 * 1024,
			maxEpisodeRecordBytes: 64 * 1024,
			maxEpisodeBytes: 256 * 1024,
		});
		const episode = snapshot.records[0];
		if (episode === undefined) throw new Error("missing collected episode");
		const proposalPath = join(
			projectRoot,
			"memory",
			"agent",
			"proposals",
			"living-memory",
			"episode-note.md",
		);
		await mkdir(dirname(proposalPath), { recursive: true });
		await baseFiles.writeText({ path: proposalPath, content: "proposal\n" });

		await expect(
			source.finalize?.([
				{
					id: episode.id,
					digest: episode.digest,
					fileIdentity: episode.fileIdentity,
					proposalPaths: [proposalPath],
				},
			]),
		).rejects.toThrow(/restore conflict/u);
		expect(racedAtRestore).toBe(true);
		await expect(readFile(episodePath, "utf-8")).resolves.toBe(concurrentLive);
		const tombstonePath = (await readdir(dirname(episodePath)))
			.filter((path) => path.endsWith(".tombstone"))
			.map((path) => join(dirname(episodePath), path))[0];
		if (tombstonePath === undefined)
			throw new Error("missing episode tombstone");
		await expect(readFile(tombstonePath, "utf-8")).resolves.toBe(capturedBytes);
		await expect(
			fileExists(
				join(dirname(episodePath), ".living-memory-episode-prune.json"),
			),
		).resolves.toBe(true);
	});

	test("does not clobber a concurrently recreated episode during journal recovery", async () => {
		const projectRoot = join(tmp.path, "episode-recovery-restore-no-clobber");
		const [episodePath] = await writeEpisodeFixtures(projectRoot, [
			["Episode recovery restore race", "2026-09-01T16:45:00.000Z"],
		]);
		if (episodePath === undefined) throw new Error("missing episode fixture");
		const original = await readFile(episodePath, "utf-8");
		const baseFiles = createDurableMachineFiles();
		const interruptedSource = createProjectEpisodeConsolidationSource({
			projectRoot,
			durableFiles: {
				...baseFiles,
				async renameFile(options) {
					await baseFiles.renameFile(options);
					if (options.sourcePath === episodePath) {
						throw new Error("stop after episode tombstone rename");
					}
				},
			},
		});
		const snapshot = await interruptedSource.collect({
			limit: 1,
			maxCorpusRecordBytes: 64 * 1024,
			maxCorpusBytes: 256 * 1024,
			maxEpisodeRecordBytes: 64 * 1024,
			maxEpisodeBytes: 256 * 1024,
		});
		const episode = snapshot.records[0];
		if (episode === undefined) throw new Error("missing collected episode");
		const proposalPath = join(
			projectRoot,
			"memory",
			"agent",
			"proposals",
			"living-memory",
			"episode-note.md",
		);
		await mkdir(dirname(proposalPath), { recursive: true });
		await baseFiles.writeText({ path: proposalPath, content: "proposal\n" });
		await expect(
			interruptedSource.finalize?.([
				{
					id: episode.id,
					digest: episode.digest,
					fileIdentity: episode.fileIdentity,
					proposalPaths: [proposalPath],
				},
			]),
		).rejects.toThrow("stop after episode tombstone rename");
		const tombstonePath = (await readdir(dirname(episodePath)))
			.filter((path) => path.endsWith(".tombstone"))
			.map((path) => join(dirname(episodePath), path))[0];
		if (tombstonePath === undefined)
			throw new Error("missing episode tombstone");
		const capturedBytes = `${original}captured recovery rewrite\n`;
		const replacementPath = `${tombstonePath}.replacement`;
		await writeFile(replacementPath, capturedBytes);
		await rename(replacementPath, tombstonePath);
		const concurrentLive = `${original}concurrent recovery live\n`;
		let racedAtRestore = false;
		const recoverySource = createProjectEpisodeConsolidationSource({
			projectRoot,
			durableFiles: {
				...baseFiles,
				async restoreFile(options) {
					racedAtRestore = true;
					await writeFile(options.destinationPath, concurrentLive);
					return baseFiles.restoreFile(options);
				},
			},
		});

		await expect(recoverySource.recover?.()).rejects.toThrow(
			/restore conflict/u,
		);
		expect(racedAtRestore).toBe(true);
		await expect(readFile(episodePath, "utf-8")).resolves.toBe(concurrentLive);
		await expect(readFile(tombstonePath, "utf-8")).resolves.toBe(capturedBytes);
		await expect(
			fileExists(
				join(dirname(episodePath), ".living-memory-episode-prune.json"),
			),
		).resolves.toBe(true);
	});

	test("recovers an episode hard-stopped after the restore link", async () => {
		const projectRoot = join(tmp.path, "episode-recovery-half-restore");
		const [episodePath] = await writeEpisodeFixtures(projectRoot, [
			["Episode half-restored during recovery", "2026-09-01T16:50:00.000Z"],
		]);
		if (episodePath === undefined) throw new Error("missing episode fixture");
		const original = await readFile(episodePath, "utf-8");
		const baseFiles = createDurableMachineFiles();
		const interruptedSource = createProjectEpisodeConsolidationSource({
			projectRoot,
			durableFiles: {
				...baseFiles,
				async renameFile(options) {
					await baseFiles.renameFile(options);
					if (options.sourcePath === episodePath) {
						throw new Error("stop after episode tombstone rename");
					}
				},
			},
		});
		const snapshot = await interruptedSource.collect({
			limit: 1,
			maxCorpusRecordBytes: 64 * 1024,
			maxCorpusBytes: 256 * 1024,
			maxEpisodeRecordBytes: 64 * 1024,
			maxEpisodeBytes: 256 * 1024,
		});
		const episode = snapshot.records[0];
		if (episode === undefined) throw new Error("missing collected episode");
		const proposalPath = join(
			projectRoot,
			"memory",
			"agent",
			"proposals",
			"living-memory",
			"episode-note.md",
		);
		await mkdir(dirname(proposalPath), { recursive: true });
		await baseFiles.writeText({ path: proposalPath, content: "proposal\n" });
		await expect(
			interruptedSource.finalize?.([
				{
					id: episode.id,
					digest: episode.digest,
					fileIdentity: episode.fileIdentity,
					proposalPaths: [proposalPath],
				},
			]),
		).rejects.toThrow("stop after episode tombstone rename");
		const tombstonePath = (await readdir(dirname(episodePath)))
			.filter((path) => path.endsWith(".tombstone"))
			.map((path) => join(dirname(episodePath), path))[0];
		if (tombstonePath === undefined)
			throw new Error("missing episode tombstone");
		const replacementPath = `${tombstonePath}.replacement`;
		await writeFile(replacementPath, original);
		await rename(replacementPath, tombstonePath);

		await expect(runEpisodeRestoreChild(projectRoot)).resolves.toMatchObject({
			code: 86,
			signal: null,
		});
		const [liveIdentity, tombstoneIdentity] = await Promise.all([
			lstat(episodePath),
			lstat(tombstonePath),
		]);
		expect([liveIdentity.dev, liveIdentity.ino]).toEqual([
			tombstoneIdentity.dev,
			tombstoneIdentity.ino,
		]);

		const recoverySource = createProjectEpisodeConsolidationSource({
			projectRoot,
		});
		await expect(recoverySource.recover?.()).resolves.toEqual({
			episodePrunes: [],
			writesCommitted: true,
		});
		await expect(recoverySource.recover?.()).resolves.toEqual({
			episodePrunes: [],
			writesCommitted: false,
		});
		await expect(readFile(episodePath, "utf-8")).resolves.toBe(original);
		await expect(fileExists(tombstonePath)).resolves.toBe(false);
		await expect(
			fileExists(
				join(dirname(episodePath), ".living-memory-episode-prune.json"),
			),
		).resolves.toBe(false);
	});

	test("pages past represented episodes in the production adapter", async () => {
		const projectRoot = join(tmp.path, "paged-episode-project");
		await writeEpisodeFixtures(projectRoot, [
			["First page episode", "2026-09-01T10:00:00.000Z"],
			["Second page episode", "2026-09-01T11:00:00.000Z"],
			["Later page episode", "2026-09-01T12:00:00.000Z"],
		]);
		const source = createProjectEpisodeConsolidationSource({ projectRoot });
		const limits = {
			limit: 2,
			maxCorpusRecordBytes: 64 * 1024,
			maxCorpusBytes: 256 * 1024,
			maxEpisodeRecordBytes: 64 * 1024,
			maxEpisodeBytes: 256 * 1024,
		};
		const first = await source.collect(limits);
		const second = await source.collect({
			...limits,
			representedKeys: first.records.map(
				(record) => `${record.scope}\0${record.path}\0${record.digest}`,
			),
		});

		expect(first.records).toHaveLength(2);
		expect(first.omitted).toBe(1);
		expect(first.deferred).toBe(1);
		expect(second.records).toHaveLength(1);
		expect(second.omitted).toBe(0);
		expect(second.deferred).toBe(0);
		expect(first.records.map((record) => record.id)).not.toContain(
			second.records[0]?.id,
		);
	});

	test("reports episode cap deferrals separately from integrity omissions", async () => {
		const projectRoot = join(tmp.path, "mixed-episode-source-causes");
		await writeEpisodeFixtures(projectRoot, [
			["First mixed episode", "2026-09-01T10:00:00.000Z"],
			["Second mixed episode", "2026-09-01T11:00:00.000Z"],
		]);
		await writeFile(
			join(projectRoot, "memory", "agent", "episodes", "000-malformed.md"),
			"not an OKF episode\n",
		);

		const result = await createHarness(
			[createProjectEpisodeConsolidationSource({ projectRoot })],
			undefined,
			{
				limits: {
					...DEFAULT_LIVING_MEMORY_LIMITS,
					maxCorpusRecords: 1,
					maxEpisodeRecords: 1,
				},
			},
		).consolidator();
		if (result.kind !== "failed" || result.details === undefined) {
			throw new Error("expected incomplete episode inventory to fail the pass");
		}

		expect(result.details.sources).toEqual([
			{
				sourceId: "project-episodes",
				admitted: 1,
				omitted: 2,
				deferred: 1,
				inventoryComplete: false,
			},
		]);
		expect(
			result.details.declines.filter(
				(decline) =>
					decline.code === "source-deferred" ||
					decline.code === "source-inventory-incomplete",
			),
		).toEqual([
			{
				code: "source-deferred",
				count: 1,
				reason:
					"1 record(s) from project-episodes were deferred by the bounded source pass.",
			},
			{
				code: "source-inventory-incomplete",
				count: 1,
				sourceId: "project-episodes",
				reason:
					"Consolidation source project-episodes reported incomplete inventory; absence-dependent work is blocked.",
			},
		]);
	});

	test("declines oversized episode files at the production adapter read boundary", async () => {
		const projectRoot = join(tmp.path, "bounded-episode-adapter-record");
		const [episodePath] = await writeEpisodeFixtures(projectRoot, [
			["Oversized adapter episode", "2026-09-01T12:00:00.000Z"],
		]);
		if (episodePath === undefined) throw new Error("missing episode fixture");
		await writeFile(
			episodePath,
			`${await readFile(episodePath, "utf-8")}${"x".repeat(2_048)}`,
		);

		const snapshot = await createProjectEpisodeConsolidationSource({
			projectRoot,
		}).collect({
			limit: 5,
			maxCorpusRecordBytes: 64 * 1024,
			maxCorpusBytes: 256 * 1024,
			maxEpisodeRecordBytes: 512,
			maxEpisodeBytes: 4_096,
		});

		expect(snapshot).toMatchObject({
			records: [],
			omitted: 1,
			deferred: 1,
			declines: [
				expect.objectContaining({
					code: "source-record-bytes-deferred",
					path: relativeFixturePath(projectRoot, episodePath),
				}),
			],
		});
	});

	test("declines episode files beyond the production adapter aggregate read boundary", async () => {
		const projectRoot = join(tmp.path, "bounded-episode-adapter-aggregate");
		const episodePaths = await writeEpisodeFixtures(projectRoot, [
			["First bounded adapter episode", "2026-09-01T12:00:00.000Z"],
			["Second bounded adapter episode", "2026-09-01T13:00:00.000Z"],
		]);
		const firstPath = episodePaths[0];
		if (firstPath === undefined) throw new Error("missing episode fixture");
		const aggregateLimit = Buffer.byteLength(
			await readFile(firstPath, "utf-8"),
			"utf-8",
		);

		const snapshot = await createProjectEpisodeConsolidationSource({
			projectRoot,
		}).collect({
			limit: 5,
			maxCorpusRecordBytes: 64 * 1024,
			maxCorpusBytes: 256 * 1024,
			maxEpisodeRecordBytes: 4_096,
			maxEpisodeBytes: aggregateLimit,
		});

		expect(snapshot.records).toHaveLength(1);
		expect(snapshot.omitted).toBe(1);
		expect(snapshot.deferred).toBe(1);
		expect(snapshot.declines).toEqual([
			expect.objectContaining({ code: "source-aggregate-bytes-deferred" }),
		]);
	});

	test("reports committed episode bytes when a later durable prune fails", async () => {
		const projectRoot = join(tmp.path, "episode-recovery-write-reporting");
		const episodePaths = await writeEpisodeFixtures(projectRoot, [
			["First recovery episode", "2026-09-01T17:00:00.000Z"],
			["Second recovery episode", "2026-09-01T18:00:00.000Z"],
		]);
		const receiptStore = createAcceptedJudgmentReceiptStore({ projectRoot });
		const proposalStore = createConsolidationProposalStore({ projectRoot });
		const baseSource = createProjectEpisodeConsolidationSource({ projectRoot });
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>((input) =>
			Promise.resolve(
				foldedEpisodeOutput(input.records.map((record) => record.id)),
			),
		);
		const interrupted = await createHarness(
			[
				{
					...baseSource,
					async finalize() {
						throw new Error("stop after accepted output before prune");
					},
				},
			],
			{ id: "fake/no-tools", judge },
			{ acceptedJudgmentReceiptStore: receiptStore, proposalStore },
		).consolidator();
		expect(interrupted.kind).toBe("failed");

		const baseFiles = createDurableMachineFiles();
		let tombstoneRemovals = 0;
		const recoverySource = createProjectEpisodeConsolidationSource({
			projectRoot,
			durableFiles: {
				...baseFiles,
				async removeFile(path) {
					if (path.endsWith(".tombstone")) {
						tombstoneRemovals += 1;
						if (tombstoneRemovals === 2) {
							throw new Error("ordinary second episode removal failure");
						}
					}
					return baseFiles.removeFile(path);
				},
			},
		});
		const recovered = await createHarness(
			[recoverySource],
			{ id: "fake/no-tools", judge },
			{
				acceptedJudgmentReceiptStore: createAcceptedJudgmentReceiptStore({
					projectRoot,
				}),
				proposalStore: createConsolidationProposalStore({ projectRoot }),
			},
		).consolidator();

		expect(recovered).toMatchObject({
			kind: "failed",
			reason: "ordinary second episode removal failure",
			details: { writesCommitted: true },
		});
		expect(
			await Promise.all(episodePaths.map((path) => fileExists(path))),
		).toEqual([false, false]);
		expect(
			(await readdir(join(projectRoot, "memory", "agent", "episodes"))).filter(
				(path) => path.endsWith(".tombstone"),
			),
		).toHaveLength(1);
	});

	test("reports a committed episode prune journal when rename fails before mutation", async () => {
		const projectRoot = join(tmp.path, "episode-prune-journal-write-reporting");
		const [episodePath] = await writeEpisodeFixtures(projectRoot, [
			["Episode awaiting prune rename", "2026-09-01T18:30:00.000Z"],
			["Episode represented in the same fold", "2026-09-01T18:45:00.000Z"],
		]);
		if (episodePath === undefined) throw new Error("missing episode fixture");
		const receiptStore = createAcceptedJudgmentReceiptStore({ projectRoot });
		const proposalStore = createConsolidationProposalStore({ projectRoot });
		const baseSource = createProjectEpisodeConsolidationSource({ projectRoot });
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>((input) =>
			Promise.resolve(
				foldedEpisodeOutput(input.records.map((record) => record.id)),
			),
		);
		const interrupted = await createHarness(
			[
				{
					...baseSource,
					async finalize() {
						throw new Error("stop after accepted output before prune");
					},
				},
			],
			{ id: "fake/no-tools", judge },
			{ acceptedJudgmentReceiptStore: receiptStore, proposalStore },
		).consolidator();
		expect(interrupted.kind).toBe("failed");

		const baseFiles = createDurableMachineFiles();
		const recoverySource = createProjectEpisodeConsolidationSource({
			projectRoot,
			durableFiles: {
				...baseFiles,
				async renameFile(options) {
					if (options.sourcePath === episodePath) {
						throw new Error("ordinary pre-rename failure after journal commit");
					}
					await baseFiles.renameFile(options);
				},
			},
		});
		const recovered = await createHarness(
			[recoverySource],
			{ id: "fake/no-tools", judge },
			{
				acceptedJudgmentReceiptStore: createAcceptedJudgmentReceiptStore({
					projectRoot,
				}),
				proposalStore: createConsolidationProposalStore({ projectRoot }),
			},
		).consolidator();

		await expect(
			fileExists(
				join(
					projectRoot,
					"memory",
					"agent",
					"episodes",
					".living-memory-episode-prune.json",
				),
			),
		).resolves.toBe(true);
		await expect(fileExists(episodePath)).resolves.toBe(true);
		expect(recovered).toMatchObject({
			kind: "failed",
			reason: "ordinary pre-rename failure after journal commit",
			details: { writesCommitted: true },
		});
	});

	test("reports a restored episode when prune journal removal fails before mutation", async () => {
		const projectRoot = join(tmp.path, "episode-prune-restore-write-reporting");
		const [episodePath] = await writeEpisodeFixtures(projectRoot, [
			["Episode awaiting prune recovery", "2026-09-01T18:50:00.000Z"],
		]);
		if (episodePath === undefined) throw new Error("missing episode fixture");
		const baseFiles = createDurableMachineFiles();
		const interruptedSource = createProjectEpisodeConsolidationSource({
			projectRoot,
			durableFiles: {
				...baseFiles,
				async renameFile(options) {
					await baseFiles.renameFile(options);
					if (options.sourcePath === episodePath) {
						throw new Error("stop after episode tombstone rename");
					}
				},
			},
		});
		const snapshot = await interruptedSource.collect({
			limit: 1,
			maxCorpusRecordBytes: 64 * 1024,
			maxCorpusBytes: 256 * 1024,
			maxEpisodeRecordBytes: 64 * 1024,
			maxEpisodeBytes: 256 * 1024,
		});
		const episode = snapshot.records[0];
		if (episode === undefined) throw new Error("missing collected episode");
		const proposalPath = join(
			projectRoot,
			"memory",
			"agent",
			"proposals",
			"living-memory",
			"episode-note.md",
		);
		await mkdir(dirname(proposalPath), { recursive: true });
		await baseFiles.writeText({ path: proposalPath, content: "proposal\n" });
		await expect(
			interruptedSource.finalize?.([
				{
					id: episode.id,
					digest: episode.digest,
					fileIdentity: episode.fileIdentity,
					proposalPaths: [proposalPath],
				},
			]),
		).rejects.toThrow("stop after episode tombstone rename");
		const tombstonePath = (await readdir(dirname(episodePath)))
			.filter((path) => path.endsWith(".tombstone"))
			.map((path) => join(dirname(episodePath), path))[0];
		if (tombstonePath === undefined)
			throw new Error("missing episode tombstone");
		const restoredBytes = "changed tombstone bytes requiring recovery\n";
		await writeFile(tombstonePath, restoredBytes);
		const journalPath = join(
			projectRoot,
			"memory",
			"agent",
			"episodes",
			".living-memory-episode-prune.json",
		);
		const recoverySource = createProjectEpisodeConsolidationSource({
			projectRoot,
			durableFiles: {
				...baseFiles,
				async removeFile(path) {
					if (path === journalPath) {
						throw new Error(
							"ordinary pre-remove failure after episode restore",
						);
					}
					return baseFiles.removeFile(path);
				},
			},
		});

		const recovered = await createHarness([recoverySource]).consolidator();

		await expect(readFile(episodePath, "utf-8")).resolves.toBe(restoredBytes);
		await expect(fileExists(tombstonePath)).resolves.toBe(false);
		await expect(fileExists(journalPath)).resolves.toBe(true);
		expect(recovered).toMatchObject({
			kind: "failed",
			reason: "ordinary pre-remove failure after episode restore",
			details: { writesCommitted: true },
		});
	});

	test("reports committed episode bytes when removal fails after unlink", async () => {
		const projectRoot = join(tmp.path, "episode-post-unlink-sync-failure");
		const [episodePath] = await writeEpisodeFixtures(projectRoot, [
			["Episode removed before sync failure", "2026-09-01T19:00:00.000Z"],
		]);
		if (episodePath === undefined) throw new Error("missing episode fixture");
		const baseFiles = createDurableMachineFiles();
		const source = createProjectEpisodeConsolidationSource({
			projectRoot,
			durableFiles: {
				...baseFiles,
				async removeFile(path) {
					const removal = await baseFiles.removeFile(path);
					if (path.endsWith(".tombstone")) {
						throw new Error("simulated post-unlink directory sync failure");
					}
					return removal;
				},
			},
		});
		const snapshot = await source.collect({
			limit: 1,
			maxCorpusRecordBytes: 64 * 1024,
			maxCorpusBytes: 256 * 1024,
			maxEpisodeRecordBytes: 64 * 1024,
			maxEpisodeBytes: 256 * 1024,
		});
		const episode = snapshot.records[0];
		if (episode === undefined) throw new Error("missing collected episode");
		const proposalPath = join(
			projectRoot,
			"memory",
			"agent",
			"proposals",
			"living-memory",
			"episode-note.md",
		);
		await mkdir(dirname(proposalPath), { recursive: true });
		await baseFiles.writeText({ path: proposalPath, content: "proposal\n" });

		await expect(
			source.finalize?.([
				{
					id: episode.id,
					digest: episode.digest,
					fileIdentity: episode.fileIdentity,
					proposalPaths: [proposalPath],
				},
			]),
		).rejects.toMatchObject({
			message: "simulated post-unlink directory sync failure",
			writesCommitted: true,
		});
		await expect(fileExists(episodePath)).resolves.toBe(false);
	});

	// @cosmo-behavior plan:living-memory#B-014
	test("executes the versioned project payload through the shared factory and store seam", async () => {
		type JobContext = {
			readonly projectRoot: string;
			readonly dependencies: LivingMemoryConsolidatorDependencies;
			readonly createConsolidator?: typeof createLivingMemoryConsolidator;
			readonly createKnowledgeStore?: typeof createKnowledgeMemoryStore;
		};
		const dependencyAccesses: string[] = [];
		const inaccessibleContext = Object.defineProperties(
			{},
			{
				projectRoot: {
					get() {
						dependencyAccesses.push("projectRoot");
						throw new Error("invalid payload accessed project root");
					},
				},
				dependencies: {
					get() {
						dependencyAccesses.push("dependencies");
						throw new Error("invalid payload accessed dependencies");
					},
				},
			},
		) as JobContext;
		const invalidPayloads = [
			null,
			{},
			{
				kind: "other.job",
				version: 1,
				scope: "project",
				dryRun: false,
				modelMode: "full",
			},
			{
				kind: "living-memory.consolidate",
				version: 2,
				scope: "project",
				dryRun: false,
				modelMode: "full",
			},
			{
				kind: "living-memory.consolidate",
				version: 1,
				scope: "user",
				dryRun: false,
				modelMode: "full",
			},
			{
				kind: "living-memory.consolidate",
				version: 1,
				scope: "project",
				dryRun: false,
				modelMode: "full",
				schedule: "hourly",
			},
			{
				kind: "living-memory.consolidate",
				version: 1,
				scope: "project",
				dryRun: false,
				modelMode: "full",
				projectRoot: "/embedded/absolute/root",
			},
		];
		for (const payload of invalidPayloads) {
			await expect(
				executeLivingMemoryConsolidationJob(payload, inaccessibleContext),
			).rejects.toThrow(/living-memory payload/i);
		}
		expect(dependencyAccesses).toEqual([]);

		const projectRoot = join(tmp.path, "payload-project");
		const collect = vi.fn(async () => ({
			records: [],
			inventoryComplete: true,
			omitted: 0,
			deferred: 0,
		}));
		const harness = createHarness([{ id: "corpus", collect }]);
		const createConsolidator = vi.fn(createLivingMemoryConsolidator);
		let storeConsolidate:
			| ReturnType<typeof vi.fn<MemoryStore["consolidate"]>>
			| undefined;
		const createKnowledgeStore = vi.fn(
			(options: Parameters<typeof createKnowledgeMemoryStore>[0]) => {
				const store = createKnowledgeMemoryStore(options);
				storeConsolidate = vi.fn((input) => store.consolidate(input));
				return { ...store, consolidate: storeConsolidate };
			},
		);
		const payload = {
			kind: "living-memory.consolidate",
			version: 1,
			scope: "project",
			dryRun: true,
			modelMode: "deterministic-only",
		} as const;
		await expect(
			executeLivingMemoryConsolidationJob(payload, {
				projectRoot,
				dependencies: harness.dependencies,
				createConsolidator,
				createKnowledgeStore,
			}),
		).resolves.toMatchObject({
			kind: "noop",
			details: {
				dryRun: true,
				modelMode: "deterministic-only",
			},
		});
		expect(createConsolidator).toHaveBeenCalledOnce();
		expect(createConsolidator).toHaveBeenCalledWith(harness.dependencies);
		expect(createKnowledgeStore).toHaveBeenCalledOnce();
		expect(createKnowledgeStore).toHaveBeenCalledWith({
			projectRoot,
			consolidator: expect.any(Function),
		});
		expect(storeConsolidate).toHaveBeenCalledWith({
			dryRun: true,
			modelMode: "deterministic-only",
		});
		expect(collect).toHaveBeenCalledOnce();
		expect(JSON.stringify(payload)).not.toContain(projectRoot);
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
		).resolves.toMatchObject({
			kind: "ran",
			details: {
				observations: [],
				proposals: [],
				retirements: [],
				writesCommitted: true,
			},
		});
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
				label: "complete inventory",
				source: {
					id: "future-reflections",
					async collect() {
						return {
							records: [],
							inventoryComplete: true,
							omitted: 1,
							deferred: 1,
						};
					},
				},
			},
			{
				label: "deferred count",
				source: {
					id: "future-reflections",
					async collect() {
						return {
							records: [],
							inventoryComplete: true,
							omitted: 0,
							deferred: 1,
						};
					},
				},
			},
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

		await expect(
			createConsolidator(
				["first-index", "second-index"].map((id) => ({
					id,
					async collect() {
						return {
							records: [],
							inventoryComplete: true,
							knowledgeIndex: { records: [], warnings: [] },
							omitted: 0,
							deferred: 0,
						};
					},
				})),
			)(),
		).resolves.toMatchObject({
			kind: "failed",
			reason: expect.stringMatching(/multiple knowledge-index/iu),
		});
	});

	// @cosmo-behavior plan:living-memory#B-010
	test("rejects an oversized source record before model judgment", async () => {
		const oversized = record({
			id: "oversized-corpus",
			sourceId: "corpus",
			path: "knowledge/oversized.md",
			kind: "knowledge",
			content: "x".repeat(64 * 1024 + 1),
		});
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [],
		}));

		await expect(
			createHarness([source("corpus", [oversized])], {
				id: "fake/no-tools",
				judge,
			}).consolidator(),
		).resolves.toMatchObject({
			kind: "failed",
			reason: expect.stringMatching(/oversized-corpus.*65,536.*bytes/iu),
		});
		expect(judge).not.toHaveBeenCalled();
	});

	test("rejects aggregate source body overflow before model judgment", async () => {
		const records = Array.from({ length: 5 }, (_, index) =>
			record({
				id: `aggregate-${index}`,
				sourceId: "corpus",
				path: `knowledge/aggregate-${index}.md`,
				kind: "knowledge",
				content: "x".repeat(60 * 1024),
			}),
		);
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [],
		}));

		await expect(
			createHarness([source("corpus", records)], {
				id: "fake/no-tools",
				judge,
			}).consolidator(),
		).resolves.toMatchObject({
			kind: "failed",
			reason: expect.stringMatching(/corpus.*aggregate.*262,144.*bytes/iu),
		});
		expect(judge).not.toHaveBeenCalled();
	});

	test("rejects an oversized episode before model judgment", async () => {
		const oversized = record({
			id: "oversized-episode",
			sourceId: "episodes",
			path: "memory/agent/episodes/oversized.md",
			kind: "episode",
			content: "x".repeat(64 * 1024 + 1),
		});
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [],
		}));

		await expect(
			createHarness([source("episodes", [oversized])], {
				id: "fake/no-tools",
				judge,
			}).consolidator(),
		).resolves.toMatchObject({
			kind: "failed",
			reason: expect.stringMatching(/oversized-episode.*65,536.*bytes/iu),
		});
		expect(judge).not.toHaveBeenCalled();
	});

	test("rejects aggregate episode body overflow before model judgment", async () => {
		const episodes = Array.from({ length: 5 }, (_, index) =>
			record({
				id: `aggregate-episode-${index}`,
				sourceId: "episodes",
				path: `memory/agent/episodes/aggregate-${index}.md`,
				kind: "episode",
				content: "x".repeat(60 * 1024),
			}),
		);
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [],
		}));

		await expect(
			createHarness([source("episodes", episodes)], {
				id: "fake/no-tools",
				judge,
			}).consolidator(),
		).resolves.toMatchObject({
			kind: "failed",
			reason: expect.stringMatching(/episode.*aggregate.*262,144.*bytes/iu),
		});
		expect(judge).not.toHaveBeenCalled();
	});

	test("rejects an oversized serialized judgment request before dispatch", async () => {
		const input = record({
			id: "request-bound",
			sourceId: "corpus",
			path: "knowledge/request-bound.md",
			kind: "knowledge",
			content: "# Request bound\n",
		});
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [],
		}));
		const harness = createHarness(
			[source("corpus", [input])],
			{ id: "fake/no-tools", judge },
			{
				limits: {
					...DEFAULT_LIVING_MEMORY_LIMITS,
					maxJudgmentRequestBytes: 1,
				},
			},
		);

		await expect(harness.consolidator()).resolves.toMatchObject({
			kind: "failed",
			reason: expect.stringMatching(/judgment request.*1 byte/iu),
			details: { writesCommitted: false },
		});
		expect(judge).not.toHaveBeenCalled();
		expect(
			harness.dependencies.acceptedJudgmentReceiptStore.write,
		).not.toHaveBeenCalled();
		expect(harness.dependencies.proposalStore.persist).not.toHaveBeenCalled();
	});

	test("rejects oversized model output before writing a receipt or proposal", async () => {
		const inputs = ["first", "second"].map((id) =>
			record({
				id,
				sourceId: "corpus",
				path: `knowledge/${id}.md`,
				kind: "knowledge",
				content: `# ${id}\n`,
			}),
		);
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [
				{
					kind: "duplicate",
					inputIds: ["first"],
					reason: "x".repeat(1_024),
				},
			],
		}));
		const harness = createHarness(
			[source("corpus", inputs)],
			{ id: "fake/no-tools", judge },
			{
				limits: {
					...DEFAULT_LIVING_MEMORY_LIMITS,
					maxJudgmentOutputBytes: 128,
				},
			},
		);

		await expect(harness.consolidator()).resolves.toMatchObject({
			kind: "failed",
			reason: expect.stringMatching(/judgment output.*128 bytes/iu),
			details: { writesCommitted: false },
		});
		expect(judge).toHaveBeenCalledOnce();
		expect(
			harness.dependencies.acceptedJudgmentReceiptStore.write,
		).not.toHaveBeenCalled();
		expect(harness.dependencies.proposalStore.persist).not.toHaveBeenCalled();
	});

	test("defers oversized production corpus bodies with explicit evidence", async () => {
		const projectRoot = join(tmp.path, "oversized-production-corpus");
		const userRoot = join(tmp.path, "oversized-production-user");
		await mkdir(join(projectRoot, "knowledge"), { recursive: true });
		await mkdir(join(userRoot, "knowledge"), { recursive: true });
		await writeFile(
			join(projectRoot, "knowledge", "oversized.md"),
			`${knowledgeFixture({ resource: "oversized.md" })}${"x".repeat(64 * 1024)}`,
		);
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [],
		}));
		const harness = createHarness(
			[
				createProjectCorpusConsolidationSource({
					projectRoot,
					userCosmonautsRoot: userRoot,
				}),
			],
			{ id: "fake/no-tools", judge },
		);

		await expect(harness.consolidator()).resolves.toMatchObject({
			kind: "noop",
			details: {
				sources: [{ sourceId: "project-corpus", admitted: 0, omitted: 1 }],
				declines: expect.arrayContaining([
					expect.objectContaining({
						code: "source-record-bytes-deferred",
						path: "knowledge/oversized.md",
					}),
				]),
			},
		});
		expect(judge).not.toHaveBeenCalled();
	});

	// @cosmo-behavior plan:living-memory-fidelity#B-005
	test("keeps receipts and blocks dependent work when corpus inventory is incomplete", async () => {
		const projectRoot = join(tmp.path, "incomplete-corpus-barrier");
		const receiptStore = createAcceptedJudgmentReceiptStore({ projectRoot });
		const receiptDigest = createHash("sha256")
			.update("temporarily unreadable record")
			.digest("hex");
		const batchKey = createHash("sha256")
			.update("incomplete corpus receipt")
			.digest("hex");
		const receiptPath = receiptStore.pathFor(batchKey);
		await receiptStore.write({
			schemaVersion: 1,
			batchKey,
			state: "accepted",
			inputDigests: [receiptDigest],
			inputs: [
				{
					id: "knowledge/temporarily-unreadable.md",
					sourceId: "project-corpus",
					scope: "project",
					path: "knowledge/temporarily-unreadable.md",
					digest: receiptDigest,
				},
			],
			output: { schemaVersion: 1, observations: [] },
			path: receiptPath,
		});
		await receiptStore.markMaterialized(batchKey);
		const dischargeStale = vi.spyOn(receiptStore, "dischargeStale");
		const markMaterialized = vi.spyOn(receiptStore, "markMaterialized");
		const warning = {
			path: join(projectRoot, "knowledge", "temporarily-unreadable.md"),
			message: "simulated unreadable knowledge record",
		};
		const recover = vi.fn<NonNullable<ConsolidationSource["recover"]>>(
			async () => ({
				episodePrunes: ["memory/agent/episodes/recovered.md"],
				writesCommitted: true,
			}),
		);
		const incompleteSource: ConsolidationSource = {
			id: "project-corpus",
			recover,
			async collect() {
				return {
					records: [],
					inventory: [],
					inventoryComplete: false,
					knowledgeIndex: { records: [], warnings: [warning] },
					omitted: 1,
					deferred: 0,
					warnings: [warning],
				};
			},
		};
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [],
		}));
		const persist = vi.fn(async () => {
			throw new Error("proposal materialization must stay blocked");
		});
		const inspect = vi.fn<LivingMemoryRetirementStore["inspect"]>(async () => ({
			recovery: "none",
			warnings: [],
			representedKeys: [],
		}));
		const apply = vi.fn<LivingMemoryRetirementStore["apply"]>(async () => ({
			kind: "completed",
			details: {
				retirements: [],
				declines: [],
				warnings: [],
				recovery: "none",
				writesCommitted: false,
			},
		}));
		const harness = createHarness(
			[incompleteSource],
			{ id: "fake/no-tools", judge },
			{
				acceptedJudgmentReceiptStore: receiptStore,
				proposalStore: { readEvidence: vi.fn(async () => []), persist },
				retirementStore: { inspect, apply },
			},
		);

		const result = await harness.consolidator();

		expect(result).toMatchObject({
			kind: "failed",
			reason: "Consolidation source inventory is incomplete.",
			details: {
				sources: [{ sourceId: "project-corpus", admitted: 0, omitted: 1 }],
				episodePrunes: ["memory/agent/episodes/recovered.md"],
				warnings: [warning],
				declines: expect.arrayContaining([
					expect.objectContaining({ code: "source-inventory-incomplete" }),
				]),
				writesCommitted: true,
			},
		});
		await expect(fileExists(receiptPath)).resolves.toBe(true);
		expect(recover).toHaveBeenCalledOnce();
		expect(dischargeStale).not.toHaveBeenCalled();
		expect(markMaterialized).not.toHaveBeenCalled();
		expect(inspect).not.toHaveBeenCalled();
		expect(judge).not.toHaveBeenCalled();
		expect(persist).not.toHaveBeenCalled();
		expect(apply).toHaveBeenCalledOnce();
		expect(
			apply.mock.calls.every(([input]) => input.candidates.length === 0),
		).toBe(true);
	});

	test("distinguishes integrity omissions from bounded source deferrals", async () => {
		const integrityRoot = join(tmp.path, "integrity-only-source");
		const boundedRoot = join(tmp.path, "bounded-only-source");
		await Promise.all([
			mkdir(join(integrityRoot, "knowledge"), { recursive: true }),
			mkdir(join(boundedRoot, "knowledge"), { recursive: true }),
		]);
		await Promise.all([
			writeFile(
				join(integrityRoot, "knowledge", "malformed.md"),
				"not an OKF knowledge record\n",
			),
			writeFile(
				join(boundedRoot, "knowledge", "first.md"),
				knowledgeFixture({ resource: "first.md" }),
			),
			writeFile(
				join(boundedRoot, "knowledge", "second.md"),
				knowledgeFixture({ resource: "second.md" }),
			),
		]);
		const integrityResult = await createHarness([
			createProjectCorpusConsolidationSource({
				projectRoot: integrityRoot,
				userCosmonautsRoot: join(tmp.path, "integrity-only-user"),
			}),
		]).consolidator();
		const boundedResult = await createHarness(
			[
				createProjectCorpusConsolidationSource({
					projectRoot: boundedRoot,
					userCosmonautsRoot: join(tmp.path, "bounded-only-user"),
				}),
			],
			undefined,
			{
				limits: {
					...DEFAULT_LIVING_MEMORY_LIMITS,
					maxCorpusRecords: 1,
					maxEpisodeRecords: 1,
				},
			},
		).consolidator();
		if (
			integrityResult.kind !== "failed" ||
			integrityResult.details === undefined
		) {
			throw new Error("expected incomplete source inventory to fail the pass");
		}
		if (boundedResult.details === undefined) {
			throw new Error("expected bounded source details");
		}

		expect(integrityResult.details.sources).toEqual([
			{
				sourceId: "project-corpus",
				admitted: 0,
				omitted: 1,
				deferred: 0,
				inventoryComplete: false,
			},
		]);
		expect(boundedResult.details.sources).toEqual([
			{
				sourceId: "project-corpus",
				admitted: 1,
				omitted: 1,
				deferred: 1,
				inventoryComplete: true,
			},
		]);
		expect(
			boundedResult.details.declines.filter(
				(decline) => decline.code === "source-deferred",
			),
		).toEqual([
			{
				code: "source-deferred",
				count: 1,
				reason:
					"1 record(s) from project-corpus were deferred by the bounded source pass.",
			},
		]);
		expect(
			integrityResult.details.declines.filter(
				(decline) => decline.code === "source-inventory-incomplete",
			),
		).toEqual([
			{
				code: "source-inventory-incomplete",
				count: 1,
				sourceId: "project-corpus",
				reason:
					"Consolidation source project-corpus reported incomplete inventory; absence-dependent work is blocked.",
			},
		]);
		expect(
			integrityResult.details.declines.some(
				(decline) => decline.code === "source-deferred",
			),
		).toBe(false);
		expect(
			boundedResult.details.declines.some(
				(decline) => decline.code === "source-inventory-incomplete",
			),
		).toBe(false);
	});

	test("reports cap deferrals and integrity omissions for the same source", async () => {
		const projectRoot = join(tmp.path, "mixed-source-causes");
		const userCosmonautsRoot = join(tmp.path, "mixed-source-causes-user");
		await mkdir(join(projectRoot, "knowledge"), { recursive: true });
		await Promise.all([
			writeFile(
				join(projectRoot, "knowledge", "first.md"),
				knowledgeFixture({ resource: "first.md" }),
			),
			writeFile(
				join(projectRoot, "knowledge", "second.md"),
				knowledgeFixture({ resource: "second.md" }),
			),
			writeFile(
				join(projectRoot, "knowledge", "malformed.md"),
				"not an OKF knowledge record\n",
			),
		]);
		const mixedSource = createProjectCorpusConsolidationSource({
			projectRoot,
			userCosmonautsRoot,
		});

		const result = await createHarness([mixedSource], undefined, {
			limits: {
				...DEFAULT_LIVING_MEMORY_LIMITS,
				maxCorpusRecords: 1,
				maxEpisodeRecords: 1,
			},
		}).consolidator();
		if (result.kind !== "failed" || result.details === undefined) {
			throw new Error("expected incomplete source inventory to fail the pass");
		}

		expect(
			result.details.declines.filter(
				(decline) =>
					decline.code === "source-deferred" ||
					decline.code === "source-inventory-incomplete",
			),
		).toEqual([
			{
				code: "source-deferred",
				count: 1,
				reason:
					"1 record(s) from project-corpus were deferred by the bounded source pass.",
			},
			{
				code: "source-inventory-incomplete",
				count: 1,
				sourceId: "project-corpus",
				reason:
					"Consolidation source project-corpus reported incomplete inventory; absence-dependent work is blocked.",
			},
		]);
		expect(result.details.sources).toEqual([
			{
				sourceId: "project-corpus",
				admitted: 1,
				omitted: 2,
				deferred: 1,
				inventoryComplete: false,
			},
		]);
	});

	test("identifies an incomplete source with no omissions or warnings", async () => {
		const incompleteSource: ConsolidationSource = {
			id: "silent-incomplete-source",
			async collect() {
				return {
					records: [],
					inventory: [],
					inventoryComplete: false,
					knowledgeIndex: { records: [], warnings: [] },
					omitted: 0,
					deferred: 0,
				};
			},
		};

		const result = await createHarness([incompleteSource]).consolidator();
		if (result.kind !== "failed" || result.details === undefined) {
			throw new Error("expected incomplete source inventory to fail the pass");
		}

		expect(result.details.sources).toEqual([
			{
				sourceId: "silent-incomplete-source",
				admitted: 0,
				omitted: 0,
				deferred: 0,
				inventoryComplete: false,
			},
		]);
		expect(result.details.declines).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "source-inventory-incomplete",
					sourceId: "silent-incomplete-source",
				}),
			]),
		);
	});

	// @cosmo-behavior plan:living-memory-fidelity#B-008
	test("preserves source-recovery episode prunes and committed writes in the final result", async () => {
		const recoveredEpisode = "memory/agent/episodes/recovered-only.md";
		const recoveryOnlySource: ConsolidationSource = {
			id: "episodes",
			async recover() {
				return {
					episodePrunes: [recoveredEpisode],
					writesCommitted: true,
				};
			},
			async collect() {
				return {
					records: [],
					inventory: [],
					inventoryComplete: true,
					knowledgeIndex: { records: [], warnings: [] },
					omitted: 0,
					deferred: 0,
				};
			},
		};

		const result = await createHarness([recoveryOnlySource]).consolidator();

		expect(result).toMatchObject({
			kind: "ran",
			details: {
				episodePrunes: [recoveredEpisode],
				writesCommitted: true,
			},
		});
	});

	test("rejects a complete inventory claim that omits an admitted current record", async () => {
		const projectRoot = join(tmp.path, "incomplete-custom-inventory");
		const receiptStore = createAcceptedJudgmentReceiptStore({ projectRoot });
		const current = record({
			id: "live-record",
			sourceId: "custom",
			path: "knowledge/live-record.md",
			kind: "knowledge",
			content: "# Still live\n",
		});
		const batchKey = createHash("sha256")
			.update("incomplete custom inventory receipt")
			.digest("hex");
		const receiptPath = receiptStore.pathFor(batchKey);
		await receiptStore.write({
			schemaVersion: 1,
			batchKey,
			state: "accepted",
			inputDigests: [current.digest],
			inputs: [
				{
					id: current.id,
					sourceId: current.sourceId,
					scope: current.scope,
					path: current.path,
					digest: current.digest,
				},
			],
			output: { schemaVersion: 1, observations: [] },
			path: receiptPath,
		});
		await receiptStore.markMaterialized(batchKey);
		const dischargeStale = vi.spyOn(receiptStore, "dischargeStale");
		const lyingSource: ConsolidationSource = {
			id: "custom",
			async collect() {
				return {
					records: [current],
					inventory: [],
					inventoryComplete: true,
					omitted: 0,
					deferred: 0,
				};
			},
		};
		const harness = createHarness([lyingSource], undefined, {
			acceptedJudgmentReceiptStore: receiptStore,
		});

		const result = await harness.consolidator({
			modelMode: "deterministic-only",
		});

		expect.soft(result).toMatchObject({
			kind: "failed",
			reason: expect.stringMatching(/complete inventory.*admitted records/iu),
		});
		expect.soft(dischargeStale).not.toHaveBeenCalled();
		await expect.soft(fileExists(receiptPath)).resolves.toBe(true);
	});

	test("preserves source warnings when dry-run retirement recovery blocks the pass", async () => {
		const sourceWarning = {
			path: "memory/agent/episodes/broken.md",
			message: "Source warning",
		};
		const retirementWarning = {
			path: "memory/agent/retirements/pending.md",
			message: "Retirement warning",
		};
		const inspect = vi.fn<LivingMemoryRetirementStore["inspect"]>(async () => ({
			recovery: "pending",
			warnings: [retirementWarning],
			representedKeys: [],
		}));
		const harness = createHarness(
			[
				{
					id: "warning-source",
					async collect() {
						return {
							records: [],
							inventory: [],
							inventoryComplete: true,
							omitted: 0,
							deferred: 0,
							warnings: [sourceWarning],
						};
					},
				},
			],
			undefined,
			{ retirementStore: { inspect, apply: vi.fn() } },
		);

		const result = await harness.consolidator({
			dryRun: true,
			modelMode: "deterministic-only",
		});

		expect(result).toMatchObject({
			kind: "failed",
			reason:
				"Dry-run observes retirement state but never acquires a lock or performs recovery.",
			details: {
				warnings: [sourceWarning, retirementWarning],
				recovery: "pending",
			},
		});
	});

	// @cosmo-behavior plan:living-memory-fidelity#B-001
	test("matches pressure to injection for both round-7 divergence directions", async () => {
		const smallIndex = [
			indexRecord({
				title: "One",
				description: "Small injection.",
				resource: "knowledge/small.md",
			}),
		];
		const largeIndex = Array.from({ length: 50 }, (_, index) =>
			indexRecord({
				title: `Large injected record ${index}`,
				description: `Large metadata ${"x".repeat(72)}`,
				resource: `knowledge/large-${index}.md`,
				timestamp: new Date(Date.UTC(2026, 8, 2, 12, 0, index)).toISOString(),
			}),
		);
		const descriptorWarning = { message: "One malformed record was omitted." };
		const projected = KNOWLEDGE_INDEX_RETRIEVAL.toRenderInput({
			records: smallIndex,
			inventoryRecords: largeIndex.map((record) => ({ record })),
			warnings: [descriptorWarning],
		});
		expect(Object.isFrozen(KNOWLEDGE_INDEX_RETRIEVAL)).toBe(true);
		expect(Object.isFrozen(KNOWLEDGE_INDEX_RETRIEVAL.scopes)).toBe(true);
		expect(Object.isFrozen(KNOWLEDGE_INDEX_RETRIEVAL.query)).toBe(true);
		expect(KNOWLEDGE_INDEX_RETRIEVAL.scopes).toEqual(["project", "user"]);
		expect(KNOWLEDGE_INDEX_RETRIEVAL.query).toEqual({
			text: "",
			recordTypes: ["decision", "trade-off", "gotcha", "convention"],
		});
		expect(projected.records).toHaveLength(50);
		expect(projected.records.every((record) => record.content === "")).toBe(
			true,
		);
		expect(projected.warnings).toEqual([descriptorWarning]);
		expect(
			KNOWLEDGE_INDEX_RETRIEVAL.resolveUserCosmonautsRoot(
				join(tmp.path, "canonical-user", "..", "user"),
			),
		).toBe(resolve(tmp.path, "user"));
		const cases = [
			{
				name: "over-measured",
				injected: smallIndex,
				inventory: largeIndex,
			},
			{
				name: "false-fit",
				injected: largeIndex,
				inventory: smallIndex,
			},
		] as const;

		for (const fixture of cases) {
			const renderInput = Object.freeze({
				records: Object.freeze(fixture.injected),
				warnings: Object.freeze([]),
			});
			const inventory = fixture.inventory.map((item, index) => ({
				id: `${fixture.name}-${index}`,
				sourceId: fixture.name,
				scope: item.scope === "user" ? ("user" as const) : ("project" as const),
				path: item.resource,
				digest: createHash("sha256")
					.update(`${fixture.name}-${index}`)
					.digest("hex"),
				kind: "knowledge" as const,
				metadata: {
					type: item.type,
					title: item.title,
					description: item.description,
					resource: item.resource,
					tags: item.tags,
					timestamp: item.timestamp,
				},
			}));
			const sourceWithExactIndex: ConsolidationSource = {
				id: fixture.name,
				async collect() {
					return {
						records: [],
						inventory,
						inventoryComplete: true,
						omitted: 0,
						deferred: 0,
						knowledgeIndex: renderInput,
					};
				},
			};
			const policy = createKnowledgeIndexPressurePolicy();
			const harness = createHarness([sourceWithExactIndex], undefined, {
				indexPressure: policy,
			});

			const result = await harness.consolidator({
				modelMode: "deterministic-only",
			});
			const rendered = renderKnowledgeIndex(renderInput);
			const injectedBytes = Buffer.byteLength(rendered ?? "", "utf-8");
			if (fixture.name === "over-measured") {
				expect(injectedBytes).toBeGreaterThan(350);
				expect(injectedBytes).toBeLessThan(400);
			} else {
				expect(injectedBytes).toBeGreaterThan(12_000);
				expect(injectedBytes).toBeLessThan(12_500);
			}
			expect.soft(result.details?.indexPressure, fixture.name).toMatchObject({
				kind: "measured",
				renderedBytes: injectedBytes,
			});
		}
	});

	// @cosmo-behavior plan:living-memory-fidelity#B-002
	test("marks pressure unusable instead of reporting a false fit without an exact render input", async () => {
		const projectRoot = join(tmp.path, "unusable-index-pressure");
		await mkdir(projectRoot, { recursive: true });
		await writeFile(join(projectRoot, "fixed.txt"), "fixed\n");
		const candidate = record({
			id: "unusable-pressure-retirement",
			sourceId: "lossy-knowledge",
			path: "knowledge/unusable.md",
			kind: "knowledge",
			content: "# Unusable pressure\n",
			metadata: {
				type: "gotcha",
				title: "Unusable pressure",
				description: "Exact index metadata is unavailable.",
				resource: "knowledge/unusable.md",
				tags: ["memory"],
				timestamp: "2026-09-02T12:00:00.000Z",
				retireWhen: {
					condition: "The replacement exists.",
					check: { kind: "path-exists", path: "fixed.txt" },
				},
				scopeRoot: projectRoot,
			},
		});
		const { content: _content, ...inventory } = candidate;
		const exactRenderInput: KnowledgeIndexRenderInput = Object.freeze({
			records: Object.freeze([
				indexRecord({
					title: "Unusable pressure",
					description: "Exact index metadata is available again.",
					resource: candidate.path,
				}),
			]),
			warnings: Object.freeze([]),
		});
		let pass = 0;
		const sourceWithoutExactIndex: ConsolidationSource = {
			id: candidate.sourceId,
			async collect(options) {
				pass += 1;
				const represented = new Set(options.representedKeys);
				const records = represented.has(
					`${candidate.scope}\0${candidate.path}\0${candidate.digest}`,
				)
					? []
					: [candidate];
				const snapshot = {
					records,
					inventory: [{ ...inventory, metadata: { type: "gotcha" } }],
					inventoryComplete: true,
					omitted: 0,
					deferred: 0,
				};
				return pass === 1
					? snapshot
					: { ...snapshot, knowledgeIndex: exactRenderInput };
			},
		};
		const receipts: AcceptedJudgmentReceipt[] = [];
		const receiptStore = inMemoryReceiptStore(receipts);
		const markMaterialized = vi.spyOn(receiptStore, "markMaterialized");
		const apply = vi.fn<LivingMemoryRetirementStore["apply"]>(
			async (input) => ({
				kind: "completed" as const,
				details: {
					retirements: input.candidates.map((retirement) => ({
						path: retirement.record.path,
						digest: retirement.record.digest,
						status: "applied" as const,
						reason: retirement.reason,
					})),
					declines: [],
					warnings: [],
					recovery: "none" as const,
					writesCommitted: input.candidates.length > 0,
				},
			}),
		);
		const harness = createHarness(
			[sourceWithoutExactIndex],
			{
				id: "fake/no-tools",
				judge: vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
					schemaVersion: 1,
					observations: [],
				})),
			},
			{
				acceptedJudgmentReceiptStore: receiptStore,
				retirementStore: {
					inspect: vi.fn(async () => ({
						recovery: "none" as const,
						warnings: [],
						representedKeys: [],
					})),
					apply,
				},
			},
		);

		const blocked = await harness.consolidator();

		expect.soft(blocked).toMatchObject({
			kind: "ran",
			details: {
				indexPressure: {
					kind: "unusable",
					targetSatisfied: false,
					reason: expect.stringContaining("exact knowledge-index render input"),
				},
				declines: expect.arrayContaining([
					expect.objectContaining({ code: "index-pressure-unusable" }),
					expect.objectContaining({ code: "retirement-pressure-deferred" }),
				]),
				retirements: [
					{
						path: candidate.path,
						digest: candidate.digest,
						status: "deferred",
						reason: "retire-when-met",
					},
				],
			},
		});
		expect(markMaterialized).not.toHaveBeenCalled();
		expect(receipts).toMatchObject([{ state: "accepted" }]);

		const retried = await harness.consolidator();

		expect.soft(retried).toMatchObject({
			kind: "ran",
			details: {
				indexPressure: { kind: "measured" },
				retirements: [
					{
						path: candidate.path,
						digest: candidate.digest,
						status: "applied",
						reason: "retire-when-met",
					},
				],
			},
		});
		expect(apply.mock.calls.map(([input]) => input.candidates.length)).toEqual([
			0, 0, 1,
		]);
		expect(markMaterialized).toHaveBeenCalledOnce();
		expect(receipts).toMatchObject([{ state: "materialized" }]);
	});

	test("reports pressure-blocked retirements identically with and without model judgment", async () => {
		const projectRoot = join(tmp.path, "pressure-deferred-path-parity");
		await mkdir(projectRoot, { recursive: true });
		await writeFile(join(projectRoot, "fixed.txt"), "fixed\n");
		const candidate = record({
			id: "pressure-deferred-retirement",
			sourceId: "pressure-deferred-source",
			path: "knowledge/pressure-deferred.md",
			kind: "knowledge",
			content: "# Pressure deferred\n",
			metadata: {
				type: "gotcha",
				title: "Pressure deferred",
				description: "The exact index input is unavailable.",
				resource: "knowledge/pressure-deferred.md",
				tags: ["memory"],
				timestamp: "2026-09-02T12:00:00.000Z",
				retireWhen: {
					condition: "The replacement exists.",
					check: { kind: "path-exists", path: "fixed.txt" },
				},
				scopeRoot: projectRoot,
			},
		});
		const { content: _content, ...inventory } = candidate;
		const pressureBlockedSource = (): ConsolidationSource => ({
			id: candidate.sourceId,
			async collect() {
				return {
					records: [candidate],
					inventory: [inventory],
					inventoryComplete: true,
					omitted: 0,
					deferred: 0,
				};
			},
		});
		const full = await createHarness([pressureBlockedSource()], {
			id: "fake/no-tools",
			judge: vi.fn(async () => ({
				schemaVersion: 1 as const,
				observations: [],
			})),
		}).consolidator();
		const deterministicOnly = await createHarness([
			pressureBlockedSource(),
		]).consolidator({ modelMode: "deterministic-only" });
		if (full.kind !== "ran" || deterministicOnly.kind !== "ran") {
			throw new Error("expected both pressure-blocked passes to run");
		}

		expect(full.details).toMatchObject({
			retirements: [
				{
					path: candidate.path,
					digest: candidate.digest,
					status: "deferred",
					reason: "retire-when-met",
				},
			],
			declines: expect.arrayContaining([
				expect.objectContaining({
					code: "retirement-pressure-deferred",
					path: candidate.path,
				}),
			]),
		});
		expect(deterministicOnly.details.retirements).toEqual(
			full.details.retirements,
		);
		expect(
			deterministicOnly.details.declines.filter(
				(decline) => decline.code === "retirement-pressure-deferred",
			),
		).toEqual(
			full.details.declines.filter(
				(decline) => decline.code === "retirement-pressure-deferred",
			),
		);
	});

	// @cosmo-behavior plan:living-memory#B-021
	test("measures oversized corpus metadata exactly as combined-context injection", async () => {
		const projectRoot = join(tmp.path, "oversized-index-pressure-corpus");
		const userRoot = join(tmp.path, "oversized-index-pressure-user");
		const raw = [
			"---",
			"type: decision",
			"resource: oversized.md",
			"scope: project",
			"kind: semantic",
			"tags: [memory]",
			"---",
			"",
			"# Derived oversized title",
			"",
			"Derived oversized description.",
			"",
			"x".repeat(64 * 1024),
		].join("\n");
		await mkdir(join(projectRoot, "knowledge"), { recursive: true });
		await writeFile(join(projectRoot, "knowledge", "oversized.md"), raw);
		const store = createKnowledgeMemoryStore({
			projectRoot,
			userCosmonautsRoot: userRoot,
		});
		const injected = await store.retrieve(
			{ projectRoot, scopes: KNOWLEDGE_INDEX_RETRIEVAL.scopes },
			KNOWLEDGE_INDEX_RETRIEVAL.query,
		);
		const source = createProjectCorpusConsolidationSource({
			projectRoot,
			userCosmonautsRoot: userRoot,
		});
		const bounded = await source.collect({
			limit: DEFAULT_LIVING_MEMORY_LIMITS.maxCorpusRecords,
			maxCorpusRecordBytes: DEFAULT_LIVING_MEMORY_LIMITS.maxCorpusRecordBytes,
			maxCorpusBytes: DEFAULT_LIVING_MEMORY_LIMITS.maxCorpusBytes,
			maxEpisodeRecordBytes: DEFAULT_LIVING_MEMORY_LIMITS.maxEpisodeRecordBytes,
			maxEpisodeBytes: DEFAULT_LIVING_MEMORY_LIMITS.maxEpisodeBytes,
		});
		expect(bounded.records).toEqual([]);
		expect(bounded.inventory).toHaveLength(1);
		expect(bounded.inventory?.[0]).not.toHaveProperty("content");
		expect(bounded.inventoryComplete).toBe(true);

		const policy = createKnowledgeIndexPressurePolicy();
		let measuredInput: KnowledgeIndexRenderInput | undefined;
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [],
		}));
		await createHarness(
			[source],
			{ id: "fake/no-tools", judge },
			{
				indexPressure: {
					measure(input) {
						measuredInput = input;
						return policy.measure(input);
					},
				},
			},
		).consolidator();

		if (measuredInput === undefined) throw new Error("expected measured input");
		expect(measuredInput.records).toHaveLength(1);
		expect(renderKnowledgeIndex(measuredInput)).toBe(
			renderKnowledgeIndex(KNOWLEDGE_INDEX_RETRIEVAL.toRenderInput(injected)),
		);
		expect(judge).not.toHaveBeenCalled();
	});

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
					expect.objectContaining({ code: "retirement-authority-deferred" }),
				]),
				writesCommitted: true,
			},
		});
		if (ran.kind !== "ran") throw new Error("expected bounded pass to run");
		expect(ran.details.observations).toHaveLength(25);
		expect(ran.details.proposals).toHaveLength(10);
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
			{
				label: "unknown input id",
				output: {
					schemaVersion: 1 as const,
					observations: [
						{
							kind: "duplicate" as const,
							inputIds: ["not-admitted"],
							reason: "Unknown evidence must fail closed.",
						},
					],
				},
			},
			{
				label: "unsupported proposal fields",
				output: {
					schemaVersion: 1 as const,
					observations: [
						{
							kind: "duplicate" as const,
							inputIds: ["corpus-0"],
							reason: "Open output shapes must fail closed.",
							confidence: 1,
						},
					],
				},
			},
			{
				label: "incomplete replacement",
				output: {
					schemaVersion: 1 as const,
					observations: [
						{
							kind: "merge-candidate" as const,
							inputIds: ["corpus-0"],
							reason: "Replacement bytes must be complete.",
							proposal: {
								proposalKind: "merge" as const,
								replacement: {
									type: "decision" as const,
									title: "Incomplete replacement",
									description: "Missing complete body bytes.",
									content: "",
									tags: ["memory"],
								},
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

	test("measures complete project and user index metadata outside the bounded body batch", async () => {
		const projectRecords = Array.from({ length: 50 }, (_, index) =>
			record({
				id: `project-${index}`,
				sourceId: "corpus",
				path: `knowledge/project-${index}.md`,
				kind: "knowledge",
				content: `# Project ${index}\n`,
				metadata: indexMetadata(`Project ${index}`, `project-${index}.md`),
			}),
		);
		const userRecord = {
			...record({
				id: "user-record",
				sourceId: "corpus",
				path: "knowledge/user-record.md",
				kind: "knowledge",
				content: "# User record\n",
				metadata: indexMetadata("User record", "user-record.md"),
			}),
			scope: "user" as const,
		};
		const inventory = [...projectRecords, userRecord].map(
			({ content: _content, ...metadata }) => metadata,
		);
		const knowledgeIndex = {
			records: [
				...projectRecords.map((_, index) =>
					indexRecord({
						title: `Project ${index}`,
						resource: `project-${index}.md`,
					}),
				),
				indexRecord({
					scope: "user",
					title: "User record",
					resource: "user-record.md",
				}),
			],
			warnings: [],
		};
		const measure = vi.fn<KnowledgeIndexPressurePolicy["measure"]>(() => ({
			kind: "measured",
			targetSatisfied: false,
			recordCount: 51,
			maxRecords: 50,
			renderedBytes: 1,
			guaranteedBytes: 8_000,
			headroomBytes: 1,
		}));
		const harness = createHarness(
			[
				{
					id: "corpus",
					async collect() {
						return {
							records: projectRecords,
							inventory,
							inventoryComplete: true,
							knowledgeIndex,
							omitted: 0,
							deferred: 0,
						};
					},
				},
			],
			undefined,
			{ indexPressure: { measure } },
		);

		const result = await harness.consolidator({
			modelMode: "deterministic-only",
		});

		expect(result).toMatchObject({
			kind: "noop",
			details: {
				sources: [{ sourceId: "corpus", admitted: 50, omitted: 0 }],
				declines: [expect.objectContaining({ code: "target-unmet" })],
			},
		});
		expect(measure).toHaveBeenCalledOnce();
		expect(measure.mock.calls[0]?.[0].records).toHaveLength(51);
		expect(
			measure.mock.calls[0]?.[0].records.filter(
				(item) => item.scope === "user",
			),
		).toHaveLength(1);
	});

	test("measures user metadata without admitting user mutation candidates", async () => {
		const project = record({
			id: "project-record",
			sourceId: "mixed-corpus",
			path: "knowledge/project.md",
			kind: "knowledge",
			content: "# Project\n",
			metadata: indexMetadata("Project", "project.md"),
		});
		const user = {
			...record({
				id: "user-record",
				sourceId: "mixed-corpus",
				path: "knowledge/user.md",
				kind: "knowledge",
				content: "# User\n",
				metadata: indexMetadata("User", "user.md"),
			}),
			scope: "user" as const,
		};
		const measure = vi.fn<KnowledgeIndexPressurePolicy["measure"]>(() => ({
			kind: "measured",
			targetSatisfied: true,
			recordCount: 2,
			maxRecords: 50,
			renderedBytes: 1,
			guaranteedBytes: 8_000,
			headroomBytes: 1,
		}));
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [],
		}));
		const harness = createHarness(
			[
				{
					id: "mixed-corpus",
					async collect() {
						return {
							records: [project, user],
							inventoryComplete: true,
							knowledgeIndex: {
								records: [
									indexRecord({ title: "Project", resource: "project.md" }),
									indexRecord({
										scope: "user",
										title: "User",
										resource: "user.md",
									}),
								],
								warnings: [],
							},
							omitted: 0,
							deferred: 0,
						};
					},
				},
			],
			{ id: "fake/no-tools", judge },
			{ indexPressure: { measure } },
		);

		await expect(harness.consolidator()).resolves.toMatchObject({
			kind: "ran",
		});

		expect(measure.mock.calls[0]?.[0].records).toHaveLength(2);
		expect(judge).toHaveBeenCalledOnce();
		expect(judge.mock.calls[0]?.[0].records).toEqual([project]);
	});

	test("admits later unrepresented project records across bounded passes", async () => {
		const allRecords = Array.from({ length: 51 }, (_, index) =>
			record({
				id: `project-${index}`,
				sourceId: "paged-corpus",
				path: `knowledge/project-${index}.md`,
				kind: "knowledge",
				content: `# Project ${index}\n`,
				metadata: indexMetadata(`Project ${index}`, `project-${index}.md`),
			}),
		);
		const inventory = allRecords.map(
			({ content: _content, ...metadata }) => metadata,
		);
		const collect = vi.fn<ConsolidationSource["collect"]>(async (options) => {
			const represented = new Set(options.representedKeys);
			const candidates = allRecords.filter(
				(record) =>
					!represented.has(`${record.scope}\0${record.path}\0${record.digest}`),
			);
			return {
				records: candidates.slice(0, options.limit),
				inventory,
				inventoryComplete: true,
				omitted: Math.max(0, candidates.length - options.limit),
				deferred: Math.max(0, candidates.length - options.limit),
			};
		});
		const receipts: AcceptedJudgmentReceipt[] = [];
		const receiptStore = inMemoryReceiptStore(receipts);
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [],
		}));
		const harness = createHarness(
			[{ id: "paged-corpus", collect }],
			{ id: "fake/no-tools", judge },
			{ acceptedJudgmentReceiptStore: receiptStore },
		);

		const first = await harness.consolidator();
		const second = await harness.consolidator();
		const third = await harness.consolidator();

		expect(first.kind).toBe("ran");
		expect(second.kind).toBe("ran");
		expect(third.kind).toBe("noop");
		expect(judge).toHaveBeenCalledTimes(2);
		expect(judge.mock.calls.map(([input]) => input.records.length)).toEqual([
			50, 1,
		]);
		expect(
			collect.mock.calls.map(
				([options]) => options.representedKeys?.length ?? 0,
			),
		).toEqual([0, 50, 51]);
	});

	test("keys represented records by scope path and digest", async () => {
		const content = "# Byte-identical evidence\n";
		const records = ["first", "second"].map((name) =>
			record({
				id: name,
				sourceId: "identity-corpus",
				path: `knowledge/${name}.md`,
				kind: "knowledge",
				content,
			}),
		);
		const collect = vi.fn<ConsolidationSource["collect"]>(async (options) => {
			const represented = new Set(options.representedKeys);
			const admitted = records.find(
				(item) =>
					!represented.has(`${item.scope}\0${item.path}\0${item.digest}`),
			);
			return {
				records: admitted === undefined ? [] : [admitted],
				inventory: records.map(({ content: _content, ...item }) => item),
				inventoryComplete: true,
				omitted: admitted === undefined ? 0 : records.length - 1,
				deferred: admitted === undefined ? 0 : records.length - 1,
			};
		});
		const receipts: AcceptedJudgmentReceipt[] = [];
		const receiptStore = inMemoryReceiptStore(receipts);
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [],
		}));
		const harness = createHarness(
			[{ id: "identity-corpus", collect }],
			{ id: "fake/no-tools", judge },
			{ acceptedJudgmentReceiptStore: receiptStore },
		);

		await expect(harness.consolidator()).resolves.toMatchObject({
			kind: "ran",
		});
		await expect(harness.consolidator()).resolves.toMatchObject({
			kind: "ran",
		});

		expect(judge.mock.calls.map(([input]) => input.records[0]?.path)).toEqual([
			"knowledge/first.md",
			"knowledge/second.md",
		]);
	});

	test("serializes each mutating pass under one living-memory lock", async () => {
		let collectCount = 0;
		let activeJudgments = 0;
		let maximumActiveJudgments = 0;
		let lockTail = Promise.resolve();
		const withLock: LivingMemoryConsolidatorDependencies["withLock"] = async (
			_path,
			action,
		) => {
			const predecessor = lockTail;
			let release: () => void = () => undefined;
			lockTail = new Promise<void>((resolve) => {
				release = resolve;
			});
			await predecessor;
			try {
				return await action();
			} finally {
				release();
			}
		};
		const collect = vi.fn<ConsolidationSource["collect"]>(async () => {
			const index = collectCount++;
			return {
				records: [
					record({
						id: `serialized-${index}`,
						sourceId: "serialized-corpus",
						path: `memory/serialized-${index}.md`,
						kind: "artifact",
						content: `# Serialized ${index}\n`,
					}),
				],
				inventoryComplete: true,
				omitted: 0,
				deferred: 0,
			};
		});
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => {
			activeJudgments += 1;
			maximumActiveJudgments = Math.max(
				maximumActiveJudgments,
				activeJudgments,
			);
			await new Promise<void>((resolve) => setTimeout(resolve, 10));
			activeJudgments -= 1;
			return { schemaVersion: 1, observations: [] };
		});
		const receiptStore = inMemoryReceiptStore([]);
		const harness = createHarness(
			[{ id: "serialized-corpus", collect }],
			{ id: "fake/no-tools", judge },
			{ acceptedJudgmentReceiptStore: receiptStore, withLock },
		);

		const results = await Promise.all([
			harness.consolidator(),
			harness.consolidator(),
		]);

		expect(results.map((result) => result.kind)).toEqual(["ran", "ran"]);
		expect(judge).toHaveBeenCalledTimes(2);
		expect(maximumActiveJudgments).toBe(1);
	});

	test("reports outer-lock timeout and release uncertainty as recovery failures", async () => {
		const timeoutHarness = createHarness([], undefined, {
			async withLock(path) {
				throw new EntityFileLockTimeoutError(path, 10_000);
			},
		});
		await expect(timeoutHarness.consolidator()).resolves.toMatchObject({
			kind: "failed",
			details: {
				recovery: "concurrent-mutation",
				writesCommitted: false,
			},
		});

		const releaseHarness = createHarness([], undefined, {
			async withLock(_path, action, options = {}) {
				const result = await action();
				options.onReleaseUnconfirmed?.(
					new Error("fixture release uncertainty"),
				);
				return result;
			},
		});
		await expect(releaseHarness.consolidator()).resolves.toMatchObject({
			kind: "failed",
			reason: expect.stringContaining("release could not be confirmed"),
			details: {
				recovery: "release-unconfirmed",
				writesCommitted: false,
			},
		});
	});

	test("bounds combined model outlets and defers excess deterministic retirements", async () => {
		const projectRoot = join(tmp.path, "combined-outlet-caps");
		await mkdir(projectRoot, { recursive: true });
		await writeFile(join(projectRoot, "fixed.txt"), "fixed\n");
		const retirements = Array.from({ length: 6 }, (_, index) =>
			record({
				id: `retire-${index}`,
				sourceId: "retirement-corpus",
				path: `knowledge/retire-${index}.md`,
				kind: "knowledge",
				content: `# Retire ${index}\n`,
				metadata: {
					type: "gotcha",
					retireWhen: {
						condition: "The replacement exists.",
						check: { kind: "path-exists", path: "fixed.txt" },
					},
					scopeRoot: projectRoot,
				},
			}),
		);
		let remaining = [...retirements];
		const collect = vi.fn<ConsolidationSource["collect"]>(async (options) => {
			const represented = new Set(options.representedKeys);
			const candidates = remaining.filter(
				(item) =>
					!represented.has(`${item.scope}\0${item.path}\0${item.digest}`),
			);
			return {
				records: candidates,
				inventoryComplete: true,
				knowledgeIndex: knowledgeIndexFixture(candidates),
				omitted: 0,
				deferred: 0,
			};
		});
		const apply = vi.fn<LivingMemoryRetirementStore["apply"]>(async (input) => {
			if (input.candidates.length > input.maxRetirements) {
				throw new Error("retirement store received over-cap candidates");
			}
			const appliedPaths = new Set(
				input.candidates.map((candidate) => candidate.record.path),
			);
			remaining = remaining.filter((item) => !appliedPaths.has(item.path));
			return {
				kind: "completed" as const,
				details: {
					retirements: input.candidates.map((candidate) => ({
						path: candidate.record.path,
						digest: candidate.record.digest,
						status: "applied" as const,
						reason: candidate.reason,
					})),
					declines: [],
					warnings: [],
					recovery: "none" as const,
					writesCommitted: input.candidates.length > 0,
				},
			};
		});
		const receiptStore = inMemoryReceiptStore([]);
		const judge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: [],
		}));
		const harness = createHarness(
			[{ id: "retirement-corpus", collect }],
			{ id: "fake/no-tools", judge },
			{
				acceptedJudgmentReceiptStore: receiptStore,
				retirementStore: {
					inspect: vi.fn(async () => ({
						recovery: "none" as const,
						warnings: [],
						representedKeys: [],
					})),
					apply,
				},
			},
		);

		const first = await harness.consolidator();
		expect(first).toMatchObject({
			kind: "ran",
			details: {
				retirements: [
					expect.objectContaining({ path: "knowledge/retire-0.md" }),
					expect.objectContaining({ path: "knowledge/retire-1.md" }),
					expect.objectContaining({ path: "knowledge/retire-2.md" }),
					expect.objectContaining({ path: "knowledge/retire-3.md" }),
					expect.objectContaining({ path: "knowledge/retire-4.md" }),
				],
				declines: expect.arrayContaining([
					expect.objectContaining({ code: "retirement-cap-deferred" }),
				]),
			},
		});
		if (first.kind !== "ran") throw new Error("expected bounded pass to run");
		expect(first.details.retirements).toHaveLength(5);
		await expect(harness.consolidator()).resolves.toMatchObject({
			kind: "ran",
			details: {
				retirements: [
					expect.objectContaining({
						path: "knowledge/retire-5.md",
						status: "applied",
					}),
				],
			},
		});
		expect(
			apply.mock.calls
				.map(([input]) => input.candidates.length)
				.filter((length) => length > 0),
		).toEqual([5, 1]);

		const combinedJudge = vi.fn<CorpusJudgmentProvider["judge"]>(async () => ({
			schemaVersion: 1,
			observations: Array.from({ length: 20 }, (_, index) => ({
				kind: "duplicate" as const,
				inputIds: [`context-${index}`],
				reason: `Model observation ${index}.`,
			})),
		}));
		const context = Array.from({ length: 21 }, (_, index) =>
			record({
				id: `context-${index}`,
				sourceId: "combined-corpus",
				path: `memory/context-${index}.md`,
				kind: "artifact",
				content: `# Context ${index}\n`,
			}),
		);
		const deterministic = retirements[0];
		if (deterministic === undefined)
			throw new Error("missing retirement fixture");
		await expect(
			createHarness(
				[
					source("combined-corpus", [
						{ ...deterministic, sourceId: "combined-corpus" },
						...context,
					]),
				],
				{ id: "fake/no-tools", judge: combinedJudge },
			).consolidator(),
		).resolves.toMatchObject({
			kind: "ran",
			details: { observations: expect.any(Array) },
		});
		const combinedResult = await createHarness(
			[
				source("combined-corpus", [
					{ ...deterministic, sourceId: "combined-corpus" },
					...context,
				]),
			],
			{
				id: "fake/no-tools",
				judge: async () => ({
					schemaVersion: 1,
					observations: Array.from({ length: 25 }, (_, index) => ({
						kind: "duplicate" as const,
						inputIds: [`context-${index % 21}`],
						reason: `Over-cap combined observation ${index}.`,
					})),
				}),
			},
		).consolidator();
		expect(combinedResult).toMatchObject({
			kind: "failed",
			reason: expect.stringMatching(/observation cap/i),
		});
	});

	test("bounds deterministic proposal and observation findings lossily in stable order", async () => {
		const projectRoot = join(tmp.path, "bounded-deterministic-project");
		await mkdir(projectRoot, { recursive: true });
		const records = Array.from({ length: 26 }, (_, index) => {
			const suffix = String(index).padStart(2, "0");
			return record({
				id: `stale-${suffix}`,
				sourceId: "corpus",
				path: `knowledge/stale-${suffix}.md`,
				kind: "knowledge",
				content: `# Stale ${suffix}\n\n[Missing](../docs/missing-${suffix}.md)\n`,
				metadata: {
					type: "gotcha",
					title: `Stale ${suffix}`,
					description: `Deterministic stale-reference fixture ${suffix}.`,
					tags: ["memory"],
					scopeRoot: projectRoot,
				},
			});
		});
		const run = async () => {
			const harness = createHarness([source("corpus", records)]);
			const result = await harness.consolidator({
				modelMode: "deterministic-only",
			});
			if (result.kind !== "ran") {
				throw new Error(
					`expected bounded deterministic pass to run: ${result.reason}`,
				);
			}
			return result.details;
		};

		const first = await run();
		const second = await run();
		const proposalPaths = (details: typeof first) =>
			details.proposals.map((proposal) => proposal.inputs[0]?.path);
		const capDeclines = (details: typeof first) =>
			details.declines
				.filter((decline) => decline.code.endsWith("-cap-deferred"))
				.map(({ code, path }) => ({ code, path }));

		expect(first.observations).toHaveLength(25);
		expect(first.proposals).toHaveLength(10);
		expect(proposalPaths(first)).toEqual(
			Array.from(
				{ length: 10 },
				(_, index) => `knowledge/stale-${String(index).padStart(2, "0")}.md`,
			),
		);
		expect(capDeclines(first)).toEqual([
			...Array.from({ length: 15 }, (_, offset) => ({
				code: "proposal-cap-deferred",
				path: `knowledge/stale-${String(offset + 10).padStart(2, "0")}.md`,
			})),
			{
				code: "observation-cap-deferred",
				path: "knowledge/stale-25.md",
			},
		]);
		expect(proposalPaths(second)).toEqual(proposalPaths(first));
		expect(capDeclines(second)).toEqual(capDeclines(first));
	});

	test("keeps committed-write errors internal to durable files", async () => {
		const durableFiles = await import("../../lib/memory/durable-files.ts");
		expect(durableFiles).not.toHaveProperty("DurableFileCommittedError");
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

function inMemoryReceiptStore(receipts: AcceptedJudgmentReceipt[]) {
	return {
		pathFor: (batchKey: string) => `/tmp/${batchKey}.json`,
		list: async () => Object.freeze([...receipts]),
		dischargeStale: async () => ({ paths: [], writesCommitted: false }),
		read: async (batchKey: string) =>
			receipts.find((receipt) => receipt.batchKey === batchKey),
		write: async (receipt: AcceptedJudgmentReceipt) => {
			receipts.push(receipt);
			return { receipt, writesCommitted: true };
		},
		markMaterialized: async (batchKey: string) => {
			const index = receipts.findIndex(
				(receipt) => receipt.batchKey === batchKey,
			);
			const current = receipts[index];
			if (current === undefined) throw new Error("missing accepted receipt");
			if (current.state === "materialized") {
				return { receipt: current, writesCommitted: false };
			}
			const materialized = { ...current, state: "materialized" as const };
			receipts[index] = materialized;
			return { receipt: materialized, writesCommitted: true };
		},
	};
}

function createHarness(
	sources: readonly ConsolidationSource[],
	judgmentProvider?: CorpusJudgmentProvider,
	overrides: Partial<
		Pick<
			LivingMemoryConsolidatorDependencies,
			| "acceptedJudgmentReceiptStore"
			| "indexPressure"
			| "proposalStore"
			| "retirementStore"
			| "withLock"
			| "lockPath"
			| "limits"
		>
	> = {},
): {
	readonly consolidator: KnowledgeConsolidator;
	readonly dependencies: LivingMemoryConsolidatorDependencies;
} {
	const dependencies = {
		lockPath: overrides.lockPath ?? "/tmp/living-memory.lock",
		withLock:
			overrides.withLock ??
			(async <T>(_path: string, action: () => Promise<T>) => action()),
		sources,
		judgmentProvider,
		proposalStore: overrides.proposalStore ?? {
			readEvidence: vi.fn(async () => []),
			persist: vi.fn(async (input) => ({
				proposalKind: input.proposal.proposalKind,
				key: input.batchKey,
				inputs: input.observation.inputs,
				contentDigest: createHash("sha256")
					.update(JSON.stringify(input.proposal))
					.digest("hex"),
				status: input.dryRun ? ("preview" as const) : ("written" as const),
				writesCommitted: !input.dryRun,
			})),
		},
		acceptedJudgmentReceiptStore: overrides.acceptedJudgmentReceiptStore ?? {
			pathFor: vi.fn(
				(batchKey) => `/tmp/living-memory-consolidations/${batchKey}.json`,
			),
			list: vi.fn(async () => []),
			dischargeStale: vi.fn(async () => ({
				paths: [],
				writesCommitted: false,
			})),
			read: vi.fn(async () => undefined),
			write: vi.fn(async (receipt) => ({ receipt, writesCommitted: true })),
			markMaterialized: vi.fn(async (batchKey) => ({
				receipt: {
					schemaVersion: 1 as const,
					batchKey,
					state: "materialized" as const,
					inputDigests: [],
					output: { schemaVersion: 1 as const, observations: [] },
					path: `/tmp/living-memory-consolidations/${batchKey}.json`,
				},
				writesCommitted: true,
			})),
		},
		retirementStore: overrides.retirementStore ?? {
			inspect: vi.fn(async () => ({
				recovery: "none" as const,
				warnings: [],
				representedKeys: [],
			})),
			apply: vi.fn(
				async (input: Parameters<LivingMemoryRetirementStore["apply"]>[0]) => ({
					kind: "completed" as const,
					details: {
						retirements: input.candidates.map((candidate) => ({
							path: candidate.record.path,
							digest: candidate.record.digest,
							status: input.dryRun
								? ("preview" as const)
								: ("deferred" as const),
							reason: candidate.reason,
						})),
						declines: [],
						warnings: [],
						recovery: "none" as const,
						writesCommitted: false,
					},
				}),
			),
		},
		durableFiles: {
			writeText: vi.fn(async () => {
				throw new Error("durable writes are not expected");
			}),
		},
		indexPressure: overrides.indexPressure ?? {
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
		limits: overrides.limits ?? DEFAULT_LIVING_MEMORY_LIMITS,
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

function promotionLedger(options: {
	readonly path: string;
	readonly digest: string;
}): string {
	return [
		"---",
		"kind: knowledge-surface-promotion",
		"round: 1",
		"promotedCount: 0",
		"promotions: []",
		"curatedRecords: []",
		"retiredRecords: []",
		"ratifiedBaselines:",
		`  - path: ${options.path}`,
		`    sha256: ${options.digest}`,
		"---",
		"",
		"# Ratified baseline fixture",
		"",
	].join("\n");
}

function promotionBaselineLedger(options: {
	readonly path: string;
	readonly digest: string;
}): string {
	return [
		"---",
		"kind: knowledge-surface-promotion",
		"round: 1",
		"promotedCount: 1",
		"promotions:",
		"  - from: memory/agent/proposals/fixture/eligible.md",
		`    to: ${options.path}`,
		`    sha256: ${options.digest}`,
		"curatedRecords: []",
		"retiredRecords: []",
		"ratifiedBaselines: []",
		"---",
		"",
		"# Promotion baseline fixture",
		"",
	].join("\n");
}

function curationLedger(path: string): string {
	return [
		"---",
		"kind: knowledge-surface-promotion",
		"round: 2",
		"promotedCount: 0",
		"promotions: []",
		"curatedRecords:",
		`  - ${path}`,
		"retiredRecords: []",
		"ratifiedBaselines: []",
		"---",
		"",
		"# Later curation fixture",
		"",
	].join("\n");
}

function retiredManifest(options: {
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
		"  - kind: retired",
		`    id: ${options.id}`,
		`    path: ${options.path}`,
		`    digest: ${options.digest}`,
		"    reason: retire-when-met",
		"    evidence:",
		"      - scope: project",
		`        path: ${options.path}`,
		`        digest: ${options.digest}`,
		"    evidenceReason: Fixture evidence.",
		"    date: '2026-09-01T12:00:00.000Z'",
		"---",
		"",
		"# Retirement fixture",
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
		"    reason: Human veto fixture.",
		"    date: '2026-09-01T13:00:00.000Z'",
		"---",
		"",
		"# Restoration fixture",
		"",
	].join("\n");
}

async function createRetirementFixture(name: string): Promise<{
	readonly projectRoot: string;
	readonly livePath: string;
	readonly raw: string;
	readonly digest: string;
	readonly input: ConsolidationSourceRecord;
}> {
	const projectRoot = join(tmp.path, name);
	const livePath = join(projectRoot, "knowledge", "eligible.md");
	const raw = knowledgeFixture({ resource: "eligible.md" });
	const digest = createHash("sha256").update(raw).digest("hex");
	await mkdir(join(projectRoot, "knowledge"), { recursive: true });
	await mkdir(join(projectRoot, "missions", "reviews"), { recursive: true });
	await writeFile(livePath, raw);
	await writeFile(join(projectRoot, "fixed.txt"), "fixed\n");
	await writeFile(
		join(
			projectRoot,
			"missions",
			"reviews",
			"knowledge-surface-promotion-1.md",
		),
		promotionLedger({ path: "knowledge/eligible.md", digest }),
	);
	return {
		projectRoot,
		livePath,
		raw,
		digest,
		input: record({
			id: "eligible",
			sourceId: "corpus",
			path: "knowledge/eligible.md",
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
		}),
	};
}

async function applyRetirementFixture(
	fixture: Awaited<ReturnType<typeof createRetirementFixture>>,
	options: {
		readonly candidate?: ReturnType<typeof retirementCandidate>;
	} = {},
) {
	return createLivingMemoryRetirementStore({
		projectRoot: fixture.projectRoot,
	}).apply({
		candidates: [options.candidate ?? retirementCandidate(fixture.input)],
		dryRun: false,
		date: new Date("2026-09-01T12:00:00.000Z"),
		maxRetirements: 5,
		lockOptions: exactLockOptions(),
	});
}

async function writeManifestHistory(
	fixture: Awaited<ReturnType<typeof createRetirementFixture>>,
	restored: boolean,
): Promise<void> {
	const directory = join(fixture.projectRoot, "memory", "agent", "retirements");
	await mkdir(directory, { recursive: true });
	await writeFile(
		join(directory, "round-1.md"),
		retiredManifest({
			round: 1,
			id: "fixture-retirement",
			path: "knowledge/eligible.md",
			digest: fixture.digest,
		}),
	);
	if (restored) {
		await writeFile(
			join(directory, "round-2.md"),
			restoredManifest({
				round: 2,
				id: "fixture-retirement",
				path: "knowledge/eligible.md",
				digest: fixture.digest,
			}),
		);
	}
}

function retirementCandidate(record: ConsolidationSourceRecord) {
	return {
		record,
		reason: "retire-when-met" as const,
		evidence: [
			{
				id: record.id,
				sourceId: record.sourceId,
				scope: record.scope,
				path: record.path,
				digest: record.digest,
			},
		],
		evidenceReason:
			"The replacement file exists. (path-exists fixed.txt observed true).",
	};
}

function exactLockOptions() {
	return {
		retryMs: 50,
		timeoutMs: 10_000,
		onReleaseUnconfirmed: () => undefined,
	};
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await readFile(path);
		return true;
	} catch (error: unknown) {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return false;
		}
		throw error;
	}
}

async function runRetirementChild(
	projectRoot: string,
	failpoint: string,
): Promise<{
	readonly code: number | null;
	readonly signal: NodeJS.Signals | null;
}> {
	return new Promise((resolve, reject) => {
		const child = spawn(
			"bun",
			[
				join(
					process.cwd(),
					"tests",
					"fixtures",
					"living-memory-retirement-child.ts",
				),
				projectRoot,
				failpoint,
			],
			{ cwd: process.cwd(), stdio: "ignore" },
		);
		child.once("error", reject);
		child.once("exit", (code, signal) => resolve({ code, signal }));
	});
}

async function runEpisodeRestoreChild(projectRoot: string): Promise<{
	readonly code: number | null;
	readonly signal: NodeJS.Signals | null;
}> {
	return new Promise((resolve, reject) => {
		const child = spawn(
			"bun",
			[
				join(
					process.cwd(),
					"tests",
					"fixtures",
					"living-memory-episode-restore-child.ts",
				),
				projectRoot,
			],
			{ cwd: process.cwd(), stdio: "ignore" },
		);
		child.once("error", reject);
		child.once("exit", (code, signal) => resolve({ code, signal }));
	});
}

async function createEpisodeRestoreRaceSource(
	projectRoot: string,
	episodePaths: readonly string[],
) {
	const changedBytes = new Map(
		await Promise.all(
			episodePaths.map(
				async (path) =>
					[path, `${await readFile(path, "utf-8")}Human rewrite.\n`] as const,
			),
		),
	);
	const journalPath = join(
		dirname(episodePaths[0] as string),
		".living-memory-episode-prune.json",
	);
	const commits = { journalWrites: 0, restores: 0, journalRemovals: 0 };
	const baseFiles = createDurableMachineFiles();
	const source = createProjectEpisodeConsolidationSource({
		projectRoot,
		durableFiles: {
			...baseFiles,
			async replaceText(options) {
				const replaced = await baseFiles.replaceText(options);
				if (options.path === journalPath) commits.journalWrites += 1;
				return replaced;
			},
			async renameFile(options) {
				const changed = changedBytes.get(options.sourcePath);
				if (changed !== undefined) await writeFile(options.sourcePath, changed);
				await baseFiles.renameFile(options);
			},
			async restoreFile(options) {
				const restoration = await baseFiles.restoreFile(options);
				if (changedBytes.has(options.destinationPath)) commits.restores += 1;
				return restoration;
			},
			async removeFile(path) {
				const removal = await baseFiles.removeFile(path);
				if (path === journalPath) commits.journalRemovals += 1;
				return removal;
			},
		},
	});
	return { changedBytes, commits, journalPath, source };
}

async function writeEpisodeFixtures(
	projectRoot: string,
	fixtures: readonly (readonly [summary: string, timestamp: string])[],
): Promise<readonly string[]> {
	const store = createMarkdownMemoryStore({
		projectRoot,
		userCosmonautsRoot: join(projectRoot, "user-memory"),
	});
	const paths: string[] = [];
	for (const [index, [summary, timestamp]] of fixtures.entries()) {
		const result = await store.write(
			createEpisodeRecord({
				scope: "project",
				source: "example/worker",
				action: "task.status-changed",
				outcome: "done",
				subject: { kind: "task", id: `TASK-FOLD-${index + 1}` },
				summary,
				timestamp,
			}),
		);
		if (result.kind !== "written") {
			throw new Error(`failed to create episode fixture: ${result.reason}`);
		}
		paths.push(result.path);
	}
	return Object.freeze(paths);
}

function foldedEpisodeOutput(inputIds: readonly string[]) {
	return {
		schemaVersion: 1 as const,
		observations: [
			{
				kind: "merge-candidate" as const,
				inputIds,
				reason: "Fold the bounded episodes into one durable note.",
				proposal: {
					proposalKind: "create" as const,
					record: {
						type: "note" as const,
						title: "Episode summary",
						description: "A bounded lossy episode fold.",
						content: "# Episode summary\n\nCompleted work was retained.\n",
						tags: ["episodes", "summary"],
					},
				},
			},
		],
	};
}

function relativeFixturePath(root: string, path: string): string {
	return relative(root, path).split(sep).join("/");
}

function source(
	id: string,
	records: readonly ConsolidationSourceRecord[],
	omitted = 0,
): ConsolidationSource {
	const knowledgeRecords = records.filter(
		(record) => record.kind === "knowledge",
	);
	const inventory =
		omitted === 0
			? undefined
			: [
					...records.map(({ content: _content, ...record }) => record),
					...Array.from({ length: omitted }, (_, index) => ({
						id: `inventoried-omission-${index}`,
						sourceId: id,
						scope: "project" as const,
						path: `memory/inventoried-omission-${index}.md`,
						digest: createHash("sha256")
							.update(`${id}\0${index}`)
							.digest("hex"),
						kind: "artifact" as const,
						metadata: {},
					})),
				];
	return {
		id,
		async collect() {
			return {
				records,
				...(inventory === undefined ? {} : { inventory }),
				inventoryComplete: true,
				...(knowledgeRecords.length === 0
					? {}
					: { knowledgeIndex: knowledgeIndexFixture(knowledgeRecords) }),
				omitted,
				deferred: omitted,
			};
		},
	};
}

function indexMetadata(title: string, resource: string) {
	return {
		type: "decision",
		title,
		description: `${title} description.`,
		resource,
		timestamp: "2026-09-02T12:00:00.000Z",
		tags: ["memory"],
	};
}

function indexRecord(
	overrides: Partial<RetrievedMemoryRecord>,
): RetrievedMemoryRecord {
	return {
		type: "decision",
		scope: "project",
		kind: "semantic",
		title: "Index record",
		description: "Index metadata.",
		resource: "knowledge/index-record.md",
		tags: ["memory"],
		timestamp: "2026-09-02T12:00:00.000Z",
		content: "",
		path: "/tmp/index-record.md",
		...overrides,
	};
}

function knowledgeIndexFixture(
	records: readonly ConsolidationSourceRecord[],
): KnowledgeIndexRenderInput {
	return {
		records: records
			.filter((record) => record.kind === "knowledge")
			.map((record) =>
				indexRecord({
					scope: record.scope,
					title:
						typeof record.metadata.title === "string"
							? record.metadata.title
							: record.id,
					resource:
						typeof record.metadata.resource === "string"
							? record.metadata.resource
							: record.path,
				}),
			),
		warnings: [],
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
