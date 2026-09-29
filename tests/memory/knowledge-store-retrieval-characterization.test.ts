import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { createKnowledgeMemoryStore } from "../../lib/memory/knowledge-store.ts";
import type { MemoryQuery, MemoryScopeName } from "../../lib/memory/types.ts";
import { useTempDir } from "../helpers/fs.ts";

/**
 * Characterization of `retrieveKnowledge`, observed only through
 * `createKnowledgeMemoryStore().retrieve()`.
 */
const tmp = useTempDir("knowledge-retrieval-");

interface Roots {
	readonly project: string;
	readonly user: string;
}

function record(options: {
	readonly resource: string;
	readonly type?: string;
	readonly title?: string;
	readonly scope?: string;
	readonly timestamp?: string;
	readonly body?: string;
	readonly extra?: readonly string[];
}): string {
	return [
		"---",
		`type: ${options.type ?? "decision"}`,
		`title: ${options.title ?? options.resource}`,
		`description: Description of ${options.resource}.`,
		`resource: ${options.resource}`,
		...(options.scope === undefined ? [] : [`scope: ${options.scope}`]),
		"kind: semantic",
		...(options.timestamp === undefined
			? []
			: [`timestamp: '${options.timestamp}'`]),
		...(options.extra ?? []),
		"---",
		"",
		`# ${options.title ?? options.resource}`,
		"",
		options.body ?? "Body.",
		"",
	].join("\n");
}

async function roots(): Promise<Roots> {
	const project = join(tmp.path, "project");
	const user = join(tmp.path, "user");
	await mkdir(join(project, "knowledge"), { recursive: true });
	await mkdir(join(user, "knowledge"), { recursive: true });
	return { project, user };
}

async function put(root: string, relative: string, content: string) {
	const path = join(root, "knowledge", ...relative.split("/"));
	await mkdir(join(path, ".."), { recursive: true });
	await writeFile(path, content);
	return path;
}

function retrieve(
	r: Roots,
	options: {
		readonly scopes?: readonly MemoryScopeName[];
		readonly query?: MemoryQuery;
		readonly readOptions?: Parameters<
			ReturnType<typeof createKnowledgeMemoryStore>["retrieve"]
		>[2];
		readonly requestedRoot?: string;
	} = {},
) {
	return createKnowledgeMemoryStore({
		projectRoot: r.project,
		userCosmonautsRoot: r.user,
	}).retrieve(
		{
			projectRoot: options.requestedRoot ?? r.project,
			scopes: options.scopes ?? ["project", "user"],
		},
		options.query ?? {},
		options.readOptions,
	);
}

describe("retrieveKnowledge (via knowledge store retrieve)", () => {
	test("returns an empty result with no warnings when knowledge roots are absent", async () => {
		const r = {
			project: join(tmp.path, "none-project"),
			user: join(tmp.path, "none-user"),
		};
		const result = await retrieve(r);
		expect(result).toMatchObject({
			records: [],
			searchedScopes: ["project", "user"],
			skippedScopes: [],
			warnings: [],
			stats: { filesScanned: 0, bytesRead: 0 },
		});
		expect(result.readDeclines).toBeUndefined();
		expect(result.inventoryRecords).toBeUndefined();
	});

	test("skips session scope with a reason and searches project and user in order", async () => {
		const r = await roots();
		await put(
			r.project,
			"p.md",
			record({ resource: "p.md", scope: "project" }),
		);
		await put(r.user, "u.md", record({ resource: "u.md", scope: "user" }));
		const result = await retrieve(r, {
			scopes: ["session", "user", "project"],
		});
		expect(result.searchedScopes).toEqual(["user", "project"]);
		expect(result.skippedScopes).toEqual([
			{
				scope: "session",
				reason: expect.stringContaining("no session-scoped root"),
			},
		]);
		expect(
			result.records.map((entry) => [entry.scope, entry.resource]).toSorted(),
		).toEqual([
			["project", "p.md"],
			["user", "u.md"],
		]);
	});

	test("rejects a scope context bound to a different project root", async () => {
		const r = await roots();
		await expect(
			retrieve(r, { requestedRoot: join(tmp.path, "other") }),
		).rejects.toThrow(/bound to a different projectRoot/u);
	});

	test("lists nested markdown, ignoring index.md, non-markdown files, and symlinks", async () => {
		const r = await roots();
		await put(r.project, "a.md", record({ resource: "a.md" }));
		await put(
			r.project,
			"nested/deep/b.md",
			record({ resource: "nested/deep/b.md" }),
		);
		await put(r.project, "index.md", "not a record\n");
		await put(r.project, "notes.txt", "ignored\n");
		await symlink(
			join(r.project, "knowledge", "a.md"),
			join(r.project, "knowledge", "link.md"),
		);
		await mkdir(join(tmp.path, "outside"), { recursive: true });
		await writeFile(
			join(tmp.path, "outside", "c.md"),
			record({ resource: "c.md" }),
		);
		await symlink(
			join(tmp.path, "outside"),
			join(r.project, "knowledge", "linked-dir"),
		);
		const result = await retrieve(r, { scopes: ["project"] });
		expect(result.records.map((entry) => entry.resource).toSorted()).toEqual([
			"a.md",
			"nested/deep/b.md",
		]);
		expect(result.warnings).toEqual([]);
		expect(result.stats?.filesScanned).toBe(2);
	});

	test("treats a symlinked knowledge root as absent", async () => {
		const r = await roots();
		const real = join(tmp.path, "real-knowledge");
		await mkdir(real, { recursive: true });
		await writeFile(join(real, "a.md"), record({ resource: "a.md" }));
		const linked = { project: join(tmp.path, "linked-project"), user: r.user };
		await mkdir(linked.project, { recursive: true });
		await symlink(real, join(linked.project, "knowledge"));
		const result = await retrieve(linked, { scopes: ["project"] });
		expect(result.records).toEqual([]);
		expect(result.warnings).toEqual([]);
	});

	test("hides retired records unless requested, then flags them with their logical resource", async () => {
		const r = await roots();
		await put(r.project, "live.md", record({ resource: "live.md" }));
		await put(
			r.project,
			"retired/old.md",
			record({ resource: "old.md", timestamp: "2026-01-01T00:00:00.000Z" }),
		);
		const hidden = await retrieve(r, { scopes: ["project"] });
		expect(hidden.records.map((entry) => entry.resource)).toEqual(["live.md"]);
		expect(
			(hidden.records[0] as { retired?: boolean } | undefined)?.retired,
		).toBeUndefined();

		const shown = await retrieve(r, {
			scopes: ["project"],
			query: { includeRetired: true },
		});
		const retired = shown.records.find((entry) => entry.resource === "old.md");
		expect(retired).toMatchObject({ retired: true, scope: "project" });
		expect(
			(
				shown.records.find((entry) => entry.resource === "live.md") as
					| { retired?: boolean }
					| undefined
			)?.retired,
		).toBeUndefined();
	});

	test("turns invalid records into warnings without failing the retrieval", async () => {
		const r = await roots();
		await put(r.project, "good.md", record({ resource: "good.md" }));
		await put(
			r.project,
			"bad-type.md",
			record({ resource: "bad-type.md", type: "opinion" }),
		);
		await put(
			r.project,
			"wrong-scope.md",
			record({ resource: "wrong-scope.md", scope: "user" }),
		);
		await put(
			r.project,
			"wrong-resource.md",
			record({ resource: "elsewhere.md" }),
		);
		const result = await retrieve(r, { scopes: ["project"] });
		expect(result.records.map((entry) => entry.resource)).toEqual(["good.md"]);
		expect(
			result.warnings
				.map((warning) => warning.path?.split("/").pop())
				.toSorted(),
		).toEqual(["bad-type.md", "wrong-resource.md", "wrong-scope.md"]);
		expect(
			result.warnings.find((w) => w.path?.endsWith("bad-type.md"))?.message,
		).toContain("opinion");
		// Invalid files are still counted as scanned.
		expect(result.stats?.filesScanned).toBe(4);
	});

	test("filters by record type, resource, and case-insensitive text", async () => {
		const r = await roots();
		await put(
			r.project,
			"d.md",
			record({ resource: "d.md", type: "decision", body: "Uses Postgres." }),
		);
		await put(
			r.project,
			"g.md",
			record({ resource: "g.md", type: "gotcha", body: "Beware Redis." }),
		);
		const byType = await retrieve(r, {
			scopes: ["project"],
			query: { recordTypes: ["gotcha"] },
		});
		expect(byType.records.map((entry) => entry.resource)).toEqual(["g.md"]);
		const byResource = await retrieve(r, {
			scopes: ["project"],
			query: { resource: "d.md" },
		});
		expect(byResource.records.map((entry) => entry.resource)).toEqual(["d.md"]);
		const byText = await retrieve(r, {
			scopes: ["project"],
			query: { text: "  POSTGRES " },
		});
		expect(byText.records.map((entry) => entry.resource)).toEqual(["d.md"]);
		const none = await retrieve(r, {
			scopes: ["project"],
			query: { text: "mongodb" },
		});
		expect(none.records).toEqual([]);
		expect(none.stats?.filesScanned).toBe(2);
	});

	test("sorts newest first with path tiebreak, and applies the limit after sorting", async () => {
		const r = await roots();
		await put(
			r.project,
			"b.md",
			record({ resource: "b.md", timestamp: "2026-02-01T00:00:00.000Z" }),
		);
		await put(
			r.project,
			"a.md",
			record({ resource: "a.md", timestamp: "2026-02-01T00:00:00.000Z" }),
		);
		await put(
			r.project,
			"old.md",
			record({ resource: "old.md", timestamp: "2025-01-01T00:00:00.000Z" }),
		);
		await put(
			r.project,
			"new.md",
			record({ resource: "new.md", timestamp: "2026-03-01T00:00:00.000Z" }),
		);
		const all = await retrieve(r, { scopes: ["project"] });
		expect(all.records.map((entry) => entry.resource)).toEqual([
			"new.md",
			"a.md",
			"b.md",
			"old.md",
		]);
		const limited = await retrieve(r, {
			scopes: ["project"],
			query: { limit: 2 },
		});
		expect(limited.records.map((entry) => entry.resource)).toEqual([
			"new.md",
			"a.md",
		]);
		const zero = await retrieve(r, {
			scopes: ["project"],
			query: { limit: 0 },
		});
		expect(zero.records).toEqual([]);
		const negative = await retrieve(r, {
			scopes: ["project"],
			query: { limit: -3 },
		});
		expect(negative.records).toEqual([]);
	});

	test("reports scan statistics for the bytes read", async () => {
		const r = await roots();
		const content = record({ resource: "a.md" });
		await put(r.project, "a.md", content);
		const result = await retrieve(r, { scopes: ["project"] });
		expect(result.stats).toMatchObject({
			filesScanned: 1,
			bytesRead: Buffer.byteLength(content, "utf-8"),
		});
		expect(result.stats?.durationMs).toBeGreaterThanOrEqual(0);
	});

	test("refuses raw content without explicit byte limits and invalid limits", async () => {
		const r = await roots();
		await expect(
			retrieve(r, { readOptions: { includeRawContent: true } }),
		).rejects.toThrow(
			"Raw knowledge content requires explicit read byte limits.",
		);
		for (const bad of [0, -1, 1.5, Number.NaN]) {
			await expect(
				retrieve(r, {
					readOptions: {
						byteLimits: { maxRecordBytes: bad, maxAggregateBytes: 100 },
					},
				}),
			).rejects.toThrow("Knowledge maxRecordBytes must be a positive integer.");
			await expect(
				retrieve(r, {
					readOptions: {
						byteLimits: { maxRecordBytes: 100, maxAggregateBytes: bad },
					},
				}),
			).rejects.toThrow(
				"Knowledge maxAggregateBytes must be a positive integer.",
			);
		}
	});

	test("returns raw content and an inventory when byte limits admit every record", async () => {
		const r = await roots();
		const content = record({ resource: "a.md" });
		await put(r.project, "a.md", content);
		const result = await retrieve(r, {
			scopes: ["project"],
			readOptions: {
				byteLimits: { maxRecordBytes: 10_000, maxAggregateBytes: 10_000 },
				includeRawContent: true,
			},
		});
		expect(result.records).toHaveLength(1);
		expect(result.records[0]?.rawContent).toBe(content);
		expect(result.readDeclines).toEqual([]);
		expect(result.inventoryRecords).toHaveLength(1);
		expect(result.inventoryRecords?.[0]?.digest).toMatch(/^[0-9a-f]{64}$/u);
		expect(Object.isFrozen(result.readDeclines)).toBe(true);
	});

	test("declines an over-limit record, keeps it in the inventory only, and never returns its body", async () => {
		const r = await roots();
		const small = record({ resource: "small.md" });
		const big = record({ resource: "big.md", body: "x".repeat(2_000) });
		await put(r.project, "small.md", small);
		await put(r.project, "big.md", big);
		const result = await retrieve(r, {
			scopes: ["project"],
			readOptions: {
				byteLimits: { maxRecordBytes: 1_000, maxAggregateBytes: 100_000 },
			},
		});
		expect(result.records.map((entry) => entry.resource)).toEqual(["small.md"]);
		expect(result.readDeclines).toEqual([
			expect.objectContaining({ code: "record-byte-limit", scope: "project" }),
		]);
		expect(
			result.inventoryRecords?.map((entry) => entry.record.resource).toSorted(),
		).toEqual(["big.md", "small.md"]);
		expect(JSON.stringify(result.records)).not.toContain("xxxxxxxx");
		// Declined bytes still count as scanned but do not consume the aggregate allowance.
		expect(result.stats?.filesScanned).toBe(2);
	});

	test("declines records past the remaining aggregate allowance", async () => {
		const r = await roots();
		const a = record({
			resource: "a.md",
			timestamp: "2026-02-01T00:00:00.000Z",
		});
		const b = record({
			resource: "b.md",
			timestamp: "2026-01-01T00:00:00.000Z",
		});
		await put(r.project, "a.md", a);
		await put(r.project, "b.md", b);
		const size = Buffer.byteLength(a, "utf-8");
		const result = await retrieve(r, {
			scopes: ["project"],
			readOptions: {
				byteLimits: { maxRecordBytes: size * 2, maxAggregateBytes: size + 1 },
			},
		});
		expect(result.records.map((entry) => entry.resource)).toEqual(["a.md"]);
		expect(result.readDeclines).toEqual([
			expect.objectContaining({ code: "aggregate-byte-limit" }),
		]);
		expect(result.readDeclines?.[0]?.path).toBe(
			join(r.project, "knowledge", "b.md"),
		);
	});

	test("omits inventory entries for records that do not match the query", async () => {
		const r = await roots();
		await put(r.project, "a.md", record({ resource: "a.md", type: "gotcha" }));
		await put(
			r.project,
			"b.md",
			record({ resource: "b.md", type: "decision" }),
		);
		const result = await retrieve(r, {
			scopes: ["project"],
			query: { recordTypes: ["gotcha"] },
			readOptions: {
				byteLimits: { maxRecordBytes: 10_000, maxAggregateBytes: 10_000 },
			},
		});
		expect(result.records.map((entry) => entry.resource)).toEqual(["a.md"]);
		expect(
			result.inventoryRecords?.map((entry) => entry.record.resource),
		).toEqual(["a.md"]);
	});
});
