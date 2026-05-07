import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import { generateBashRunner } from "../../lib/driver/driver-script.ts";
import { useTempDir } from "../helpers/fs.ts";

const execFileAsync = promisify(execFile);
const temp = useTempDir("driver-script-test-");

describe("driver-script generateBashRunner", () => {
	test("returns the expected bash runner shape", () => {
		const script = generateBashRunner("/project/missions/run");

		expect(script).toMatchInlineSnapshot(`
			"#!/usr/bin/env bash
			set -uo pipefail
			WORKDIR="$(cd "$(dirname "$0")" && pwd)"
			trap 'rm -f "$WORKDIR/run.pid"' EXIT
			exec "$WORKDIR/bin/cosmonauts-drive-step" --workdir "$WORKDIR"
			"
		`);
		expect(script).toContain(`trap 'rm -f "$WORKDIR/run.pid"' EXIT`);
		expect(script).not.toContain("run.completion.json");
		expect(script).toContain(
			`exec "$WORKDIR/bin/cosmonauts-drive-step" --workdir "$WORKDIR"`,
		);
	});

	test("passes bash syntax validation from a path with spaces and special characters", async () => {
		const workdir = join(
			temp.path,
			"run dir with spaces [x] $HOME 'quote' & more",
		);
		await mkdir(workdir, { recursive: true });

		const scriptPath = join(workdir, "runner.sh");
		await writeFile(scriptPath, generateBashRunner(workdir), {
			encoding: "utf-8",
			mode: 0o755,
		});

		await expect(
			execFileAsync("bash", ["-n", scriptPath]),
		).resolves.toBeTruthy();
	});
});
