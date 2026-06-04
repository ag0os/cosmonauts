import { readFile } from "node:fs/promises";
import { describe, expect, test, vi } from "vitest";
import {
	createDriveBackendOrchestrationAdapter,
	DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES,
	type DriveOrchestrationBackendName,
	UnsupportedDriveBackendOperationError,
} from "../../../lib/driver/backends/orchestration-adapter.ts";
import type {
	Backend,
	BackendInvocation,
	BackendRunResult,
} from "../../../lib/driver/backends/types.ts";
import type { BackendContext } from "../../../lib/durable-runtime/index.ts";

describe("Drive backend orchestration adapter", () => {
	// @cosmo-behavior plan:durable-backend-step-model#B-002
	test("starts wrapped Drive backends with unchanged invocations and pinned capabilities", async () => {
		const signal = new AbortController().signal;
		const eventSink = vi.fn(async () => {});
		const invocation: BackendInvocation = {
			runId: "run-adapter",
			promptPath: "/tmp/rendered-prompt.md",
			workdir: "/tmp/drive-run",
			projectRoot: "/tmp/project",
			taskId: "TASK-345",
			parentSessionId: "parent-session",
			planSlug: "durable-backend-step-model",
			eventSink,
			signal,
		};
		const backendResult: BackendRunResult = {
			exitCode: 17,
			stdout: '{"outcome":"success"}',
			durationMs: 1234,
		};
		const driveBackend: Backend = {
			name: "fake-backend-name",
			capabilities: { canCommit: true, isolatedFromHostSource: false },
			run: vi.fn(async (receivedInvocation) => {
				expect(receivedInvocation).toBe(invocation);
				expect(receivedInvocation.signal).toBe(signal);
				expect(receivedInvocation.eventSink).toBe(eventSink);
				return backendResult;
			}),
		};
		const adapter = createDriveBackendOrchestrationAdapter({
			name: "codex",
			backend: driveBackend,
		});
		const context = createBackendContext(invocation);

		const prepared = await adapter.prepare(context.step, context);
		const handle = await adapter.start(prepared);
		const result = await handle.result;

		expect(driveBackend.run).toHaveBeenCalledTimes(1);
		expect(driveBackend.run).toHaveBeenCalledWith(invocation);
		expect(result).toBe(backendResult);
		expect(adapter.name).toBe("codex");
		expect(prepared.backend).toEqual({ name: "codex" });
		expect(handle.backend).toEqual({ name: "codex" });
		expect(adapter.capabilities).toEqual(
			DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES.codex,
		);

		expectCapability("codex", {
			canResume: false,
			canCancel: false,
			canCommit: false,
			isolatedFromHostSource: true,
			emitsMachineReport: true,
		});
		expectCapability("claude-cli", {
			canResume: false,
			canCancel: false,
			canCommit: true,
			isolatedFromHostSource: true,
			emitsMachineReport: true,
		});
		expectCapability("cosmonauts-subagent", {
			canResume: false,
			canCancel: false,
			canCommit: true,
			isolatedFromHostSource: false,
			emitsMachineReport: true,
		});

		await expect(adapter.resume(context.step, context)).rejects.toMatchObject({
			name: "UnsupportedDriveBackendOperationError",
			backendName: "codex",
			operation: "resume",
		});
		await expect(adapter.cancel(handle)).rejects.toMatchObject({
			name: "UnsupportedDriveBackendOperationError",
			backendName: "codex",
			operation: "cancel",
		});
		expect(() => {
			throw new UnsupportedDriveBackendOperationError("codex", "resume");
		}).toThrow("Drive backend codex does not support resume.");

		const source = await readFile(
			"lib/driver/backends/orchestration-adapter.ts",
			"utf-8",
		);
		expect(source).not.toMatch(
			/(prompt-template|report-parser|state-commit|task-manager|task-parser|run-one-task|run-run-loop|driver\.ts)/,
		);
		expect(source).not.toMatch(/\bparseReport\b|\bcommit\b|\bverify\b/);
	});
});

function expectCapability(
	name: DriveOrchestrationBackendName,
	expected: (typeof DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES)[DriveOrchestrationBackendName],
): void {
	const driveBackend: Backend = {
		name: `test-double-${name}`,
		capabilities: { canCommit: false, isolatedFromHostSource: false },
		run: vi.fn(async () => ({ exitCode: 0, stdout: "", durationMs: 0 })),
	};
	const adapter = createDriveBackendOrchestrationAdapter({
		name,
		backend: driveBackend,
	});

	expect(adapter.name).toBe(name);
	expect(adapter.capabilities).toEqual(expected);
	expect(adapter.capabilities).not.toBe(
		DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES[name],
	);
}

function createBackendContext(
	invocation: BackendInvocation,
): BackendContext<BackendInvocation> {
	return {
		run: {
			scope: "durable-backend-step-model",
			runId: invocation.runId,
			status: "running",
			createdAt: "2026-06-04T00:00:00.000Z",
			updatedAt: "2026-06-04T00:00:00.000Z",
			runDir: "/tmp/drive-run",
			graphPath: "/tmp/drive-run/graph.json",
			eventsPath: "/tmp/drive-run/orchestration-events.jsonl",
			artifactsDir: "/tmp/drive-run/artifacts",
			schedulerStatePath: "/tmp/drive-run/scheduler.json",
			stepsDir: "/tmp/drive-run/steps",
			policy: {
				reportInference: "strict",
				defaultBackend: { name: "codex" },
				worktree: { mode: "shared" },
			},
		},
		step: {
			id: invocation.taskId,
			runId: invocation.runId,
			title: "Add Drive backend orchestration adapter",
			kind: "drive",
			backend: { name: "codex" },
			dependsOn: [],
			status: "ready",
			inputArtifacts: [{ id: "prompt", path: invocation.promptPath }],
			outputArtifacts: [],
		},
		attemptId: "attempt-001",
		input: invocation,
		signal: invocation.signal,
		now: () => "2026-06-04T00:00:01.000Z",
	};
}
