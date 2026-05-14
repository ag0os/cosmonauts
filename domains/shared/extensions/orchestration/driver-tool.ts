import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	createClaudeCliBackend,
	readClaudeArgsFromEnv,
} from "../../../../lib/driver/backends/claude-cli.ts";
import {
	createCodexBackend,
	readCodexArgsFromEnv,
	readCodexExecArgsFromEnv,
} from "../../../../lib/driver/backends/codex.ts";
import { createCosmonautsSubagentBackend } from "../../../../lib/driver/backends/cosmonauts-subagent.ts";
import type { Backend } from "../../../../lib/driver/backends/types.ts";
import { runInline, startDetached } from "../../../../lib/driver/driver.ts";
import {
	writeInlineRunState,
	writeRunCompletion,
} from "../../../../lib/driver/run-state.ts";
import type {
	BackendName,
	DriverHandle,
	DriverResult,
	DriverRunSpec,
} from "../../../../lib/driver/types.ts";
import { activityBus } from "../../../../lib/orchestration/activity-bus.ts";
import { createPiSpawner } from "../../../../lib/orchestration/agent-spawner.ts";
import type { CosmonautsRuntime } from "../../../../lib/runtime.ts";
import { TaskManager } from "../../../../lib/tasks/task-manager.ts";

interface ActiveDriverRun {
	runId: string;
	activeAt: string;
}

interface RunDriverStarted {
	runId: string;
	planSlug: string;
	workdir: string;
	eventLogPath: string;
}

interface RunDriverActive {
	error: "active";
	activeRunId: string;
	activeAt: string;
}

interface RunDriverUnsupportedDetachedBackend {
	error: "detached_backend_not_supported";
	backend: BackendName;
	mode: "detached";
	message: string;
}

type RunDriverResponse =
	| RunDriverStarted
	| RunDriverActive
	| RunDriverUnsupportedDetachedBackend;

type DriverMode = "inline" | "detached";

const activeRuns = new Map<string, ActiveDriverRun>();

export function registerDriverTool(
	pi: ExtensionAPI,
	getRuntime: (cwd: string) => Promise<CosmonautsRuntime>,
	frameworkRoot: string,
): void {
	pi.registerTool({
		name: "run_driver",
		label: "Run Driver",
		description:
			"Start a plan-linked task run through the Cosmonauts driver loop. Returns a `runId` immediately; the run proceeds in the background — monitor it with `watch_events`. Load /skill:drive before configuring a run.",
		parameters: Type.Object({
			planSlug: Type.String({ description: "Plan slug to run" }),
			taskIds: Type.Optional(
				Type.Array(Type.String(), {
					description:
						"Ordered task IDs to run. Pass them when dependency order matters. Defaults to all non-Done tasks labeled plan:<planSlug>.",
				}),
			),
			backend: Type.Union(
				[
					Type.Literal("cosmonauts-subagent"),
					Type.Literal("codex"),
					Type.Literal("claude-cli"),
				],
				{
					description:
						"Backend that executes each task's rendered prompt. `cosmonauts-subagent` runs in-process and is inline-only; `codex` and `claude-cli` are external CLI agents (use them for detached runs).",
				},
			),
			mode: Type.Optional(
				Type.Union([Type.Literal("inline"), Type.Literal("detached")], {
					description:
						"Execution mode. `inline` (default) runs inside this session. `detached` writes a frozen run directory that survives session death and source edits — required for long or self-modifying work, not supported with the `cosmonauts-subagent` backend.",
				}),
			),
			branch: Type.Optional(
				Type.String({
					description:
						"Expected git branch for each task. Set this to a feature branch — per-task commits land here.",
				}),
			),
			commitPolicy: Type.Optional(
				Type.Union(
					[
						Type.Literal("driver-commits"),
						Type.Literal("backend-commits"),
						Type.Literal("no-commit"),
					],
					{
						description:
							"Who creates per-task commits. `driver-commits` (default): the driver commits each completed task. `backend-commits`: the backend agent commits its own work. `no-commit`: changes are left uncommitted.",
					},
				),
			),
			promptOverridesDir: Type.Optional(
				Type.String({
					description: "Directory containing per-task prompt overrides",
				}),
			),
			preflightCommands: Type.Optional(
				Type.Array(Type.String(), {
					description:
						"Commands run before each task. A non-zero exit aborts the run before that task starts.",
				}),
			),
			postflightCommands: Type.Optional(
				Type.Array(Type.String(), {
					description:
						"Commands run after each task (not just at the end) — e.g. test, lint, typecheck. A non-zero exit blocks the run.",
				}),
			),
			envelopePath: Type.Optional(
				Type.String({
					description:
						"Base prompt envelope path, relative to the project root (absolute paths are honored as-is). Omit it to use the bundled coding envelope shipped with Cosmonauts; pass a path only when the project ships its own envelope.",
				}),
			),
			preconditionPath: Type.Optional(
				Type.String({ description: "Optional run precondition prompt path" }),
			),
			partialMode: Type.Optional(
				Type.Union([Type.Literal("stop"), Type.Literal("continue")], {
					description:
						"What to do when a task returns partial progress. `stop` (default): halt the run for inspection. `continue`: move on to the next task.",
				}),
			),
			taskTimeoutMs: Type.Optional(
				Type.Number({
					description:
						"Per-task timeout in milliseconds, applied to each task's backend invocation.",
				}),
			),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const planSlug = params.planSlug;
			const mode = params.mode ?? "inline";
			if (mode === "detached" && params.backend === "cosmonauts-subagent") {
				return runDriverResult({
					error: "detached_backend_not_supported",
					backend: params.backend,
					mode,
					message:
						"Backend cosmonauts-subagent is not supported for detached mode.",
				});
			}

			const activeKey = activeRunKey(ctx.cwd, planSlug);
			const activeRun = activeRuns.get(activeKey);
			if (activeRun) {
				return runDriverResult({
					error: "active",
					activeRunId: activeRun.runId,
					activeAt: activeRun.activeAt,
				});
			}

			const runId = `run-${randomUUID()}`;
			const activeAt = new Date().toISOString();
			activeRuns.set(activeKey, { runId, activeAt });
			let spec: DriverRunSpec | undefined;

			try {
				const runtime =
					mode === "inline" ? await getRuntime(ctx.cwd) : undefined;
				const taskManager = new TaskManager(ctx.cwd);
				await taskManager.init();
				const taskIds = await resolveTaskIds(
					taskManager,
					planSlug,
					params.taskIds,
				);
				spec = await createRunSpec({
					params,
					ctx,
					runId,
					planSlug,
					taskIds,
					frameworkRoot,
					prepareWorkdir: mode === "inline",
				});
				const backend = createBackend(params.backend, mode, runtime, ctx.cwd);
				const deps = {
					taskManager,
					backend,
					activityBus,
					cosmonautsRoot: frameworkRoot,
				};
				const handle =
					mode === "detached"
						? startDetached(spec, deps)
						: runInline(spec, deps);

				clearActiveRunOnCompletion(activeKey, handle);
				return runDriverResult({
					runId: handle.runId,
					planSlug: handle.planSlug,
					workdir: handle.workdir,
					eventLogPath: handle.eventLogPath,
				});
			} catch (error) {
				if (mode === "inline" && spec) {
					await writeRunCompletion(
						spec.workdir,
						abortedCompletionFromRunId(runId, error),
					).catch(() => undefined);
				}
				clearActiveRun(activeKey, runId);
				throw error;
			}
		},
	});
}

async function resolveTaskIds(
	taskManager: TaskManager,
	planSlug: string,
	taskIds: readonly string[] | undefined,
): Promise<string[]> {
	if (taskIds && taskIds.length > 0) {
		return [...taskIds];
	}

	const tasks = await taskManager.listTasks({ label: `plan:${planSlug}` });
	return tasks.filter((task) => task.status !== "Done").map((task) => task.id);
}

async function createRunSpec({
	params,
	ctx,
	runId,
	planSlug,
	taskIds,
	frameworkRoot,
	prepareWorkdir,
}: {
	params: {
		backend: BackendName;
		branch?: string;
		commitPolicy?: DriverRunSpec["commitPolicy"];
		envelopePath?: string;
		preconditionPath?: string;
		promptOverridesDir?: string;
		preflightCommands?: string[];
		postflightCommands?: string[];
		partialMode?: DriverRunSpec["partialMode"];
		taskTimeoutMs?: number;
	};
	ctx: { cwd: string; sessionManager: { getSessionId(): string } };
	runId: string;
	planSlug: string;
	taskIds: string[];
	frameworkRoot: string;
	prepareWorkdir: boolean;
}): Promise<DriverRunSpec> {
	const workdir = join(
		ctx.cwd,
		"missions",
		"sessions",
		planSlug,
		"runs",
		runId,
	);
	const eventLogPath = join(workdir, "events.jsonl");
	const spec: DriverRunSpec = {
		runId,
		parentSessionId: ctx.sessionManager.getSessionId(),
		projectRoot: ctx.cwd,
		planSlug,
		taskIds,
		backendName: params.backend,
		promptTemplate: {
			envelopePath: resolveEnvelopePath(
				params.envelopePath,
				ctx.cwd,
				frameworkRoot,
			),
			preconditionPath: params.preconditionPath
				? resolve(ctx.cwd, params.preconditionPath)
				: undefined,
			perTaskOverrideDir: params.promptOverridesDir
				? resolve(ctx.cwd, params.promptOverridesDir)
				: undefined,
		},
		preflightCommands: params.preflightCommands ?? [],
		postflightCommands: params.postflightCommands ?? [],
		branch: params.branch,
		commitPolicy: params.commitPolicy ?? "driver-commits",
		partialMode: params.partialMode,
		workdir,
		eventLogPath,
		taskTimeoutMs: params.taskTimeoutMs,
	};

	if (prepareWorkdir) {
		await mkdir(workdir, { recursive: true });
		await writeFile(
			join(workdir, "spec.json"),
			`${JSON.stringify(spec, null, 2)}\n`,
		);
		await writeFile(join(workdir, "task-queue.txt"), `${taskIds.join("\n")}\n`);
		await writeInlineRunState(workdir);
	}

	return spec;
}

const BUNDLED_CODING_ENVELOPE = join(
	"bundled",
	"coding",
	"coding",
	"drivers",
	"templates",
	"envelope.md",
);

function resolveEnvelopePath(
	envelopePath: string | undefined,
	projectRoot: string,
	frameworkRoot: string,
): string {
	if (envelopePath) {
		return isAbsolute(envelopePath)
			? envelopePath
			: resolve(projectRoot, envelopePath);
	}

	const bundled = join(frameworkRoot, BUNDLED_CODING_ENVELOPE);
	if (!existsSync(bundled)) {
		throw new Error(
			`No envelopePath provided and the bundled coding envelope was not found at ${bundled}. Pass envelopePath explicitly.`,
		);
	}
	return bundled;
}

function createBackend(
	backendName: BackendName,
	mode: DriverMode,
	runtime: CosmonautsRuntime | undefined,
	cwd: string,
): Backend {
	switch (backendName) {
		case "cosmonauts-subagent": {
			if (mode === "detached") {
				throw new Error(
					`Unsupported driver backend in detached mode: ${backendName}`,
				);
			}
			if (!runtime) {
				throw new Error(
					"Cosmonauts runtime is required for cosmonauts-subagent backend",
				);
			}
			const spawner = createPiSpawner(
				runtime.agentRegistry,
				runtime.domainsDir,
				{
					resolver: runtime.domainResolver,
				},
			);
			return createCosmonautsSubagentBackend({
				spawner,
				cwd,
				domainContext: runtime.domainContext,
				projectSkills: runtime.projectSkills,
				skillPaths: runtime.skillPaths,
			});
		}
		case "codex":
			if (mode === "inline") {
				throw new Error(
					`Unsupported driver backend in inline mode: ${backendName}`,
				);
			}
			return createCodexBackend({
				binary: process.env.COSMONAUTS_DRIVER_CODEX_BINARY,
				globalArgs: readCodexArgsFromEnv(),
				extraArgs: readCodexExecArgsFromEnv(),
			});
		case "claude-cli":
			if (mode === "inline") {
				throw new Error(
					`Unsupported driver backend in inline mode: ${backendName}`,
				);
			}
			return createClaudeCliBackend({
				binary: process.env.COSMONAUTS_DRIVER_CLAUDE_BINARY,
				args: readClaudeArgsFromEnv(),
			});
	}
}

function clearActiveRunOnCompletion(
	activeKey: string,
	handle: DriverHandle,
): void {
	void handle.result
		.then(
			(result) => writeRunCompletion(handle.workdir, result),
			(error: unknown) =>
				writeRunCompletion(handle.workdir, abortedCompletion(handle, error)),
		)
		.finally(() => clearActiveRun(activeKey, handle.runId))
		.catch(() => undefined);
}

function abortedCompletion(handle: DriverHandle, error: unknown): DriverResult {
	return abortedCompletionFromRunId(handle.runId, error);
}

function abortedCompletionFromRunId(
	runId: string,
	error: unknown,
): DriverResult {
	return {
		runId,
		outcome: "aborted",
		tasksDone: 0,
		tasksBlocked: 0,
		blockedReason: formatError(error),
	};
}

function formatError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === "object" && error !== null) {
		return JSON.stringify(error);
	}
	return String(error);
}

function clearActiveRun(activeKey: string, runId: string): void {
	if (activeRuns.get(activeKey)?.runId === runId) {
		activeRuns.delete(activeKey);
	}
}

function activeRunKey(cwd: string, planSlug: string): string {
	return `${cwd}\0${planSlug}`;
}

function runDriverResult(response: RunDriverResponse) {
	if ("error" in response) {
		if (response.error === "active") {
			return {
				...response,
				content: [
					{
						type: "text" as const,
						text: `Driver run already active: ${response.activeRunId}`,
					},
				],
				details: response,
			};
		}

		return {
			...response,
			content: [
				{
					type: "text" as const,
					text: response.message,
				},
			],
			details: response,
		};
	}

	return {
		...response,
		content: [
			{
				type: "text" as const,
				text: `Started driver run ${response.runId} for ${response.planSlug}`,
			},
		],
		details: response,
	};
}
