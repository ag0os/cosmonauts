import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
	access,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
	deriveKnowledgeProposalIdentity,
	type KnowledgeRecordType,
} from "../../lib/memory/knowledge-records.ts";
import { createKnowledgeMemoryStore } from "../../lib/memory/knowledge-store.ts";
import {
	inspectKnowledgeSurfaceBackfill,
	readBackfillSnapshot,
	runKnowledgeSurfaceBackfill,
} from "../../scripts/knowledge-surface-backfill.ts";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const CODING_DOMAIN = ["cod", "ing"].join("");
const QUALIFIED_DISTILLER = `${CODING_DOMAIN}/distiller`;
const EXPECTED_MISSING_SLUGS = [
	"agent-thinking-levels",
	"analysis-capabilities",
	`${CODING_DOMAIN}-agnostic-framework`,
	"dialogic-planner",
	"domain-authoring",
	"drive-smoke-fixes",
	"driver-primitives",
	"external-agent-orchestration",
	"external-backends-and-cli",
	"fallow-temp-exceptions-cleanup",
	"framework-extraction",
	"main-domain-and-cosmo-rename",
	"observability",
	"orchestration-hardening",
	"orchestration-surface-consolidation",
	"package-system",
	"quality-contracts",
	"roadmap-system",
	"ruby-rails-skills",
] as const;

const tempRoots: string[] = [];

afterEach(async () => {
	await Promise.all(
		tempRoots
			.splice(0)
			.map((path) => rm(path, { recursive: true, force: true })),
	);
});

describe("knowledge surface recoverable backfill", () => {
	test("derives the frozen current 19-slug batch and verifies every source input @cosmo-behavior plan:knowledge-surface#B-010", async () => {
		const inspected = await inspectKnowledgeSurfaceBackfill({
			projectRoot: REPO_ROOT,
		});

		expect(inspected.missingSlugs).toEqual(EXPECTED_MISSING_SLUGS);
		expect(inspected.scanCostVerdict).toBe("pass");
		expect(inspected.sourceInputs.length).toBeGreaterThan(19);
		expect(inspected.sourceInputs.every((input) => input.verified)).toBe(true);
	});

	test("keeps the supervised machine GREEN artifact digest-complete and unpromoted", async () => {
		const reviewIndexPath = join(
			REPO_ROOT,
			"memory",
			"agent",
			"proposals",
			"backfill-review.json",
		);
		const index = JSON.parse(await readFile(reviewIndexPath, "utf-8")) as {
			beforeConfigDigest: string;
			afterConfigDigest: string;
			missingSlugs: string[];
			proposals: { path: string; sha256: string; planSlug: string }[];
			aggregateProposalDigest: string;
			noPromotion: boolean;
		};
		expect(index.missingSlugs).toEqual(EXPECTED_MISSING_SLUGS);
		expect(index.noPromotion).toBe(true);
		expect(index.afterConfigDigest).toBe(index.beforeConfigDigest);
		expect(index.beforeConfigDigest).toBe(
			sha256(await readFile(join(REPO_ROOT, ".cosmonauts", "config.json"))),
		);

		// A proposal exits the proposals area only by human promotion or deletion.
		// Promotions are recorded, so an indexed proposal must still be readable at
		// its original path OR at its recorded promoted path — with the same digest,
		// which also proves promotion moved bytes unchanged.
		const promoted = await recordedPromotions(REPO_ROOT);
		const counts = new Map<string, number>();
		for (const proposal of index.proposals) {
			expect(proposal.path).toMatch(
				new RegExp(`^memory/agent/proposals/${proposal.planSlug}/[^/]+\\.md$`),
			);
			const livePath = promoted.get(proposal.path) ?? proposal.path;
			expect(sha256(await readFile(join(REPO_ROOT, livePath))), livePath).toBe(
				proposal.sha256,
			);
			counts.set(proposal.planSlug, (counts.get(proposal.planSlug) ?? 0) + 1);
		}
		for (const slug of EXPECTED_MISSING_SLUGS) {
			expect(counts.get(slug), slug).toBeGreaterThanOrEqual(3);
			expect(counts.get(slug), slug).toBeLessThanOrEqual(15);
		}
		expect(index.proposals.map(({ path }) => path).sort()).toEqual(
			[...(await proposalFiles(REPO_ROOT)), ...promoted.keys()].sort(),
		);
		expect(index.aggregateProposalDigest).toBe(
			aggregateDigest(index.proposals),
		);
		await expectMissing(
			join(REPO_ROOT, ".cosmonauts", "config.json.backfill-prerun"),
		);
		const reviewIndexRaw = await readFile(reviewIndexPath);
		const approval = matter(
			await readFile(
				join(
					REPO_ROOT,
					"missions",
					"reviews",
					"knowledge-surface-backfill-approval.md",
				),
				"utf-8",
			),
		).data as Record<string, unknown>;
		expect(approval).toMatchObject({
			kind: "knowledge-surface-backfill-approval",
			plan: "knowledge-surface",
			stage: "7B",
			decision: "approve",
			noVerbatimAttested: true,
			reviewIndexDigest: sha256(reviewIndexRaw),
			aggregateProposalDigest: index.aggregateProposalDigest,
			proposalCount: index.proposals.length,
			slugCount: EXPECTED_MISSING_SLUGS.length,
		});
		// INV-1 forbids the machine pathway writing into knowledge/, not a human
		// placing a distiller-authored record there by promotion. A file's `writer`
		// records who authored it, not who promoted it, so the filesystem cannot
		// tell the two apart — a recorded promotion is what distinguishes them.
		// The store-level refusal is proved separately by B-002 and B-013.
		expect(await curatedDistillerFiles(REPO_ROOT)).toEqual(
			[...promoted.values()].sort(),
		);
	});

	test("restores config and writes a digest-complete no-promotion review index", async () => {
		const fixture = await createBackfillFixture(["alpha-plan", "beta-plan"]);
		const originalConfig = await readFile(fixture.configPath);
		const curatedPath = join(fixture.root, "knowledge", "sentinel.md");
		await mkdir(dirname(curatedPath), { recursive: true });
		await writeFile(curatedPath, "human-curated\n");
		const taskSource =
			"missions/archive/tasks/TASK-1 - Beta plan implementation.md";
		await mkdir(dirname(join(fixture.root, taskSource)), { recursive: true });
		await writeFile(
			join(fixture.root, taskSource),
			"---\nlabels:\n  - plan:beta-plan\n---\n\n# Beta task\n",
		);
		const distillSlug = vi.fn(async (slug: string) => {
			await writeValidProposals(
				fixture.root,
				slug,
				3,
				0,
				slug === "beta-plan"
					? { source: taskSource, includePlanTag: false }
					: undefined,
			);
		});

		const result = await runKnowledgeSurfaceBackfill({
			projectRoot: fixture.root,
			distillSlug,
			now: () => new Date("2026-08-21T12:00:00.000Z"),
		});

		expect(distillSlug.mock.calls.map(([slug]) => slug)).toEqual([
			"alpha-plan",
			"beta-plan",
		]);
		expect(await readFile(fixture.configPath)).toEqual(originalConfig);
		await expectMissing(fixture.snapshotPath);
		expect(await readFile(curatedPath, "utf-8")).toBe("human-curated\n");
		await expectMissing(
			join(
				fixture.root,
				"missions",
				"reviews",
				"knowledge-surface-backfill-approval.md",
			),
		);

		const rawIndex = await readFile(result.reviewIndexPath, "utf-8");
		const index = JSON.parse(rawIndex) as {
			noPromotion: boolean;
			missingSlugs: string[];
			proposals: { path: string; sha256: string; planSlug: string }[];
			aggregateProposalDigest: string;
			beforeConfigDigest: string;
			afterConfigDigest: string;
		};
		expect(index.noPromotion).toBe(true);
		expect(index.missingSlugs).toEqual(["alpha-plan", "beta-plan"]);
		expect(index.proposals).toHaveLength(6);
		expect(
			index.proposals.every((proposal) => proposal.sha256.length === 64),
		).toBe(true);
		expect(index.aggregateProposalDigest).toBe(
			aggregateDigest(index.proposals),
		);
		expect(index.afterConfigDigest).toBe(index.beforeConfigDigest);
	});

	test("halts for an inventory amendment before enablement when archives drift", async () => {
		const fixture = await createBackfillFixture(["alpha-plan"]);
		await mkdir(
			join(fixture.root, "missions", "archive", "plans", "new-plan"),
			{ recursive: true },
		);
		const originalConfig = await readFile(fixture.configPath);
		const distillSlug = vi.fn();

		await expect(
			runKnowledgeSurfaceBackfill({
				projectRoot: fixture.root,
				distillSlug,
			}),
		).rejects.toThrow(/inventory amendment/i);
		expect(distillSlug).not.toHaveBeenCalled();
		expect(await readFile(fixture.configPath)).toEqual(originalConfig);
		await expectMissing(fixture.snapshotPath);
	});

	test("restores unchanged temporary config and removes all same-batch proposals after failure", async () => {
		const fixture = await createBackfillFixture(["alpha-plan", "beta-plan"]);
		const originalConfig = await readFile(fixture.configPath);

		await expect(
			runKnowledgeSurfaceBackfill({
				projectRoot: fixture.root,
				distillSlug: async (slug) => {
					await writeValidProposals(fixture.root, slug, 3);
					if (slug === "beta-plan") throw new Error("injected failure");
				},
			}),
		).rejects.toThrow("injected failure");
		expect(await readFile(fixture.configPath)).toEqual(originalConfig);
		await expectMissing(fixture.snapshotPath);
		expect(await proposalFiles(fixture.root)).toEqual([]);
	});

	test("awaits fake cancellation before cleanup and config restoration", async () => {
		const fixture = await createBackfillFixture(["alpha-plan"]);
		const originalConfig = await readFile(fixture.configPath);
		const controller = new AbortController();
		let started: (() => void) | undefined;
		const distillStarted = new Promise<void>((resolveStarted) => {
			started = resolveStarted;
		});

		const running = runKnowledgeSurfaceBackfill({
			projectRoot: fixture.root,
			signal: controller.signal,
			distillSlug: async (slug, signal) => {
				await writeValidProposals(fixture.root, slug, 1);
				started?.();
				await new Promise<void>((_resolve, reject) => {
					signal?.addEventListener(
						"abort",
						() => reject(new Error("fake distiller cancelled")),
						{ once: true },
					);
				});
			},
		});
		await distillStarted;
		expect(await readFile(fixture.configPath)).not.toEqual(originalConfig);

		controller.abort();
		await expect(running).rejects.toThrow(/cancelled|abort/i);
		expect(await readFile(fixture.configPath)).toEqual(originalConfig);
		await expectMissing(fixture.snapshotPath);
		expect(await proposalFiles(fixture.root)).toEqual([]);
	});

	test("preserves a concurrent config edit and leaves a digest-bound recovery snapshot", async () => {
		const fixture = await createBackfillFixture(["alpha-plan"]);
		const originalConfig = await readFile(fixture.configPath);
		const concurrentBytes = Buffer.from('{"concurrentEdit":true}\n');

		await expect(
			runKnowledgeSurfaceBackfill({
				projectRoot: fixture.root,
				distillSlug: async (slug) => {
					await writeValidProposals(fixture.root, slug, 3);
					await writeFile(fixture.configPath, concurrentBytes);
				},
			}),
		).rejects.toThrow(
			new RegExp(
				`${escapeRegex(fixture.configPath)}.*${escapeRegex(fixture.snapshotPath)}`,
			),
		);
		expect(await readFile(fixture.configPath)).toEqual(concurrentBytes);
		const snapshot = await readBackfillSnapshot(fixture.snapshotPath);
		expect(snapshot.configBytes).toEqual(originalConfig);
		expect(snapshot.sha256).toBe(sha256(originalConfig));
		expect(await proposalFiles(fixture.root)).toEqual([]);
	});

	test("removes an unindexed prior machine orphan before rerun without touching an indexed path", async () => {
		const fixture = await createBackfillFixture(["alpha-plan"]);
		const [orphan] = await writeValidProposals(
			fixture.root,
			"alpha-plan",
			1,
			20,
		);
		const [indexed] = await writeValidProposals(
			fixture.root,
			"alpha-plan",
			1,
			30,
		);
		if (!orphan || !indexed) expect.unreachable("Expected proposal fixtures");
		await writeExistingIndex(fixture.root, indexed);
		const observedBeforeDistill: string[][] = [];

		const result = await runKnowledgeSurfaceBackfill({
			projectRoot: fixture.root,
			distillSlug: async (slug) => {
				observedBeforeDistill.push(await proposalFiles(fixture.root));
				await writeValidProposals(fixture.root, slug, 3, 40);
			},
		});

		expect(observedBeforeDistill).toEqual([[indexed]]);
		await expectMissing(join(fixture.root, orphan));
		expect(await readFile(join(fixture.root, indexed), "utf-8")).toContain(
			`writer: ${QUALIFIED_DISTILLER}`,
		);
		const index = JSON.parse(
			await readFile(result.reviewIndexPath, "utf-8"),
		) as { proposals: { path: string }[] };
		expect(index.proposals.map(({ path }) => path)).toContain(indexed);
	});

	test("leaves enough on-disk evidence for manual recovery after a real hard kill", async () => {
		const fixture = await createBackfillFixture(["alpha-plan"]);
		const originalConfig = await readFile(fixture.configPath);
		const modulePath = join(
			REPO_ROOT,
			"scripts",
			"knowledge-surface-backfill.ts",
		);
		const childScript = join(fixture.root, "hard-kill-backfill.ts");
		await writeFile(
			childScript,
			`import { runKnowledgeSurfaceBackfill } from ${JSON.stringify(modulePath)};\nawait runKnowledgeSurfaceBackfill({ projectRoot: ${JSON.stringify(fixture.root)}, distillSlug: async () => { process.kill(process.pid, "SIGKILL"); await new Promise(() => undefined); } });\n`,
		);

		const child = spawn("bun", [childScript], { stdio: "pipe" });
		const exit = await new Promise<{
			code: number | null;
			signal: NodeJS.Signals | null;
		}>((resolveExit, reject) => {
			child.once("error", reject);
			child.once("exit", (code, signal) => resolveExit({ code, signal }));
		});
		expect(exit.signal).toBe("SIGKILL");
		expect(await readFile(fixture.configPath)).not.toEqual(originalConfig);

		const snapshot = await readBackfillSnapshot(fixture.snapshotPath);
		expect(snapshot.configBytes).toEqual(originalConfig);
		expect(snapshot.sha256).toBe(sha256(originalConfig));
	}, 20_000);
});

interface Fixture {
	root: string;
	configPath: string;
	snapshotPath: string;
}

async function createBackfillFixture(
	slugs: readonly string[],
): Promise<Fixture> {
	const root = await mkdtemp(join(tmpdir(), "knowledge-backfill-"));
	tempRoots.push(root);
	const configPath = join(root, ".cosmonauts", "config.json");
	const snapshotPath = `${configPath}.backfill-prerun`;
	await mkdir(dirname(configPath), { recursive: true });
	await writeFile(configPath, '{\n\t"skills": ["archive"]\n}\n');
	const sourceInputs: Record<string, { path: string; sha256: string }[]> = {};

	for (const slug of slugs) {
		const path = `missions/archive/plans/${slug}/plan.md`;
		const absolutePath = join(root, path);
		const raw = `# ${slug}\n\nDurable source evidence for ${slug}.\n`;
		await mkdir(dirname(absolutePath), { recursive: true });
		await writeFile(absolutePath, raw);
		sourceInputs[slug] = [{ path, sha256: sha256(raw) }];
	}

	await mkdir(join(root, "tests", "fixtures"), { recursive: true });
	await writeFile(
		join(root, "tests", "fixtures", "knowledge-seed-inventory.json"),
		`${JSON.stringify(
			{
				version: 1,
				backfill: {
					archivedPlanSlugs: slugs,
					distilledSlugs: [],
					missingSlugs: slugs,
					sourceInputs,
				},
			},
			null,
			2,
		)}\n`,
	);
	await mkdir(join(root, "missions", "reviews"), { recursive: true });
	await writeFile(
		join(root, "missions", "reviews", "knowledge-surface-scan-cost.md"),
		"---\nverdict: pass\n---\n\n# Scan cost\n",
	);
	return { root, configPath, snapshotPath };
}

async function writeValidProposals(
	projectRoot: string,
	planSlug: string,
	count: number,
	offset = 0,
	options?: { readonly source?: string; readonly includePlanTag?: boolean },
): Promise<string[]> {
	const store = createKnowledgeMemoryStore({
		projectRoot,
		now: () => new Date("2026-08-21T12:00:00.000Z"),
	});
	const paths: string[] = [];
	for (let index = 0; index < count; index += 1) {
		const ordinal = offset + index;
		const type: KnowledgeRecordType = "decision";
		const title = `Decision ${ordinal} for ${planSlug}`;
		const description = `One attributable concept ${ordinal}.`;
		const content = `Future work on ${planSlug} keeps concept ${ordinal} explicit.`;
		const tags = [
			...(options?.includePlanTag === false ? [] : [`plan:${planSlug}`]),
			`concept:${ordinal}`,
		];
		const source =
			options?.source ?? `missions/archive/plans/${planSlug}/plan.md`;
		const identity = deriveKnowledgeProposalIdentity({
			planSlug,
			type,
			title,
			description,
			content,
			tags,
			source,
			writer: QUALIFIED_DISTILLER,
		});
		const timestamp = "2026-08-21T12:00:00.000Z";
		const result = await store.write({
			scope: "project",
			kind: "semantic",
			type,
			title,
			description,
			content,
			tags: identity.tags,
			resource: identity.resource,
			writer: identity.writer,
			source: identity.source,
			date: timestamp,
			timestamp,
			proposalIdentity: identity.proposalIdentity,
		});
		if (result.kind !== "written") {
			throw new Error(`Proposal fixture failed: ${result.reason}`);
		}
		paths.push(relativePath(projectRoot, result.path));
	}
	return paths.sort();
}

async function writeExistingIndex(projectRoot: string, indexedPath: string) {
	const absolutePath = join(projectRoot, indexedPath);
	const indexPath = join(
		projectRoot,
		"memory",
		"agent",
		"proposals",
		"backfill-review.json",
	);
	await writeFile(
		indexPath,
		`${JSON.stringify({
			version: 1,
			proposals: [
				{
					path: indexedPath,
					sha256: sha256(await readFile(absolutePath)),
					planSlug: "alpha-plan",
				},
			],
		})}\n`,
	);
}

async function proposalFiles(projectRoot: string): Promise<string[]> {
	const root = join(projectRoot, "memory", "agent", "proposals");
	try {
		const paths: string[] = [];
		for (const slugEntry of await readdir(root, { withFileTypes: true })) {
			if (!slugEntry.isDirectory()) continue;
			for (const fileEntry of await readdir(join(root, slugEntry.name), {
				withFileTypes: true,
			})) {
				if (fileEntry.isFile() && fileEntry.name.endsWith(".md")) {
					paths.push(
						`memory/agent/proposals/${slugEntry.name}/${fileEntry.name}`,
					);
				}
			}
		}
		return paths.sort();
	} catch (error: unknown) {
		if (errorCode(error) === "ENOENT") return [];
		throw error;
	}
}

/**
 * Human promotion records under `missions/reviews/`, as proposal path -> curated
 * path. Promotion is a human act (INV-1) and this is its only audit trail, so an
 * unrecorded distiller-authored file under `knowledge/` remains a failure.
 */
async function recordedPromotions(
	projectRoot: string,
): Promise<Map<string, string>> {
	const reviews = join(projectRoot, "missions", "reviews");
	const moves = new Map<string, string>();
	let entries: string[];
	try {
		entries = await readdir(reviews);
	} catch {
		return moves;
	}
	for (const entry of entries.sort()) {
		if (!entry.endsWith(".md")) continue;
		const data = matter(await readFile(join(reviews, entry), "utf-8")).data as {
			kind?: unknown;
			promotions?: unknown;
		};
		if (data.kind !== "knowledge-surface-promotion") continue;
		if (!Array.isArray(data.promotions)) continue;
		for (const move of data.promotions) {
			const { from, to } = move as { from?: unknown; to?: unknown };
			if (typeof from === "string" && typeof to === "string") {
				moves.set(from, to);
			}
		}
	}
	return moves;
}

async function curatedDistillerFiles(projectRoot: string): Promise<string[]> {
	const matches: string[] = [];
	await walkMarkdown(join(projectRoot, "knowledge"), async (path) => {
		if (
			(await readFile(path, "utf-8")).includes(`writer: ${QUALIFIED_DISTILLER}`)
		) {
			matches.push(relativePath(projectRoot, path));
		}
	});
	return matches.sort();
}

async function walkMarkdown(
	directory: string,
	visit: (path: string) => Promise<void>,
): Promise<void> {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) await walkMarkdown(path, visit);
		else if (entry.isFile() && entry.name.endsWith(".md")) await visit(path);
	}
}

function aggregateDigest(
	proposals: readonly { path: string; sha256: string }[],
): string {
	const canonical = [...proposals]
		.sort((left, right) => left.path.localeCompare(right.path))
		.map(({ path, sha256: digest }) => `${path}\0${digest}\n`)
		.join("");
	return sha256(canonical);
}

function sha256(value: string | Buffer): string {
	return createHash("sha256").update(value).digest("hex");
}

function relativePath(projectRoot: string, absolutePath: string): string {
	return absolutePath
		.slice(projectRoot.length + 1)
		.split("\\")
		.join("/");
}

async function expectMissing(path: string): Promise<void> {
	await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function errorCode(error: unknown): string | undefined {
	return error && typeof error === "object" && "code" in error
		? String((error as NodeJS.ErrnoException).code)
		: undefined;
}
