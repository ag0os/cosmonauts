/**
 * The external backend under the child runner's real output cap: a Codex
 * session long enough to pass it still has its usage counted, because the
 * usage event comes last and the cap keeps the tail.
 */
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
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

	test("counts a long Codex session's usage, which comes after the cap", async () => {
		const lines = Math.ceil(DEFAULT_CHILD_OUTPUT_CAP_BYTES / 4_000) + 100;
		const binary = join(dir, "codex-long");
		await writeFile(
			binary,
			[
				"#!/bin/sh",
				"cat >/dev/null",
				'while [ $# -gt 0 ]; do [ "$1" = --output-last-message ] && last=$2; shift; done',
				`printf '%s' '${ENVELOPE}' > "$last"`,
				`perl -e 'my $l = "{\\"type\\":\\"item.completed\\",\\"item\\":{\\"aggregated_output\\":\\"" . ("x" x 3950) . "\\"}}\\n"; print $l for 1..${lines}'`,
				`echo '{"type":"turn.completed","usage":{"input_tokens":500000,"cached_input_tokens":0,"output_tokens":700}}'`,
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
		expect(result.stats?.tokens).toMatchObject({ input: 500_000, output: 700 });
		expect(reports).toEqual([{ tree: "gone", truncated: ["stdout"] }]);
	});
});
