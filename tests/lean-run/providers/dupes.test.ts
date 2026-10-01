/**
 * Tests for createDupesProvider: real Fallow against small git repositories
 * whose committed `.fallow-baselines/dupes.json` holds the floor, plus a
 * stubbed process runner for the failure paths.
 */

import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ProviderProcessExecutor } from "../../../domains/shared/extensions/project-tools/process-runner.ts";
import { resolveFallowExecutable } from "../../../lib/code-health/fallow-function-metrics.ts";
import {
	createDupesProvider,
	type DupesData,
} from "../../../lib/lean-run/providers/dupes.ts";
import type { SignalContext } from "../../../lib/lean-run/types.ts";
import { useTempDir } from "../../helpers/fs.ts";
import { stubContext } from "./context.ts";

const TOTALS = [
	"(orders: { total: number; region: string }[]) {",
	"\tconst byRegion = new Map<string, number>();",
	"\tfor (const order of orders) {",
	"\t\tconst previous = byRegion.get(order.region) ?? 0;",
	"\t\tbyRegion.set(order.region, previous + order.total);",
	"\t}",
	"\tconst entries = [...byRegion.entries()].sort((a, b) => b[1] - a[1]);",
	'\treturn entries.map(([region, total]) => region + ": " + total.toFixed(2));',
	"}",
].join("\n");

const SETTINGS = [
	"(text: string): Record<string, string> {",
	"\tconst settings: Record<string, string> = {};",
	'\tfor (const line of text.split("\\n")) {',
	"\t\tconst trimmed = line.trim();",
	'\t\tif (trimmed.length === 0 || trimmed.startsWith("#")) continue;',
	'\t\tconst [key, ...rest] = trimmed.split("=");',
	"\t\tif (key === undefined) continue;",
	'\t\tsettings[key.trim()] = rest.join("=").trim();',
	"\t}",
	"\treturn settings;",
	"}",
].join("\n");

const A_BASE = `export function summarizeOrders${TOTALS}\n\nexport function parseSettings${SETTINGS}\n`;
const B_BASE = `export function totalsByRegion${TOTALS}\n`;
const C_COPY = `export function readConfig${SETTINGS}\n`;
const FLOOR_PATH = ".fallow-baselines/dupes.json";

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" });
}

async function saveFloor(root: string): Promise<void> {
	await mkdir(join(root, ".fallow-baselines"), { recursive: true });
	execFileSync(
		await resolveFallowExecutable(),
		["dupes", "--save-baseline", FLOOR_PATH, "--quiet", "--no-cache"],
		{ cwd: root, stdio: "ignore" },
	);
}

/**
 * Commits `lib/a.ts` and `lib/b.ts`, which share one block, with or without
 * a floor saved by Fallow itself.
 */
async function initRepo(root: string, withFloor: boolean): Promise<void> {
	git(root, "init", "-q", "-b", "main");
	git(root, "config", "user.name", "Test");
	git(root, "config", "user.email", "test@example.com");
	git(root, "config", "commit.gpgsign", "false");
	await mkdir(join(root, "lib"));
	await writeFile(join(root, "lib/a.ts"), A_BASE);
	await writeFile(join(root, "lib/b.ts"), B_BASE);
	if (withFloor) await saveFloor(root);
	git(root, "add", "-A");
	git(root, "commit", "-q", "--no-verify", "-m", "base");
}

/** Copies `parseSettings` into a new file and moves the floor's clone down two lines. */
async function introduceDuplicate(root: string): Promise<void> {
	await writeFile(join(root, "lib/c.ts"), C_COPY);
	await writeFile(join(root, "lib/a.ts"), `// moved\n// down\n${A_BASE}`);
}

function context(
	worktree: string,
	overrides: Partial<SignalContext> = {},
): SignalContext {
	return stubContext({
		worktree,
		baseSha: "HEAD",
		changedFiles: ["lib/a.ts", "lib/c.ts"],
		budget: { tokens: 0, timeMs: 60_000 },
		...overrides,
	});
}

function locationsOf(data: unknown, key: "newGroups" | "baselinedGroups") {
	return (data as DupesData)[key].map((group) => group.locations);
}

describe("createDupesProvider with real Fallow", { timeout: 60_000 }, () => {
	const repo = useTempDir("lean-dupes-");

	describe("with a committed floor", () => {
		beforeEach(async () => {
			await initRepo(repo.path, true);
			await introduceDuplicate(repo.path);
		});

		test("reports a block a changed file copied as a new group with its line ranges", async () => {
			const signal = await createDupesProvider().run(context(repo.path));

			expect(signal).toMatchObject({
				kind: "dupes",
				status: "info",
				summary:
					"1 new duplicate groups involve changed files (1 already in the floor of 1)",
				reenter: false,
			});
			expect(locationsOf(signal.data, "newGroups")).toEqual([
				["lib/a.ts:13-22", "lib/c.ts:1-10"],
			]);
		});

		test("counts a floor group that an edit only moved as already in the floor", async () => {
			const signal = await createDupesProvider().run(context(repo.path));

			expect(locationsOf(signal.data, "baselinedGroups")).toEqual([
				["lib/a.ts:3-10", "lib/b.ts:1-8"],
			]);
		});

		test("ignores clone groups that involve no changed file", async () => {
			const signal = await createDupesProvider().run(
				context(repo.path, { changedFiles: ["lib/c.ts"] }),
			);

			expect(locationsOf(signal.data, "baselinedGroups")).toEqual([]);
			expect(locationsOf(signal.data, "newGroups")).toHaveLength(1);
		});

		test("compares with the floor at the base revision, not a floor the builder rewrote", async () => {
			await saveFloor(repo.path);
			const rewritten = await readFile(join(repo.path, FLOOR_PATH), "utf8");
			expect(rewritten).toContain("lib/c.ts");

			const signal = await createDupesProvider().run(context(repo.path));

			expect(signal.data).toMatchObject({ floor: `HEAD:${FLOOR_PATH}` });
			expect(locationsOf(signal.data, "newGroups")).toHaveLength(1);
		});
	});

	test("reports a repository without a committed floor as unavailable", async () => {
		await initRepo(repo.path, false);
		await introduceDuplicate(repo.path);

		const signal = await createDupesProvider().run(context(repo.path));

		expect(signal).toMatchObject({
			kind: "dupes",
			status: "info",
			data: { unavailable: true },
			reenter: false,
		});
		expect(signal.summary).toContain(
			`dupes unavailable: no committed duplication floor at HEAD:${FLOOR_PATH}`,
		);
	});
});

describe("createDupesProvider with a stubbed process runner", () => {
	const FLOOR = JSON.stringify({ clone_groups: ["lib/a.ts:1-8|lib/b.ts:1-8"] });

	function stub(
		fallow: Awaited<ReturnType<ProviderProcessExecutor>>,
	): ReturnType<typeof vi.fn<ProviderProcessExecutor>> {
		return vi.fn<ProviderProcessExecutor>(async (invocation) =>
			invocation.executablePath === "git"
				? { kind: "code-exit", code: 0, stdout: FLOOR, stderr: "" }
				: fallow,
		);
	}

	const provider = (runProcess: ProviderProcessExecutor) =>
		createDupesProvider({ fallowExecutable: "/bin/fallow", runProcess });

	test("runs nothing and reports no groups when nothing changed", async () => {
		const runProcess = stub({
			kind: "code-exit",
			code: 0,
			stdout: "",
			stderr: "",
		});

		const signal = await provider(runProcess).run(
			context("/work", { changedFiles: [] }),
		);

		expect(runProcess).not.toHaveBeenCalled();
		expect(signal).toMatchObject({ status: "info", reenter: false });
	});

	test("runs Fallow's dupes report in the worktree within the run's budget", async () => {
		const runProcess = stub({
			kind: "code-exit",
			code: 0,
			stdout: JSON.stringify({ clone_groups: [] }),
			stderr: "",
		});

		await provider(runProcess).run(
			context("/work", { budget: { tokens: 0, timeMs: 5_000 } }),
		);

		expect(runProcess).toHaveBeenCalledWith(
			{
				executablePath: "/bin/fallow",
				args: ["dupes", "--format", "json", "--quiet", "--no-cache"],
				cwd: "/work",
			},
			undefined,
			{ timeoutMs: 5_000 },
		);
	});

	test("reports a Fallow that cannot start as unavailable", async () => {
		const runProcess = stub({
			kind: "spawn-error",
			error: Object.assign(new Error("spawn /bin/fallow ENOENT"), {
				code: "ENOENT",
			}),
			stdout: "",
			stderr: "",
		});

		const signal = await provider(runProcess).run(context("/work"));

		expect(signal).toEqual({
			kind: "dupes",
			status: "info",
			summary:
				"dupes unavailable: fallow dupes failed (could not start: spawn /bin/fallow ENOENT)",
			data: {
				unavailable: true,
				reason:
					"fallow dupes failed (could not start: spawn /bin/fallow ENOENT)",
			},
			reenter: false,
		});
	});

	test("reports Fallow output that is not JSON as unavailable", async () => {
		const runProcess = stub({
			kind: "code-exit",
			code: 0,
			stdout: "WARN something",
			stderr: "",
		});

		const signal = await provider(runProcess).run(context("/work"));

		expect(signal.data).toEqual({
			unavailable: true,
			reason: "fallow dupes did not print JSON",
		});
	});

	test("does not let one floor entry absorb two current groups", async () => {
		const group = (start: number) => ({
			instances: [
				{ file: "lib/a.ts", start_line: start, end_line: start + 7 },
				{ file: "lib/b.ts", start_line: start, end_line: start + 7 },
			],
		});
		const runProcess = stub({
			kind: "code-exit",
			code: 0,
			stdout: JSON.stringify({ clone_groups: [group(1), group(21)] }),
			stderr: "",
		});

		const signal = await provider(runProcess).run(context("/work"));

		expect(locationsOf(signal.data, "baselinedGroups")).toEqual([
			["lib/a.ts:1-8", "lib/b.ts:1-8"],
		]);
		expect(locationsOf(signal.data, "newGroups")).toEqual([
			["lib/a.ts:21-28", "lib/b.ts:21-28"],
		]);
	});
});
