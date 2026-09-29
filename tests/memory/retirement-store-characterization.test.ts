import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	createDurableRetirementFiles,
	type DurableRetirementFiles,
} from "../../lib/memory/durable-files.ts";
import type { ConsolidationSourceRecord } from "../../lib/memory/index.ts";
import { createLivingMemoryRetirementStore } from "../../lib/memory/retirement-store.ts";
import { useTempDir } from "../helpers/fs.ts";

/**
 * Characterization of `applyUnderLock` and `candidateConflict`, observed only
 * through `createLivingMemoryRetirementStore().apply()` and the durable files
 * it leaves behind.
 */
const tmp = useTempDir("retirement-characterization-");

const LIVE = "knowledge/eligible.md";
const JOURNAL = ".cosmonauts/living-memory-retirement.json";
const DATE = new Date("2026-09-01T12:00:00.000Z");

interface Fixture {
	readonly projectRoot: string;
	readonly livePath: string;
	readonly raw: string;
	readonly digest: string;
	readonly record: ConsolidationSourceRecord;
}

function sha(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

function knowledgeRaw(): string {
	return [
		"---",
		"type: decision",
		"title: Fixture",
		"description: Fixture record.",
		"resource: eligible.md",
		"scope: project",
		"kind: semantic",
		"---",
		"",
		"# Fixture",
		"",
		"Body.",
		"",
	].join("\n");
}

function ledger(digest: string): string {
	return [
		"---",
		"kind: knowledge-surface-promotion",
		"round: 1",
		"promotedCount: 0",
		"promotions: []",
		"curatedRecords: []",
		"retiredRecords: []",
		"ratifiedBaselines:",
		`  - path: ${LIVE}`,
		`    sha256: ${digest}`,
		"---",
		"",
		"# Baseline",
		"",
	].join("\n");
}

function manifest(
	kind: "retired" | "restored",
	round: number,
	digest: string,
): string {
	const event =
		kind === "retired"
			? [
					"  - kind: retired",
					"    id: fixture-retirement",
					`    path: ${LIVE}`,
					`    digest: ${digest}`,
					"    reason: retire-when-met",
					"    evidence:",
					"      - scope: project",
					`        path: ${LIVE}`,
					`        digest: ${digest}`,
					"    evidenceReason: Fixture evidence.",
					"    date: '2026-09-01T12:00:00.000Z'",
				]
			: [
					"  - kind: restored",
					"    retirementId: fixture-retirement",
					`    path: ${LIVE}`,
					`    digest: ${digest}`,
					"    reason: Human veto fixture.",
					"    date: '2026-09-01T13:00:00.000Z'",
				];
	return [
		"---",
		"kind: knowledge-retirement-round",
		`round: ${round}`,
		"events:",
		...event,
		"---",
		"",
		"# Fixture",
		"",
	].join("\n");
}

async function fixture(name: string): Promise<Fixture> {
	const projectRoot = join(tmp.path, name);
	const livePath = join(projectRoot, LIVE);
	const raw = knowledgeRaw();
	const digest = sha(raw);
	await mkdir(join(projectRoot, "knowledge"), { recursive: true });
	await mkdir(join(projectRoot, "missions", "reviews"), { recursive: true });
	await writeFile(livePath, raw);
	await writeFile(
		join(
			projectRoot,
			"missions",
			"reviews",
			"knowledge-surface-promotion-1.md",
		),
		ledger(digest),
	);
	return {
		projectRoot,
		livePath,
		raw,
		digest,
		record: {
			id: "eligible",
			sourceId: "corpus",
			scope: "project",
			path: LIVE,
			digest,
			kind: "knowledge",
			content: raw,
			metadata: { scopeRoot: projectRoot },
		},
	};
}

function candidate(
	record: ConsolidationSourceRecord,
	overrides: {
		readonly evidence?: readonly {
			id: string;
			sourceId: string;
			scope: "project" | "user";
			path: string;
			digest: string;
		}[];
		readonly evidenceReason?: string;
	} = {},
) {
	return {
		record,
		reason: "retire-when-met" as const,
		evidence: overrides.evidence ?? [
			{
				id: record.id,
				sourceId: record.sourceId,
				scope: record.scope,
				path: record.path,
				digest: record.digest,
			},
		],
		evidenceReason: overrides.evidenceReason ?? "Replacement observed.",
	};
}

function apply(
	f: Fixture,
	candidates: readonly ReturnType<typeof candidate>[],
	options: {
		readonly maxRetirements?: number;
		readonly signal?: AbortSignal;
		readonly durableFiles?: DurableRetirementFiles;
		readonly failpoint?: (point: string) => void | Promise<void>;
	} = {},
) {
	return createLivingMemoryRetirementStore({
		projectRoot: f.projectRoot,
		inspectCitations: async () => ({
			healthy: true,
			entries: [],
			warnings: [],
		}),
		...(options.durableFiles === undefined
			? {}
			: { durableFiles: options.durableFiles }),
		...(options.failpoint === undefined
			? {}
			: { failpoint: options.failpoint as never }),
	}).apply({
		candidates,
		dryRun: false,
		date: DATE,
		maxRetirements: options.maxRetirements ?? 5,
		lockOptions: {
			retryMs: 20,
			timeoutMs: 10_000,
			onReleaseUnconfirmed: () => undefined,
		},
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
}

async function exists(path: string): Promise<boolean> {
	return readFile(path).then(
		() => true,
		() => false,
	);
}

async function expectDeclined(
	f: Fixture,
	cand: ReturnType<typeof candidate>,
	code: string,
): Promise<void> {
	const result = await apply(f, [cand]);
	expect(result).toMatchObject({
		kind: "completed",
		details: {
			retirements: [],
			declines: [{ code, path: cand.record.path }],
			writesCommitted: false,
			recovery: "none",
		},
	});
	// Declined candidates leave the live bytes and every durable artifact alone.
	await expect(readFile(f.livePath, "utf-8")).resolves.toBe(f.raw);
	expect(
		await exists(join(f.projectRoot, "memory/agent/retirements/round-1.md")),
	).toBe(false);
	expect(await exists(join(f.projectRoot, JOURNAL))).toBe(false);
}

describe("candidateConflict (via retirement apply)", () => {
	test("authorizes a fully evidenced, baselined, uncited candidate", async () => {
		const f = await fixture("authorized");
		const result = await apply(f, [candidate(f.record)]);
		expect(result).toMatchObject({
			kind: "completed",
			details: {
				retirements: [{ path: LIVE, digest: f.digest, status: "applied" }],
				declines: [],
			},
		});
	});

	test.each([
		[
			"a user-scoped record",
			(f: Fixture) => ({ ...f.record, scope: "user" as const }),
		],
		[
			"a non-knowledge record",
			(f: Fixture) => ({ ...f.record, kind: "artifact" as const }),
		],
		[
			"a path outside knowledge/",
			(f: Fixture) => ({ ...f.record, path: "docs/eligible.md" }),
		],
		[
			"an already-retired path",
			(f: Fixture) => ({ ...f.record, path: "knowledge/retired/eligible.md" }),
		],
		[
			"a non-markdown path",
			(f: Fixture) => ({ ...f.record, path: "knowledge/eligible.txt" }),
		],
		[
			"a traversing path",
			(f: Fixture) => ({ ...f.record, path: "knowledge/../eligible.md" }),
		],
		[
			"a foreign scope root",
			(f: Fixture) => ({ ...f.record, metadata: { scopeRoot: "/elsewhere" } }),
		],
		["a missing scope root", (f: Fixture) => ({ ...f.record, metadata: {} })],
	])("declines with retirement-path-conflict for %s", async (name, mutate) => {
		const f = await fixture(`path-${name.replace(/\W+/gu, "-")}`);
		const record = mutate(f);
		await expectDeclined(f, candidate(record), "retirement-path-conflict");
	});

	test("declines with retirement-evidence-incomplete when evidence is empty", async () => {
		const f = await fixture("evidence-empty");
		await expectDeclined(
			f,
			candidate(f.record, { evidence: [] }),
			"retirement-evidence-incomplete",
		);
	});

	test("declines with retirement-evidence-incomplete when any evidence ref is malformed", async () => {
		const f = await fixture("evidence-malformed");
		const good = candidate(f.record).evidence[0] as ReturnType<
			typeof candidate
		>["evidence"][number];
		await expectDeclined(
			f,
			candidate(f.record, {
				evidence: [good, { ...good, path: "../escape.md" }],
			}),
			"retirement-evidence-incomplete",
		);
		const badDigest = await fixture("evidence-bad-digest");
		await expectDeclined(
			badDigest,
			candidate(badDigest.record, {
				evidence: [{ ...good, digest: "not-a-digest" }],
			}),
			"retirement-evidence-incomplete",
		);
	});

	test("declines with retirement-evidence-incomplete when no evidence names the consumed record", async () => {
		const f = await fixture("evidence-unrelated");
		const good = candidate(f.record).evidence[0] as ReturnType<
			typeof candidate
		>["evidence"][number];
		await expectDeclined(
			f,
			candidate(f.record, { evidence: [{ ...good, digest: sha("other") }] }),
			"retirement-evidence-incomplete",
		);
		const otherScope = await fixture("evidence-other-scope");
		await expectDeclined(
			otherScope,
			candidate(otherScope.record, { evidence: [{ ...good, scope: "user" }] }),
			"retirement-evidence-incomplete",
		);
		const otherPath = await fixture("evidence-other-path");
		await expectDeclined(
			otherPath,
			candidate(otherPath.record, {
				evidence: [{ ...good, path: "knowledge/other.md" }],
			}),
			"retirement-evidence-incomplete",
		);
	});

	test("declines with retirement-evidence-incomplete when the evidence reason is blank", async () => {
		const f = await fixture("evidence-blank-reason");
		await expectDeclined(
			f,
			candidate(f.record, { evidenceReason: "   " }),
			"retirement-evidence-incomplete",
		);
	});

	test("declines with retirement-digest-conflict when the live file is gone or changed", async () => {
		const gone = await fixture("digest-missing");
		await (await import("node:fs/promises")).rm(gone.livePath);
		const missing = await apply(gone, [candidate(gone.record)]);
		expect(missing).toMatchObject({
			kind: "completed",
			details: { declines: [{ code: "retirement-digest-conflict" }] },
		});

		const changed = await fixture("digest-changed");
		await writeFile(changed.livePath, `${changed.raw}human edit\n`);
		const result = await apply(changed, [candidate(changed.record)]);
		expect(result).toMatchObject({
			kind: "completed",
			details: { declines: [{ code: "retirement-digest-conflict" }] },
		});
		await expect(readFile(changed.livePath, "utf-8")).resolves.toBe(
			`${changed.raw}human edit\n`,
		);
	});

	test("declines with retirement-baseline-conflict without or with a mismatched baseline", async () => {
		const none = await fixture("baseline-none");
		await (await import("node:fs/promises")).rm(
			join(
				none.projectRoot,
				"missions/reviews/knowledge-surface-promotion-1.md",
			),
		);
		await expectDeclined(
			none,
			candidate(none.record),
			"retirement-baseline-conflict",
		);

		const stale = await fixture("baseline-stale");
		await writeFile(
			join(
				stale.projectRoot,
				"missions/reviews/knowledge-surface-promotion-1.md",
			),
			ledger(sha("older bytes")),
		);
		await expectDeclined(
			stale,
			candidate(stale.record),
			"retirement-baseline-conflict",
		);
	});

	test("declines with restoration-in-progress while a retired event is live", async () => {
		const f = await fixture("in-progress");
		const dir = join(f.projectRoot, "memory/agent/retirements");
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, "round-1.md"), manifest("retired", 1, f.digest));
		const result = await apply(f, [candidate(f.record)]);
		expect(result).toMatchObject({
			kind: "completed",
			details: { declines: [{ code: "restoration-in-progress" }] },
		});
	});

	test("declines with restoration-suppressed for unchanged restored bytes", async () => {
		const f = await fixture("suppressed");
		const dir = join(f.projectRoot, "memory/agent/retirements");
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, "round-1.md"), manifest("retired", 1, f.digest));
		await writeFile(join(dir, "round-2.md"), manifest("restored", 2, f.digest));
		const result = await apply(f, [candidate(f.record)]);
		expect(result).toMatchObject({
			kind: "completed",
			details: { declines: [{ code: "restoration-suppressed" }] },
		});
	});

	test("declines with retirement-destination-conflict when the retired path is occupied", async () => {
		const f = await fixture("destination");
		await mkdir(join(f.projectRoot, "knowledge/retired"), { recursive: true });
		await writeFile(
			join(f.projectRoot, "knowledge/retired/eligible.md"),
			"squatter\n",
		);
		await expectDeclined(
			f,
			candidate(f.record),
			"retirement-destination-conflict",
		);
		await expect(
			readFile(join(f.projectRoot, "knowledge/retired/eligible.md"), "utf-8"),
		).resolves.toBe("squatter\n");
	});

	test("declines with retirement-inbound-citation naming the citing records", async () => {
		const f = await fixture("inbound");
		const result = await createLivingMemoryRetirementStore({
			projectRoot: f.projectRoot,
			inspectCitations: async () => ({
				healthy: true,
				entries: [
					{
						scope: "project",
						path: "docs/a.md",
						digest: sha("a"),
						targets: [LIVE],
					},
					{
						scope: "user",
						path: "docs/user.md",
						digest: sha("u"),
						targets: [LIVE],
					},
					{ scope: "project", path: LIVE, digest: f.digest, targets: [LIVE] },
					{
						scope: "project",
						path: "docs/b.md",
						digest: sha("b"),
						targets: ["knowledge/other.md"],
					},
				],
				warnings: [],
			}),
		}).apply({
			candidates: [candidate(f.record)],
			dryRun: false,
			date: DATE,
			maxRetirements: 5,
			lockOptions: {
				retryMs: 20,
				timeoutMs: 10_000,
				onReleaseUnconfirmed: () => undefined,
			},
		});
		expect(result).toMatchObject({
			kind: "completed",
			details: {
				declines: [
					{
						code: "retirement-inbound-citation",
						reason:
							"Live inbound citations still target this record: docs/a.md.",
					},
				],
			},
		});
		if (result.details.declines[0]?.reason.includes("docs/user.md")) {
			throw new Error("user-scope citations must not block");
		}
		await expect(readFile(f.livePath, "utf-8")).resolves.toBe(f.raw);
	});
});

describe("applyUnderLock (via retirement apply)", () => {
	test("commits journal-first, retires bytes, writes the manifest, and removes the journal", async () => {
		const f = await fixture("success");
		const points: string[] = [];
		const result = await apply(f, [candidate(f.record)], {
			failpoint: (point) => {
				points.push(point);
			},
		});
		expect(result).toMatchObject({
			kind: "completed",
			details: {
				retirements: [
					{
						path: LIVE,
						digest: f.digest,
						status: "applied",
						reason: "retire-when-met",
					},
				],
				declines: [],
				warnings: [],
				recovery: "none",
				writesCommitted: true,
				manifestPath: join(
					f.projectRoot,
					"memory/agent/retirements/round-1.md",
				),
			},
		});
		expect(points).toEqual([
			"after-journal-sync",
			"after-retired-link-sync",
			"after-manifest-sync",
			"after-live-tombstone-sync",
			"after-live-unlink-sync",
			"before-journal-remove",
		]);
		expect(await exists(f.livePath)).toBe(false);
		await expect(
			readFile(join(f.projectRoot, "knowledge/retired/eligible.md"), "utf-8"),
		).resolves.toBe(f.raw);
		const manifestText = await readFile(
			join(f.projectRoot, "memory/agent/retirements/round-1.md"),
			"utf-8",
		);
		expect(manifestText).toContain(`digest: ${f.digest}`);
		expect(await exists(join(f.projectRoot, JOURNAL))).toBe(false);
	});

	test("returns a no-write completion for an empty candidate list", async () => {
		const f = await fixture("empty");
		await expect(apply(f, [])).resolves.toMatchObject({
			kind: "completed",
			details: {
				retirements: [],
				declines: [],
				recovery: "none",
				writesCommitted: false,
			},
		});
		expect(await exists(f.livePath)).toBe(true);
	});

	test("fails without writes when candidates exceed the cap or the cap is invalid", async () => {
		const f = await fixture("cap");
		const many = Array.from({ length: 3 }, () => candidate(f.record));
		for (const maxRetirements of [2, 0, 1.5, Number.NaN]) {
			await expect(apply(f, many, { maxRetirements })).resolves.toMatchObject({
				kind: "failed",
				reason: expect.stringContaining("bounded cap"),
				details: { retirements: [], writesCommitted: false, recovery: "none" },
			});
		}
		await expect(readFile(f.livePath, "utf-8")).resolves.toBe(f.raw);
		expect(await exists(join(f.projectRoot, JOURNAL))).toBe(false);
	});

	test("fails without writes when the signal is already aborted", async () => {
		const f = await fixture("aborted");
		const controller = new AbortController();
		controller.abort();
		const result = await apply(f, [candidate(f.record)], {
			signal: controller.signal,
		});
		expect(result.kind).toBe("failed");
		expect(result.details.writesCommitted).toBe(false);
		await expect(readFile(f.livePath, "utf-8")).resolves.toBe(f.raw);
		expect(await exists(join(f.projectRoot, JOURNAL))).toBe(false);
	});

	test("rolls back an uncommitted failure before the manifest is written", async () => {
		const f = await fixture("rollback");
		const result = await apply(f, [candidate(f.record)], {
			failpoint(point) {
				if (point === "after-journal-sync")
					throw new Error("boom before manifest");
			},
		});
		expect(result).toMatchObject({
			kind: "failed",
			reason: "boom before manifest",
			details: { recovery: "rolled-back", writesCommitted: false },
		});
		await expect(readFile(f.livePath, "utf-8")).resolves.toBe(f.raw);
		expect(await exists(join(f.projectRoot, JOURNAL))).toBe(false);
		expect(
			await exists(join(f.projectRoot, "memory/agent/retirements/round-1.md")),
		).toBe(false);
		expect(
			await exists(join(f.projectRoot, "knowledge/retired/eligible.md")),
		).toBe(false);
	});

	test("rolls forward a failure after the manifest committed", async () => {
		const f = await fixture("roll-forward");
		const result = await apply(f, [candidate(f.record)], {
			failpoint(point) {
				if (point === "after-manifest-sync")
					throw new Error("boom after manifest");
			},
		});
		expect(result).toMatchObject({
			kind: "failed",
			reason: "boom after manifest",
			details: { recovery: "rolled-forward", writesCommitted: true },
		});
		expect(await exists(f.livePath)).toBe(false);
		await expect(
			readFile(join(f.projectRoot, "knowledge/retired/eligible.md"), "utf-8"),
		).resolves.toBe(f.raw);
		expect(await exists(join(f.projectRoot, JOURNAL))).toBe(false);
	});

	test("reports a pending journal when recovery cannot remove it, then rolls forward on the next run", async () => {
		const f = await fixture("pending");
		const real = createDurableRetirementFiles();
		let blockJournalRemoval = true;
		const durableFiles: DurableRetirementFiles = {
			...real,
			async removeFile(path) {
				if (
					blockJournalRemoval &&
					path.endsWith("living-memory-retirement.json")
				) {
					throw new Error("journal removal blocked");
				}
				return real.removeFile(path);
			},
		};
		const first = await apply(f, [candidate(f.record)], { durableFiles });
		expect(first).toMatchObject({
			kind: "failed",
			reason: "journal removal blocked",
			details: { recovery: "pending", writesCommitted: true },
		});
		expect(await exists(join(f.projectRoot, JOURNAL))).toBe(true);

		blockJournalRemoval = false;
		const second = await apply(f, [], { durableFiles });
		expect(second).toMatchObject({
			kind: "completed",
			details: {
				recovery: "rolled-forward",
				writesCommitted: true,
				retirements: [],
			},
		});
		expect(await exists(join(f.projectRoot, JOURNAL))).toBe(false);
		expect(await exists(f.livePath)).toBe(false);
	});

	test("declines and preserves live bytes changed by a human after the manifest committed", async () => {
		const f = await fixture("unlink-conflict");
		const changed = `${f.raw}human change\n`;
		const result = await apply(f, [candidate(f.record)], {
			async failpoint(point) {
				if (point === "after-manifest-sync")
					await writeFile(f.livePath, changed);
			},
		});
		expect(result.kind).toBe("failed");
		expect(result.details.declines).toEqual([
			expect.objectContaining({
				code: "retirement-unlink-conflict",
				path: LIVE,
			}),
		]);
		expect(result.details.writesCommitted).toBe(true);
		await expect(readFile(f.livePath, "utf-8")).resolves.toBe(changed);
	});

	test("numbers the next round after existing manifests", async () => {
		const f = await fixture("next-round");
		const first = await apply(f, [candidate(f.record)]);
		expect(first.kind).toBe("completed");
		const dir = join(f.projectRoot, "memory/agent/retirements");
		expect((await readdir(dir)).toSorted()).toEqual(["round-1.md"]);
	});
});
