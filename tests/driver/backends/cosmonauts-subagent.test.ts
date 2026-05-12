import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createCosmonautsSubagentBackend } from "../../../lib/driver/backends/cosmonauts-subagent.ts";
import type { BackendInvocation } from "../../../lib/driver/backends/types.ts";
import type { DriverEvent, EventSink } from "../../../lib/driver/types.ts";
import type {
	AgentSpawner,
	SpawnConfig,
	SpawnResult,
} from "../../../lib/orchestration/types.ts";

let tempDir: string | undefined;

async function createPromptFile(
	content = "Implement the task.",
): Promise<string> {
	tempDir = await mkdtemp(join(tmpdir(), "cosmonauts-subagent-"));
	const promptPath = join(tempDir, "prompt.md");
	await writeFile(promptPath, content, "utf-8");
	return promptPath;
}

function createInvocation(
	promptPath: string,
	overrides: Partial<BackendInvocation> = {},
): BackendInvocation {
	const eventSink: EventSink = async () => {};
	return {
		runId: "run-1",
		promptPath,
		workdir: "/tmp/run-workdir",
		projectRoot: "/tmp/run-project-root",
		taskId: "TASK-1",
		parentSessionId: "parent-session-1",
		planSlug: "driver-primitives",
		eventSink,
		signal: new AbortController().signal,
		...overrides,
	};
}

function createSpawner(result: SpawnResult): {
	spawner: AgentSpawner;
	spawn: ReturnType<typeof vi.fn>;
} {
	const spawn = vi.fn(async (_config: SpawnConfig) => result);
	return {
		spawner: { spawn, dispose: vi.fn() },
		spawn,
	};
}

function firstSpawnConfig(spawn: ReturnType<typeof vi.fn>): SpawnConfig {
	const config = spawn.mock.calls[0]?.[0] as SpawnConfig | undefined;
	expect(config).toBeDefined();
	return config as SpawnConfig;
}

afterEach(async () => {
	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true });
		tempDir = undefined;
	}
});

describe("cosmonauts-subagent backend", () => {
	test("exports a committing Backend", () => {
		const { spawner } = createSpawner({
			success: true,
			sessionId: "session-1",
			messages: [],
		});
		const backend = createCosmonautsSubagentBackend({
			spawner,
			cwd: "/repo",
		});

		expect(backend.name).toBe("cosmonauts-subagent");
		expect(backend.capabilities).toEqual({
			canCommit: true,
			isolatedFromHostSource: false,
		});
		expect(backend.run).toEqual(expect.any(Function));
	});

	test("cosmonauts-subagent full spawn config is forwarded", async () => {
		const promptPath = await createPromptFile("Task prompt");
		const result: SpawnResult = {
			success: true,
			sessionId: "session-1",
			messages: [
				{
					role: "assistant",
					content: [{ type: "text", text: "Done" }],
				},
			],
		};
		const { spawner, spawn } = createSpawner(result);
		const signal = new AbortController().signal;
		const projectSkills = ["typescript", "testing"];
		const skillPaths = ["/skills/typescript", "/skills/testing"];
		const backend = createCosmonautsSubagentBackend({
			spawner,
			defaultRole: "reviewer",
			cwd: "/repo",
			domainContext: "coding",
			projectSkills,
			skillPaths,
		});

		await backend.run(
			createInvocation(promptPath, {
				signal,
				runId: "run-254",
				taskId: "TASK-254",
				parentSessionId: "parent-session-254",
				planSlug: "driver-primitives",
			}),
		);

		expect(spawn).toHaveBeenCalledTimes(1);
		const config = firstSpawnConfig(spawn);
		expect(config.role).toBe("reviewer");
		expect(config.prompt).toBe("Task prompt");
		expect(config.cwd).toBe("/repo");
		expect(config.signal).toBe(signal);
		expect(config.planSlug).toBe("driver-primitives");
		expect(config.parentSessionId).toBe("parent-session-254");
		expect(config.runtimeContext).toEqual({
			mode: "sub-agent",
			taskId: "TASK-254",
			parentRole: "driver",
		});
		expect(config.domainContext).toBe("coding");
		expect(config.projectSkills).toBe(projectSkills);
		expect(config.skillPaths).toBe(skillPaths);
		expect(config.onEvent).toEqual(expect.any(Function));
	});

	test("bridges spawn events as driver_activity events", async () => {
		const promptPath = await createPromptFile();
		const events: DriverEvent[] = [];
		const eventSink: EventSink = async (event) => {
			events.push(event);
		};
		const spawn = vi.fn(async (config: SpawnConfig): Promise<SpawnResult> => {
			config.onEvent?.({
				type: "tool_execution_start",
				sessionId: "child-session-1",
				toolName: "read",
				toolCallId: "tool-call-1",
				args: { path: "lib/file.ts" },
			});
			return { success: true, sessionId: "child-session-1", messages: [] };
		});
		const backend = createCosmonautsSubagentBackend({
			spawner: { spawn, dispose: vi.fn() },
			cwd: "/repo",
		});

		await backend.run(
			createInvocation(promptPath, {
				runId: "run-254",
				parentSessionId: "parent-session-254",
				taskId: "TASK-254",
				eventSink,
			}),
		);

		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			type: "driver_activity",
			runId: "run-254",
			parentSessionId: "parent-session-254",
			taskId: "TASK-254",
			activity: {
				kind: "tool_start",
				toolName: "read",
				summary: "read file.ts",
			},
		});
		expect(events[0]?.timestamp).toEqual(expect.any(String));
	});

	test("returns stdout from the spawned agent's last assistant text", async () => {
		const promptPath = await createPromptFile();
		const { spawner } = createSpawner({
			success: true,
			sessionId: "session-1",
			messages: [
				{ role: "assistant", content: [{ type: "text", text: "Earlier" }] },
				{ role: "user", content: [{ type: "text", text: "Ignore" }] },
				{
					role: "assistant",
					content: [
						{ type: "text", text: "  Final report  " },
						{ type: "image", text: "ignored" },
						{ type: "text", text: "Second block" },
					],
				},
			],
		});
		const backend = createCosmonautsSubagentBackend({
			spawner,
			cwd: "/repo",
		});

		const runResult = await backend.run(createInvocation(promptPath));

		expect(runResult).toMatchObject({
			exitCode: 0,
			stdout: "Final report\n\nSecond block",
		});
		expect(runResult.durationMs).toEqual(expect.any(Number));
	});

	test("has no domains imports", async () => {
		const source = await import("node:fs/promises").then((fs) =>
			fs.readFile("lib/driver/backends/cosmonauts-subagent.ts", "utf-8"),
		);

		expect(source).not.toContain("domains/");
		expect(source).not.toContain("/domains");
	});
});
