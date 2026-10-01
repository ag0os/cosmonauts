/**
 * Tests for runBuild with stub backends and stub signal providers in a real
 * temporary git repository.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	DEFAULT_SLICE_BUDGET_TOKENS,
	type FileGraph,
} from "../../lib/architecture-map/index.ts";
import { readRunBaseSha } from "../../lib/lean-run/base-sha.ts";
import { buildContextPack } from "../../lib/lean-run/context-pack.ts";
import type {
	FileGraphRefresh,
	RefreshFileGraph,
} from "../../lib/lean-run/graph-refresh.ts";
import { appendHealthHookEntries } from "../../lib/lean-run/health-hook-log.ts";
import {
	REPAIR_HEADING,
	REVIEW_DIFF_INLINE_BYTES,
} from "../../lib/lean-run/prompts.ts";
import { planVersusActualProvider } from "../../lib/lean-run/providers/plan-vs-actual.ts";
import { loadRunRecord } from "../../lib/lean-run/record.ts";
import {
	DEFAULT_RUN_BUDGET,
	MAX_RUN_TIME_MS,
	type RunBuildOptions,
	type RunReviewOptions,
	runBuild,
	runReview,
} from "../../lib/lean-run/run-build.ts";
import { summarizeRun } from "../../lib/lean-run/summary.ts";
import type {
	BackendRunInput,
	BuilderBackend,
	RunRecord,
	Signal,
	SignalContext,
	SignalKind,
	SignalProvider,
} from "../../lib/lean-run/types.ts";
import type { SpawnStats } from "../../lib/orchestration/types.ts";

const PLAN_PATH = "missions/lean/demo/plan.md";
const PLAN = `# Demo

## Approach
Add a greeting.

## Touches
- \`src/greet.ts\`

## Behaviors
- B-1: a caller / greet() / gets "hi"
`;

const DONE = '{"outcome":"done","summary":"built","touched":["src/greet.ts"]}';
const REVIEW =
	'{"outcome":"done","summary":"looks fine","findings":[{"id":"F-1","severity":"low","file":"src/greet.ts:1","summary":"name","fix":"rename"}]}';
const HIGH_REVIEW =
	'{"outcome":"done","summary":"one bug","findings":[{"id":"F-1","severity":"high","file":"src/greet.ts:1","summary":"greets nobody","fix":"return hi"},{"id":"F-2","severity":"low","file":"src/greet.ts:1","summary":"name","fix":"rename"}]}';
const MEDIUM_REVIEW =
	'{"outcome":"done","summary":"still off","findings":[{"id":"F-3","severity":"medium","file":"src/greet.ts:1","summary":"no test","fix":"add one"}]}';

type Reply = string | ((input: BackendRunInput) => Promise<string> | string);

interface StubBackend extends BuilderBackend {
	calls: BackendRunInput[];
}

/**
 * One session as Pi's `getSessionStats()` reports it: most of the total is
 * cache reads, which a run budget must not count.
 */
const SESSION_STATS: SpawnStats = {
	tokens: {
		input: 120_000,
		output: 8_000,
		cacheRead: 700_000,
		cacheWrite: 0,
		total: 828_000,
	},
	cost: 0.4,
	durationMs: 5,
	turns: 12,
	toolCalls: 30,
};

/** Input + output of one `SESSION_STATS` session. */
const SESSION_TOKENS = 128_000;

function stubBackend(
	replies: Reply[],
	kind: BuilderBackend["kind"] = "pi",
	/** `null` for a harness that reports no stats. */
	stats: SpawnStats | null = SESSION_STATS,
): StubBackend {
	const calls: BackendRunInput[] = [];
	return {
		kind,
		calls,
		async run(input) {
			calls.push(input);
			const reply = replies[calls.length - 1] ?? replies.at(-1) ?? "";
			const text = typeof reply === "string" ? reply : await reply(input);
			return stats ? { text, stats } : { text };
		},
	};
}

interface StubProvider extends SignalProvider {
	contexts: SignalContext[];
}

type ProviderResult = Partial<Signal> | Error | (() => Promise<never>);

function stubProvider(
	results: ProviderResult[],
	kind: SignalKind = "verify",
): StubProvider {
	const contexts: SignalContext[] = [];
	return {
		kind,
		contexts,
		async run(context) {
			contexts.push(context);
			const result = results[contexts.length - 1] ?? results.at(-1) ?? {};
			if (result instanceof Error) throw result;
			if (typeof result === "function") return result();
			return {
				kind,
				status: "pass",
				summary: "tests pass",
				data: { exitCode: 0 },
				reenter: false,
				...result,
			};
		},
	};
}

const FAILING: Partial<Signal> = {
	status: "fail",
	summary: "1 test failed",
	data: { failed: ["tests/greet.test.ts"] },
	reenter: true,
};

/** The mutation provider's answer while verify fails: it does not run. */
const SKIPPED_MUTATION: Partial<Signal> = {
	status: "info",
	summary: "skipped: verification did not pass",
	data: { skipped: true, reason: "verification did not pass: 1 test failed" },
};

const never = (): Promise<never> => new Promise<never>(() => {});

const GREET_SIGNATURE = "const greet: string";

/** The fixture repo's file graph, as the generator would write it. */
const GRAPH: FileGraph = {
	schemaVersion: 1,
	projectHash: "project",
	graphHash: "graph",
	nodes: [
		{
			path: "src/greet.ts",
			kind: "source",
			exports: [{ name: "greet", kind: "const", signature: GREET_SIGNATURE }],
		},
	],
	edges: [],
};

const CURRENT: FileGraphRefresh = { outcome: "current", graph: GRAPH };

type RefreshResult =
	| FileGraphRefresh
	| Error
	| ((projectRoot: string) => Promise<FileGraphRefresh>);

interface StubRefresh extends RefreshFileGraph {
	calls: string[];
}

/** Stands in for the architecture-map generator, which no run-build test runs. */
function stubRefresh(results: RefreshResult[] = [CURRENT]): StubRefresh {
	const calls: string[] = [];
	const refresh = async ({ projectRoot }: { readonly projectRoot: string }) => {
		calls.push(projectRoot);
		const result = results[calls.length - 1] ?? results.at(-1) ?? CURRENT;
		if (result instanceof Error) throw result;
		return typeof result === "function" ? result(projectRoot) : result;
	};
	return Object.assign(refresh, { calls });
}

let root: string;
const extraDirs: string[] = [];

function git(...args: string[]): string {
	return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "lean-run-"));
	git("init", "-q", "-b", "main");
	git("config", "user.email", "test@example.com");
	git("config", "user.name", "Test");
	git("config", "commit.gpgsign", "false");
	await mkdir(join(root, "missions/lean/demo"), { recursive: true });
	await mkdir(join(root, "src"));
	await writeFile(join(root, ".gitignore"), "missions/sessions/\n");
	await writeFile(join(root, PLAN_PATH), PLAN);
	await writeFile(join(root, "README.md"), "readme\n");
	await writeFile(join(root, "src/greet.ts"), "export const greet = 1;\n");
	git("add", "-A");
	git("commit", "-q", "-m", "base");
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
	for (const dir of extraDirs.splice(0))
		await rm(dir, { recursive: true, force: true });
});

async function writeGreet(worktree: string): Promise<void> {
	await writeFile(
		join(worktree, "src/greet.ts"),
		'export const greet = "hi";\n',
	);
}

function editGreet(text: string): Reply {
	return async (input) => {
		await writeGreet(input.worktree);
		return text;
	};
}

function build(
	options: {
		builder: StubBackend;
		reviewer?: StubBackend;
		providers?: SignalProvider[];
	} & Partial<RunBuildOptions>,
) {
	const { builder, reviewer, providers, ...rest } = options;
	return runBuild({
		projectRoot: root,
		planPath: PLAN_PATH,
		backend: builder,
		reviewerBackend: reviewer ?? stubBackend([REVIEW]),
		providers: providers ?? [stubProvider([{}])],
		refreshGraph: stubRefresh(),
		...rest,
	});
}

function onDisk(record: RunRecord, projectRoot = root): Promise<RunRecord> {
	return loadRunRecord({ projectRoot, id: record.manifest.id });
}

describe("runBuild on clean output", () => {
	test("finishes done after one builder pass and the reviewer", async () => {
		const reviewer = stubBackend([REVIEW]);
		const record = await build({
			builder: stubBackend([editGreet(`Implemented.\n${DONE}`)]),
			reviewer,
		});
		expect(record.manifest).toMatchObject({ status: "done", reentries: 0 });
		expect(Object.keys(record.envelopes).sort()).toEqual([
			"builder-1",
			"reviewer",
		]);
		expect(reviewer.calls).toHaveLength(1);
	});

	test("writes every run record file to disk", async () => {
		const record = await build({ builder: stubBackend([editGreet(DONE)]) });
		expect(record.dir).toBe(
			join(root, "missions/sessions/lean/runs", record.manifest.id),
		);
		for (const file of [
			"run.json",
			"facts.json",
			"stats.json",
			"envelopes/builder-1.json",
			"envelopes/reviewer.json",
		])
			expect(existsSync(join(record.dir, file))).toBe(true);
		expect(await onDisk(record)).toEqual(record);
	});

	test("records the base sha, plan path and a run-scoped snapshot of the dirty tree", async () => {
		await writeFile(join(root, "src/pending.ts"), "export {};\n");
		const head = git("rev-parse", "HEAD").trim();
		const builder = stubBackend([DONE]);
		const record = await build({ builder });
		const { id } = record.manifest;
		const ref = `refs/cosmonauts/drive/${id}/lean-${id}/attempt-1`;
		expect(record.manifest).toMatchObject({
			baseSha: head,
			diffBase: git("rev-parse", ref).trim(),
			planPath: PLAN_PATH,
			backend: "pi",
			snapshotRefs: [ref],
		});
		expect(builder.calls[0]?.taskId).toBe(`lean-${id}`);
	});

	test("hands providers the builder's changed files, the diff base and the envelope", async () => {
		const provider = stubProvider([{}]);
		const record = await build({
			builder: stubBackend([
				async (input) => {
					await writeFile(join(root, "src/new.ts"), "export {};\n");
					await writeGreet(input.worktree);
					return DONE;
				},
			]),
			providers: [provider],
		});
		expect(provider.contexts[0]).toMatchObject({
			worktree: root,
			baseSha: record.manifest.baseSha,
			changedFiles: ["src/greet.ts", "src/new.ts"],
			envelope: { outcome: "done", summary: "built" },
		});
		expect(provider.contexts[0]?.plan.touches).toEqual(["src/greet.ts"]);
	});

	test("gives the reviewer the plan, facts, changed files and diff in a private checkout", async () => {
		const reviewer = stubBackend([REVIEW]);
		const record = await build({
			builder: stubBackend([editGreet(DONE)]),
			reviewer,
		});
		const call = reviewer.calls[0];
		expect(record.manifest.reviewWorkspace).toBe("private");
		expect(call?.role).toBe("lean/code-reviewer");
		expect(call?.worktree).not.toBe(root);
		expect(existsSync(call?.worktree ?? "")).toBe(false);
		expect(call?.prompt).toContain("# Demo");
		expect(call?.prompt).toContain("### verify (pass)");
		expect(call?.prompt).toContain("# Changed files\n\nsrc/greet.ts");
		expect(call?.prompt).toContain('+export const greet = "hi";');
	});

	test("records per-stage duration, spawn stats and cumulative input and output tokens", async () => {
		const record = await build({ builder: stubBackend([DONE]) });
		expect(record.stats.map((stage) => stage.stage)).toEqual([
			"builder-1",
			"reviewer",
		]);
		expect(record.stats[0]?.spawn).toEqual(SESSION_STATS);
		expect(record.stats[0]?.durationMs).toBeGreaterThanOrEqual(0);
		expect(record.manifest.tokensUsed).toBe(2 * SESSION_TOKENS);
	});

	test("prompts the builder with the plan and the envelope instruction", async () => {
		const builder = stubBackend([DONE]);
		await build({ builder });
		expect(builder.calls[0]).toMatchObject({
			role: "lean/builder",
			worktree: root,
		});
		expect(builder.calls[0]?.prompt).toContain("## Approach\nAdd a greeting.");
		expect(builder.calls[0]?.prompt).toContain("End with the lean envelope");
	});
});

/** What follows a context pack in the builder prompt: one paragraph, the envelope instruction. */
const ENVELOPE_TAIL = /^End with the lean envelope: [^\n]+$/u;

function afterPack(prompt: string | undefined, pack: string): string {
	expect(prompt?.startsWith(`${pack}\n\n`), prompt).toBe(true);
	return prompt?.slice(pack.length + 2) ?? "";
}

describe("runBuild context pack", () => {
	test("sends a supplied context pack verbatim, followed only by the envelope instruction", async () => {
		const builder = stubBackend([DONE]);
		const record = await build({ builder, contextPack: "PACK" });

		expect(afterPack(builder.calls[0]?.prompt, "PACK")).toMatch(ENVELOPE_TAIL);
		expect(record.manifest.contextPack).toBe("supplied");
	});

	test("builds the context pack from the plan, the repo map and the conventions by default", async () => {
		await writeFile(join(root, "AGENTS.md"), "# Conventions\n\nUse tabs.\n");
		const builder = stubBackend([DONE]);
		const pack = await buildContextPack({
			planSection: PLAN,
			touches: ["src/greet.ts"],
			reuses: [],
			graph: GRAPH,
			budget: DEFAULT_SLICE_BUDGET_TOKENS,
			projectRoot: root,
		});

		const record = await build({ builder });

		expect(pack).toContain(
			`# Repo map\n\nsrc/greet.ts [touch]\n  ${GREET_SIGNATURE}`,
		);
		expect(pack).toContain("# Repository conventions (AGENTS.md)");
		expect(afterPack(builder.calls[0]?.prompt, pack.trimEnd())).toMatch(
			ENVELOPE_TAIL,
		);
		expect(record.manifest.contextPack).toBe("built");
	});

	test("warns in the manifest and atop the pack about plan paths the slice cannot show", async () => {
		await writeFile(
			join(root, PLAN_PATH),
			PLAN.replace(
				"## Behaviors",
				"## Reuses\n- `tests/helpers/mermaid-structure.ts`\n- `README.md`\n\n## Behaviors",
			),
		);
		const builder = stubBackend([DONE]);

		const record = await build({ builder });

		const warnings = [
			"plan path is not in the file graph: README.md",
			"plan path not found (new file?): tests/helpers/mermaid-structure.ts",
		];
		expect(record.manifest.warnings).toEqual(warnings);
		expect(builder.calls[0]?.prompt).toMatch(
			/^Warning: plan path is not in the file graph: README\.md\nWarning: plan path not found \(new file\?\): tests\/helpers\/mermaid-structure\.ts\n\n# Plan\n/u,
		);
	});

	test("takes the repo-map budget from the project config", async () => {
		await mkdir(join(root, ".cosmonauts"));
		await writeFile(
			join(root, ".cosmonauts/config.json"),
			JSON.stringify({ lean: { repoMapBudgetTokens: 8 } }),
		);
		const builder = stubBackend([DONE]);

		await build({ builder });

		expect(builder.calls[0]?.prompt).toContain(
			"# Repo map\n\nsrc/greet.ts [touch]\n  … 1 more",
		);
		expect(builder.calls[0]?.prompt).not.toContain(GREET_SIGNATURE);
	});

	test("sends the plan alone with a warning when no file graph can be produced", async () => {
		const builder = stubBackend([DONE]);
		const record = await build({
			builder,
			refreshGraph: stubRefresh([
				{ outcome: "unavailable", reason: "not a TypeScript project" },
			]),
		});

		expect(builder.calls[0]?.prompt).toMatch(
			/^Implement this plan\.\n\n# Demo\n/u,
		);
		expect(record.manifest).toMatchObject({
			status: "done",
			contextPack: "plan-only",
			warnings: [
				"context pack: the builder got the plan alone; graph.json unavailable: not a TypeScript project",
			],
		});
	});

	test("sends the plan alone with a warning when the context pack cannot be built", async () => {
		await writeFile(join(root, "package.json"), "{ not json");
		const builder = stubBackend([DONE]);

		const record = await build({ builder });

		expect(builder.calls[0]?.prompt).toMatch(/^Implement this plan\./u);
		expect(record.manifest.status).toBe("done");
		expect(record.manifest.contextPack).toBe("plan-only");
		expect(record.manifest.warnings?.[0]).toMatch(
			/^context pack: the builder got the plan alone; .*JSON/u,
		);
	});
});

describe("runBuild file graph refresh", () => {
	const regenerated = (
		cause: "missing" | "stale" | "corrupt",
		detail?: string,
	): FileGraphRefresh => ({
		outcome: "regenerated",
		cause,
		...(detail === undefined ? {} : { detail }),
		graph: GRAPH,
	});

	test("checks graph.json at run start and before each provider pass", async () => {
		const refreshGraph = stubRefresh([
			regenerated("missing"),
			regenerated("stale"),
			CURRENT,
		]);
		const record = await build({
			builder: stubBackend([DONE, DONE]),
			providers: [stubProvider([FAILING, {}])],
			refreshGraph,
		});

		expect(refreshGraph.calls).toEqual([root, root, root]);
		expect(record.manifest.graph).toEqual([
			{ at: "start", outcome: "regenerated", reason: "missing" },
			{ at: "pass-1", outcome: "regenerated", reason: "stale" },
			{ at: "pass-2", outcome: "current" },
		]);
		expect(await onDisk(record)).toEqual(record);
	});

	test("refreshes the graph after the builder returns and before the providers run", async () => {
		const order: string[] = [];
		const provider = stubProvider([{}]);
		await build({
			builder: stubBackend([
				() => {
					order.push("builder");
					return DONE;
				},
			]),
			providers: [
				{
					kind: "verify",
					run: (context) => {
						order.push("provider");
						return provider.run(context);
					},
				},
			],
			refreshGraph: stubRefresh([
				async () => {
					order.push("refresh");
					return CURRENT;
				},
			]),
		});

		expect(order).toEqual(["refresh", "builder", "refresh", "provider"]);
	});

	test("records a corrupt graph.json's load error as the regeneration reason", async () => {
		const record = await build({
			builder: stubBackend([DONE]),
			refreshGraph: stubRefresh([
				regenerated("corrupt", "Unrecognized file graph format"),
				CURRENT,
			]),
		});

		expect(record.manifest.graph?.[0]).toEqual({
			at: "start",
			outcome: "regenerated",
			reason: "corrupt: Unrecognized file graph format",
		});
		expect(record.manifest.contextPack).toBe("built");
	});

	test("records the graph unavailable and finishes the run when the refresher throws", async () => {
		const record = await build({
			builder: stubBackend([DONE]),
			refreshGraph: stubRefresh([new Error("generator crashed")]),
		});

		expect(record.manifest.graph).toEqual([
			{ at: "start", outcome: "unavailable", reason: "generator crashed" },
			{ at: "pass-1", outcome: "unavailable", reason: "generator crashed" },
		]);
		expect(record.manifest.status).toBe("done");
	});

	test("leaves the regenerated architecture map out of the builder's changed files", async () => {
		const provider = stubProvider([{}]);
		const reviewer = stubBackend([REVIEW]);
		const record = await build({
			builder: stubBackend([editGreet(DONE)]),
			reviewer,
			providers: [provider],
			refreshGraph: stubRefresh([
				async (projectRoot) => {
					const dir = join(projectRoot, "memory/architecture");
					await mkdir(dir, { recursive: true });
					await writeFile(join(dir, "graph.json"), `${Date.now()}\n`);
					await writeFile(join(dir, "index.md"), `${Math.random()}\n`);
					return regenerated("stale");
				},
			]),
		});

		expect(record.manifest.status).toBe("done");
		expect(provider.contexts[0]?.changedFiles).toEqual(["src/greet.ts"]);
		expect(reviewer.calls[0]?.prompt).not.toContain("memory/architecture");
	});

	test("skips the pass check when no providers are configured", async () => {
		const refreshGraph = stubRefresh();

		const record = await build({
			builder: stubBackend([DONE]),
			providers: [],
			refreshGraph,
		});

		expect(refreshGraph.calls).toHaveLength(1);
		expect(record.manifest.graph?.map((check) => check.at)).toEqual(["start"]);
	});

	test("fails at the graph refresh when the run is aborted during it", async () => {
		const controller = new AbortController();
		const builder = stubBackend([DONE]);

		const record = await build({
			builder,
			signal: controller.signal,
			refreshGraph: stubRefresh([
				() => {
					controller.abort();
					return never();
				},
			]),
		});

		expect(record.manifest.reason).toBe("aborted at graph refresh (start)");
		expect(builder.calls).toHaveLength(0);
	});
});

describe("runBuild diff base", () => {
	test("diffs against HEAD when the tree was clean", async () => {
		const record = await build({ builder: stubBackend([editGreet(DONE)]) });
		expect(record.manifest.snapshotRefs).toEqual([]);
		expect(record.manifest.diffBase).toBe(record.manifest.baseSha);
	});

	test("leaves uncommitted work that predates the run out of the builder's change", async () => {
		await writeFile(join(root, PLAN_PATH), `${PLAN}\n## Risks\n- none\n`);
		await writeFile(join(root, "missions/lean/demo/plan2.md"), "# Two\n");
		await writeFile(join(root, "README.md"), "edited by the user\n");
		const provider = stubProvider([{}]);
		const reviewer = stubBackend([REVIEW]);
		const record = await build({
			builder: stubBackend([editGreet(DONE)]),
			reviewer,
			providers: [provider],
		});
		expect(record.manifest.diffBase).not.toBe(record.manifest.baseSha);
		expect(provider.contexts[0]).toMatchObject({
			baseSha: record.manifest.diffBase,
			changedFiles: ["src/greet.ts"],
		});
		const prompt = reviewer.calls[0]?.prompt ?? "";
		expect(prompt).toContain("# Changed files\n\nsrc/greet.ts\n\n# Diff");
		expect(prompt).not.toContain("README.md");
		expect(prompt).not.toContain("plan2.md");
		expect(record.manifest).toMatchObject({
			status: "done",
			reviewWorkspace: "private",
		});
	});

	test("on a feature branch the reviewer sees the builder's commit, not earlier branch commits", async () => {
		git("checkout", "-q", "-b", "feature");
		await writeFile(join(root, "src/earlier.ts"), "export const e = 1;\n");
		git("add", "-A");
		git("commit", "-q", "-m", "earlier");
		const reviewer = stubBackend([REVIEW]);
		await build({
			builder: stubBackend([
				async () => {
					await writeFile(join(root, "src/built.ts"), "export const b = 1;\n");
					git("add", "-A");
					git("commit", "-q", "-m", "builder");
					return DONE;
				},
			]),
			reviewer,
		});
		const prompt = reviewer.calls[0]?.prompt ?? "";
		expect(prompt).toContain("# Changed files\n\nsrc/built.ts\n\n# Diff");
		expect(prompt).not.toContain("earlier.ts");
	});

	test("writes the diff base marker for the builder and clears it afterwards", async () => {
		await writeFile(join(root, "src/pending.ts"), "export {};\n");
		const seen: Array<string | undefined> = [];
		const record = await build({
			builder: stubBackend([
				async () => {
					seen.push(await readRunBaseSha({ worktree: root }));
					return DONE;
				},
			]),
		});
		expect(seen).toEqual([record.manifest.diffBase]);
		expect(await readRunBaseSha({ worktree: root })).toBeUndefined();
	});
});

describe("runBuild review workspace", () => {
	test("reviews in place when no main, master or origin/main ref exists", async () => {
		git("branch", "-m", "main", "trunk");
		const reviewer = stubBackend([REVIEW]);
		const record = await build({
			builder: stubBackend([editGreet(DONE)]),
			reviewer,
		});
		expect(record.manifest).toMatchObject({
			status: "done",
			reviewWorkspace: "in-place",
		});
		expect(record.manifest.warnings?.[0]).toContain(
			"private review workspace unavailable",
		);
		expect(reviewer.calls[0]?.worktree).toBe(root);
		expect(reviewer.calls[0]?.prompt).toContain('+export const greet = "hi";');
		expect(await onDisk(record)).toEqual(record);
	});

	test("reviews a linked worktree in place, with the marker in its own git dir", async () => {
		const parent = await mkdtemp(join(tmpdir(), "lean-run-linked-"));
		extraDirs.push(parent);
		const linked = join(parent, "wt");
		git("worktree", "add", "-q", "-b", "feature", linked);
		const seen: Array<string | undefined> = [];
		const reviewer = stubBackend([REVIEW]);
		const record = await runBuild({
			projectRoot: linked,
			planPath: PLAN_PATH,
			backend: stubBackend([
				async (input) => {
					seen.push(await readRunBaseSha({ worktree: linked }));
					seen.push(await readRunBaseSha({ worktree: root }));
					await writeGreet(input.worktree);
					return DONE;
				},
			]),
			reviewerBackend: reviewer,
			providers: [stubProvider([{}])],
			refreshGraph: stubRefresh(),
		});
		expect(record.manifest).toMatchObject({
			status: "done",
			reviewWorkspace: "in-place",
		});
		expect(seen).toEqual([record.manifest.diffBase, undefined]);
		expect(reviewer.calls[0]?.worktree).toBe(linked);
		expect(reviewer.calls[0]?.prompt).toContain(
			"# Changed files\n\nsrc/greet.ts",
		);
		expect(await onDisk(record, linked)).toEqual(record);
	});
});

describe("runBuild re-entry", () => {
	test("re-enters the builder exactly once, then reviews", async () => {
		const builder = stubBackend([editGreet(DONE), DONE]);
		const reviewer = stubBackend([REVIEW]);
		const record = await build({
			builder,
			reviewer,
			providers: [stubProvider([FAILING, {}])],
		});
		expect(builder.calls).toHaveLength(2);
		expect(reviewer.calls).toHaveLength(1);
		const saved = await onDisk(record);
		expect(saved).toEqual(record);
		expect(saved.manifest).toMatchObject({ status: "done", reentries: 1 });
		expect(saved.envelopes["builder-2"]).toBeDefined();
		expect(saved.facts.passes.map((pass) => pass.pass)).toEqual([1, 2]);
	});

	test("sends the failing signals to the builder as structured text", async () => {
		const builder = stubBackend([DONE]);
		await build({ builder, providers: [stubProvider([FAILING, {}])] });
		const prompt = builder.calls[1]?.prompt ?? "";
		expect(prompt.startsWith(builder.calls[0]?.prompt ?? "-")).toBe(true);
		expect(prompt).toContain("### verify (fail)\n1 test failed");
		expect(prompt).toContain('"failed": [\n    "tests/greet.test.ts"\n  ]');
	});

	test("snapshots before the second builder attempt", async () => {
		await writeFile(join(root, "src/pending.ts"), "export {};\n");
		const record = await build({
			builder: stubBackend([editGreet(DONE), DONE]),
			providers: [stubProvider([FAILING, {}])],
		});
		expect(record.manifest.snapshotRefs.at(-1)).toMatch(/\/attempt-2$/);
	});

	test("still reviews both passes, then ends blocked, when a re-entry signal remains", async () => {
		const builder = stubBackend([DONE]);
		const reviewer = stubBackend([REVIEW]);
		const record = await build({
			builder,
			reviewer,
			providers: [stubProvider([FAILING])],
		});
		expect(builder.calls).toHaveLength(2);
		expect(reviewer.calls).toHaveLength(1);
		expect(reviewer.calls[0]?.prompt).toContain("## Pass 1");
		expect(reviewer.calls[0]?.prompt).toContain("## Pass 2");
		const saved = await onDisk(record);
		expect(saved).toEqual(record);
		expect(saved.manifest).toMatchObject({
			status: "blocked",
			reentries: 1,
			reentryReasons: [
				{
					stage: "builder-2",
					pass: 1,
					kinds: ["verify"],
					reason: "pass 1: verify failing",
				},
			],
			reason: "re-entry signals still failing after one re-entry: verify",
		});
		expect(saved.envelopes.reviewer?.outcome).toBe("done");
	});

	test("gives a mutation signal that first fails in pass 2 its own re-entry", async () => {
		const builder = stubBackend([DONE]);
		const reviewer = stubBackend([REVIEW]);
		const mutation = stubProvider(
			[
				SKIPPED_MUTATION,
				{ status: "fail", summary: "1 survivor", reenter: true },
				{},
			],
			"mutation",
		);
		const record = await build({
			builder,
			reviewer,
			providers: [stubProvider([FAILING, {}, {}]), mutation],
		});

		expect(builder.calls).toHaveLength(3);
		expect(builder.calls[2]?.prompt).toContain(
			"### mutation (fail)\n1 survivor",
		);
		expect(builder.calls[2]?.prompt).not.toContain("### verify");
		expect(reviewer.calls).toHaveLength(1);
		expect(reviewer.calls[0]?.prompt).toContain("## Pass 3");
		const saved = await onDisk(record);
		expect(saved).toEqual(record);
		expect(saved.facts.passes.map((pass) => pass.pass)).toEqual([1, 2, 3]);
		expect(saved.envelopes["builder-3"]).toBeDefined();
		expect(saved.manifest).toMatchObject({
			status: "done",
			reentries: 2,
			reentryReasons: [
				{
					stage: "builder-2",
					pass: 1,
					kinds: ["verify"],
					reason: "pass 1: verify failing",
				},
				{
					stage: "builder-3",
					pass: 2,
					kinds: ["mutation"],
					reason: "pass 2: mutation failing, and did not run in pass 1",
				},
			],
		});
	});

	test("ends blocked when the signal behind the second re-entry fails again", async () => {
		const builder = stubBackend([DONE]);
		const record = await build({
			builder,
			providers: [
				stubProvider([FAILING, {}]),
				stubProvider(
					[SKIPPED_MUTATION, { status: "fail", reenter: true }],
					"mutation",
				),
			],
		});

		expect(builder.calls).toHaveLength(3);
		expect(record.manifest).toMatchObject({
			status: "blocked",
			reentries: 2,
			reason:
				"re-entry signals still failing after one re-entry each: mutation",
		});
	});

	test("does not re-enter twice for the same signal kind", async () => {
		const builder = stubBackend([DONE]);
		const record = await build({
			builder,
			providers: [
				stubProvider([{}]),
				stubProvider([{ status: "fail", reenter: true }], "mutation"),
			],
		});

		expect(builder.calls).toHaveLength(2);
		expect(record.manifest).toMatchObject({
			status: "blocked",
			reentries: 1,
			reason: "re-entry signals still failing after one re-entry: mutation",
		});
	});

	test("gives no second re-entry to a kind that ran and passed in the pass before", async () => {
		const builder = stubBackend([DONE]);
		const reviewer = stubBackend([REVIEW]);
		const record = await build({
			builder,
			reviewer,
			providers: [
				stubProvider([{}, FAILING]),
				stubProvider(
					[{ status: "fail", reenter: true }, SKIPPED_MUTATION],
					"mutation",
				),
			],
		});

		expect(builder.calls).toHaveLength(2);
		expect(reviewer.calls).toHaveLength(1);
		expect(record.manifest).toMatchObject({
			status: "blocked",
			reentries: 1,
			reason: "re-entry signals still failing after one re-entry: verify",
		});
	});

	test("never sends a kind back twice, whatever the provider order", async () => {
		const builder = stubBackend([DONE]);
		const record = await build({
			builder,
			providers: [
				stubProvider([{}, { status: "fail", reenter: true }], "mutation"),
				stubProvider([FAILING]),
			],
		});

		expect(builder.calls).toHaveLength(2);
		expect(record.manifest).toMatchObject({
			status: "blocked",
			reentries: 1,
			reason:
				"re-entry signals still failing after one re-entry: mutation, verify",
		});
	});

	test("re-enters on surviving mutants", async () => {
		const builder = stubBackend([DONE]);
		await build({
			builder,
			providers: [
				stubProvider([{}]),
				stubProvider([{ status: "fail", reenter: true }, {}], "mutation"),
			],
		});
		expect(builder.calls).toHaveLength(2);
	});

	test("records but does not act on a re-entry request from another kind", async () => {
		const builder = stubBackend([DONE]);
		const health = stubProvider([{ status: "fail", reenter: true }], "health");
		const record = await build({
			builder,
			providers: [stubProvider([{}]), health],
		});
		expect(builder.calls).toHaveLength(1);
		expect(record.facts.passes[0]?.signals[1]).toMatchObject({
			kind: "health",
			reenter: true,
		});
		expect(record.manifest).toMatchObject({ status: "done", reentries: 0 });
		expect(record.manifest.warnings).toEqual([
			"pass 1: health asked to re-enter the builder; ruling D-4 lets only verify and mutation re-enter",
		]);
	});
});

describe("runBuild verification verdict", () => {
	test("ends blocked when verification reports unverified", async () => {
		const reviewer = stubBackend([REVIEW]);
		const record = await build({
			builder: stubBackend([DONE]),
			reviewer,
			providers: [
				stubProvider([
					{
						status: "info",
						summary: "no test command",
						data: { unverified: true },
					},
				]),
			],
		});
		expect(reviewer.calls).toHaveLength(1);
		expect(record.manifest).toMatchObject({
			status: "blocked",
			reason: "verification did not pass (info, unverified): no test command",
		});
	});

	test("ends blocked when no provider produced a verify signal", async () => {
		const record = await build({
			builder: stubBackend([DONE]),
			providers: [stubProvider([{}], "health")],
		});
		expect(record.manifest).toMatchObject({
			status: "blocked",
			reason: "unverified: no verify signal",
		});
	});

	test("ends blocked when no providers are configured", async () => {
		const record = await build({ builder: stubBackend([DONE]), providers: [] });
		expect(record.manifest).toMatchObject({
			status: "blocked",
			reason: "unverified: no providers configured",
		});
	});

	test("turns a throwing provider into a fail signal that does not re-enter", async () => {
		const builder = stubBackend([DONE]);
		const record = await build({
			builder,
			providers: [stubProvider([new Error("vitest crashed")])],
		});
		expect(record.facts.passes[0]?.signals[0]).toEqual({
			kind: "verify",
			status: "fail",
			summary: "verify provider threw: vitest crashed",
			data: { error: "vitest crashed" },
			reenter: false,
		});
		expect(builder.calls).toHaveLength(1);
		expect(record.manifest).toMatchObject({
			status: "blocked",
			reason:
				"verification did not pass (fail): verify provider threw: vitest crashed",
		});
	});

	test("keeps the reviewer's outcome and adds the verification gap", async () => {
		const record = await build({
			builder: stubBackend([DONE]),
			reviewer: stubBackend(['{"outcome":"failed","reason":"no tests"}']),
			providers: [],
		});
		expect(record.manifest).toMatchObject({
			status: "failed",
			reason: "reviewer: no tests; unverified: no providers configured",
		});
	});
});

describe("runBuild budgets", () => {
	test("fails when a stage outlives the time budget, even if it ignores the signal", async () => {
		const builder = stubBackend([never]);
		const record = await build({
			builder,
			budget: { tokens: 1_000, timeMs: 100 },
		});
		expect(builder.calls[0]?.signal?.aborted).toBe(true);
		const saved = await onDisk(record);
		expect(saved.manifest).toMatchObject({
			status: "failed",
			reason: "time budget exceeded at builder-1",
		});
	});

	test("fails when a provider outlives the time budget", async () => {
		const reviewer = stubBackend([REVIEW]);
		const record = await build({
			builder: stubBackend([DONE]),
			reviewer,
			providers: [stubProvider([never])],
			budget: { tokens: 1_000, timeMs: 2_000 },
		});
		expect(record.manifest).toMatchObject({
			status: "failed",
			reason: "time budget exceeded at verify provider (pass 1)",
		});
		expect(reviewer.calls).toHaveLength(0);
	});

	test("fails before the next stage once the token budget is spent", async () => {
		const reviewer = stubBackend([REVIEW]);
		const record = await build({
			builder: stubBackend([DONE]),
			reviewer,
			budget: { tokens: 100_000, timeMs: 60_000 },
		});
		expect(record.manifest).toMatchObject({
			status: "failed",
			reason:
				"token budget exceeded at reviewer: 128000 of 100000 input and output tokens used",
		});
		expect(reviewer.calls).toHaveLength(0);
	});

	test("is not stopped by cache reads under the default budget", async () => {
		const reviewer = stubBackend([HIGH_REVIEW, REVIEW]);
		const record = await build({
			builder: stubBackend([DONE]),
			reviewer,
			providers: [stubProvider([FAILING, {}])],
		});

		const sessions = record.stats.length;
		expect(sessions).toBe(5);
		expect(sessions * SESSION_STATS.tokens.total).toBeGreaterThan(
			DEFAULT_RUN_BUDGET.tokens,
		);
		expect(record.manifest).toMatchObject({
			status: "done",
			tokensUsed: sessions * SESSION_TOKENS,
			budget: DEFAULT_RUN_BUDGET,
		});
	});

	test("takes the budget from the project config", async () => {
		await mkdir(join(root, ".cosmonauts"));
		await writeFile(
			join(root, ".cosmonauts/config.json"),
			JSON.stringify({ lean: { budget: { tokens: 200_000 } } }),
		);
		const reviewer = stubBackend([HIGH_REVIEW, REVIEW]);

		const record = await build({ builder: stubBackend([DONE]), reviewer });

		expect(record.manifest).toMatchObject({
			status: "failed",
			reason:
				"token budget exceeded at builder-4: 256000 of 200000 input and output tokens used",
			budget: { tokens: 200_000, timeMs: DEFAULT_RUN_BUDGET.timeMs },
		});
	});

	test("lets the caller's budget override the project config field by field", async () => {
		await mkdir(join(root, ".cosmonauts"));
		await writeFile(
			join(root, ".cosmonauts/config.json"),
			JSON.stringify({ lean: { budget: { tokens: 1, timeMs: 120_000 } } }),
		);

		const record = await build({
			builder: stubBackend([DONE]),
			budget: { tokens: 300_000 },
		});

		expect(record.manifest).toMatchObject({
			status: "done",
			budget: { tokens: 300_000, timeMs: 120_000 },
		});
	});

	test("defaults to an hour, room for a run that reaches the re-review", () => {
		expect(DEFAULT_RUN_BUDGET.timeMs).toBe(60 * 60_000);
	});

	test("cuts a time budget longer than a timer can wait to the longest one", async () => {
		const record = await build({
			builder: stubBackend([DONE]),
			budget: { timeMs: 5e9 },
		});

		expect(record.manifest).toMatchObject({
			status: "done",
			budget: { timeMs: MAX_RUN_TIME_MS },
		});
	});

	test("fails the run and releases the lock when the run cannot start", async () => {
		const timeout = vi
			.spyOn(AbortSignal, "timeout")
			.mockImplementationOnce(() => {
				throw new RangeError('The value of "delay" is out of range');
			});
		try {
			const builder = stubBackend([DONE]);
			const record = await build({ builder });

			expect(builder.calls).toHaveLength(0);
			expect((await onDisk(record)).manifest).toMatchObject({
				status: "failed",
				reason: 'runner error: The value of "delay" is out of range',
			});
			expect(existsSync(join(root, ".git/lean-run/lock"))).toBe(false);
		} finally {
			timeout.mockRestore();
		}
	});

	test("fails the run with the reason when taking the lock throws", async () => {
		await writeFile(join(root, ".git/lean-run"), "not a directory\n");
		const builder = stubBackend([DONE]);

		const record = await build({ builder });

		expect(builder.calls).toHaveLength(0);
		expect((await onDisk(record)).manifest).toMatchObject({
			status: "failed",
			reason: expect.stringMatching(/^runner error: E(EXIST|NOTDIR)/u),
		});
	});

	test("warns once that the token budget is not enforced when the backend reports no stats", async () => {
		const record = await build({
			builder: stubBackend([DONE], "codex-cli", null),
			reviewer: stubBackend([HIGH_REVIEW, REVIEW], "codex-cli", null),
		});

		expect(record.stats).toHaveLength(4);
		expect(record.manifest.tokensUsed).toBeUndefined();
		expect(
			record.manifest.warnings?.filter((warning) =>
				warning.startsWith("token budget not enforced"),
			),
		).toEqual(["token budget not enforced: codex-cli reports no token stats"]);
	});

	test("fails at the running stage when the caller aborts", async () => {
		const controller = new AbortController();
		const record = await build({
			builder: stubBackend([
				() => {
					controller.abort();
					return never();
				},
			]),
			signal: controller.signal,
		});
		expect(record.manifest.reason).toBe("aborted at builder-1");
	});
});

describe("runBuild stage failures", () => {
	test("fails with both reasons when the builder and its repair turn return no envelope", async () => {
		const provider = stubProvider([{}]);
		const record = await build({
			builder: stubBackend(["I changed things."]),
			providers: [provider],
		});
		expect(provider.contexts).toHaveLength(0);
		expect(existsSync(join(record.dir, "envelopes/builder-1.json"))).toBe(
			false,
		);
		const saved = await onDisk(record);
		expect(saved).toEqual(record);
		expect(saved.manifest).toMatchObject({
			status: "failed",
			reason:
				"builder-1: invalid envelope: no envelope line found; repair turn: no envelope line found",
			repairs: [
				{
					stage: "builder-1",
					reason: "no envelope line found",
					repaired: false,
				},
			],
		});
	});

	test("fails when the re-entered builder and its repair turn return no envelope", async () => {
		const reviewer = stubBackend([REVIEW]);
		const record = await build({
			builder: stubBackend([DONE, "gave up"]),
			reviewer,
			providers: [stubProvider([FAILING])],
		});
		const saved = await onDisk(record);
		expect(saved.manifest).toMatchObject({
			status: "failed",
			reentries: 1,
			reason:
				"builder-2: invalid envelope: no envelope line found; repair turn: no envelope line found",
		});
		expect(Object.keys(saved.envelopes)).toEqual(["builder-1"]);
		expect(reviewer.calls).toHaveLength(0);
	});

	test("rejects a decorated envelope after a quoted one", async () => {
		const record = await build({
			builder: stubBackend([
				`${DONE}\nFinal: {"outcome":"failed","reason":"x"}`,
			]),
		});
		expect(record.manifest.status).toBe("failed");
		expect(record.manifest.reason).toContain('mentions "outcome"');
	});

	test("ends blocked with the builder's reason and runs no providers", async () => {
		const provider = stubProvider([{}]);
		const record = await build({
			builder: stubBackend([
				'{"outcome":"blocked","reason":"plan is ambiguous"}',
			]),
			providers: [provider],
		});
		expect(record.manifest).toMatchObject({
			status: "blocked",
			reason: "builder-1: plan is ambiguous",
		});
		expect(provider.contexts).toHaveLength(0);
		expect(record.envelopes["builder-1"]?.outcome).toBe("blocked");
	});

	test("ends failed with the builder's reason when the builder fails", async () => {
		const reviewer = stubBackend([REVIEW]);
		const record = await build({
			builder: stubBackend(['{"outcome":"failed","reason":"cannot compile"}']),
			reviewer,
		});
		const saved = await onDisk(record);
		expect(saved.manifest).toMatchObject({
			status: "failed",
			reason: "builder-1: cannot compile",
		});
		expect(saved.envelopes["builder-1"]?.outcome).toBe("failed");
		expect(reviewer.calls).toHaveLength(0);
	});

	test("fails when the backend throws", async () => {
		const builder: BuilderBackend = {
			kind: "pi",
			run: async () => {
				throw new Error("model unavailable");
			},
		};
		const record = await runBuild({
			projectRoot: root,
			planPath: PLAN_PATH,
			backend: builder,
			reviewerBackend: stubBackend([REVIEW]),
			providers: [],
			refreshGraph: stubRefresh(),
		});
		expect(record.manifest.reason).toBe(
			"builder-1: backend error: model unavailable",
		);
		expect(record.stats).toHaveLength(1);
	});

	test("carries the reviewer's blocked outcome into the run", async () => {
		const record = await build({
			builder: stubBackend([DONE]),
			reviewer: stubBackend(['{"outcome":"blocked","reason":"diff is empty"}']),
		});
		expect(record.manifest).toMatchObject({
			status: "blocked",
			reason: "reviewer: diff is empty",
		});
	});

	test("fails before the builder when the signal is already aborted", async () => {
		const builder = stubBackend([DONE]);
		const controller = new AbortController();
		controller.abort();
		const record = await build({ builder, signal: controller.signal });
		expect(record.manifest.reason).toBe("aborted at builder-1");
		expect(builder.calls).toHaveLength(0);
		expect(
			JSON.parse(await readFile(join(record.dir, "run.json"), "utf-8")),
		).toEqual(record.manifest);
	});
	test("hands each provider the signals produced earlier in the same pass", async () => {
		const first = stubProvider([{}], "verify");
		const second = stubProvider([{}], "health");
		await build({
			builder: stubBackend([DONE]),
			providers: [first, second],
		});

		expect(first.contexts[0]?.priorSignals).toEqual([]);
		expect(
			second.contexts[0]?.priorSignals?.map((signal) => signal.kind),
		).toEqual(["verify"]);
	});
});

describe("runBuild envelope repair", () => {
	test("continues the run when the repair turn re-emits a valid envelope", async () => {
		const builder = stubBackend(["I changed things.", DONE]);
		const record = await build({ builder });

		expect(record.manifest).toMatchObject({
			status: "done",
			repairs: [
				{
					stage: "builder-1",
					reason: "no envelope line found",
					repaired: true,
				},
			],
		});
		expect(record.envelopes["builder-1"]?.summary).toBe("built");
		expect(
			record.stats.map((entry) => [entry.stage, entry.repair ?? false]),
		).toEqual([
			["builder-1", false],
			["builder-1", true],
			["reviewer", false],
		]);
		expect(await onDisk(record)).toEqual(record);
	});

	test("runs the repair turn read-only with the reason, the field list and the end of the reply", async () => {
		const builder = stubBackend(["I changed src/greet.ts.", DONE]);
		await build({ builder });

		const repair = builder.calls[1];
		expect(builder.calls[0]?.readonly).toBeUndefined();
		expect(repair).toMatchObject({ role: "lean/builder", readonly: true });
		expect(repair?.prompt.startsWith(`${REPAIR_HEADING}\n`)).toBe(true);
		expect(repair?.prompt).toContain("no envelope line found");
		expect(repair?.prompt).toContain("I changed src/greet.ts.");
		expect(repair?.prompt).toContain('every file you changed in "touched"');
		expect(repair?.prompt).toMatch(
			/Reply with only the envelope line, nothing else\.$/u,
		);
	});

	test("repairs a fenced pretty-printed reviewer envelope with the reviewer's field list", async () => {
		const fenced = [
			"Review done.",
			"```json",
			"{",
			'  "outcome": "done"',
			"}",
			"```",
		].join("\n");
		const reviewer = stubBackend([fenced, REVIEW]);
		const record = await build({ builder: stubBackend([DONE]), reviewer });

		expect(record.manifest.status).toBe("done");
		expect(record.manifest.repairs?.[0]).toMatchObject({
			stage: "reviewer",
			repaired: true,
		});
		expect(reviewer.calls[1]).toMatchObject({
			role: "lean/code-reviewer",
			readonly: true,
		});
		expect(reviewer.calls[1]?.prompt).toContain(
			'your "findings" (id, severity, file, summary, fix)',
		);
	});

	test("asks for a bare, unfenced last line wherever the host asks for the envelope", async () => {
		const builder = stubBackend([DONE]);
		const reviewer = stubBackend([REVIEW]);
		await build({ builder, reviewer });

		for (const call of [builder.calls[0], reviewer.calls[0]])
			expect(call?.prompt).toMatch(
				/The envelope must be the bare last line, not fenced, quoted or prefixed\.$/u,
			);
	});
});

describe("runBuild findings loop", () => {
	test("re-enters the builder once with high findings, re-checks and re-reviews", async () => {
		const builder = stubBackend([editGreet(DONE), DONE]);
		const reviewer = stubBackend([HIGH_REVIEW, REVIEW]);
		const provider = stubProvider([{}]);
		const record = await build({ builder, reviewer, providers: [provider] });

		expect(builder.calls).toHaveLength(2);
		expect(reviewer.calls).toHaveLength(2);
		expect(provider.contexts).toHaveLength(2);
		const saved = await onDisk(record);
		expect(saved).toEqual(record);
		expect(saved.manifest).toMatchObject({
			status: "done",
			reentries: 0,
			findingsReentries: 1,
		});
		expect(Object.keys(saved.envelopes).sort()).toEqual([
			"builder-1",
			"builder-4",
			"reviewer",
			"reviewer-2",
		]);
		expect(saved.facts.passes.map((pass) => pass.pass)).toEqual([1, 2]);
		expect(saved.stats.map((entry) => entry.stage)).toEqual([
			"builder-1",
			"reviewer",
			"builder-4",
			"reviewer-2",
		]);
	});

	test("sends the high and medium findings, not the low ones, after the base prompt", async () => {
		const builder = stubBackend([DONE]);
		await build({
			builder,
			reviewer: stubBackend([HIGH_REVIEW, REVIEW]),
		});

		const prompt = builder.calls[1]?.prompt ?? "";
		expect(prompt.startsWith(builder.calls[0]?.prompt ?? "-")).toBe(true);
		expect(prompt).toContain(
			"## Review findings\n\nA reviewer read your change and reported these findings. Address each one in the worktree, or say in your summary why not",
		);
		expect(prompt).toContain(
			"### F-1 (high) src/greet.ts:1\ngreets nobody\nFix: return hi",
		);
		expect(prompt).not.toContain("F-2");
	});

	test("gives the re-reviewer the first review and the builder's answer", async () => {
		const reviewer = stubBackend([HIGH_REVIEW, REVIEW]);
		await build({
			builder: stubBackend([
				DONE,
				'{"outcome":"done","summary":"now greets","touched":["src/greet.ts"]}',
			]),
			reviewer,
		});

		const prompt = reviewer.calls[1]?.prompt ?? "";
		expect(prompt).toContain("# Earlier review");
		expect(prompt).toContain("### F-1 (high) src/greet.ts:1");
		expect(prompt).toContain("Builder's answer: now greets");
		expect(prompt).toContain("## Pass 2");
	});

	test("does not re-enter on low findings", async () => {
		const builder = stubBackend([DONE]);
		const record = await build({ builder, reviewer: stubBackend([REVIEW]) });

		expect(builder.calls).toHaveLength(1);
		expect(record.manifest).toMatchObject({
			status: "done",
			findingsReentries: 0,
		});
	});

	test("ends blocked when the re-review still reports a medium finding", async () => {
		const builder = stubBackend([DONE]);
		const record = await build({
			builder,
			reviewer: stubBackend([HIGH_REVIEW, MEDIUM_REVIEW]),
		});

		expect(builder.calls).toHaveLength(2);
		expect(record.manifest).toMatchObject({
			status: "blocked",
			reason: "reviewer-2 still reports 1 high or medium finding(s): F-3",
		});
	});

	test("runs no further builder turn when verification fails after the findings re-entry", async () => {
		const builder = stubBackend([DONE]);
		const reviewer = stubBackend([HIGH_REVIEW, REVIEW]);
		const record = await build({
			builder,
			reviewer,
			providers: [stubProvider([{}, FAILING])],
		});

		expect(builder.calls).toHaveLength(2);
		expect(reviewer.calls).toHaveLength(2);
		expect(record.manifest).toMatchObject({
			status: "blocked",
			reentries: 0,
			findingsReentries: 1,
			reason:
				"re-entry signals still failing after the findings re-entry: verify",
		});
	});

	test("hands the findings re-entry the verification still failing after the first re-entry", async () => {
		const builder = stubBackend([DONE]);
		await build({
			builder,
			reviewer: stubBackend([HIGH_REVIEW, REVIEW]),
			providers: [stubProvider([FAILING, FAILING, {}])],
		});

		expect(builder.calls).toHaveLength(3);
		expect(builder.calls[2]?.prompt).toContain(
			"## Host verification still failing\n\n### verify (fail)",
		);
	});

	test("ends with the builder's outcome and no re-review when the findings re-entry is blocked", async () => {
		const reviewer = stubBackend([HIGH_REVIEW]);
		const record = await build({
			builder: stubBackend([
				DONE,
				'{"outcome":"blocked","reason":"the finding contradicts the plan"}',
			]),
			reviewer,
		});

		expect(reviewer.calls).toHaveLength(1);
		expect(record.manifest).toMatchObject({
			status: "blocked",
			reason: "builder-4: the finding contradicts the plan",
		});
	});

	test("keeps a reviewer that did not finish from triggering the findings re-entry", async () => {
		const builder = stubBackend([DONE]);
		const record = await build({
			builder,
			reviewer: stubBackend([
				'{"outcome":"blocked","reason":"diff is empty","findings":[{"id":"F-1","severity":"high","file":"a:1","summary":"s","fix":"f"}]}',
			]),
		});

		expect(builder.calls).toHaveLength(1);
		expect(record.manifest).toMatchObject({
			status: "blocked",
			findingsReentries: 0,
			reason: "reviewer: diff is empty",
		});
	});
});

describe("runBuild direct request", () => {
	const REQUEST = "Make greet return the string hi.";

	function direct(
		options: {
			builder: StubBackend;
			reviewer?: StubBackend;
		} & Partial<RunBuildOptions>,
	) {
		const { builder, reviewer, ...rest } = options;
		return runBuild({
			projectRoot: root,
			request: REQUEST,
			backend: builder,
			reviewerBackend: reviewer ?? stubBackend([REVIEW]),
			providers: [stubProvider([{}])],
			refreshGraph: stubRefresh(),
			...rest,
		});
	}

	test("builds a context pack around the request with an empty touch set", async () => {
		const builder = stubBackend([editGreet(DONE)]);
		const record = await direct({ builder });

		expect(record.manifest).toMatchObject({
			status: "done",
			tier: "direct",
			contextPack: "built",
		});
		expect(record.manifest.planPath).toBeUndefined();
		expect(builder.calls[0]?.prompt).toMatch(
			/^# Plan\n\nMake greet return the string hi\.\n/u,
		);
	});

	test("seeds the touch set from the paths the request names", async () => {
		const builder = stubBackend([editGreet(DONE)]);
		const provider = stubProvider([{}]);

		await direct({
			builder,
			providers: [provider],
			request: "Make `src/greet.ts` return the string hi.",
		});

		expect(builder.calls[0]?.prompt).toContain(
			`# Repo map\n\nsrc/greet.ts [touch]\n  ${GREET_SIGNATURE}`,
		);
		expect(provider.contexts[0]).toMatchObject({
			tier: "direct",
			plan: { touches: ["src/greet.ts"] },
		});
	});

	test("saves the request in the run directory", async () => {
		const record = await direct({ builder: stubBackend([DONE]) });

		const path = record.manifest.requestPath ?? "";
		expect(path).toBe(
			`missions/sessions/lean/runs/${record.manifest.id}/request.md`,
		);
		expect(await readFile(join(root, path), "utf-8")).toBe(`${REQUEST}\n`);
		expect(await onDisk(record)).toEqual(record);
	});

	test("tells the builder to make the change when no context pack is possible", async () => {
		const builder = stubBackend([DONE]);
		await direct({
			builder,
			refreshGraph: stubRefresh([{ outcome: "unavailable", reason: "none" }]),
		});

		expect(builder.calls[0]?.prompt).toMatch(
			/^Make this change\.\n\nMake greet return the string hi\.\n\nEnd with the lean envelope/u,
		);
	});

	test("reviews the change against the request with host verification", async () => {
		const provider = stubProvider([{}]);
		const reviewer = stubBackend([REVIEW]);
		await direct({
			builder: stubBackend([editGreet(DONE)]),
			reviewer,
			providers: [provider],
		});

		expect(provider.contexts[0]?.changedFiles).toEqual(["src/greet.ts"]);
		expect(reviewer.calls[0]?.prompt).toContain(
			`# Request\n\n${REQUEST}\n\n# Verification facts`,
		);
	});

	test("refuses a plan path and a request together", async () => {
		await expect(
			direct({ builder: stubBackend([DONE]), planPath: PLAN_PATH }),
		).rejects.toThrow("exactly one of planPath and request");
	});

	test("refuses a call with neither a plan path nor a request", async () => {
		await expect(
			direct({ builder: stubBackend([DONE]), request: undefined }),
		).rejects.toThrow("exactly one of planPath and request");
	});
});

describe("runBuild PR body", () => {
	const DIAGRAM_PLAN = `${PLAN}
## Diagram
\`\`\`mermaid
graph LR
  greet["src/greet.ts"] --> fresh["src/new.ts"]
\`\`\`
`;

	const RADIUS: Partial<Signal> = {
		status: "info",
		summary: "Blast radius: 2 changed, 1 dependents, 1 tests.",
		data: {
			graph: "current",
			radius: {
				changed: ["src/greet.ts", "src/new.ts"],
				dependents: ["src/app.ts"],
				tests: ["tests/greet.test.ts"],
				hubs: [],
				truncated: false,
			},
		},
	};

	function greetAndAdd(text: string): Reply {
		return async (input) => {
			await writeGreet(input.worktree);
			await writeFile(join(input.worktree, "src/new.ts"), "export {};\n");
			return text;
		};
	}

	async function prBody(record: RunRecord): Promise<string> {
		const path = (await onDisk(record)).manifest.prBodyPath ?? "";
		expect(path).toBe(
			`missions/sessions/lean/runs/${record.manifest.id}/pr-body.md`,
		);
		return readFile(join(root, path), "utf-8");
	}

	test("writes the plan's restyled diagram, the checks, the blast radius and the open findings", async () => {
		await writeFile(join(root, PLAN_PATH), DIAGRAM_PLAN);

		const record = await build({
			builder: stubBackend([greetAndAdd(DONE)]),
			providers: [
				stubProvider([{}]),
				stubProvider([RADIUS], "blast-radius"),
				planVersusActualProvider,
			],
		});

		const body = await prBody(record);
		expect(body.startsWith("# Demo\n\n## Change diagram\n```mermaid\n")).toBe(
			true,
		);
		expect(body).toContain('greet["src/greet.ts"] --> fresh["src/new.ts"]');
		expect(body).toContain("class fresh added");
		expect(body).toContain("class greet modified");
		expect(body).toContain("| verify | pass | tests pass |");
		expect(body).toContain("| blast-radius | info |");
		expect(body).toContain("2 changed, 1 dependents, 1 tests.");
		expect(body).toContain("**Unplanned** (1)\n\n- `src/new.ts`");
		expect(body).toContain("| F-1 | low | open | `src/greet.ts:1` | name |");
	});

	test("says a direct request had no plan and marks no file unplanned", async () => {
		const record = await runBuild({
			projectRoot: root,
			request: "Make `src/greet.ts` say hi\nand nothing else.",
			backend: stubBackend([greetAndAdd(DONE)]),
			reviewerBackend: stubBackend([REVIEW]),
			providers: [stubProvider([{}]), planVersusActualProvider],
			refreshGraph: stubRefresh(),
		});

		const body = await prBody(record);
		expect(body.startsWith("# Make `src/greet.ts` say hi\n")).toBe(true);
		expect(body).toContain(
			"## Plan versus actual\n\nNo plan (direct tier): nothing to compare the 2 changed file(s) against.",
		);
		expect(body).not.toContain("(unplanned)");
	});

	test("writes one for a review too", async () => {
		const base = git("rev-parse", "HEAD").trim();
		await writeGreet(root);

		const record = await runReview({
			projectRoot: root,
			base,
			reviewerBackend: stubBackend([HIGH_REVIEW]),
			providers: [stubProvider([{}])],
		});

		const body = await prBody(record);
		expect(body).toContain(`# Change against ${base.slice(0, 7)}`);
		expect(body).toContain("| F-1 | high | open |");
	});

	test("compares a planned review against the plan when no plan-vs-actual signal ran", async () => {
		const base = git("rev-parse", "HEAD").trim();
		await writeGreet(root);

		const record = await runReview({
			projectRoot: root,
			base,
			planPath: PLAN_PATH,
			reviewerBackend: stubBackend([REVIEW]),
			providers: [stubProvider([{}])],
		});

		const body = await prBody(record);
		expect(body).toContain("**Planned** (1)\n\n- `src/greet.ts`");
		expect(body).toContain("**Unplanned** (0)\n\n- none");
		expect(body).toContain("**Untouched** (0)\n\n- none");
		expect(body).toContain(
			"## Blast radius\n\nThe blast-radius signal did not run for this change.",
		);
	});

	test("styles a renamed planned file's old node as removed and counts it as touched", async () => {
		await writeFile(
			join(root, PLAN_PATH),
			`${PLAN}
## Diagram
\`\`\`mermaid
graph LR
  greet["src/greet.ts"]
\`\`\`
`,
		);
		git("add", "-A");
		git("commit", "-q", "-m", "diagram");
		const renameGreet: Reply = async (input) => {
			await rm(join(input.worktree, "src/greet.ts"));
			await writeFile(
				join(input.worktree, "src/hello.ts"),
				"export const greet = 1;\n",
			);
			return DONE;
		};

		const record = await build({
			builder: stubBackend([renameGreet]),
			providers: [stubProvider([{}]), planVersusActualProvider],
		});

		const body = await prBody(record);
		expect(body).toContain("class greet removed");
		expect(body).toContain("**Planned** (1)\n\n- `src/greet.ts`");
		expect(body).toContain("**Untouched** (0)");
		expect(body).toMatch(/class \w+ added/u);
	});

	test("is not written when no stage ran", async () => {
		const controller = new AbortController();
		controller.abort();

		const record = await build({
			builder: stubBackend([DONE]),
			signal: controller.signal,
		});

		expect(record.manifest.prBodyPath).toBeUndefined();
		expect(existsSync(join(record.dir, "pr-body.md"))).toBe(false);
	});
});

describe("runBuild reviewer lenses", () => {
	test("reviews through the general lens by default", async () => {
		const reviewer = stubBackend([REVIEW]);
		const record = await build({ builder: stubBackend([DONE]), reviewer });

		expect(record.manifest.lenses).toEqual(["general"]);
		expect(reviewer.calls[0]?.prompt).toContain("# Lenses\n\ngeneral\n\n");
	});

	test("passes the requested lenses to the reviewer and the record", async () => {
		const reviewer = stubBackend([REVIEW]);
		const record = await build({
			builder: stubBackend([DONE]),
			reviewer,
			lenses: ["security", "performance"],
		});

		expect(record.manifest.lenses).toEqual(["security", "performance"]);
		expect(reviewer.calls[0]?.prompt).toContain(
			"# Lenses\n\nsecurity, performance\n\n",
		);
	});
});

describe("runBuild reviewer diff bound", () => {
	/** A file larger than the inline cap, so the diff is cut inside it. */
	async function writeLargeChange(worktree: string): Promise<void> {
		const line = `${"x".repeat(99)}\n`;
		await writeFile(
			join(worktree, "src/big.ts"),
			line.repeat(Math.ceil(REVIEW_DIFF_INLINE_BYTES / line.length) + 50),
		);
		await writeFile(join(worktree, "src/zz-last.ts"), "export const z = 1;\n");
	}

	test("inlines at most the cap, lists every changed file, and points at the full diff", async () => {
		let fullDiff = "";
		const reviewer = stubBackend([
			async (input) => {
				fullDiff = await readFile(join(input.worktree, "full.diff"), "utf-8");
				return REVIEW;
			},
		]);
		await build({
			builder: stubBackend([
				async (input) => {
					await writeLargeChange(input.worktree);
					return DONE;
				},
			]),
			reviewer,
		});

		const prompt = reviewer.calls[0]?.prompt ?? "";
		const worktree = reviewer.calls[0]?.worktree ?? "";
		const diff = prompt.slice(
			prompt.indexOf("```diff\n") + 8,
			prompt.indexOf("\n```", prompt.indexOf("```diff\n")),
		);
		expect(Buffer.byteLength(diff)).toBeLessThanOrEqual(
			REVIEW_DIFF_INLINE_BYTES,
		);
		expect(prompt).toContain("# Changed files\n\nsrc/big.ts\nsrc/zz-last.ts");
		expect(prompt).toContain(
			`(truncated at ${REVIEW_DIFF_INLINE_BYTES} bytes; full diff at ${join(worktree, "full.diff")})`,
		);
		expect(fullDiff).toContain("+export const z = 1;");
		expect(diff).not.toContain("+export const z = 1;");
	});

	test("in place, writes the full diff to the run directory", async () => {
		git("branch", "-m", "main", "trunk");
		const reviewer = stubBackend([REVIEW]);
		const record = await build({
			builder: stubBackend([
				async (input) => {
					await writeLargeChange(input.worktree);
					return DONE;
				},
			]),
			reviewer,
		});

		const path = join(record.dir, "reviewer.diff");
		expect(record.manifest.reviewWorkspace).toBe("in-place");
		expect(reviewer.calls[0]?.prompt).toContain(`full diff at ${path})`);
		expect(await readFile(path, "utf-8")).toContain("+export const z = 1;");
	});

	test("inlines a small diff whole, with no truncation note", async () => {
		const reviewer = stubBackend([REVIEW]);
		await build({ builder: stubBackend([editGreet(DONE)]), reviewer });

		expect(reviewer.calls[0]?.prompt).toContain('+export const greet = "hi";');
		expect(reviewer.calls[0]?.prompt).not.toContain("truncated at");
	});
});

describe("runBuild run lock", () => {
	function deferred(): { promise: Promise<void>; resolve: () => void } {
		let resolve = () => {};
		const promise = new Promise<void>((done) => {
			resolve = done;
		});
		return { promise, resolve };
	}

	test("blocks a second run in the same worktree while the first is active", async () => {
		const started = deferred();
		const release = deferred();
		const first = build({
			builder: stubBackend([
				async () => {
					started.resolve();
					await release.promise;
					return DONE;
				},
			]),
		});
		await started.promise;
		const secondBuilder = stubBackend([DONE]);
		const second = await build({ builder: secondBuilder });
		release.resolve();
		const firstRecord = await first;

		expect(secondBuilder.calls).toHaveLength(0);
		expect(second.manifest).toMatchObject({
			status: "blocked",
			reason: `another lean run (${firstRecord.manifest.id}) is active in this worktree`,
		});
		expect(firstRecord.manifest.status).toBe("done");
	});

	test("releases the lock when the run ends, even when it fails", async () => {
		await build({ builder: stubBackend(["no envelope"]) });
		const record = await build({ builder: stubBackend([DONE]) });

		expect(record.manifest.status).toBe("done");
		expect(existsSync(join(root, ".git/lean-run/lock"))).toBe(false);
	});

	test("reclaims a lock left by a process that is gone", async () => {
		const gone = execFileSync("node", ["-p", "process.pid"], {
			encoding: "utf8",
		}).trim();
		await mkdir(join(root, ".git/lean-run"), { recursive: true });
		await writeFile(
			join(root, ".git/lean-run/lock"),
			JSON.stringify({ runId: "old-run", pid: Number(gone), createdAt: "t" }),
		);

		const record = await build({ builder: stubBackend([DONE]) });

		expect(record.manifest.status).toBe("done");
	});
});

describe("runBuild health hook coverage", () => {
	test("records the Pi health hook for a Pi builder", async () => {
		const record = await build({ builder: stubBackend([DONE]) });

		expect(record.manifest.healthHook).toBe("pi");
		expect(record.manifest.warnings).toBeUndefined();
	});

	test("records that no health hook ran for an external builder", async () => {
		const record = await build({
			builder: stubBackend([DONE], "claude-cli"),
		});

		expect(record.manifest).toMatchObject({
			status: "done",
			healthHook: "none (external backend)",
			warnings: [
				"claude-cli: the post-edit health hook and the lean role guard run only in Pi sessions (brief 4.7A)",
			],
		});
	});

	const ENTRY = {
		timestamp: "2026-10-01T00:00:00.000Z",
		file: "src/greet.ts",
		function: "greet",
		startLine: 1,
		endLine: 1,
		metrics: { cyclomatic: 2, cognitive: 1, crap: null },
		baseMetrics: { cyclomatic: 1, cognitive: 0, crap: null },
		base: "abc",
	};

	/** What the hook does inside a Pi builder session: logs the finding it injects. */
	function hookFinding(fn: string, text: string): Reply {
		return async (input) => {
			await appendHealthHookEntries({
				worktree: input.worktree,
				entries: [{ ...ENTRY, function: fn }],
			});
			return text;
		};
	}

	test("keeps what the hook logged in each builder stage, then clears the log", async () => {
		const leftover = join(root, ".git/lean-run/health-hook.jsonl");
		await mkdir(join(root, ".git/lean-run"), { recursive: true });
		await writeFile(leftover, `${JSON.stringify(ENTRY)}\n`);

		const record = await build({
			builder: stubBackend([
				hookFinding("first", DONE),
				hookFinding("second", DONE),
			]),
			providers: [stubProvider([FAILING, {}])],
		});

		const kept = await readFile(join(record.dir, "health-hook.jsonl"), "utf8");
		expect(
			kept
				.trimEnd()
				.split("\n")
				.map((line) => JSON.parse(line)),
		).toEqual([
			{ stage: "builder-1", ...ENTRY, function: "first" },
			{ stage: "builder-2", ...ENTRY, function: "second" },
		]);
		expect(existsSync(leftover)).toBe(false);
	});

	test("writes no hook log into a record whose builder logged nothing", async () => {
		const record = await build({ builder: stubBackend([DONE]) });

		expect(existsSync(join(record.dir, "health-hook.jsonl"))).toBe(false);
	});
});

describe("runReview", () => {
	/** A feature branch with one committed change and one uncommitted one. */
	async function featureChange(): Promise<string> {
		const base = git("rev-parse", "HEAD").trim();
		git("checkout", "-q", "-b", "feature");
		await writeGreet(root);
		git("commit", "-q", "-am", "greet");
		await writeFile(join(root, "src/extra.ts"), "export const extra = 2;\n");
		return base;
	}

	function review(
		options: { reviewer: StubBackend } & Partial<RunReviewOptions>,
	) {
		const { reviewer, ...rest } = options;
		return runReview({
			projectRoot: root,
			reviewerBackend: reviewer,
			providers: [stubProvider([{}])],
			refreshGraph: stubRefresh(),
			...rest,
		});
	}

	test("runs verification before the reviewer and hands it the signal", async () => {
		await featureChange();
		const provider = stubProvider([{}]);
		const reviewer = stubBackend([REVIEW]);

		const record = await review({ reviewer, providers: [provider] });

		expect(record.manifest.status).toBe("done");
		expect(provider.contexts[0]).toMatchObject({
			tier: "review",
			changedFiles: ["src/extra.ts", "src/greet.ts"],
		});
		expect(record.facts.passes).toHaveLength(1);
		expect(reviewer.calls[0]?.prompt).toContain(
			"# Verification facts\n\n## Pass 1\n\n### verify (pass)",
		);
	});

	test("ends blocked as unverified when verification did not pass", async () => {
		await featureChange();
		const reviewer = stubBackend([REVIEW]);

		const record = await review({
			reviewer,
			providers: [stubProvider([FAILING])],
		});

		expect(reviewer.calls).toHaveLength(1);
		expect(record.manifest).toMatchObject({
			status: "blocked",
			reason: "unverified: verification did not pass (fail): 1 test failed",
		});
		expect(summarizeRun(record)).toMatch(/^blocked: unverified: /u);
	});

	test("ends blocked as unverified when no verify signal was produced", async () => {
		await featureChange();

		const record = await review({
			reviewer: stubBackend([REVIEW]),
			providers: [stubProvider([{ status: "info" }], "health")],
		});

		expect(record.manifest).toMatchObject({
			status: "blocked",
			reason: "unverified: no verify signal",
		});
	});

	test("ends blocked as unverified when no providers are configured", async () => {
		await featureChange();

		const record = await review({
			reviewer: stubBackend([REVIEW]),
			providers: [],
		});

		expect(record.manifest).toMatchObject({
			status: "blocked",
			reason: "unverified: no providers configured",
		});
	});

	test("keeps the reviewer's outcome and adds the verification gap", async () => {
		await featureChange();

		const record = await review({
			reviewer: stubBackend([
				'{"outcome":"blocked","summary":"no access","reason":"checkout unreadable"}',
			]),
			providers: [stubProvider([FAILING])],
		});

		expect(record.manifest).toMatchObject({
			status: "blocked",
			reason:
				"reviewer: checkout unreadable; unverified: verification did not pass (fail): 1 test failed",
		});
	});

	test("runs the project's verification commands by default", async () => {
		await featureChange();
		await mkdir(join(root, ".cosmonauts"));
		await writeFile(
			join(root, ".cosmonauts/config.json"),
			JSON.stringify({
				qualityReview: {
					checks: [{ id: "ok", command: "sh", args: ["-c", "exit 0"] }],
				},
			}),
		);
		const refresh = stubRefresh();

		const record = await runReview({
			projectRoot: root,
			reviewerBackend: stubBackend([REVIEW]),
			refreshGraph: refresh,
		});

		expect(record.manifest.status).toBe("done");
		expect(record.facts.passes[0]?.signals).toMatchObject([
			{ kind: "verify", status: "pass", summary: "1 passed" },
		]);
		expect(refresh.calls).toHaveLength(0);
	});

	test("reviews the branch's change against its merge-base with main and records the envelope", async () => {
		const base = await featureChange();
		const reviewer = stubBackend([REVIEW]);

		const record = await review({ reviewer, lenses: ["security"] });

		expect(record.manifest).toMatchObject({
			tier: "review",
			status: "done",
			diffBase: base,
			backend: "pi",
			reentries: 0,
			lenses: ["security"],
		});
		expect(record.manifest.healthHook).toBeUndefined();
		expect(record.envelopes).toEqual({ reviewer: JSON.parse(REVIEW) });
		expect(record.facts.passes.map((pass) => pass.pass)).toEqual([1]);
		expect(await onDisk(record)).toEqual(record);
		const call = reviewer.calls[0];
		expect(call).toMatchObject({ role: "lean/code-reviewer" });
		expect(call?.prompt).toContain("no plan or request came with it");
		expect(call?.prompt).toContain("# Lenses\n\nsecurity");
		expect(call?.prompt).toContain(
			"# Changed files\n\nsrc/extra.ts\nsrc/greet.ts",
		);
		expect(call?.prompt).toContain('+export const greet = "hi";');
		expect(call?.prompt).toContain("+export const extra = 2;");
		expect(call?.prompt).not.toContain("# Plan");
	});

	test("bounds the inline diff and points at the full diff", async () => {
		await featureChange();
		const line = `${"x".repeat(99)}\n`;
		await writeFile(
			join(root, "src/big.ts"),
			line.repeat(Math.ceil(REVIEW_DIFF_INLINE_BYTES / line.length) + 50),
		);
		const reviewer = stubBackend([REVIEW]);

		await review({ reviewer });

		const prompt = reviewer.calls[0]?.prompt ?? "";
		expect(prompt).toContain(`(truncated at ${REVIEW_DIFF_INLINE_BYTES} bytes`);
		expect(prompt).toContain("src/big.ts\nsrc/extra.ts\nsrc/greet.ts");
	});

	test("reviews against a given base ref", async () => {
		await featureChange();
		const reviewer = stubBackend([REVIEW]);

		const record = await review({ reviewer, base: "HEAD" });

		expect(record.manifest.diffBase).toBe(git("rev-parse", "HEAD").trim());
		const prompt = reviewer.calls[0]?.prompt ?? "";
		expect(prompt).toContain("# Changed files\n\nsrc/extra.ts\n");
		expect(prompt).not.toContain("src/greet.ts");
	});

	test("reads the change against the request it answers", async () => {
		await featureChange();
		const reviewer = stubBackend([REVIEW]);

		const record = await review({ reviewer, request: "Make greet say hi." });

		expect(record.manifest).toMatchObject({
			tier: "review",
			requestPath: expect.stringMatching(/request\.md$/),
		});
		const prompt = reviewer.calls[0]?.prompt ?? "";
		expect(prompt).toContain("Review this change against its request.");
		expect(prompt).toContain("# Request\n\nMake greet say hi.");
	});

	test("reads the change against its plan", async () => {
		await featureChange();
		const reviewer = stubBackend([REVIEW]);

		const record = await review({ reviewer, planPath: PLAN_PATH });

		expect(record.manifest).toMatchObject({
			tier: "review",
			planPath: PLAN_PATH,
		});
		expect(reviewer.calls[0]?.prompt).toContain("# Plan\n\n# Demo");
	});

	test("repairs a reply with no envelope in a read-only turn", async () => {
		await featureChange();
		const reviewer = stubBackend(["Looks fine to me.", REVIEW]);

		const record = await review({ reviewer });

		expect(record.manifest).toMatchObject({
			status: "done",
			repairs: [
				{ stage: "reviewer", reason: "no envelope line found", repaired: true },
			],
		});
		expect(reviewer.calls[1]).toMatchObject({ readonly: true });
		expect(reviewer.calls[1]?.prompt.startsWith(REPAIR_HEADING)).toBe(true);
	});

	test("ends with the reviewer's outcome when it could not review", async () => {
		await featureChange();
		const reviewer = stubBackend([
			'{"outcome":"blocked","summary":"no access","reason":"checkout unreadable"}',
		]);

		const record = await review({ reviewer });

		expect(record.manifest).toMatchObject({
			status: "blocked",
			reason: "reviewer: checkout unreadable",
		});
	});

	test("blocks without a session when there is nothing to review", async () => {
		const reviewer = stubBackend([REVIEW]);

		const record = await review({ reviewer });

		expect(reviewer.calls).toHaveLength(0);
		expect(record.manifest.status).toBe("blocked");
		expect(record.manifest.reason).toMatch(
			/^nothing to review: no change against /,
		);
		expect(existsSync(join(root, ".git/lean-run/lock"))).toBe(false);
	});

	test("refuses a plan path and a request together", async () => {
		await expect(
			review({
				reviewer: stubBackend([REVIEW]),
				planPath: PLAN_PATH,
				request: "fix it",
			}),
		).rejects.toThrow("runReview takes planPath or request, not both");
	});

	test("refuses a base that is not a commit", async () => {
		await expect(
			review({ reviewer: stubBackend([REVIEW]), base: "no-such-ref" }),
		).rejects.toThrow();
	});
});
