/**
 * Tests for the lean run lock on a file system without hard links, where
 * `link()` fails with ENOTSUP (exFAT).
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { link, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { acquireRunLock } from "../../lib/lean-run/run-lock.ts";

vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	return {
		...actual,
		link: vi.fn(async () => {
			throw Object.assign(new Error("operation not supported"), {
				code: "ENOTSUP",
			});
		}),
	};
});

let root: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "lean-run-lock-no-links-"));
	execFileSync("git", ["init", "-q"], { cwd: root });
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

test("takes the lock for this run without hard links, and releases it", async () => {
	const lockPath = join(root, ".git/lean-run/lock");

	const lock = await acquireRunLock({ worktree: root, runId: "run-1" });

	expect(lock.acquired).toBe(true);
	await expect(vi.mocked(link).mock.results[0]?.value).rejects.toMatchObject({
		code: "ENOTSUP",
	});
	expect(JSON.parse(await readFile(lockPath, "utf8"))).toMatchObject({
		runId: "run-1",
		pid: process.pid,
	});
	const second = await acquireRunLock({ worktree: root, runId: "run-2" });
	expect(second).toEqual({ acquired: false, holder: "run-1" });
	if (lock.acquired) await lock.release();
	expect(existsSync(lockPath)).toBe(false);
});
