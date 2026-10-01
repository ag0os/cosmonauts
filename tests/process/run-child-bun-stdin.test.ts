/**
 * runChild under Bun's stdin shape: Bun gives a child spawned with an ignored
 * stdin a non-null, never-finished `child.stdin`, where Node gives null. The
 * suite runs under Node, so spawn is wrapped to hand back Bun's shape.
 */
import type * as ChildProcessModule from "node:child_process";
import { join } from "node:path";
import { Writable } from "node:stream";
import { describe, expect, test, vi } from "vitest";
import { runChild } from "../../lib/process/run-child.ts";
import { useTempDir } from "../helpers/fs.ts";

vi.mock("node:child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof ChildProcessModule>();
	const spawn = ((...args: Parameters<typeof actual.spawn>) => {
		const child = actual.spawn(...args);
		const options = args[2] as ChildProcessModule.SpawnOptions | undefined;
		const stdio = options?.stdio;
		if (Array.isArray(stdio) && stdio[0] === "ignore")
			child.stdin = new Writable({
				write: (_chunk, _encoding, callback) => callback(),
			});
		return child;
	}) as typeof actual.spawn;
	return { ...actual, spawn };
});

const tmp = useTempDir("run-child-bun-stdin-");

describe("runChild with Bun's stdin shape", () => {
	test("a child given no stdin leaves no stdin note, although its stdin stream is not null", async () => {
		const outcome = await runChild({
			command: "sh",
			args: ["-c", "echo out"],
			cwd: tmp.path,
			output: {
				stdout: join(tmp.path, "child.stdout.log"),
				stderr: join(tmp.path, "child.stderr.log"),
			},
		});

		expect(outcome.exit).toEqual({ kind: "code", code: 0 });
		expect(outcome.notes).toEqual([]);
	});
});
