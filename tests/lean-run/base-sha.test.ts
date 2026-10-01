import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import {
	clearRunBaseSha,
	readRunBaseSha,
	writeRunBaseSha,
} from "../../lib/lean-run/base-sha.ts";
import { useTempDir } from "../helpers/fs.ts";

const repo = useTempDir("lean-base-sha-");
const outside = useTempDir("lean-base-sha-outside-");

function git(...args: string[]): void {
	execFileSync("git", args, { cwd: repo.path });
}

describe("run base sha marker", () => {
	beforeEach(() => {
		git("init", "-q", "-b", "main");
		git("config", "user.name", "Test");
		git("config", "user.email", "test@example.com");
		git("commit", "-q", "--allow-empty", "--no-verify", "-m", "base");
	});

	test("reads back the base written for a worktree", async () => {
		await writeRunBaseSha({ worktree: repo.path, baseSha: "abc1234" });

		await expect(readRunBaseSha({ worktree: repo.path })).resolves.toBe(
			"abc1234",
		);
	});

	test("reads nothing once the run clears its base", async () => {
		await writeRunBaseSha({ worktree: repo.path, baseSha: "abc1234" });
		await clearRunBaseSha({ worktree: repo.path });

		await expect(
			readRunBaseSha({ worktree: repo.path }),
		).resolves.toBeUndefined();
	});

	test("keeps each linked worktree's base separate", async () => {
		const linked = join(outside.path, "linked");
		git("worktree", "add", "-q", "--detach", linked);
		await writeRunBaseSha({ worktree: linked, baseSha: "linked1" });

		await expect(readRunBaseSha({ worktree: linked })).resolves.toBe("linked1");
		await expect(
			readRunBaseSha({ worktree: repo.path }),
		).resolves.toBeUndefined();
	});

	test("reads nothing outside a git worktree", async () => {
		await expect(
			readRunBaseSha({ worktree: outside.path }),
		).resolves.toBeUndefined();
	});
});
