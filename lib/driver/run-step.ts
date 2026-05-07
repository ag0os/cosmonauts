import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { MessageBus } from "../orchestration/message-bus.ts";
import { TaskManager } from "../tasks/task-manager.ts";
import { writeFileAtomically } from "./atomic-file.ts";
import { resolveBackend } from "./backends/registry.ts";
import { createEventSink } from "./event-stream.ts";
import { acquirePlanLock } from "./lock.ts";
import { runRunLoop } from "./run-run-loop.ts";
import type { DriverResult, DriverRunSpec, LockHandle } from "./types.ts";

const COMPLETION_FILENAME = "run.completion.json";

async function main(): Promise<number> {
	const workdir = parseWorkdir();
	const spec = await readRunSpec(workdir);

	const lock = await acquirePlanLock(
		spec.planSlug,
		spec.runId,
		spec.projectRoot,
	);
	if ("error" in lock) {
		console.error(
			`Plan lock active: runId=${lock.activeRunId} activeAt=${lock.activeAt}`,
		);
		return 1;
	}

	const result = await runWithLock(spec, lock);
	return result.outcome === "completed" ? 0 : 1;
}

function parseWorkdir(): string {
	const { values } = parseArgs({
		options: {
			workdir: { type: "string" },
		},
		strict: true,
	});

	if (!values.workdir) {
		throw new Error("Missing required --workdir");
	}

	return values.workdir;
}

async function readRunSpec(workdir: string): Promise<DriverRunSpec> {
	const raw = await readFile(join(workdir, "spec.json"), "utf-8");
	return JSON.parse(raw) as DriverRunSpec;
}

async function runWithLock(
	spec: DriverRunSpec,
	lock: LockHandle,
): Promise<DriverResult> {
	try {
		const backend = resolveBackend(spec.backendName, {
			codexBinary: process.env.COSMONAUTS_DRIVER_CODEX_BINARY,
			claudeBinary: process.env.COSMONAUTS_DRIVER_CLAUDE_BINARY,
		});
		const taskManager = new TaskManager(spec.projectRoot);
		await taskManager.init();

		const localBus = new MessageBus();
		const eventSink = createEventSink({
			logPath: spec.eventLogPath,
			runId: spec.runId,
			parentSessionId: spec.parentSessionId,
			activityBus: localBus,
		});
		const controller = new AbortController();

		const result = await runRunLoop(spec, {
			taskManager,
			backend,
			eventSink,
			parentSessionId: spec.parentSessionId,
			runId: spec.runId,
			abortSignal: controller.signal,
			cosmonautsRoot: spec.projectRoot,
			mode: "detached",
		});

		await writeCompletion(spec.workdir, result);
		return result;
	} finally {
		await lock.release();
	}
}

async function writeCompletion(
	workdir: string,
	result: DriverResult,
): Promise<void> {
	await writeFileAtomically(
		join(workdir, COMPLETION_FILENAME),
		`${JSON.stringify(result, null, 2)}\n`,
	);
}

try {
	process.exitCode = await main();
} catch (error) {
	console.error(formatError(error));
	process.exitCode = 1;
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
