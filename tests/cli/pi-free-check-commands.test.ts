/** Real independent analysis/architecture CLI commands stay Pi-free; the recorder also proves it detects an intentional Pi load. */

import { spawnSync } from "node:child_process";
import {
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
const COMMAND_TIMEOUT_MS = 60_000;

const bunMissing =
	spawnSync("bun", ["--version"], { stdio: "ignore" }).status !== 0;

let dir: string;
let project: string;
let piLog: string;

function git(...args: string[]): void {
	const result = spawnSync("git", args, { cwd: project, encoding: "utf8" });
	if (result.status !== 0) throw new Error(result.stderr);
}

interface CliRun {
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
	/** Every Pi module file the process loaded, ESM or CommonJS. */
	readonly piModules: readonly string[];
}

function runCli(args: readonly string[]): CliRun {
	const result = spawnSync("bun", ["--preload", RECORDER, BIN, ...args], {
		cwd: project,
		encoding: "utf8",
		timeout: COMMAND_TIMEOUT_MS,
		env: {
			...process.env,
			HOME: join(dir, "home"),
			PI_CODING_AGENT_DIR: join(dir, "home", ".pi", "agent"),
			PI_LOAD_LOG: piLog,
		},
	});
	if (!existsSync(piLog))
		throw new Error(
			`the Pi load recorder wrote no log:\n${result.stdout}\n${result.stderr}`,
		);
	return {
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
		piModules: JSON.parse(readFileSync(piLog, "utf8")) as string[],
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
	piLog = join(dir, "pi-loads.log");
	mkdirSync(project);
	mkdirSync(join(project, "src"));
	git("init", "-q", "-b", "main");
	git("config", "user.email", "test@example.com");
	git("config", "user.name", "Test");
	git("config", "commit.gpgsign", "false");
	writeFileSync(join(project, ".gitignore"), "missions/sessions/\n");
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
});

describe.skipIf(bunMissing)("check CLI commands without Pi", () => {
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
