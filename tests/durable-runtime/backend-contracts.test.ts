import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import {
	type BackendCapabilities,
	type BackendContext,
	type BackendHandle,
	type BackendName,
	type BackendSpec,
	KNOWN_BACKEND_NAMES,
	type KnownBackendName,
	type OrchestrationBackend,
	type PreparedStep,
	type RunStore,
	type StepAttemptRecord,
	type StepRecord,
} from "../../lib/durable-runtime/index.ts";

describe("durable runtime backend contracts", () => {
	// @cosmo-behavior plan:durable-backend-step-model#B-001
	test("defines generic backend and attempt contracts without Drive dependencies", async () => {
		const knownBackendNames: KnownBackendName[] = [...KNOWN_BACKEND_NAMES];
		expect(knownBackendNames).toEqual([
			"codex",
			"claude-cli",
			"cosmonauts-subagent",
			"shell-command",
		]);
		expect(knownBackendNames).not.toContain("unknown");

		const compatibilityBackend: BackendName = "unknown";
		const defaultBackend: BackendSpec = { name: compatibilityBackend };
		expect(defaultBackend).toEqual({ name: "unknown" });

		const step: StepRecord = {
			id: "TASK-1",
			runId: "run-contracts",
			title: "Implement backend contracts",
			kind: "drive",
			backend: { name: "codex", options: { model: "gpt-5" } },
			dependsOn: [],
			status: "completed",
			inputArtifacts: [{ id: "prompt", path: "artifacts/prompt.md" }],
			outputArtifacts: [{ id: "report", path: "artifacts/report.json" }],
			latestAttemptId: "attempt-001",
			result: {
				outcome: "unknown",
				summary: "Report was not machine-readable.",
				artifacts: [],
				nextAction: "wait_for_human",
			},
		};
		expect(step.backend.name).toBe("codex");
		expect(step.latestAttemptId).toBe("attempt-001");

		const attempt: StepAttemptRecord = {
			attemptId: "attempt-001",
			startedAt: "2026-06-04T00:00:00.000Z",
			endedAt: "2026-06-04T00:01:00.000Z",
			result: step.result,
		};
		expect(attempt.result?.outcome).toBe("unknown");

		const store = {} as RunStore;
		expectType<RunStore["writeStepAttemptRecord"]>(
			store.writeStepAttemptRecord,
		);
		expectType<RunStore["readStepAttemptRecord"]>(store.readStepAttemptRecord);
		expectType<RunStore["listStepAttemptRecords"]>(
			store.listStepAttemptRecords,
		);

		const capabilities: BackendCapabilities = {
			canResume: false,
			canCancel: false,
			canCommit: false,
			isolatedFromHostSource: true,
			emitsMachineReport: true,
		};
		const backend: OrchestrationBackend<
			{ prompt: string },
			{ stdout: string }
		> = {
			name: "codex",
			capabilities,
			async prepare(
				stepRecord: StepRecord,
				context: BackendContext<{ prompt: string }>,
			): Promise<PreparedStep<{ prompt: string }>> {
				return {
					step: stepRecord,
					attemptId: context.attemptId,
					backend: context.step.backend,
					input: context.input,
					preparedAt: context.now?.() ?? "2026-06-04T00:00:00.000Z",
				};
			},
			async start(
				prepared: PreparedStep<{ prompt: string }>,
			): Promise<BackendHandle<{ stdout: string }>> {
				return {
					backend: prepared.backend,
					stepId: prepared.step.id,
					attemptId: prepared.attemptId,
					startedAt: prepared.preparedAt,
					result: Promise.resolve({ stdout: prepared.input.prompt }),
				};
			},
		};
		expect(backend.name).toBe("codex");
		expect(backend.capabilities).toEqual(capabilities);

		const runtimeSources = await Promise.all([
			readFile("lib/durable-runtime/types.ts", "utf-8"),
			readFile("lib/durable-runtime/backends.ts", "utf-8"),
			readFile("lib/durable-runtime/index.ts", "utf-8"),
		]);
		for (const source of runtimeSources) {
			expect(source).not.toMatch(
				/from\s+["'][^"']*(?:driver|cli|domains|prompts|tasks)[^"']*["']/,
			);
		}

		const typeSource = runtimeSources[0];
		const backendSource = runtimeSources[1];
		expect(typeSource).toContain("export const KNOWN_BACKEND_NAMES");
		expect(typeSource).toContain("export type KnownBackendName");
		expect(typeSource).toContain("export type BackendName");
		expect(typeSource).toContain("export interface BackendSpec");
		expect(backendSource).toMatch(
			/import type \{[\s\S]*\} from "\.\/types\.ts";/,
		);
		for (const importedType of [
			"BackendSpec",
			"KnownBackendName",
			"RunRecord",
			"StepRecord",
		]) {
			expect(backendSource).toContain(importedType);
		}
		expect(backendSource).not.toContain("export type KnownBackendName");
		expect(backendSource).not.toContain("export type BackendName");
		expect(backendSource).not.toContain("export interface BackendSpec");

		const driverTypeSource = await readFile("lib/driver/types.ts", "utf-8");
		expect(driverTypeSource).toContain(
			'import type { KnownBackendName } from "../durable-runtime/index.ts";',
		);
		expect(driverTypeSource).toContain("Extract<");
		for (const driveBackendName of [
			"cosmonauts-subagent",
			"codex",
			"claude-cli",
		]) {
			expect(driverTypeSource).toContain(driveBackendName);
		}
	});
});

function expectType<T>(_value: T): void {}
