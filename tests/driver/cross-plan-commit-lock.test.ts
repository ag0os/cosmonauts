import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import { createCodexBackend } from "../../lib/driver/backends/codex.ts";
import { type DriverDeps, startDetached } from "../../lib/driver/driver.ts";
import type { DriverBusEvent } from "../../lib/driver/event-stream.ts";
import {
	acquirePlanLock,
	getPlanLockPath,
	getRepoCommitLockPath,
} from "../../lib/driver/lock.ts";
import type {
	DriverEvent,
	DriverResult,
	DriverRunSpec,
} from "../../lib/driver/types.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";

const execFileAsync = promisify(execFile);
const temp = useTempDir("cross-plan-commit-lock-test-");

const envKeys = [
	"COSMONAUTS_DRIVER_CODEX_BINARY",
	"COSMONAUTS_TEST_FIRST_TASK_ID",
	"COSMONAUTS_TEST_SECOND_TASK_ID",
	"COSMONAUTS_TEST_FIRST_PLAN_LOCK_PATH",
	"COSMONAUTS_TEST_FIRST_PLAN_LOCK_OBSERVED",
	"COSMONAUTS_TEST_FIRST_BACKEND_SLEEP_SECONDS",
	"COSMONAUTS_TEST_FIRST_COMMIT_HOOK_BEGIN",
	"COSMONAUTS_TEST_COMMIT_HOOK_LOG",
	"COSMONAUTS_TEST_COMMIT_LOCK_PATH",
	"COSMONAUTS_TEST_COMMIT_HOOK_SLEEP_SECONDS",
	"GIT_AUTHOR_DATE",
	"GIT_COMMITTER_DATE",
] as const;
const savedEnv: Partial<Record<(typeof envKeys)[number], string>> = {};

afterEach(() => {
	for (const key of envKeys) {
		if (savedEnv[key] === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = savedEnv[key];
		}
	}
});

describe("cross-plan detached commit serialization", () => {
	test("serializes driver-owned commits across detached runs in one repo", async () => {
		const projectRoot = join(temp.path, "project");
		await setupGitProject(projectRoot);

		const taskManager = new TaskManager(projectRoot);
		await taskManager.init();
		const firstTask = await taskManager.createTask({
			title: "Cross Plan Commit One",
			description: "Write the first deterministic detached output.",
		});
		const secondTask = await taskManager.createTask({
			title: "Cross Plan Commit Two",
			description: "Write the second deterministic detached output.",
		});

		const fakeCodex = await writeFakeCodex(join(temp.path, "bin"));
		const hookLogPath = join(temp.path, "commit-hook.jsonl");
		const firstHookBeginPath = join(temp.path, "first-hook-begin");
		const firstLockObservedPath = join(temp.path, "first-plan-lock.json");
		const firstPlanSlug = "cross-plan-alpha";
		const secondPlanSlug = "cross-plan-beta";
		const firstSpec = createSpec({
			projectRoot,
			planSlug: firstPlanSlug,
			runId: "cross-plan-alpha-run",
			taskId: firstTask.id,
		});
		const secondSpec = createSpec({
			projectRoot,
			planSlug: secondPlanSlug,
			runId: "cross-plan-beta-run",
			taskId: secondTask.id,
		});
		const firstPlanLockPath = getPlanLockPath(firstPlanSlug, projectRoot);
		const repoCommitLockPath = getRepoCommitLockPath(projectRoot);
		await installCommitMsgHook(projectRoot);

		withEnv({
			COSMONAUTS_DRIVER_CODEX_BINARY: fakeCodex,
			COSMONAUTS_TEST_FIRST_TASK_ID: firstTask.id,
			COSMONAUTS_TEST_SECOND_TASK_ID: secondTask.id,
			COSMONAUTS_TEST_FIRST_PLAN_LOCK_PATH: firstPlanLockPath,
			COSMONAUTS_TEST_FIRST_PLAN_LOCK_OBSERVED: firstLockObservedPath,
			COSMONAUTS_TEST_FIRST_BACKEND_SLEEP_SECONDS: "0.45",
			COSMONAUTS_TEST_FIRST_COMMIT_HOOK_BEGIN: firstHookBeginPath,
			COSMONAUTS_TEST_COMMIT_HOOK_LOG: hookLogPath,
			COSMONAUTS_TEST_COMMIT_LOCK_PATH: repoCommitLockPath,
			COSMONAUTS_TEST_COMMIT_HOOK_SLEEP_SECONDS: "0.6",
			GIT_AUTHOR_DATE: "2026-05-05T00:00:00Z",
			GIT_COMMITTER_DATE: "2026-05-05T00:00:00Z",
		});

		const deps = createDeps(taskManager, fakeCodex);
		const firstHandle = startDetached(firstSpec, deps);
		const secondHandle = startDetached(secondSpec, deps);

		await waitForFile(firstLockObservedPath);
		const firstLock = await readJsonLock(firstPlanLockPath);
		const observedFirstLock = await readJsonLock(firstLockObservedPath);
		expect(observedFirstLock).toEqual(firstLock);
		expect(firstLock.runId).toBe(firstSpec.runId);
		expect(typeof firstLock.pid).toBe("number");
		expect(typeof firstLock.startedAt).toBe("string");
		expect(firstLock.pid).not.toBe(process.pid);

		const active = await acquirePlanLock(
			firstPlanSlug,
			"same-plan-rival",
			projectRoot,
		);
		expect(active).toEqual({
			error: "active",
			activeRunId: firstSpec.runId,
			activeAt: firstLock.startedAt,
		});
		expect(await readJsonLock(firstPlanLockPath)).toEqual(firstLock);

		const [firstResult, secondResult] = await Promise.all([
			firstHandle.result,
			secondHandle.result,
		]);
		expect(firstResult).toEqual(completedResult(firstSpec.runId));
		expect(secondResult).toEqual(completedResult(secondSpec.runId));

		const firstEvents = await readEvents(firstSpec.eventLogPath);
		const secondEvents = await readEvents(secondSpec.eventLogPath);
		expect(eventTypes([...firstEvents, ...secondEvents])).not.toContain(
			"spawn_failed",
		);
		expect(commitSubjects(firstEvents)).toEqual([
			`${firstTask.id}: driver task update`,
		]);
		expect(commitSubjects(secondEvents)).toEqual([
			`${secondTask.id}: driver task update`,
		]);
		await expect(
			stat(join(projectRoot, ".git", "index.lock")),
		).rejects.toMatchObject({ code: "ENOENT" });

		const hookEntries = await readHookEntries(hookLogPath);
		const expectedSubjects = [
			`${firstTask.id}: driver task update`,
			`${secondTask.id}: driver task update`,
		];
		expect(hookEntries.map((entry) => entry.stage)).toEqual([
			"begin",
			"end",
			"begin",
			"end",
		]);
		expect(hookEntries.map((entry) => entry.subject)).toEqual([
			expectedSubjects[0],
			expectedSubjects[0],
			expectedSubjects[1],
			expectedSubjects[1],
		]);
		for (const entry of hookEntries) {
			expect(entry.lock.runId).toBe("repo-commit");
			expect(typeof entry.lock.pid).toBe("number");
			expect(typeof entry.lock.startedAt).toBe("string");
			expect(entry.lock.pid).not.toBe(process.pid);
		}
		expect(lockIdentity(hookEntries[0])).toBe(lockIdentity(hookEntries[1]));
		expect(lockIdentity(hookEntries[2])).toBe(lockIdentity(hookEntries[3]));
		expect(lockIdentity(hookEntries[0])).not.toBe(lockIdentity(hookEntries[2]));

		const gitSubjects = await git(projectRoot, [
			"log",
			"--format=%s",
			"--reverse",
			"HEAD~2..HEAD",
		]);
		expect(gitSubjects.trim().split("\n")).toEqual(expectedSubjects);
	}, 120_000);
});

interface CreateSpecOptions {
	projectRoot: string;
	planSlug: string;
	runId: string;
	taskId: string;
}

interface LockContent {
	runId: string;
	pid: number;
	startedAt: string;
}

interface HookEntry {
	stage: "begin" | "end";
	subject: string;
	lock: LockContent;
}

async function setupGitProject(projectRoot: string): Promise<void> {
	await mkdir(projectRoot, { recursive: true });
	await git(projectRoot, ["init", "-b", "main"]);
	await git(projectRoot, ["config", "user.email", "driver@example.com"]);
	await git(projectRoot, ["config", "user.name", "Driver Test"]);
	await writeFile(join(projectRoot, "README.md"), "initial\n", "utf-8");
	await writeFile(
		join(projectRoot, "envelope.md"),
		"Use the fake backend report.",
		"utf-8",
	);
	await git(projectRoot, ["add", "README.md", "envelope.md"]);
	await git(projectRoot, ["commit", "-m", "initial"], {
		GIT_AUTHOR_DATE: "2026-05-04T00:00:00Z",
		GIT_COMMITTER_DATE: "2026-05-04T00:00:00Z",
	});
}

function createSpec(options: CreateSpecOptions): DriverRunSpec {
	const workdir = join(
		options.projectRoot,
		"missions",
		"sessions",
		options.planSlug,
		"runs",
		options.runId,
	);
	return {
		runId: options.runId,
		parentSessionId: `parent-${options.runId}`,
		projectRoot: options.projectRoot,
		planSlug: options.planSlug,
		taskIds: [options.taskId],
		backendName: "codex",
		promptTemplate: { envelopePath: join(options.projectRoot, "envelope.md") },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "driver-commits",
		workdir,
		eventLogPath: join(workdir, "events.jsonl"),
	};
}

function createDeps(
	taskManager: TaskManager,
	fakeCodex: string,
): DriverDeps & { published: DriverBusEvent[] } {
	const published: DriverBusEvent[] = [];
	return {
		taskManager,
		backend: createCodexBackend({ binary: fakeCodex }),
		activityBus: { publish: (event) => published.push(event) },
		cosmonautsRoot: resolve("."),
		published,
	};
}

async function writeFakeCodex(binDir: string): Promise<string> {
	await mkdir(binDir, { recursive: true });
	const path = join(binDir, "fake-codex");
	await writeFile(
		path,
		`#!/usr/bin/env bash
set -euo pipefail
if [ "\${1:-}" = "--version" ]; then
  printf 'fake-codex 1.0.0\\n'
  exit 0
fi
if [ "\${1:-}" != "exec" ] || [ "\${2:-}" != "--full-auto" ]; then
  echo "unsupported fake-codex invocation: $*" >&2
  exit 64
fi
shift 2
summary_path=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o)
      summary_path="$2"
      shift 2
      ;;
    -)
      cat >/dev/null
      shift
      ;;
    *)
      shift
      ;;
  esac
done
if [ -z "$summary_path" ]; then
  echo "missing summary path" >&2
  exit 64
fi
wait_for_file() {
  target="$1"
  for _ in $(seq 1 200); do
    if [ -f "$target" ]; then
      return 0
    fi
    sleep 0.05
  done
  echo "timed out waiting for $target" >&2
  exit 65
}
task_id="$(basename "$summary_path" "-summary.txt")"
project_root="$(git rev-parse --show-toplevel)"
if [ "$task_id" = "\${COSMONAUTS_TEST_FIRST_TASK_ID:-}" ]; then
  cat "$COSMONAUTS_TEST_FIRST_PLAN_LOCK_PATH" > "$COSMONAUTS_TEST_FIRST_PLAN_LOCK_OBSERVED"
  sleep "\${COSMONAUTS_TEST_FIRST_BACKEND_SLEEP_SECONDS:-0.3}"
elif [ "$task_id" = "\${COSMONAUTS_TEST_SECOND_TASK_ID:-}" ]; then
  wait_for_file "$COSMONAUTS_TEST_FIRST_COMMIT_HOOK_BEGIN"
fi
mkdir -p "$project_root/src"
printf '%s\\n' "$task_id" > "$project_root/src/$task_id.txt"
printf '\`\`\`json\\n{"outcome":"success","files":[{"path":"src/%s.txt","change":"modified"}],"verification":[]}\\n\`\`\`\\n' "$task_id" > "$summary_path"
`,
		"utf-8",
	);
	await chmod(path, 0o755);
	return path;
}

async function installCommitMsgHook(projectRoot: string): Promise<void> {
	const hookPath = join(projectRoot, ".git", "hooks", "commit-msg");
	await writeFile(
		hookPath,
		`#!/usr/bin/env bash
set -euo pipefail
log_path="\${COSMONAUTS_TEST_COMMIT_HOOK_LOG:?}"
lock_path="\${COSMONAUTS_TEST_COMMIT_LOCK_PATH:?}"
subject="$(head -n 1 "$1")"
append_entry() {
  stage="$1"
  lock_content=""
  if [ -f "$lock_path" ]; then
    lock_content="$(tr -d '\\n' < "$lock_path")"
  fi
  printf '%s\\t%s\\t%s\\n' "$stage" "$subject" "$lock_content" >> "$log_path"
}
append_entry begin
if [ -n "\${COSMONAUTS_TEST_FIRST_COMMIT_HOOK_BEGIN:-}" ]; then
  : > "$COSMONAUTS_TEST_FIRST_COMMIT_HOOK_BEGIN"
fi
sleep "\${COSMONAUTS_TEST_COMMIT_HOOK_SLEEP_SECONDS:-0.3}"
append_entry end
`,
		"utf-8",
	);
	await chmod(hookPath, 0o755);
}

function completedResult(runId: string): DriverResult {
	return {
		runId,
		outcome: "completed",
		tasksDone: 1,
		tasksBlocked: 0,
	};
}

async function readJsonLock(path: string): Promise<LockContent> {
	return JSON.parse(await readFile(path, "utf-8")) as LockContent;
}

async function readEvents(path: string): Promise<DriverEvent[]> {
	const raw = await readFile(path, "utf-8");
	return raw
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as DriverEvent);
}

function eventTypes(events: DriverEvent[]): DriverEvent["type"][] {
	return events.map((event) => event.type);
}

function commitSubjects(events: DriverEvent[]): string[] {
	return events.flatMap((event) =>
		event.type === "commit_made" ? [event.subject] : [],
	);
}

function lockIdentity(entry: HookEntry | undefined): string {
	if (!entry) {
		throw new Error("missing hook entry");
	}
	return `${entry.lock.runId}:${entry.lock.pid}:${entry.lock.startedAt}`;
}

async function readHookEntries(path: string): Promise<HookEntry[]> {
	const raw = await readFile(path, "utf-8");
	return raw
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [stage, subject, lockRaw] = line.split("\t");
			if (stage !== "begin" && stage !== "end") {
				throw new Error(`invalid hook stage: ${stage}`);
			}
			if (!subject || !lockRaw) {
				throw new Error(`invalid hook entry: ${line}`);
			}
			return {
				stage,
				subject,
				lock: JSON.parse(lockRaw) as LockContent,
			};
		});
}

async function waitForFile(path: string, timeoutMs = 10_000): Promise<void> {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		try {
			await stat(path);
			return;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				throw error;
			}
		}
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error(`timed out waiting for file: ${path}`);
}

async function git(
	cwd: string,
	args: string[],
	env: Record<string, string> = {},
): Promise<string> {
	const { stdout } = await execFileAsync("git", args, {
		cwd,
		env: { ...process.env, ...env },
	});
	return stdout.toString();
}

function withEnv(overrides: Partial<Record<(typeof envKeys)[number], string>>) {
	for (const [key, value] of Object.entries(overrides)) {
		if (!(key in savedEnv)) {
			savedEnv[key as (typeof envKeys)[number]] =
				process.env[key as (typeof envKeys)[number]];
		}
		process.env[key] = value;
	}
}
