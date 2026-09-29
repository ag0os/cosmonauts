import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	ConsolidationSourceContractError,
	createProjectEpisodeConsolidationSource,
} from "../../lib/memory/consolidation-sources.ts";
import { useTempDir } from "../helpers/fs.ts";

/**
 * Characterization of `isEpisodePruneJournal`, observed through the project
 * episode source's `recover()` and `finalize()`: an accepted journal is
 * consumed and removed; a rejected one raises a contract error and stays put.
 */
const tmp = useTempDir("episode-prune-journal-");

const EPISODES = "memory/agent/episodes";
const JOURNAL = `${EPISODES}/.living-memory-episode-prune.json`;
const DIGEST = createHash("sha256").update("episode").digest("hex");

type Journal = Record<string, unknown>;

function validJournal(): Journal {
	return {
		schemaVersion: 1,
		originalPath: `${EPISODES}/one.md`,
		tombstonePath: `${EPISODES}/.one.md.abc.tombstone`,
		digest: DIGEST,
		fileIdentity: { device: "1", inode: "2" },
	};
}

async function withJournal(
	name: string,
	content: string,
): Promise<{ readonly projectRoot: string; readonly journalPath: string }> {
	const projectRoot = join(tmp.path, name);
	await mkdir(join(projectRoot, EPISODES), { recursive: true });
	const journalPath = join(projectRoot, JOURNAL);
	await writeFile(journalPath, content);
	return { projectRoot, journalPath };
}

async function expectRejected(name: string, value: unknown): Promise<void> {
	const { projectRoot, journalPath } = await withJournal(
		name,
		typeof value === "string" ? value : JSON.stringify(value),
	);
	const source = createProjectEpisodeConsolidationSource({ projectRoot });
	const before = await readFile(journalPath, "utf-8");
	await expect(source.recover?.()).rejects.toBeInstanceOf(
		ConsolidationSourceContractError,
	);
	await expect(source.recover?.()).rejects.toThrow(
		"Episode prune journal has an invalid shape.",
	);
	// A rejected journal is evidence, never consumed or rewritten.
	await expect(readFile(journalPath, "utf-8")).resolves.toBe(before);
}

function mutated(change: (journal: Journal) => void): Journal {
	const journal = validJournal();
	change(journal);
	return journal;
}

describe("isEpisodePruneJournal (via episode source recovery)", () => {
	test("accepts a well-formed journal and consumes it when no tombstone or live file remains", async () => {
		const { projectRoot, journalPath } = await withJournal(
			"valid",
			JSON.stringify(validJournal()),
		);
		const source = createProjectEpisodeConsolidationSource({ projectRoot });
		await expect(source.recover?.()).resolves.toEqual({
			episodePrunes: [`${EPISODES}/one.md`],
			writesCommitted: true,
		});
		await expect(readFile(journalPath)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("accepts a journal while finalizing and consumes it before pruning anything", async () => {
		const { projectRoot, journalPath } = await withJournal(
			"valid-finalize",
			JSON.stringify(validJournal()),
		);
		const source = createProjectEpisodeConsolidationSource({ projectRoot });
		await expect(source.finalize?.([])).resolves.toEqual({
			episodePrunes: [`${EPISODES}/one.md`],
			writesCommitted: true,
		});
		await expect(readFile(journalPath)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("reports nothing to recover when there is no journal", async () => {
		const projectRoot = join(tmp.path, "no-journal");
		await mkdir(join(projectRoot, EPISODES), { recursive: true });
		await expect(
			createProjectEpisodeConsolidationSource({ projectRoot }).recover?.(),
		).resolves.toEqual({ episodePrunes: [], writesCommitted: false });
	});

	test("reports malformed JSON with the parser message rather than a shape error", async () => {
		const { projectRoot } = await withJournal("not-json", "{ nope");
		await expect(
			createProjectEpisodeConsolidationSource({ projectRoot }).recover?.(),
		).rejects.toThrow(/^Episode prune journal is malformed: /u);
	});

	test.each([
		["null", null],
		["an array", [validJournal()]],
		["a string", "text"],
		["a number", 7],
	])("rejects %s as the journal value", async (name, value) => {
		await expectRejected(
			`top-${name.replace(/\W+/gu, "-")}`,
			JSON.stringify(value),
		);
	});

	test.each([
		["a missing key", mutated((j) => delete j.digest)],
		[
			"an extra key",
			mutated((j) => {
				j.extra = true;
			}),
		],
	])("rejects %s in the journal", async (name, value) => {
		await expectRejected(`keys-${name.replace(/\W+/gu, "-")}`, value);
	});

	test.each([
		[
			"schemaVersion 2",
			mutated((j) => {
				j.schemaVersion = 2;
			}),
		],
		[
			"a string schemaVersion",
			mutated((j) => {
				j.schemaVersion = "1";
			}),
		],
		[
			"a numeric originalPath",
			mutated((j) => {
				j.originalPath = 1;
			}),
		],
		[
			"a numeric tombstonePath",
			mutated((j) => {
				j.tombstonePath = 1;
			}),
		],
		[
			"a numeric digest",
			mutated((j) => {
				j.digest = 1;
			}),
		],
		[
			"a short digest",
			mutated((j) => {
				j.digest = "abc";
			}),
		],
		[
			"an uppercase digest",
			mutated((j) => {
				j.digest = DIGEST.toUpperCase();
			}),
		],
	])("rejects %s", async (name, value) => {
		await expectRejected(`scalar-${name.replace(/\W+/gu, "-")}`, value);
	});

	test.each([
		["a null fileIdentity", null],
		["a string fileIdentity", "1:2"],
		["an array fileIdentity", ["1", "2"]],
		["a fileIdentity missing inode", { device: "1" }],
		[
			"a fileIdentity with an extra key",
			{ device: "1", inode: "2", extra: "3" },
		],
		["a numeric device", { device: 1, inode: "2" }],
		["an empty device", { device: "", inode: "2" }],
		["a numeric inode", { device: "1", inode: 2 }],
		["an empty inode", { device: "1", inode: "" }],
	])("rejects %s", async (name, identity) => {
		await expectRejected(
			`identity-${name.replace(/\W+/gu, "-")}`,
			mutated((j) => {
				j.fileIdentity = identity;
			}),
		);
	});

	test.each([
		["a traversing original path", { originalPath: `${EPISODES}/../one.md` }],
		["an absolute original path", { originalPath: `/${EPISODES}/one.md` }],
		[
			"an original path outside the episode directory",
			{ originalPath: "memory/agent/one.md" },
		],
		["a nested original path", { originalPath: `${EPISODES}/nested/one.md` }],
		["a non-markdown original path", { originalPath: `${EPISODES}/one.txt` }],
		[
			"a traversing tombstone path",
			{ tombstonePath: `${EPISODES}/../.one.md.abc.tombstone` },
		],
		[
			"a tombstone outside the episode directory",
			{ tombstonePath: "memory/agent/.one.md.abc.tombstone" },
		],
		[
			"a tombstone for a different episode",
			{ tombstonePath: `${EPISODES}/.two.md.abc.tombstone` },
		],
		[
			"a tombstone without the leading dot",
			{ tombstonePath: `${EPISODES}/one.md.abc.tombstone` },
		],
		[
			"a tombstone without the tombstone suffix",
			{ tombstonePath: `${EPISODES}/.one.md.abc` },
		],
	])("rejects %s", async (name, override) => {
		await expectRejected(`path-${name.replace(/\W+/gu, "-")}`, {
			...validJournal(),
			...override,
		});
	});
});
