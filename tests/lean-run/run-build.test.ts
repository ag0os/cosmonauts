/**
 * Tests for runBuild with stub backends and stub signal providers in a real
 * temporary git repository.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { readRunBaseSha } from "../../lib/lean-run/base-sha.ts";
import { loadRunRecord } from "../../lib/lean-run/record.ts";
import {
	type RunBuildOptions,
	runBuild,
} from "../../lib/lean-run/run-build.ts";
import type {
	BackendRunInput,
	BuilderBackend,
	RunRecord,
	Signal,
	SignalContext,
	SignalKind,
	SignalProvider,
} from "../../lib/lean-run/types.ts";

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

type Reply = string | ((input: BackendRunInput) => Promise<string> | string);

interface StubBackend extends BuilderBackend {
	calls: BackendRunInput[];
}

function stubBackend(replies: Reply[]): StubBackend {
	const calls: BackendRunInput[] = [];
	return {
		kind: "pi",
		calls,
		async run(input) {
			calls.push(input);
			const reply = replies[calls.length - 1] ?? replies.at(-1) ?? "";
			const text = typeof reply === "string" ? reply : await reply(input);
			return {
				text,
				stats: {
					tokens: {
						input: 1,
						output: 2,
						cacheRead: 0,
						cacheWrite: 0,
						total: 3,
					},
					cost: 0,
					durationMs: 5,
					turns: 1,
					toolCalls: 0,
				},
			};
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

const never = (): Promise<never> => new Promise<never>(() => {});

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

	test("records per-stage duration, spawn stats and cumulative tokens", async () => {
		const record = await build({ builder: stubBackend([DONE]) });
		expect(record.stats.map((stage) => stage.stage)).toEqual([
			"builder-1",
			"reviewer",
		]);
		expect(record.stats[0]?.spawn?.tokens.total).toBe(3);
		expect(record.stats[0]?.durationMs).toBeGreaterThanOrEqual(0);
		expect(record.manifest.tokensUsed).toBe(6);
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

	test("sends a supplied context pack verbatim", async () => {
		const builder = stubBackend([DONE]);
		await build({ builder, contextPack: "PACK" });
		expect(builder.calls[0]?.prompt).toBe("PACK");
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
			reason: "re-entry signals still failing after one re-entry: verify",
		});
		expect(saved.envelopes.reviewer?.outcome).toBe("done");
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
			budget: { tokens: 2, timeMs: 60_000 },
		});
		expect(record.manifest).toMatchObject({
			status: "failed",
			reason: "token budget exceeded at reviewer: 3 of 2 tokens used",
		});
		expect(reviewer.calls).toHaveLength(0);
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
	test("fails with a reason when the builder returns no envelope", async () => {
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
			reason: "builder-1: invalid envelope: no envelope line found",
		});
	});

	test("fails when the re-entered builder returns no envelope", async () => {
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
			reason: "builder-2: invalid envelope: no envelope line found",
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
});
