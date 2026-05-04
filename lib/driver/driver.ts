import type { TaskManager } from "../tasks/task-manager.ts";
import type { Backend } from "./backends/types.ts";
import { createEventSink, type DriverEventPublisher } from "./event-stream.ts";
import { acquirePlanLock } from "./lock.ts";
import { runRunLoop } from "./run-run-loop.ts";
import type { DriverHandle, DriverRunSpec } from "./types.ts";

export interface DriverDeps {
	taskManager: TaskManager;
	backend: Backend;
	activityBus: DriverEventPublisher;
	cosmonautsRoot: string;
}

export function runInline(spec: DriverRunSpec, deps: DriverDeps): DriverHandle {
	const controller = new AbortController();
	const result = acquirePlanLock(
		spec.planSlug,
		spec.runId,
		deps.cosmonautsRoot,
	).then((lock) => {
		if ("error" in lock) {
			throw lock;
		}

		const eventSink = createEventSink({
			logPath: spec.eventLogPath,
			runId: spec.runId,
			parentSessionId: spec.parentSessionId,
			activityBus: deps.activityBus,
		});

		return runRunLoop(spec, {
			taskManager: deps.taskManager,
			backend: deps.backend,
			eventSink,
			parentSessionId: spec.parentSessionId,
			runId: spec.runId,
			abortSignal: controller.signal,
			cosmonautsRoot: deps.cosmonautsRoot,
			mode: "inline",
		}).finally(() => lock.release());
	});

	return {
		runId: spec.runId,
		planSlug: spec.planSlug,
		workdir: spec.workdir,
		eventLogPath: spec.eventLogPath,
		async abort() {
			controller.abort();
		},
		result,
	};
}
