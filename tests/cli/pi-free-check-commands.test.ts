/**
 * The check CLI's commands load no Pi module when they run through the real
 * entry, `bin/cosmonauts`, with a non-Pi lean backend or without the
 * architecture narrative. Each runs under bun with a preload that records
 * every `@earendil-works/*` module loaded, start to exit. The lean backends
 * reach stub `claude` and `codex` binaries on PATH, so no model is called.
 */

import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const BIN = join(REPO_ROOT, "bin/cosmonauts");
const RECORDER = join(REPO_ROOT, "tests/helpers/pi-load-recorder.ts");
const PLAN_PATH = "missions/lean/demo/plan.md";
const PLAN = `# Demo

## Approach
Add a greeting.

## Touches
- \`src/greet.ts\`

## Behaviors
- B-1: a caller / greet() / gets "hi"
`;
const BLOCKED =
	'{"outcome":"blocked","summary":"stub","reason":"stub harness"}';
const REVIEWED = '{"outcome":"done","summary":"stub","findings":[]}';
const COMMAND_TIMEOUT_MS = 60_000;

const bunMissing =
	spawnSync("bun", ["--version"], { stdio: "ignore" }).status !== 0;

let dir: string;
let project: string;
let stubs: string;
let piLog: string;
let harnessLog: string;

function git(...args: string[]): void {
	const result = spawnSync("git", args, { cwd: project, encoding: "utf8" });
	if (result.status !== 0) throw new Error(result.stderr);
}

/** Prints `STUB_ENVELOPE`; codex's goes to its last-message file. */
function writeStubs(): void {
	writeFileSync(
		join(stubs, "claude"),
		'#!/bin/sh\necho claude >> "$HARNESS_LOG"\ncat > /dev/null\nprintf \'%s\\n\' "$STUB_ENVELOPE"\n',
	);
	writeFileSync(
		join(stubs, "codex"),
		'#!/bin/sh\necho codex >> "$HARNESS_LOG"\ncat > /dev/null\nwhile [ $# -gt 0 ]; do\n\tif [ "$1" = "--output-last-message" ]; then printf \'%s\' "$STUB_ENVELOPE" > "$2"; fi\n\tshift\ndone\n',
	);
	chmodSync(join(stubs, "claude"), 0o755);
	chmodSync(join(stubs, "codex"), 0o755);
}

interface CliRun {
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
	/** Every Pi module file the process loaded, ESM or CommonJS. */
	readonly piModules: readonly string[];
	/** The stub harnesses the run invoked, in order. */
	readonly harnesses: readonly string[];
}

function runCli(args: readonly string[], envelope = BLOCKED): CliRun {
	const result = spawnSync("bun", ["--preload", RECORDER, BIN, ...args], {
		cwd: project,
		encoding: "utf8",
		timeout: COMMAND_TIMEOUT_MS,
		env: {
			...process.env,
			PATH: `${stubs}:${process.env.PATH ?? ""}`,
			PI_LOAD_LOG: piLog,
			HARNESS_LOG: harnessLog,
			STUB_ENVELOPE: envelope,
		},
	});
	const lines = (path: string) =>
		existsSync(path)
			? readFileSync(path, "utf8").split("\n").filter(Boolean)
			: [];
	if (!existsSync(piLog))
		throw new Error(
			`the Pi load recorder wrote no log:\n${result.stdout}\n${result.stderr}`,
		);
	return {
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
		piModules: JSON.parse(readFileSync(piLog, "utf8")) as string[],
		harnesses: lines(harnessLog),
	};
}

function json(run: CliRun): Record<string, unknown> {
	try {
		return JSON.parse(run.stdout) as Record<string, unknown>;
	} catch {
		throw new Error(`not JSON:\n${run.stdout}\n${run.stderr}`);
	}
}

beforeAll(async () => {
	if (bunMissing) return;
	dir = await mkdtemp(join(tmpdir(), "pi-free-cli-"));
	project = join(dir, "project");
	stubs = join(dir, "stubs");
	piLog = join(dir, "pi-loads.log");
	harnessLog = join(dir, "harness.log");
	mkdirSync(join(project, "missions/lean/demo"), { recursive: true });
	mkdirSync(join(project, "src"));
	mkdirSync(stubs);
	writeStubs();
	git("init", "-q", "-b", "main");
	git("config", "user.email", "test@example.com");
	git("config", "user.name", "Test");
	git("config", "commit.gpgsign", "false");
	writeFileSync(join(project, ".gitignore"), "missions/sessions/\n");
	writeFileSync(join(project, PLAN_PATH), PLAN);
	writeFileSync(join(project, "src/greet.ts"), "export const greet = 1;\n");
	git("add", "-A");
	git("commit", "-q", "-m", "base");
	writeFileSync(
		join(project, "src/greet.ts"),
		"export function greet(): string {\n\treturn 'hi';\n}\n",
	);
});

afterAll(async () => {
	if (dir) await rm(dir, { recursive: true, force: true });
});

beforeEach(() => {
	if (bunMissing) return;
	rmSync(piLog, { force: true });
	rmSync(harnessLog, { force: true });
});

describe.skipIf(bunMissing)("check CLI commands without Pi", () => {
	test(
		"lean check reports on a plan",
		() => {
			const run = runCli(["lean", "check", PLAN_PATH, "--json"]);

			expect(json(run)).toMatchObject({ plan: PLAN_PATH, title: "Demo" });
			expect(run.piModules).toEqual([]);
		},
		COMMAND_TIMEOUT_MS,
	);

	test.each([
		["claude-cli", "claude"],
		["codex-cli", "codex"],
	] as const)(
		"lean build --backend %s runs its builder through the harness",
		(backend, harness) => {
			const run = runCli([
				"lean",
				"build",
				"--backend",
				backend,
				"--plan",
				PLAN_PATH,
				"--json",
			]);

			expect(json(run)).toMatchObject({ status: "blocked" });
			expect(run.harnesses).toContain(harness);
			expect(run.piModules).toEqual([]);
		},
		COMMAND_TIMEOUT_MS,
	);

	test.each([
		["claude-cli", "claude"],
		["codex-cli", "codex"],
	] as const)(
		"lean review --backend %s runs its reviewer through the harness",
		(backend, harness) => {
			const run = runCli(
				["lean", "review", "--backend", backend, "--base", "main", "--json"],
				REVIEWED,
			);

			expect(json(run)).toHaveProperty("findings", []);
			expect(run.harnesses).toEqual([harness]);
			expect(run.piModules).toEqual([]);
		},
		COMMAND_TIMEOUT_MS,
	);

	test(
		"analysis changed-functions lists the changed function",
		() => {
			const run = runCli([
				"analysis",
				"changed-functions",
				"--base",
				"main",
				"--format",
				"json",
			]);

			expect(run.status).toBe(0);
			expect(run.stdout).toContain('"greet"');
			expect(run.piModules).toEqual([]);
		},
		COMMAND_TIMEOUT_MS,
	);

	test(
		"architecture generate --file-graph --no-narrative writes the graph",
		() => {
			const run = runCli([
				"architecture",
				"generate",
				"--file-graph",
				"--no-narrative",
				"--json",
			]);

			expect(run.status).toBe(0);
			expect(json(run).changedFiles).toContain(
				"memory/architecture/graph.json",
			);
			expect(run.piModules).toEqual([]);
		},
		COMMAND_TIMEOUT_MS,
	);

	test(
		"architecture slice prints the touch set",
		() => {
			const run = runCli([
				"architecture",
				"slice",
				"--touch",
				"src/greet.ts",
				"--format",
				"json",
			]);

			expect(run.status).toBe(0);
			expect(json(run).included).toContain("src/greet.ts");
			expect(run.piModules).toEqual([]);
		},
		COMMAND_TIMEOUT_MS,
	);

	test(
		"the recorder sees Pi load for a command that uses it",
		() => {
			const run = runCli(["session", "--help"]);

			expect(run.status).toBe(0);
			expect(run.piModules).not.toEqual([]);
		},
		COMMAND_TIMEOUT_MS,
	);
});
