/**
 * The external backend under the child runner's real output cap: a Codex
 * session long enough to pass it still has every turn's usage counted,
 * including turns in the part of stdout the cap drops, because usage is
 * read as stdout streams.
 */
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { AgentPackage } from "../../lib/agent-packages/types.ts";
import { createExternalBuilderBackend } from "../../lib/lean-run/backends/external.ts";
import type { StageProcessExit } from "../../lib/lean-run/types.ts";
import { DEFAULT_CHILD_OUTPUT_CAP_BYTES } from "../../lib/process/run-child.ts";

const ENVELOPE = '{"outcome":"done"}';

const PACKAGE: AgentPackage = {
	schemaVersion: 1,
	packageId: "lean-builder-codex",
	description: "builder",
	systemPrompt: "You are the builder.",
	tools: "coding",
	skills: [],
	projectContext: "omit",
	target: "codex",
	targetOptions: {},
};

describe("createExternalBuilderBackend past the output cap", () => {
	let dir: string;

	beforeAll(async () => {
		dir = await mkdtemp(join(tmpdir(), "lean-output-cap-"));
	});

	afterAll(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	test("counts every turn of a long Codex session, including those the cap drops", async () => {
		/** About `share` of the cap in ~4 KB event lines. */
		const filler = (share: number) =>
			`perl -e 'my $l = "{\\"type\\":\\"item.completed\\",\\"item\\":{\\"aggregated_output\\":\\"" . ("x" x 3950) . "\\"}}\\n"; print $l for 1..${Math.ceil((DEFAULT_CHILD_OUTPUT_CAP_BYTES * share) / 4_000)}'`;
		const turn = (input: number, output: number) =>
			`echo '{"type":"turn.completed","usage":{"input_tokens":${input},"cached_input_tokens":0,"output_tokens":${output}}}'`;
		const binary = join(dir, "codex-long");
		await writeFile(
			binary,
			[
				"#!/bin/sh",
				"cat >/dev/null",
				'while [ $# -gt 0 ]; do [ "$1" = --output-last-message ] && last=$2; shift; done',
				`printf '%s' '${ENVELOPE}' > "$last"`,
				turn(1_000, 10),
				// The spool keeps the first 3/4 of the cap and the last 1/4:
				// a turn at 0.8 of the cap, followed by 0.3 more, is dropped.
				filler(0.8),
				turn(40_000, 300),
				filler(0.3),
				turn(500_000, 700),
				"",
			].join("\n"),
		);
		await chmod(binary, 0o755);
		const reports: StageProcessExit[] = [];
		const backend = createExternalBuilderBackend({
			kind: "codex-cli",
			resolvePackage: async () => PACKAGE,
			binary,
		});

		const result = await backend.run({
			prompt: "p",
			worktree: dir,
			role: "lean/builder",
			processLog: {
				stdout: join(dir, "logs", "codex.stdout.log"),
				stderr: join(dir, "logs", "codex.stderr.log"),
				report: (exit) => reports.push(exit),
			},
		});

		expect(result.text).toBe(ENVELOPE);
		const spool = await readFile(join(dir, "logs", "codex.stdout.log"), "utf8");
		expect(spool).not.toContain('"input_tokens":40000');
		expect(result.stats?.tokens).toMatchObject({
			input: 541_000,
			output: 1_010,
		});
		expect(result.stats?.turns).toBe(3);
		expect(result.stats?.incomplete).toBeUndefined();
		expect(reports).toEqual([{ tree: "gone", truncated: ["stdout"] }]);
	});
});
