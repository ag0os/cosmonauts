import { execFile } from "node:child_process";
import {
	appendFile,
	chmod,
	cp,
	mkdir,
	readFile,
	writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import { createCodexBackend } from "../../lib/driver/backends/codex.ts";
import type {
	Backend,
	BackendRunResult,
} from "../../lib/driver/backends/types.ts";
import {
	type DriverDeps,
	runInline,
	startDetached,
} from "../../lib/driver/driver.ts";
import type { DriverBusEvent } from "../../lib/driver/event-stream.ts";
import type {
	DriverEvent,
	DriverResult,
	DriverRunSpec,
} from "../../lib/driver/types.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";

const execFileAsync = promisify(execFile);
const temp = useTempDir("driver-parity-test-");
const planSlug = "driver-parity";

const envKeys = [
	"COSMONAUTS_DRIVER_CODEX_BINARY",
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

describe("driver inline vs detached parity", () => {
	test("keeps behavioral output equivalent while detached commits differ by metadata", async () => {
		const fakeCodex = await writeFakeCodex(join(temp.path, "bin"));
		const baseRoot = join(temp.path, "base-project");
		const taskIds = await setupBaseProject(baseRoot);
		const inlineRoot = join(temp.path, "inline-project");
		const detachedRoot = join(temp.path, "detached-project");
		await cp(baseRoot, inlineRoot, { recursive: true });
		await cp(baseRoot, detachedRoot, { recursive: true });
		await configureGit(inlineRoot);
		await configureGit(detachedRoot);

		const inlineRun = await withEnv(commitEnv("2026-05-04T00:00:00Z"), () =>
			runInlineFixture(inlineRoot, taskIds),
		);
		const detachedRun = await withEnv(
			{
				...commitEnv("2026-05-05T00:00:00Z"),
				COSMONAUTS_DRIVER_CODEX_BINARY: fakeCodex,
			},
			() => runDetachedFixture(detachedRoot, taskIds, fakeCodex),
		);

		expect(inlineRun.result).toMatchObject({
			outcome: "completed",
			tasksDone: 2,
			tasksBlocked: 0,
		});
		expect(detachedRun.result).toMatchObject({
			outcome: "completed",
			tasksDone: 2,
			tasksBlocked: 0,
		});

		const inlineEvents = await readEvents(inlineRun.spec.eventLogPath);
		const detachedEvents = await readEvents(detachedRun.spec.eventLogPath);

		expect(normalizeEvents(inlineEvents)).toEqual(
			normalizeEvents(detachedEvents),
		);

		const expectedTransitions = taskIds.flatMap((taskId) => [
			{ taskId, status: "To Do" },
			{ taskId, status: "In Progress" },
			{ taskId, status: "Done" },
		]);
		const inlineTransitions = deriveTaskStatusTransitions(inlineEvents);
		const detachedTransitions = deriveTaskStatusTransitions(detachedEvents);
		expect(inlineTransitions).toEqual(detachedTransitions);
		expect(inlineTransitions).toEqual(expectedTransitions);

		expect(commitSubjects(inlineEvents)).toEqual(
			commitSubjects(detachedEvents),
		);

		const inlineTree = await git(inlineRoot, ["rev-parse", "HEAD^{tree}"]);
		const detachedTree = await git(detachedRoot, ["rev-parse", "HEAD^{tree}"]);
		expect(inlineTree.trim()).toBe(detachedTree.trim());

		const inlineCommitShas = commitShas(inlineEvents);
		const detachedCommitShas = commitShas(detachedEvents);
		expect(inlineCommitShas).toHaveLength(2);
		expect(detachedCommitShas).toHaveLength(2);
		expect(inlineCommitShas).not.toEqual(detachedCommitShas);
		for (const [index, sha] of inlineCommitShas.entries()) {
			expect(sha).not.toBe(detachedCommitShas[index]);
		}
	}, 120_000);
});

interface RunFixtureResult {
	result: DriverResult;
	spec: DriverRunSpec;
}

async function setupBaseProject(projectRoot: string): Promise<string[]> {
	await mkdir(projectRoot, { recursive: true });
	await initGitRepo(projectRoot);

	const taskManager = new TaskManager(projectRoot);
	await taskManager.init();
	const first = await taskManager.createTask({
		title: "Parity Task One",
		description: "Append the first deterministic driver output line.",
	});
	const second = await taskManager.createTask({
		title: "Parity Task Two",
		description: "Append the second deterministic driver output line.",
	});

	await writeFile(join(projectRoot, "README.md"), "initial\n", "utf-8");
	await writeFile(
		join(projectRoot, "envelope.md"),
		"Use the fixture backend and report success.",
		"utf-8",
	);
	await git(projectRoot, ["add", "README.md", "envelope.md"]);
	await git(projectRoot, ["commit", "-m", "initial"], {
		GIT_AUTHOR_DATE: "2026-05-03T00:00:00Z",
		GIT_COMMITTER_DATE: "2026-05-03T00:00:00Z",
	});

	return [first.id, second.id];
}

async function runInlineFixture(
	projectRoot: string,
	taskIds: string[],
): Promise<RunFixtureResult> {
	const spec = createSpec(projectRoot, "parity-inline", taskIds);
	await mkdir(spec.workdir, { recursive: true });
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init();
	const published: DriverBusEvent[] = [];
	const deps: DriverDeps = {
		taskManager,
		backend: createFixtureBackend(projectRoot),
		activityBus: { publish: (event) => published.push(event) },
		cosmonautsRoot: projectRoot,
	};

	const result = await runInline(spec, deps).result;
	return { result, spec };
}

async function runDetachedFixture(
	projectRoot: string,
	taskIds: string[],
	fakeCodex: string,
): Promise<RunFixtureResult> {
	const spec = createSpec(projectRoot, "parity-detached", taskIds);
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init();
	const published: DriverBusEvent[] = [];
	const deps: DriverDeps = {
		taskManager,
		backend: createCodexBackend({ binary: fakeCodex }),
		activityBus: { publish: (event) => published.push(event) },
		cosmonautsRoot: resolve("."),
	};

	const result = await startDetached(spec, deps).result;
	return { result, spec };
}

function createSpec(
	projectRoot: string,
	runId: string,
	taskIds: string[],
): DriverRunSpec {
	const workdir = join(
		projectRoot,
		"missions",
		"sessions",
		planSlug,
		"runs",
		runId,
	);
	return {
		runId,
		parentSessionId: `parent-${runId}`,
		projectRoot,
		planSlug,
		taskIds,
		backendName: "codex",
		promptTemplate: { envelopePath: join(projectRoot, "envelope.md") },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "driver-commits",
		workdir,
		eventLogPath: join(workdir, "events.jsonl"),
	};
}

function createFixtureBackend(projectRoot: string): Backend {
	return {
		name: "codex",
		capabilities: { canCommit: false, isolatedFromHostSource: true },
		async run(invocation): Promise<BackendRunResult> {
			await applyTaskChange(projectRoot, invocation.taskId);
			return {
				exitCode: 0,
				stdout: fencedSuccessReport(),
				durationMs: 1,
			};
		},
	};
}

async function applyTaskChange(
	projectRoot: string,
	taskId: string,
): Promise<void> {
	await mkdir(join(projectRoot, "src"), { recursive: true });
	await appendFile(
		join(projectRoot, "src", "driver-output.txt"),
		`${taskId}\n`,
		"utf-8",
	);
}

function fencedSuccessReport(): string {
	return [
		"```json",
		JSON.stringify({
			outcome: "success",
			files: [{ path: "src/driver-output.txt", change: "modified" }],
			verification: [],
		}),
		"```",
		"",
	].join("\n");
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
task_id="$(basename "$summary_path" "-summary.txt")"
project_root="$(git rev-parse --show-toplevel)"
mkdir -p "$project_root/src"
printf '%s\\n' "$task_id" >> "$project_root/src/driver-output.txt"
printf '\`\`\`json\\n{"outcome":"success","files":[{"path":"src/driver-output.txt","change":"modified"}],"verification":[]}\\n\`\`\`\\n' > "$summary_path"
`,
		"utf-8",
	);
	await chmod(path, 0o755);
	return path;
}

async function configureGit(projectRoot: string): Promise<void> {
	await git(projectRoot, ["config", "user.email", "driver@example.com"]);
	await git(projectRoot, ["config", "user.name", "Driver Test"]);
}

async function initGitRepo(projectRoot: string): Promise<void> {
	await git(projectRoot, ["init", "-b", "main"]);
	await configureGit(projectRoot);
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

function normalizeEvents(events: DriverEvent[]): NormalizedEvent[] {
	return events.map((event) => {
		const normalized: NormalizedEvent = { type: event.type };
		if ("taskId" in event) {
			normalized.taskId = event.taskId;
		}
		if ("status" in event) {
			normalized.status = event.status;
		}
		return normalized;
	});
}

interface NormalizedEvent {
	type: DriverEvent["type"];
	taskId?: string;
	status?: string;
}

function deriveTaskStatusTransitions(
	events: DriverEvent[],
): StatusTransition[] {
	const transitions: StatusTransition[] = [];
	for (const event of events) {
		if (event.type === "task_started") {
			transitions.push({ taskId: event.taskId, status: "To Do" });
		}
		if (event.type === "spawn_started") {
			transitions.push({ taskId: event.taskId, status: "In Progress" });
		}
		if (event.type === "task_done") {
			transitions.push({ taskId: event.taskId, status: "Done" });
		}
	}
	return transitions;
}

interface StatusTransition {
	taskId: string;
	status: "To Do" | "In Progress" | "Done";
}

function commitSubjects(events: DriverEvent[]): string[] {
	return events.flatMap((event) =>
		event.type === "commit_made" ? [event.subject] : [],
	);
}

function commitShas(events: DriverEvent[]): string[] {
	return events.flatMap((event) =>
		event.type === "commit_made" ? [event.sha] : [],
	);
}

async function readEvents(path: string): Promise<DriverEvent[]> {
	const raw = await readFile(path, "utf-8");
	return raw
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as DriverEvent);
}

function commitEnv(date: string): Record<string, string> {
	return {
		GIT_AUTHOR_DATE: date,
		GIT_COMMITTER_DATE: date,
	};
}

async function withEnv<T>(
	overrides: Partial<Record<(typeof envKeys)[number], string>>,
	fn: () => Promise<T>,
): Promise<T> {
	for (const [key, value] of Object.entries(overrides)) {
		setEnv(key as (typeof envKeys)[number], value);
	}
	try {
		return await fn();
	} finally {
		for (const key of Object.keys(overrides) as (typeof envKeys)[number][]) {
			restoreEnv(key);
		}
	}
}

function setEnv(key: (typeof envKeys)[number], value: string): void {
	if (!(key in savedEnv)) {
		savedEnv[key] = process.env[key];
	}
	process.env[key] = value;
}

function restoreEnv(key: (typeof envKeys)[number]): void {
	if (savedEnv[key] === undefined) {
		delete process.env[key];
	} else {
		process.env[key] = savedEnv[key];
	}
}
