import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
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
import type { DriverRunSpec } from "../../lib/driver/types.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("drive-on-graph-routing-");
const PLAN_SLUG = "durable-frontend-migration";

const savedCodexBinary = process.env.COSMONAUTS_DRIVER_CODEX_BINARY;

describe("Drive-on-graph routing", () => {
	// @cosmo-behavior plan:durable-frontend-migration#B-016
	test("runs inline Drive through runDriveOnGraph in the host process", async () => {
		const fixture = await setupFixture("inline");

		const result = await runInline(fixture.spec, fixture.deps).result;

		expect(result).toEqual({
			runId: fixture.spec.runId,
			outcome: "completed",
			tasksDone: 1,
			tasksBlocked: 0,
			completedAt: expect.any(String),
		});
		await expectArtifact(fixture.spec.workdir, "spec.json");
		await expectArtifact(fixture.spec.workdir, "task-queue.txt");
		await expectArtifact(fixture.spec.workdir, "events.jsonl");
		await expectArtifact(fixture.spec.workdir, "run.inline.json");
		await expectArtifact(fixture.spec.workdir, "graph.json");
		await expectArtifact(
			fixture.spec.workdir,
			join("steps", fixture.taskId, "step.json"),
		);
		await expectArtifact(
			fixture.spec.workdir,
			join("steps", `finalizer-task-status-${fixture.taskId}`, "step.json"),
		);
		await expectArtifact(fixture.spec.workdir, "run.completion.json");
		expect(await readJson(join(fixture.spec.workdir, "spec.json"))).toEqual(
			fixture.spec,
		);
		expect(
			await readFile(join(fixture.spec.workdir, "task-queue.txt"), "utf-8"),
		).toBe(`${fixture.taskId}\n`);

		const graph = (await readJson(
			join(fixture.spec.workdir, "graph.json"),
		)) as {
			steps: Array<{ id: string; kind: string }>;
		};
		expect(graph.steps.map((step) => [step.id, step.kind])).toEqual([
			[fixture.taskId, "drive"],
			[`finalizer-task-status-${fixture.taskId}`, "finalizer"],
		]);
		expect(
			await readJson(join(fixture.spec.workdir, "run.completion.json")),
		).toEqual(result);
		expect(
			(await readLegacyEvents(fixture.spec.eventLogPath)).map(
				(event) => event.type,
			),
		).toEqual(
			expect.arrayContaining([
				"run_started",
				"task_started",
				"spawn_completed",
				"task_done",
				"run_completed",
			]),
		);
	});

	// @cosmo-behavior plan:durable-frontend-migration#B-017
	test("runs detached Drive by executing runDriveOnGraph inside the frozen runner", async () => {
		const fixture = await setupFixture("detached");
		const fakeCodex = await writeFakeCodex(join(temp.path, "detached-bin"));
		process.env.COSMONAUTS_DRIVER_CODEX_BINARY = fakeCodex;
		try {
			const handle = startDetached(fixture.spec, {
				...fixture.deps,
				cosmonautsRoot: fixture.projectRoot,
			});

			await waitForFile(join(fixture.spec.workdir, "run.pid"));
			const pidRecord = (await readJson(
				join(fixture.spec.workdir, "run.pid"),
			)) as {
				pid: number;
				cosmonautsPath: string;
			};
			const result = await handle.result;

			expect(result).toEqual({
				runId: fixture.spec.runId,
				outcome: "completed",
				tasksDone: 1,
				tasksBlocked: 0,
				completedAt: expect.any(String),
			});
			await expectArtifact(fixture.spec.workdir, "run.sh");
			expect(pidRecord.pid).toEqual(expect.any(Number));
			expect(pidRecord.pid).not.toBe(process.pid);
			expect(pidRecord.cosmonautsPath).toBe(
				join(fixture.spec.workdir, "bin", "cosmonauts-drive-step"),
			);
			await expectArtifact(
				fixture.spec.workdir,
				join("bin", "cosmonauts-drive-step"),
			);
			await expectArtifact(fixture.spec.workdir, "spec.json");
			await expectArtifact(fixture.spec.workdir, "task-queue.txt");
			await expectArtifact(fixture.spec.workdir, "events.jsonl");
			await expectArtifact(fixture.spec.workdir, "graph.json");
			await expectArtifact(
				fixture.spec.workdir,
				join("steps", fixture.taskId, "step.json"),
			);
			await expectArtifact(fixture.spec.workdir, "run.completion.json");

			const runStepSource = await readFile("lib/driver/run-step.ts", "utf-8");
			expect(runStepSource).toContain("runDriveOnGraph");
			expect(runStepSource).not.toContain("runRunLoop(spec");
			expect(
				await readJson(join(fixture.spec.workdir, "run.completion.json")),
			).toEqual(result);
		} finally {
			if (savedCodexBinary === undefined) {
				delete process.env.COSMONAUTS_DRIVER_CODEX_BINARY;
			} else {
				process.env.COSMONAUTS_DRIVER_CODEX_BINARY = savedCodexBinary;
			}
		}
	}, 30_000);
});

interface Fixture {
	projectRoot: string;
	taskId: string;
	spec: DriverRunSpec;
	deps: DriverDeps & { published: DriverBusEvent[] };
}

async function setupFixture(name: string): Promise<Fixture> {
	const projectRoot = join(temp.path, name, "project");
	const runId = `run-${name}`;
	const workdir = join(
		projectRoot,
		"missions",
		"sessions",
		PLAN_SLUG,
		"runs",
		runId,
	);
	await mkdir(workdir, { recursive: true });
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init({ zeroPadding: 0 });
	const task = await taskManager.createTask({
		title: `${name} Drive-on-graph fixture`,
		description: "Exercise Drive graph routing.",
	});
	const envelopePath = join(projectRoot, "envelope.md");
	await writeFile(envelopePath, "Use the fake backend report.", "utf-8");
	const spec: DriverRunSpec = {
		runId,
		parentSessionId: `parent-${name}`,
		projectRoot,
		planSlug: PLAN_SLUG,
		taskIds: [task.id],
		backendName: "codex",
		promptTemplate: { envelopePath },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "no-commit",
		stateCommitPolicy: "none",
		workdir,
		eventLogPath: join(workdir, "events.jsonl"),
	};
	const published: DriverBusEvent[] = [];
	return {
		projectRoot,
		taskId: task.id,
		spec,
		deps: {
			taskManager,
			backend: createBackend(),
			activityBus: { publish: (event) => published.push(event) },
			cosmonautsRoot: resolve("."),
			published,
		},
	};
}

function createBackend(): Backend {
	return {
		name: "codex",
		capabilities: { canCommit: false, isolatedFromHostSource: true },
		livenessCheck() {
			return {
				argv: [process.execPath, "-e", "process.exit(0)"],
				expectExitZero: true,
			};
		},
		run: async () => successfulBackendResult(),
	};
}

function successfulBackendResult(): BackendRunResult {
	return {
		exitCode: 0,
		stdout: [
			"```json",
			JSON.stringify({
				outcome: "success",
				files: [],
				verification: [],
				notes: "graph routing success",
			}),
			"```",
		].join("\n"),
		durationMs: 1,
	};
}

async function writeFakeCodex(binDir: string): Promise<string> {
	await mkdir(binDir, { recursive: true });
	const path = join(binDir, "fake-codex");
	await writeFile(
		path,
		`#!/usr/bin/env bash
set -euo pipefail
summary_path=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o)
      summary_path="$2"
      shift 2
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
printf '\`\`\`json\\n{"outcome":"success","files":[],"verification":[],"notes":"detached graph routing success"}\\n\`\`\`\\n' > "$summary_path"
`,
		"utf-8",
	);
	await chmod(path, 0o755);
	return path;
}

async function expectArtifact(
	workdir: string,
	relativePath: string,
): Promise<void> {
	await expect(stat(join(workdir, relativePath))).resolves.toBeTruthy();
}

async function readJson(path: string): Promise<unknown> {
	return JSON.parse(await readFile(path, "utf-8"));
}

async function readLegacyEvents(
	path: string,
): Promise<Array<{ type: string }>> {
	return (await readFile(path, "utf-8"))
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as { type: string });
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
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(`Timed out waiting for ${path}`);
}
