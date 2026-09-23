/**
 * A Cancelled task through the shipped CLI, one process per command, so every
 * read comes from what an earlier process persisted.
 */

import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { useTempDir } from "../../helpers/fs.ts";

const BIN = resolve(import.meta.dirname, "../../../bin/cosmonauts");
const tmp = useTempDir("cancelled-status-cli-");

function cosmonauts(...args: string[]): string {
	const result = spawnSync("bun", [BIN, ...args], {
		cwd: tmp.path,
		encoding: "utf-8",
	});
	if (result.status !== 0) {
		throw new Error(
			`cosmonauts ${args.join(" ")} exited ${result.status}: ${result.stderr}`,
		);
	}
	return result.stdout;
}

function readyTaskIds(): string[] {
	const tasks = JSON.parse(cosmonauts("task", "list", "--ready", "--json")) as {
		id: string;
	}[];
	return tasks.map((task) => task.id);
}

describe("a Cancelled task through the CLI", () => {
	test("persists, keeps its dependent blocked, and lets its plan archive", async () => {
		cosmonauts("plan", "create", "--slug", "superseded", "--title", "Old");
		cosmonauts("task", "create", "Superseded work", "-l", "plan:superseded");
		cosmonauts("task", "create", "Follow-on", "--depends-on", "TASK-001");

		cosmonauts("task", "edit", "TASK-001", "--status", "cancelled");

		const viewed = JSON.parse(
			cosmonauts("task", "view", "TASK-001", "--json"),
		) as { status: string };
		expect(viewed.status).toBe("Cancelled");
		expect(readyTaskIds()).not.toContain("TASK-002");

		cosmonauts("plan", "edit", "superseded", "--status", "completed");
		cosmonauts("plan", "archive", "superseded");

		await access(join(tmp.path, "missions/archive/plans/superseded"));
		expect(readyTaskIds()).not.toContain("TASK-002");
	}, 30_000);
});
