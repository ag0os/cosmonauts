/**
 * Tests for runBuild's cleanup when the run record cannot be written: the
 * run lock, the base-sha marker and the builder worktree are released
 * whatever the last saves do.
 * Saving the manifest and reading the hook log fail on demand through
 * module mocks; everything else is real, in a temporary git repository.
 */
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { RefreshFileGraph } from "../../lib/lean-run/graph-refresh.ts";
import { loadRunRecord } from "../../lib/lean-run/record.ts";
import { runBuild } from "../../lib/lean-run/run-build.ts";
import type {
	BuilderBackend,
	RunRecord,
	SignalProvider,
} from "../../lib/lean-run/types.ts";

interface Faults {
	/** Whether this save of the manifest fails. */
	saveFails?: (manifest: RunRecord["manifest"]) => boolean;
	/** 1-based calls to takeHealthHookLog that fail. */
	takeFails: Set<number>;
	takeCalls: number;
	/** The base-sha marker of each builder worktree, read just before it is removed. */
	markersAtDispose: Array<string | undefined>;
}

const faults = vi.hoisted<Faults>(() => ({
	takeFails: new Set(),
	takeCalls: 0,
	markersAtDispose: [],
}));

vi.mock("../../lib/lean-run/builder-worktree.ts", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("../../lib/lean-run/builder-worktree.ts")
		>();
	const { readRunBaseSha } = await import("../../lib/lean-run/base-sha.ts");
	return {
		...actual,
		openBuilderWorktree: async (
			options: Parameters<typeof actual.openBuilderWorktree>[0],
		) => {
			const worktree = await actual.openBuilderWorktree(options);
			return {
				...worktree,
				dispose: async () => {
					faults.markersAtDispose.push(
						await readRunBaseSha({ worktree: worktree.projectDir }),
					);
					return worktree.dispose();
				},
			};
		},
	};
});

vi.mock("../../lib/lean-run/record.ts", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../lib/lean-run/record.ts")>();
	return {
		...actual,
		saveManifest: async (record: RunRecord) => {
			if (faults.saveFails?.(record.manifest)) throw new Error("disk full");
			await actual.saveManifest(record);
		},
	};
});

vi.mock("../../lib/lean-run/health-hook-log.ts", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("../../lib/lean-run/health-hook-log.ts")
		>();
	return {
		...actual,
		takeHealthHookLog: async (options: { readonly worktree: string }) => {
			faults.takeCalls += 1;
			if (faults.takeFails.has(faults.takeCalls))
				throw new Error("EACCES: hook log");
			return actual.takeHealthHookLog(options);
		},
	};
});

const PLAN_PATH = "missions/lean/demo/plan.md";
const PLAN = "# Demo\n\n## Approach\nGreet.\n\n## Touches\n- `src/greet.ts`\n";
const DONE = '{"outcome":"done","summary":"built","touched":["src/greet.ts"]}';
const REVIEW = '{"outcome":"done","summary":"fine","findings":[]}';

let root: string;

function git(...args: string[]): string {
	return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function worktreeCount(): number {
	return (
		git("worktree", "list", "--porcelain").match(/^worktree /gmu)?.length ?? 0
	);
}

beforeEach(async () => {
	faults.saveFails = undefined;
	faults.takeFails = new Set();
	faults.takeCalls = 0;
	faults.markersAtDispose = [];
	root = await mkdtemp(join(tmpdir(), "lean-run-cleanup-"));
	git("init", "-q", "-b", "main");
	git("config", "user.email", "test@example.com");
	git("config", "user.name", "Test");
	git("config", "commit.gpgsign", "false");
	await mkdir(join(root, "missions/lean/demo"), { recursive: true });
	await mkdir(join(root, "src"));
	await writeFile(join(root, ".gitignore"), "missions/sessions/\n");
	await writeFile(join(root, PLAN_PATH), PLAN);
	await writeFile(join(root, "src/greet.ts"), "export const greet = 1;\n");
	git("add", "-A");
	git("commit", "-q", "-m", "base");
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

function backend(text: string, edit = false): BuilderBackend {
	return {
		kind: "pi",
		async run(input) {
			if (edit)
				await writeFile(
					join(input.worktree, "src/greet.ts"),
					'export const greet = "hi";\n',
				);
			return { text };
		},
	};
}

const verify: SignalProvider = {
	kind: "verify",
	run: async () => ({
		kind: "verify",
		status: "pass",
		summary: "tests pass",
		data: { exitCode: 0 },
		reenter: false,
	}),
};

const refreshGraph: RefreshFileGraph = async () => ({
	outcome: "current",
	graph: {
		schemaVersion: 1,
		projectHash: "p",
		graphHash: "g",
		nodes: [{ path: "src/greet.ts", kind: "source", exports: [] }],
		edges: [],
	},
});

function build(): Promise<RunRecord> {
	return runBuild({
		projectRoot: root,
		planPath: PLAN_PATH,
		backend: backend(DONE, true),
		reviewerBackend: backend(REVIEW),
		providers: [verify],
		// Only verify runs here; the default required kinds would block every run.
		requiredSignals: [],
		refreshGraph,
	});
}

describe("runBuild cleanup when the record cannot be saved", () => {
	test("releases the run lock and rethrows when the manifest cannot be saved after the pr body", async () => {
		faults.saveFails = (manifest) => manifest.prBodyPath !== undefined;

		await expect(build()).rejects.toThrow("disk full");

		expect(worktreeCount()).toBe(1);
		faults.saveFails = undefined;
		const next = await build();
		expect(next.manifest.status).toBe("done");
	});

	test("keeps the run with a warning when one save after the pr body fails", async () => {
		let failures = 0;
		faults.saveFails = (manifest) =>
			manifest.prBodyPath !== undefined && failures++ === 0;

		const record = await build();

		const saved = await loadRunRecord({
			projectRoot: root,
			id: record.manifest.id,
		});
		expect(saved.manifest.status).toBe("done");
		expect(saved.manifest.prBodyPath).toBeDefined();
		expect(saved.manifest.warnings).toContain(
			"manifest save failed after the pr body: disk full",
		);
	});

	test("clears the base sha, removes the builder worktree and releases the lock when the manifest cannot be saved after a lost hook log", async () => {
		faults.takeFails = new Set([2]);
		faults.saveFails = (manifest) =>
			(manifest.warnings ?? []).some((warning) =>
				warning.startsWith("health hook log not kept"),
			);

		await expect(build()).rejects.toThrow("disk full");

		expect(faults.markersAtDispose).toEqual([undefined]);
		expect(worktreeCount()).toBe(1);
		faults.saveFails = undefined;
		faults.takeFails = new Set();
		expect((await build()).manifest.status).toBe("done");
	});

	test("warns and runs on when the hook log cannot be cleared before a stage", async () => {
		faults.takeFails = new Set([1]);

		const record = await build();

		expect(record.manifest.status).toBe("done");
		expect(record.manifest.warnings).toContain(
			"health hook log not cleared before builder-1: EACCES: hook log",
		);
	});
});
