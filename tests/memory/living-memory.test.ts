import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
	mkdir,
	readdir,
	readFile,
	rename,
	symlink,
	writeFile,
} from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { createArchitectureMapMemoryStore } from "../../lib/architecture-map/index.ts";
import type { EntityFileLockOptions } from "../../lib/entity-file-lock.ts";
import { EntityFileLockTimeoutError } from "../../lib/entity-file-lock.ts";
import {
	createDurableRetirementFiles,
	type DurableRetirementFiles,
} from "../../lib/memory/durable-files.ts";
import {
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
	createProjectEpisodeConsolidationSource,
	DEFAULT_LIVING_MEMORY_LIMITS,
	executeLivingMemoryConsolidationJob,
	inspectLivingMemoryCitationInventory,
	type KnowledgeConsolidator,
	type LivingMemoryConsolidatorDependencies,
	type LivingMemoryRetirementStore,
	type MemoryStore,
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

	// @cosmo-behavior plan:living-memory#B-015
	test("recovers hard-stopped retirement at every durable commit boundary", async () => {
		const cases = [
			["after-journal-sync", "rolled-back", true, false],
			["after-retired-link-sync", "rolled-back", true, false],
			["after-manifest-sync", "rolled-forward", false, true],
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
				async removeFile(path) {
					if (path === ordinaryPostCommit.livePath && failLiveRemoval) {
						failLiveRemoval = false;
						throw new Error("ordinary post-commit unlink failure");
					}
					await postCommitDurable.removeFile(path);
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
					await terminalDurable.removeFile(path);
					if (
						path.endsWith("living-memory-retirement.json") &&
						failTerminalCleanup
					) {
						failTerminalCleanup = false;
						throw new Error("terminal journal directory sync is unconfirmed");
					}
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
				await realDurable.removeFile(path);
				if (path === fixture.livePath) syncEvents.push("live-removed");
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
		expect(syncEvents).toEqual(["manifest-synced", "live-removed"]);
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
					await realDurable.removeFile(path);
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
			"removeFile",
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
			path: "memory/manifest-only.md",
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
				return { records, omitted: 0 };
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
				path: "knowledge/synthetic-retired.md",
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
					omitted: 0,
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
				await baseDurableFiles.removeFile(path);
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
		const collect = vi.fn(async () => ({ records: [], omitted: 0 }));
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
		Pick<
			LivingMemoryConsolidatorDependencies,
			| "acceptedJudgmentReceiptStore"
			| "indexPressure"
			| "proposalStore"
			| "retirementStore"
		>
	> = {},
): {
	readonly consolidator: KnowledgeConsolidator;
	readonly dependencies: LivingMemoryConsolidatorDependencies;
} {
	const dependencies = {
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
			})),
		},
		acceptedJudgmentReceiptStore: overrides.acceptedJudgmentReceiptStore ?? {
			pathFor: vi.fn(
				(batchKey) => `/tmp/living-memory-consolidations/${batchKey}.json`,
			),
			list: vi.fn(async () => []),
			dischargeStale: vi.fn(async () => []),
			read: vi.fn(async () => undefined),
			write: vi.fn(async (receipt) => receipt),
			markMaterialized: vi.fn(async (batchKey) => ({
				schemaVersion: 1 as const,
				batchKey,
				state: "materialized" as const,
				inputDigests: [],
				output: { schemaVersion: 1 as const, observations: [] },
				path: `/tmp/living-memory-consolidations/${batchKey}.json`,
			})),
		},
		retirementStore: overrides.retirementStore ?? {
			inspect: vi.fn(async () => ({
				recovery: "none" as const,
				warnings: [],
				representedDigests: [],
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
