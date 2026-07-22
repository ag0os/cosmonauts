import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	bridgeJsonlToActivityBus,
	type DriverBusEvent,
	type DriverEventBridgeOptions,
	type DriverEventPublisher,
	type JsonlActivityBusBridge,
} from "../../lib/driver/event-stream.ts";
import type { DriverEvent } from "../../lib/driver/types.ts";

const watchSeam = vi.hoisted(() => ({
	closeSpies: [] as Array<{ mock: { calls: unknown[][] } }>,
}));

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	const trackedWatch = ((...args: unknown[]) => {
		const watcher = Reflect.apply(actual.watch, actual, args);
		const closeSpy = vi.spyOn(watcher, "close");
		watchSeam.closeSpies.push(closeSpy);
		return watcher;
	}) as typeof actual.watch;
	return { ...actual, watch: trackedWatch };
});

type EventOf<T extends DriverEvent["type"]> = Extract<DriverEvent, { type: T }>;

const baseEvent = {
	runId: "run-bridge-1",
	parentSessionId: "parent-session-bridge-1",
	timestamp: "2026-05-05T00:00:00.000Z",
};

let tempDir: string | undefined;
let bridges: JsonlActivityBusBridge[] = [];

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "event-stream-bridge-"));
	bridges = [];
	watchSeam.closeSpies = [];
});

afterEach(async () => {
	for (const bridge of bridges) {
		bridge.stop();
	}
	bridges = [];
	vi.restoreAllMocks();

	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true });
		tempDir = undefined;
	}
});

describe("bridgeJsonlToActivityBus", () => {
	test("watches the parent directory when the JSONL file is missing initially", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const published: DriverBusEvent[] = [];
		const bridge = startBridge({
			publish: (event) => published.push(event),
		});

		const event = taskDoneEvent({ taskId: "TASK-MISSING" });
		await writeFile(logPath(), `${JSON.stringify(event)}\n`, "utf-8");

		await waitFor(() => published.length === 1);
		expect(published).toEqual([
			{
				type: "driver_event",
				runId: event.runId,
				parentSessionId: event.parentSessionId,
				event,
			},
		]);
		bridge.stop();
	});

	test("buffers partial lines until a trailing newline is written", async () => {
		const event = taskDoneEvent({ taskId: "TASK-PARTIAL" });
		await writeFile(logPath(), JSON.stringify(event), "utf-8");
		const publish = vi.fn();
		startBridge({ publish });

		await delay(250);
		expect(publish).not.toHaveBeenCalled();

		await appendFile(logPath(), "\n", "utf-8");

		await waitFor(() => publish.mock.calls.length === 1);
		expect(publish).toHaveBeenCalledWith({
			type: "driver_event",
			runId: event.runId,
			parentSessionId: event.parentSessionId,
			event,
		});
	});

	test("logs parse errors and retries the same line without advancing cursor", async () => {
		const publish = vi.fn();
		const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const validEvent = taskDoneEvent({ taskId: "TASK-AFTER-BAD-LINE" });
		await writeFile(
			logPath(),
			`not json\n${JSON.stringify(validEvent)}\n`,
			"utf-8",
		);

		startBridge({ publish });

		await waitFor(() => stderrSpy.mock.calls.length >= 2);
		expect(publish).not.toHaveBeenCalled();
		expect(String(stderrSpy.mock.calls[0]?.[0])).toContain(
			"driver_event_bridge_error",
		);
		expect(String(stderrSpy.mock.calls[0]?.[0])).toContain("parse_error");
	});

	test("stops automatically after a terminal event", async () => {
		const publish = vi.fn();
		const terminalEvent = runCompletedEvent();
		await writeFile(logPath(), `${JSON.stringify(terminalEvent)}\n`, "utf-8");

		startBridge({ publish });

		await waitFor(() => publish.mock.calls.length === 1);

		await appendFile(
			logPath(),
			`${JSON.stringify(taskDoneEvent({ taskId: "TASK-AFTER-DONE" }))}\n`,
			"utf-8",
		);
		await delay(300);

		expect(publish).toHaveBeenCalledTimes(1);
		expect(publish).toHaveBeenCalledWith({
			type: "driver_event",
			runId: terminalEvent.runId,
			parentSessionId: terminalEvent.parentSessionId,
			event: terminalEvent,
		});
	});

	// @cosmo-behavior plan:episodic-log-detached-hardening#B-003
	test("drains only episode capture diagnostics after a terminal event", async () => {
		const published: DriverBusEvent[] = [];
		const terminal = runCompletedEvent();
		const firstDiagnostic = episodeCaptureFailedEvent({
			message: "first terminal capture warning",
		});
		const secondDiagnostic = episodeCaptureFailedEvent({
			message: "second terminal capture warning",
		});
		await writeFile(
			logPath(),
			`${[
				terminal,
				taskDoneEvent({ taskId: "TASK-SUPPRESSED-1" }),
				driverDiagnosticEvent({ code: "unrelated_warning" }),
				firstDiagnostic,
			]
				.map((event) => JSON.stringify(event))
				.join("\n")}\n`,
			"utf-8",
		);

		const bridge = startBridge(
			{ publish: (event) => published.push(event) },
			{ bridgeDriverDiagnostics: true },
		);
		await waitFor(() => published.length === 2);
		await appendFile(
			logPath(),
			`${[
				taskDoneEvent({ taskId: "TASK-SUPPRESSED-2" }),
				secondDiagnostic,
				driverDiagnosticEvent({ code: "another_unrelated_warning" }),
			]
				.map((event) => JSON.stringify(event))
				.join("\n")}\n`,
			"utf-8",
		);
		await bridge.finish();

		expect(published).toEqual([
			toPublishedEvent(terminal),
			toPublishedEvent(firstDiagnostic),
			toPublishedEvent(secondDiagnostic),
		]);
	});

	test("final-polls and cleans timers when a draining bridge reaches its deadline", async () => {
		vi.useFakeTimers();
		try {
			const publish = vi.fn();
			await writeFile(
				logPath(),
				`${JSON.stringify(runCompletedEvent())}\n`,
				"utf-8",
			);
			const bridge = startBridge(
				{ publish },
				{ bridgeDriverDiagnostics: true },
			);

			await vi.waitFor(() => {
				expect(publish).toHaveBeenCalledTimes(1);
			});
			await appendFile(
				logPath(),
				`${JSON.stringify(episodeCaptureFailedEvent())}\n`,
				"utf-8",
			);
			await vi.advanceTimersByTimeAsync(2_000);

			expect(publish).toHaveBeenCalledTimes(2);
			expect(vi.getTimerCount()).toBe(0);
			expect(watchSeam.closeSpies.length).toBeGreaterThan(0);
			expect(
				watchSeam.closeSpies.every(
					(closeSpy) => closeSpy.mock.calls.length > 0,
				),
			).toBe(true);
			bridge.stop();
			await bridge.finish();
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
});

function startBridge(
	bus: DriverEventPublisher,
	options: DriverEventBridgeOptions = {},
): JsonlActivityBusBridge {
	const bridge = bridgeJsonlToActivityBus(
		logPath(),
		baseEvent.runId,
		baseEvent.parentSessionId,
		bus,
		options,
	);
	bridges.push(bridge);
	return bridge;
}

function logPath(): string {
	if (!tempDir) {
		throw new Error("tempDir not initialized");
	}
	return join(tempDir, "events.jsonl");
}

function taskDoneEvent(
	overrides: Partial<EventOf<"task_done">> = {},
): EventOf<"task_done"> {
	return { ...baseEvent, type: "task_done", taskId: "TASK-270", ...overrides };
}

function runCompletedEvent(
	overrides: Partial<EventOf<"run_completed">> = {},
): EventOf<"run_completed"> {
	return {
		...baseEvent,
		type: "run_completed",
		summary: { total: 1, done: 1, blocked: 0 },
		...overrides,
	};
}

function driverDiagnosticEvent(
	overrides: Partial<EventOf<"driver_diagnostic">> = {},
): EventOf<"driver_diagnostic"> {
	return {
		...baseEvent,
		type: "driver_diagnostic",
		level: "warning",
		code: "fixture_warning",
		message: "fixture diagnostic",
		...overrides,
	};
}

function episodeCaptureFailedEvent(
	overrides: Partial<EventOf<"driver_diagnostic">> = {},
): EventOf<"driver_diagnostic"> {
	return driverDiagnosticEvent({
		code: "episode_capture_failed",
		message: "Episode capture skipped: fixture failure",
		...overrides,
	});
}

function toPublishedEvent(event: DriverEvent): DriverBusEvent {
	return {
		type: "driver_event",
		runId: event.runId,
		parentSessionId: event.parentSessionId,
		event,
	};
}

async function waitFor(
	predicate: () => boolean,
	timeoutMs = 2_000,
): Promise<void> {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		if (predicate()) {
			return;
		}
		await delay(25);
	}
	throw new Error("Timed out waiting for bridge expectation");
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
