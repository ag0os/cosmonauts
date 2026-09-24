import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { runQualityReviewChecks } from "../../lib/orchestration/quality-review-checks.ts";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

it("runs configured argv once with the literal base and records failed output", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "qm-checks-"));
	roots.push(cwd);
	const result = await runQualityReviewChecks({
		cwd,
		base: "a".repeat(40),
		checks: [
			{
				id: "failing",
				command: process.execPath,
				args: [
					"-e",
					"process.stderr.write(process.argv[1]); process.exit(7)",
					"{base}",
				],
			},
		],
	});
	expect(result).toMatchObject([
		{
			id: "failing",
			argv: [process.execPath, "-e", expect.any(String), "a".repeat(40)],
			exitCode: 7,
		},
	]);
	expect(result[0]?.output).toContain("a".repeat(40));
	expect(result[0]?.durationMs).toBeGreaterThanOrEqual(0);
});

it("does not run a shell when a configured argument contains shell syntax", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "qm-checks-"));
	roots.push(cwd);
	const result = await runQualityReviewChecks({
		cwd,
		base: "b".repeat(40),
		checks: [
			{
				id: "literal",
				command: process.execPath,
				args: [
					"-e",
					"process.stdout.write(process.argv[1])",
					"$(touch forbidden)",
				],
			},
		],
	});
	expect(result[0]?.output).toBe("$(touch forbidden)");
});

it("bounds a check whose grandchild inherits stdout", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "qm-checks-tree-"));
	roots.push(cwd);
	const started = Date.now();
	const [result] = await runQualityReviewChecks({
		cwd,
		base: "a".repeat(40),
		checks: [
			{
				id: "tree",
				command: process.execPath,
				args: [
					"-e",
					"require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio: ['ignore', 'inherit', 'inherit']}); setInterval(() => {}, 1000)",
				],
				timeoutMs: 200,
			},
		],
	});
	expect(result?.timedOut).toBe(true);
	expect(Date.now() - started).toBeLessThan(2000);
});
it("does not inherit runner-injected Codex arguments into configured checks", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "qm-checks-env-"));
	try {
		const prior = process.env.COSMONAUTS_DRIVER_CODEX_ARGS;
		process.env.COSMONAUTS_DRIVER_CODEX_ARGS = "--injected";
		try {
			const [result] = await runQualityReviewChecks({
				cwd,
				base: "a".repeat(40),
				checks: [
					{
						id: "env",
						command: process.execPath,
						args: [
							"-e",
							"process.stdout.write(process.env.COSMONAUTS_DRIVER_CODEX_ARGS ?? 'clean')",
						],
					},
				],
			});
			expect(result?.output).toBe("clean");
		} finally {
			if (prior === undefined) delete process.env.COSMONAUTS_DRIVER_CODEX_ARGS;
			else process.env.COSMONAUTS_DRIVER_CODEX_ARGS = prior;
		}
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});
