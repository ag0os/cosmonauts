import { createHash } from "node:crypto";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { createConsolidationProposalStore } from "../../lib/memory/consolidation-proposals.ts";
import type {
	ConsolidationEvidenceRef,
	ConsolidationObservation,
	JudgedProposal,
} from "../../lib/memory/types.ts";
import { useTempDir } from "../helpers/fs.ts";

/**
 * Characterization of `readProposalMaterializations`, observed through the
 * proposal store's `readMaterializations()` / `readEvidence()` and the files
 * `persist()` leaves behind.
 */
const tmp = useTempDir("proposal-materializations-");

const ROOT = "memory/agent/proposals/living-memory";

function sha(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function evidence(id: string): ConsolidationEvidenceRef {
	return {
		id,
		sourceId: "episodes",
		scope: "project",
		path: `memory/agent/episodes/${id}.md`,
		digest: sha(id),
	};
}

function projectRoot(name: string): string {
	return join(tmp.path, name);
}

async function proposalDirectory(root: string): Promise<string> {
	const directory = join(root, ...ROOT.split("/"));
	await mkdir(directory, { recursive: true });
	return directory;
}

function frontmatter(fields: Readonly<Record<string, string>>): string {
	return [
		"---",
		...Object.entries(fields).map(([key, value]) => `${key}: ${value}`),
		"---",
		"",
		"# Proposal",
		"",
	].join("\n");
}

const KEY = sha("key");
const VALID = {
	kind: "living-memory-proposal",
	schemaVersion: "1",
	proposalKind: "create",
	status: "open",
	key: KEY,
	inputs: JSON.stringify([evidence("one")]),
};

async function persist(
	root: string,
	options: {
		readonly key: string;
		readonly observationId: string;
		readonly inputs: readonly ConsolidationEvidenceRef[];
		readonly proposal: JudgedProposal;
	},
) {
	const observation: ConsolidationObservation = {
		id: options.observationId,
		kind: "stale-reference",
		inputs: options.inputs,
		reason: "Fixture.",
	};
	return createConsolidationProposalStore({ projectRoot: root }).persist({
		batchKey: options.key,
		observation,
		proposal: options.proposal,
		dryRun: false,
	});
}

const NOTE = {
	type: "note",
	title: "Note",
	description: "A note.",
	content: "Content.",
	tags: [],
} as const;

describe("readProposalMaterializations (via proposal store)", () => {
	test("returns a frozen empty list when the proposal root does not exist", async () => {
		const root = projectRoot("absent");
		const store = createConsolidationProposalStore({ projectRoot: root });
		const materializations = await store.readMaterializations();
		expect(materializations).toEqual([]);
		expect(Object.isFrozen(materializations)).toBe(true);
		await expect(store.readEvidence()).resolves.toEqual([]);
	});

	test("rejects a proposal root that is a file or a symlink", async () => {
		const root = projectRoot("root-file");
		await mkdir(join(root, "memory/agent/proposals"), { recursive: true });
		await writeFile(join(root, ...ROOT.split("/")), "not a directory\n");
		await expect(
			createConsolidationProposalStore({
				projectRoot: root,
			}).readMaterializations(),
		).rejects.toThrow(/proposal root is not a regular directory/u);

		const linked = projectRoot("root-symlink");
		await mkdir(join(linked, "memory/agent/proposals"), { recursive: true });
		await mkdir(join(tmp.path, "elsewhere"), { recursive: true });
		await symlink(
			join(tmp.path, "elsewhere"),
			join(linked, ...ROOT.split("/")),
		);
		await expect(
			createConsolidationProposalStore({
				projectRoot: linked,
			}).readMaterializations(),
		).rejects.toThrow(/proposal root is not a regular directory/u);
	});

	test("materializes persisted proposals sorted by file name with digest, kind, output type, and evidence", async () => {
		const root = projectRoot("persisted");
		const one = evidence("one");
		const two = evidence("two");
		const created = await persist(root, {
			key: sha("a"),
			observationId: "obs-2",
			inputs: [one],
			proposal: { proposalKind: "create", record: NOTE },
		});
		const merged = await persist(root, {
			key: sha("b"),
			observationId: "obs-1",
			inputs: [one, two],
			proposal: {
				proposalKind: "merge",
				replacement: { ...NOTE, type: "decision" },
			},
		});
		const retired = await persist(root, {
			key: sha("c"),
			observationId: "obs-3",
			inputs: [two],
			proposal: { proposalKind: "retire", reason: "obsolete" },
		});
		const store = createConsolidationProposalStore({ projectRoot: root });
		const result = await store.readMaterializations();
		expect(result.map((entry) => entry.proposalKind)).toEqual([
			"create",
			"merge",
			"retire",
		]);
		expect(result).toEqual([
			expect.objectContaining({
				proposalKind: "create",
				key: sha("a"),
				outputType: "note",
				status: "existing",
				inputs: [one],
				path: created.path,
				contentDigest: created.contentDigest,
			}),
			expect.objectContaining({
				proposalKind: "merge",
				key: sha("b"),
				outputType: "decision",
				inputs: [one, two],
				path: merged.path,
				contentDigest: merged.contentDigest,
			}),
			expect.objectContaining({
				proposalKind: "retire",
				key: sha("c"),
				inputs: [two],
				path: retired.path,
			}),
		]);
		expect(result[2]).not.toHaveProperty("outputType");
		expect(Object.isFrozen(result)).toBe(true);
		expect(Object.isFrozen(result[0])).toBe(true);
		expect(Object.isFrozen(result[0]?.inputs)).toBe(true);
		await expect(store.readEvidence()).resolves.toEqual([one, one, two, two]);
	});

	test("ignores dotfiles, non-markdown files, and directories that are not markdown-named", async () => {
		const root = projectRoot("ignored");
		const directory = await proposalDirectory(root);
		await writeFile(join(directory, ".hidden.md"), "garbage\n");
		await writeFile(join(directory, "README.txt"), "garbage\n");
		await mkdir(join(directory, "resolutions.md.d"), { recursive: true });
		await mkdir(join(directory, "resolutions"), { recursive: true });
		await writeFile(join(directory, "create-001-valid.md"), frontmatter(VALID));
		const result = await createConsolidationProposalStore({
			projectRoot: root,
		}).readMaterializations();
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ proposalKind: "create", key: KEY });
		expect(result[0]).not.toHaveProperty("outputType");
	});

	test("rejects a directory or symlink occupying a markdown name", async () => {
		const dirRoot = projectRoot("occupant-dir");
		const directory = await proposalDirectory(dirRoot);
		await mkdir(join(directory, "create-001-dir.md"));
		await expect(
			createConsolidationProposalStore({
				projectRoot: dirRoot,
			}).readMaterializations(),
		).rejects.toThrow(
			"Living-memory proposal occupant is not a regular file: create-001-dir.md.",
		);

		const linkRoot = projectRoot("occupant-link");
		const linkDirectory = await proposalDirectory(linkRoot);
		await writeFile(join(tmp.path, "target.md"), frontmatter(VALID));
		await symlink(
			join(tmp.path, "target.md"),
			join(linkDirectory, "create-001-link.md"),
		);
		await expect(
			createConsolidationProposalStore({
				projectRoot: linkRoot,
			}).readMaterializations(),
		).rejects.toThrow(
			"Living-memory proposal occupant is not a regular file: create-001-link.md.",
		);
	});

	test.each([
		["a foreign kind", { ...VALID, kind: "something-else" }],
		["a future schema version", { ...VALID, schemaVersion: "2" }],
		["a non-open status", { ...VALID, status: "resolved" }],
		["an unknown proposal kind", { ...VALID, proposalKind: "rewrite" }],
		["a short key", { ...VALID, key: "abc123" }],
		["an uppercase key", { ...VALID, key: KEY.toUpperCase() }],
		["a non-list inputs field", { ...VALID, inputs: "one" }],
	])("rejects a proposal with %s as malformed", async (name, fields) => {
		const root = projectRoot(`malformed-${name.replace(/\W+/gu, "-")}`);
		const directory = await proposalDirectory(root);
		await writeFile(join(directory, "create-001-bad.md"), frontmatter(fields));
		await expect(
			createConsolidationProposalStore({
				projectRoot: root,
			}).readMaterializations(),
		).rejects.toThrow(
			`Living-memory proposal is malformed: ${ROOT}/create-001-bad.md.`,
		);
	});

	test.each([
		["a non-object input", JSON.stringify(["one"])],
		["an extra key", JSON.stringify([{ ...evidence("x"), extra: 1 }])],
		[
			"a missing key",
			JSON.stringify([
				{ id: "x", sourceId: "s", scope: "project", path: "a.md" },
			]),
		],
		["an empty id", JSON.stringify([{ ...evidence("x"), id: "" }])],
		[
			"an empty source id",
			JSON.stringify([{ ...evidence("x"), sourceId: "" }]),
		],
		[
			"an unknown scope",
			JSON.stringify([{ ...evidence("x"), scope: "session" }]),
		],
		[
			"an unsafe path",
			JSON.stringify([{ ...evidence("x"), path: "../escape.md" }]),
		],
		[
			"a non-digest digest",
			JSON.stringify([{ ...evidence("x"), digest: "nope" }]),
		],
	])("rejects a proposal whose evidence has %s", async (name, inputs) => {
		const root = projectRoot(`evidence-${name.replace(/\W+/gu, "-")}`);
		const directory = await proposalDirectory(root);
		await writeFile(
			join(directory, "create-001-bad.md"),
			frontmatter({ ...VALID, inputs }),
		);
		await expect(
			createConsolidationProposalStore({
				projectRoot: root,
			}).readMaterializations(),
		).rejects.toThrow(
			`Living-memory proposal has invalid evidence: ${ROOT}/create-001-bad.md.`,
		);
	});

	test("accepts an empty evidence list and drops an unrecognized output type", async () => {
		const root = projectRoot("empty-inputs");
		const directory = await proposalDirectory(root);
		await writeFile(
			join(directory, "create-001-a.md"),
			frontmatter({ ...VALID, inputs: "[]", outputType: "essay" }),
		);
		const result = await createConsolidationProposalStore({
			projectRoot: root,
		}).readMaterializations();
		expect(result).toHaveLength(1);
		expect(result[0]?.inputs).toEqual([]);
		expect(result[0]).not.toHaveProperty("outputType");
	});

	test("fails the whole read when any one proposal is invalid, exposing no partial list", async () => {
		const root = projectRoot("partial");
		const directory = await proposalDirectory(root);
		await writeFile(join(directory, "create-001-a.md"), frontmatter(VALID));
		await writeFile(
			join(directory, "create-002-b.md"),
			frontmatter({ ...VALID, status: "resolved" }),
		);
		const store = createConsolidationProposalStore({ projectRoot: root });
		await expect(store.readMaterializations()).rejects.toThrow(
			/create-002-b\.md/u,
		);
		await expect(store.readEvidence()).rejects.toThrow(/create-002-b\.md/u);
	});

	test("does not modify proposal files while reading them", async () => {
		const root = projectRoot("read-only");
		const persisted = await persist(root, {
			key: sha("a"),
			observationId: "obs-1",
			inputs: [evidence("one")],
			proposal: { proposalKind: "create", record: NOTE },
		});
		const store = createConsolidationProposalStore({ projectRoot: root });
		const first = await store.readMaterializations();
		const second = await store.readMaterializations();
		expect(second).toEqual(first);
		expect(first[0]?.contentDigest).toBe(persisted.contentDigest);
	});
});
