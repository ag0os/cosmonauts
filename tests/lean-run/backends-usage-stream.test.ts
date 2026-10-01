/**
 * Codex usage is counted from stdout as it streams, before the child
 * runner's spool cap drops anything, and is marked incomplete when part of
 * the stream was never read.
 */
import { existsSync } from "node:fs";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { AgentPackage } from "../../lib/agent-packages/types.ts";
import {
	createExternalBuilderBackend,
	type ProcessRunner,
} from "../../lib/lean-run/backends/external.ts";
import { CodexUsageTap } from "../../lib/lean-run/backends/harness-usage.ts";
import type { StageProcessExit } from "../../lib/lean-run/types.ts";
import { readSpool, runChild } from "../../lib/process/run-child.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("lean-usage-stream-");

const ENVELOPE = '{"outcome":"done"}';
const CAP_BYTES = 512;

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

const INPUT = { prompt: "p", role: "lean/builder" } as const;

function turnLine(input: number, output: number): string {
	return JSON.stringify({
		type: "turn.completed",
		usage: {
			input_tokens: input,
			cached_input_tokens: 0,
			cache_write_input_tokens: 0,
			output_tokens: output,
			reasoning_output_tokens: 0,
		},
	});
}

/** A codex event line of about `bytes` bytes that carries no usage. */
function itemLine(bytes: number): string {
	return JSON.stringify({
		type: "item.completed",
		item: { type: "command_execution", aggregated_output: "x".repeat(bytes) },
	});
}

/** A stand-in `codex` that writes the last-message file and prints `stdout` verbatim. */
async function fakeCodex(name: string, stdout: string): Promise<string> {
	const payload = join(tmp.path, `${name}.out`);
	await writeFile(payload, stdout);
	const binary = join(tmp.path, name);
	await writeFile(
		binary,
		[
			"#!/bin/sh",
			"cat >/dev/null",
			'while [ $# -gt 0 ]; do [ "$1" = --output-last-message ] && last=$2; shift; done',
			`printf '%s' '${ENVELOPE}' > "$last"`,
			`cat '${payload}'`,
			"",
		].join("\n"),
	);
	await chmod(binary, 0o755);
	return binary;
}

/** The shared child runner with a tiny spool cap, streaming stdout to the tap. */
const cappedRunner: ProcessRunner = async (request) => {
	const outcome = await runChild({
		command: request.command,
		args: request.args,
		cwd: request.cwd,
		env: request.env,
		stdin: request.stdin,
		output: request.output,
		outputCapBytes: CAP_BYTES,
		...(request.onStdout ? { onStdout: request.onStdout } : {}),
	});
	return {
		exitCode: outcome.exit.kind === "code" ? outcome.exit.code : null,
		stdout: await readSpool(outcome.stdout),
		stderr: "",
		stdoutBytes: outcome.stdout.bytes,
		process: {
			tree: "gone",
			...(outcome.stdout.truncated ? { truncated: ["stdout" as const] } : {}),
		},
	};
};

function logIn(name: string) {
	const reports: StageProcessExit[] = [];
	return {
		stdout: join(tmp.path, "logs", `${name}.stdout.log`),
		stderr: join(tmp.path, "logs", `${name}.stderr.log`),
		reports,
		report: (exit: StageProcessExit) => reports.push(exit),
	};
}

function codexBackend(binary: string, runProcess: ProcessRunner) {
	return createExternalBuilderBackend({
		kind: "codex-cli",
		resolvePackage: async () => PACKAGE,
		binary,
		runProcess,
	});
}

describe("codex usage counted while stdout streams", () => {
	test("sums every turn, including those in the part of stdout the spool cap dropped", async () => {
		const lines = [
			turnLine(100, 1),
			itemLine(400),
			turnLine(20_000, 50),
			itemLine(400),
			turnLine(30_000, 60),
			itemLine(400),
			turnLine(400, 4),
		];
		const binary = await fakeCodex("codex-many", `${lines.join("\n")}\n`);
		const processLog = logIn("many");

		const result = await codexBackend(binary, cappedRunner).run({
			...INPUT,
			worktree: tmp.path,
			processLog,
		});

		const spool = await readFile(processLog.stdout, "utf8");
		expect(spool).not.toContain('"input_tokens":20000');
		expect(spool).not.toContain('"input_tokens":30000');
		expect(result.stats?.tokens).toMatchObject({
			input: 50_500,
			output: 115,
		});
		expect(result.stats?.turns).toBe(4);
		expect(result.stats?.incomplete).toBeUndefined();
	});

	test("records the run's spool as truncated while the usage stays complete", async () => {
		const lines = [turnLine(10, 1), itemLine(2_000), turnLine(20, 2)];
		const binary = await fakeCodex("codex-cut", `${lines.join("\n")}\n`);
		const processLog = logIn("cut");

		const result = await codexBackend(binary, cappedRunner).run({
			...INPUT,
			worktree: tmp.path,
			processLog,
		});

		expect(processLog.reports).toEqual([
			{ tree: "gone", truncated: ["stdout"] },
		]);
		expect(await readFile(processLog.stdout, "utf8")).toContain(
			"[output truncated:",
		);
		expect(result.stats).toMatchObject({
			tokens: { input: 30, output: 3 },
			turns: 2,
		});
		expect(result.stats?.incomplete).toBeUndefined();
	});

	test("is incomplete when stdout ends inside a JSON line", async () => {
		const cut = turnLine(5_000, 500).slice(0, 40);
		const binary = await fakeCodex(
			"codex-partial",
			`${turnLine(100, 10)}\n${cut}`,
		);

		const result = await codexBackend(binary, cappedRunner).run({
			...INPUT,
			worktree: tmp.path,
		});

		expect(result.stats).toMatchObject({
			tokens: { input: 100, output: 10 },
			incomplete: true,
			incompleteReason: "stdout ended inside a JSON line",
		});
	});

	test("reads a last line that has no newline but is whole", async () => {
		const binary = await fakeCodex(
			"codex-no-newline",
			`${turnLine(100, 10)}\n${turnLine(5, 1)}`,
		);

		const result = await codexBackend(binary, cappedRunner).run({
			...INPUT,
			worktree: tmp.path,
		});

		expect(result.stats?.tokens).toMatchObject({ input: 105, output: 11 });
		expect(result.stats?.incomplete).toBeUndefined();
	});

	test("is incomplete when the runner reports stdout bytes the tap never saw", async () => {
		const stdout = `${turnLine(100, 10)}\n`;
		const binary = await fakeCodex("codex-unseen", stdout);
		const runner: ProcessRunner = async (request) => {
			request.onStdout?.(Buffer.from(stdout));
			await writeFile(
				request.args[request.args.indexOf("--output-last-message") + 1] ?? "",
				ENVELOPE,
			);
			return {
				exitCode: 0,
				stdout,
				stderr: "",
				stdoutBytes: stdout.length + 300,
			};
		};

		const result = await codexBackend(binary, runner).run({
			...INPUT,
			worktree: tmp.path,
		});

		expect(result.stats).toMatchObject({
			tokens: { input: 100, output: 10 },
			incomplete: true,
			incompleteReason: `300 of ${stdout.length + 300} stdout bytes were not observed`,
		});
	});

	test("is incomplete when a runner that does not stream returns a truncated stdout", async () => {
		const binary = await fakeCodex("codex-unused", "");
		const runner: ProcessRunner = async (request) => {
			await writeFile(
				request.args[request.args.indexOf("--output-last-message") + 1] ?? "",
				ENVELOPE,
			);
			return {
				exitCode: 0,
				stdout: `${turnLine(100, 10)}\n[output truncated: 9000 bytes dropped]\n${turnLine(5, 1)}`,
				stderr: "",
				process: { tree: "gone", truncated: ["stdout"] },
			};
		};

		const result = await codexBackend(binary, runner).run({
			...INPUT,
			worktree: tmp.path,
		});

		expect(result.stats).toMatchObject({
			tokens: { input: 105, output: 11 },
			incomplete: true,
			incompleteReason:
				"stdout passed the output cap before its usage was read",
		});
	});
});

describe("CodexUsageTap", () => {
	test("joins a usage line split across chunks, wherever the chunk boundary falls", () => {
		const bytes = Buffer.from(`${turnLine(1_234, 56)}\n${turnLine(1, 1)}\n`);
		for (let at = 1; at < bytes.length; at += 7) {
			const tap = new CodexUsageTap();
			tap.push(bytes.subarray(0, at));
			tap.push(bytes.subarray(at));

			const stats = tap.finish({ durationMs: 0 });

			expect(stats?.tokens).toMatchObject({ input: 1_235, output: 57 });
			expect(stats?.incomplete).toBeUndefined();
		}
	});

	test("is incomplete when the child is killed in the middle of a line", async () => {
		const marker = join(tmp.path, "printed");
		const tap = new CodexUsageTap();
		const controller = new AbortController();
		const run = runChild({
			command: "/bin/sh",
			args: [
				"-c",
				`printf '%s\\n' '${turnLine(100, 10)}'; printf '%s' '{"type":"turn.completed","usage":{"input_'; touch '${marker}'; sleep 30`,
			],
			cwd: tmp.path,
			output: {
				stdout: join(tmp.path, "kill.stdout.log"),
				stderr: join(tmp.path, "kill.stderr.log"),
			},
			onStdout: (chunk) => tap.push(chunk),
			signal: controller.signal,
			graceMs: 100,
		});
		while (!existsSync(marker))
			await new Promise((settle) => setTimeout(settle, 10));
		controller.abort();
		const outcome = await run;

		const stats = tap.finish({ durationMs: 0 });

		expect(outcome.stopped?.kind).toBe("aborted");
		expect(tap.observedBytes).toBe(outcome.stdout.bytes);
		expect(stats).toMatchObject({
			tokens: { input: 100, output: 10 },
			incomplete: true,
			incompleteReason: "stdout ended inside a JSON line",
		});
	});

	test("is incomplete when a usage line is too long to hold", () => {
		const tap = new CodexUsageTap();
		const huge = JSON.stringify({
			type: "turn.completed",
			usage: { input_tokens: 9, output_tokens: 9 },
			padding: "x".repeat(2 * 1024 * 1024),
		});
		tap.push(Buffer.from(`${huge}\n${turnLine(3, 1)}\n`));

		const stats = tap.finish({ durationMs: 0 });

		expect(stats).toMatchObject({
			tokens: { input: 3, output: 1 },
			incomplete: true,
			incompleteReason: "a turn.completed line over 1048576 bytes was not read",
		});
	});

	test("skips a long line that carries no usage without marking anything", () => {
		const tap = new CodexUsageTap();
		tap.push(Buffer.from(`${itemLine(2 * 1024 * 1024)}\n${turnLine(3, 1)}\n`));

		const stats = tap.finish({ durationMs: 0 });

		expect(stats?.tokens).toMatchObject({ input: 3, output: 1 });
		expect(stats?.incomplete).toBeUndefined();
	});

	test("reports incomplete usage with nothing counted when no turn was read", () => {
		const tap = new CodexUsageTap();
		tap.push(Buffer.from('{"type":"turn.comp'));

		expect(tap.finish({ durationMs: 0 })).toMatchObject({
			tokens: { input: 0, output: 0, total: 0 },
			turns: 0,
			incomplete: true,
		});
	});
});
