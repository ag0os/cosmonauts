import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { beforeEach, describe, expect, test, vi } from "vitest";
import "./orchestration-mocks.ts";
import { registerDriverTool } from "../../domains/shared/extensions/orchestration/driver-tool.ts";
import { registerWatchEventsTool } from "../../domains/shared/extensions/orchestration/watch-events-tool.ts";
import { AgentRegistry } from "../../lib/agents/index.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import type {
	Backend,
	BackendInvocation,
	BackendRunResult,
} from "../../lib/driver/backends/types.ts";
import {
	DEFAULT_DRIVE_ENVELOPE_RELATIVE_PATH,
	resolveDefaultDriveEnvelopePath,
} from "../../lib/driver/default-envelope.ts";
import { resolveDriveEpisodeWorker } from "../../lib/driver/episode-identity.ts";
import type {
	DriverActivityBusEvent,
	DriverBusEvent,
	DriverEventBusEvent,
} from "../../lib/driver/event-stream.ts";
import { tailEvents } from "../../lib/driver/event-stream.ts";
import {
	acquirePlanLock,
	getRepoCommitLockPath,
	type LockHandle,
} from "../../lib/driver/lock.ts";
import {
	type DriverEvent,
	type DriverResult,
	type DriverRunSpec,
	resolveStateCommitPolicy,
} from "../../lib/driver/types.ts";
import { activityBus } from "../../lib/orchestration/activity-bus.ts";
import type { SpawnActivityEvent } from "../../lib/orchestration/message-bus.ts";
import type { CosmonautsRuntime } from "../../lib/runtime.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import type { TaskUpdateInput } from "../../lib/tasks/task-types.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi } from "./orchestration-helpers.ts";

type BackendRun = (invocation: BackendInvocation) => Promise<BackendRunResult>;

const backendMocks = vi.hoisted(() => {
	const run = vi.fn<BackendRun>();
	return {
		run,
		createCosmonautsSubagentBackend: vi.fn((): Backend => {
			return {
				name: "cosmonauts-subagent",
				capabilities: {
					canCommit: true,
					isolatedFromHostSource: false,
				},
				run,
			};
		}),
	};
});

vi.mock("../../lib/driver/backends/cosmonauts-subagent.ts", () => ({
	createCosmonautsSubagentBackend: backendMocks.createCosmonautsSubagentBackend,
}));

const temp = useTempDir("driver-e2e-test-");
const execFileAsync = promisify(execFile);
const PLAN_SLUG = "driver-e2e";
const PARENT_SESSION_ID = "driver-e2e-parent-session";
const TERMINAL_EVENTS = new Set<DriverEvent["type"]>([
	"run_completed",
	"run_aborted",
]);

describe("driver e2e run_driver integration", () => {
	beforeEach(() => {
		backendMocks.run.mockReset();
		backendMocks.createCosmonautsSubagentBackend.mockClear();
	});

	test("driver e2e happy path completes two tasks and tails JSONL events", async () => {
		const fixture = await setupFixture({ taskCount: 2 });
		const updateSpy = vi.spyOn(TaskManager.prototype, "updateTask");
		const busCapture = captureDriverBusEvents(
			fixture.projectRoot,
			fixture.planSlug,
		);
		backendMocks.run.mockImplementation(async (invocation) => {
			await emitBackendActivity(invocation);
			return successResult();
		});

		try {
			const result = await runDriver(fixture);
			const events = await waitForTerminalEvents(result.eventLogPath);
			const tailed = await tailEvents(result.eventLogPath);
			const tasks = await Promise.all(
				fixture.taskIds.map((taskId) => fixture.taskManager.getTask(taskId)),
			);

			expect(tasks.map((task) => task?.status)).toEqual(["Done", "Done"]);
			expect(updateStatuses(updateSpy)).toEqual([
				"In Progress",
				"Done",
				"In Progress",
				"Done",
			]);
			expect(events[0]).toMatchObject({ type: "run_started" });
			expect(events.filter(isTaskDone)).toHaveLength(2);
			expect(events.at(-1)).toMatchObject({
				type: "run_completed",
				summary: { total: 2, done: 2, blocked: 0 },
			});
			expect(tailed.events).toEqual(events);
			expect(tailed.cursor).toBe(events.length);
			expect(
				(await tailEvents(result.eventLogPath, tailed.cursor)).events,
			).toEqual([]);
			expect(backendMocks.run).toHaveBeenCalledTimes(2);
			expect(busCapture.types()).toContain("driver_activity");
			expect(busCapture.types()).toContain("driver_event");
			expect(busCapture.types()).not.toContain("spawn_activity");
			expect(busCapture.spawnEvents).toEqual([]);
			expect(busCapture.persistenceErrors).toEqual([]);
		} finally {
			busCapture.dispose();
		}
	});

	test("driver preflight failure aborts without task status updates", async () => {
		const fixture = await setupFixture({ taskCount: 1 });
		const updateSpy = vi.spyOn(TaskManager.prototype, "updateTask");
		backendMocks.run.mockResolvedValue(successResult());

		const result = await runDriver(fixture, {
			preflightCommands: [
				nodeCommand(
					"process.stderr.write('preflight failed'); process.exit(7)",
				),
			],
		});
		const events = await waitForTerminalEvents(result.eventLogPath);
		const task = await fixture.taskManager.getTask(onlyTaskId(fixture));

		expect(events).toContainEqual(
			expect.objectContaining({
				type: "run_aborted",
				reason: expect.stringContaining("preflight failed"),
			}),
		);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "preflight",
				status: "failed",
				details: expect.objectContaining({ command: expect.any(String) }),
			}),
		);
		expect(updateSpy).not.toHaveBeenCalled();
		expect(task?.status).toBe("To Do");
		expect(backendMocks.run).not.toHaveBeenCalled();
	});

	test("driver writes aborted completion when inline launch fails before the loop", async () => {
		const fixture = await setupFixture({ taskCount: 1 });
		const lock = await acquirePlanLock(
			fixture.planSlug,
			"already-running",
			fixture.projectRoot,
		);
		if ("error" in lock) {
			throw new Error("Fixture lock unexpectedly active");
		}

		try {
			const result = await runDriver(fixture);
			const completion = await waitForCompletion(result.workdir);

			expect(completion).toMatchObject({
				runId: result.runId,
				outcome: "aborted",
				blockedReason: expect.stringContaining("already-running"),
			});
		} finally {
			await (lock as LockHandle).release();
		}
	});

	test("driver branch mismatch emits structured preflight failure before transitions", async () => {
		const fixture = await setupFixture({ taskCount: 1 });
		await initGit(fixture.projectRoot);
		const updateSpy = vi.spyOn(TaskManager.prototype, "updateTask");
		backendMocks.run.mockResolvedValue(successResult());

		const result = await runDriver(fixture, { branch: "not-main" });
		const events = await waitForTerminalEvents(result.eventLogPath);
		const failedPreflightIndex = events.findIndex(
			(event) => event.type === "preflight" && event.status === "failed",
		);
		const abortedIndex = events.findIndex(
			(event) => event.type === "run_aborted",
		);

		expect(failedPreflightIndex).toBeGreaterThanOrEqual(0);
		expect(abortedIndex).toBeGreaterThan(failedPreflightIndex);
		expect(events[failedPreflightIndex]).toMatchObject({
			type: "preflight",
			status: "failed",
			details: {
				branch: "main",
				stderr: expect.stringContaining("branch mismatch"),
			},
		});
		expect(updateSpy).not.toHaveBeenCalled();
		expect(backendMocks.run).not.toHaveBeenCalled();
	});

	// @cosmo-behavior plan:coding-agnostic-framework#B-012
	test("run_driver uses the framework default envelope when envelopePath is omitted", async () => {
		const fixture = await setupFixture({ taskCount: 1 });
		const frameworkRoot = process.cwd();
		const expectedEnvelopePath = resolveDefaultDriveEnvelopePath({
			frameworkRoot,
		});
		backendMocks.run.mockResolvedValue(successResult());

		const result = await runDriver(fixture, {
			frameworkRoot,
			omitEnvelopePath: true,
		});
		await waitForCompletion(result.workdir);
		const spec = await readSpec(result.workdir);

		expect(spec.promptTemplate.envelopePath).toBe(expectedEnvelopePath);
		expect(relative(frameworkRoot, spec.promptTemplate.envelopePath)).toBe(
			DEFAULT_DRIVE_ENVELOPE_RELATIVE_PATH,
		);
		expect(spec.promptTemplate.envelopePath).not.toContain(
			"bundled/coding/coding",
		);
		await expect(
			readFile(spec.promptTemplate.envelopePath, "utf-8"),
		).resolves.toBe(await readFile(expectedEnvelopePath, "utf-8"));
	});

	test("freezes the execution-resolved worker for enabled default main project-bound and live-bound launches", async () => {
		const fixture = await setupFixture({ taskCount: 1 });
		await writeEpisodicConfig(fixture.projectRoot, true);
		backendMocks.run.mockResolvedValue(successResult());
		const cases = [
			{
				name: "default",
				domainContext: undefined,
				targetDomain: "coding",
			},
			{
				name: "main",
				domainContext: "main",
				targetDomain: "coding",
			},
			{
				name: "project-bound",
				domainContext: "coding",
				targetDomain: "project-coding",
			},
			{
				name: "live-bound",
				domainContext: "coding",
				targetDomain: "live-coding",
			},
		] as const;

		for (const testCase of cases) {
			const runtime = workerRuntime(
				testCase.domainContext,
				testCase.targetDomain,
			);
			const result = await runDriver(fixture, { runtime });
			await waitForCompletion(result.workdir);
			await delay(0);
			const spec = await readSpec(result.workdir);
			const executed = resolveDriveEpisodeWorker(runtime);

			expect(spec.episodeSource, testCase.name).toBe(executed?.qualifiedId);
			expect(spec.episodeSource, testCase.name).toBe(
				`${testCase.targetDomain}/worker`,
			);
			expect(spec.episodeAttemptId, testCase.name).toMatch(/^attempt-/u);
			expect(
				backendMocks.createCosmonautsSubagentBackend,
			).toHaveBeenLastCalledWith(
				expect.objectContaining({
					workerResolution: expect.objectContaining({
						qualifiedId: spec.episodeSource,
					}),
				}),
			);
		}
	});

	test("warns and omits episode identity when the enabled worker does not resolve", async () => {
		const fixture = await setupFixture({ taskCount: 1 });
		await writeEpisodicConfig(fixture.projectRoot, true);
		backendMocks.run.mockResolvedValue(successResult());
		const stderr = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);
		const runtime = {
			...workerRuntime("main", "coding"),
			agentRegistry: new AgentRegistry([]),
		};

		const result = await runDriver(fixture, { runtime });
		await waitForCompletion(result.workdir);
		const spec = await readSpec(result.workdir);

		expect(spec).not.toHaveProperty("episodeSource");
		expect(spec).not.toHaveProperty("episodeAttemptId");
		expect(stderr).toHaveBeenCalledWith(
			expect.stringContaining("Drive episode capture skipped"),
		);
		expect(backendMocks.run).toHaveBeenCalledTimes(1);
	});

	test("keeps absent and false-config inline specs and completions episode-free", async () => {
		const absent = await setupFixture({ taskCount: 1 });
		backendMocks.run.mockResolvedValue(successResult());

		const absentResult = await runDriver(absent);
		const absentCompletion = await waitForCompletion(absentResult.workdir);
		const absentSpec = await readSpec(absentResult.workdir);

		expect(absentSpec).not.toHaveProperty("episodeSource");
		expect(absentSpec).not.toHaveProperty("episodeAttemptId");
		expect(absentCompletion).not.toHaveProperty("completedAt");
		expect(existsSync(join(absent.projectRoot, "memory", "agent"))).toBe(false);

		const disabled = await setupFixture({ taskCount: 1 });
		await writeEpisodicConfig(disabled.projectRoot, false);
		const disabledResult = await runDriver(disabled);
		const disabledCompletion = await waitForCompletion(disabledResult.workdir);
		const disabledSpec = await readSpec(disabledResult.workdir);

		expect(disabledSpec).not.toHaveProperty("episodeSource");
		expect(disabledSpec).not.toHaveProperty("episodeAttemptId");
		expect(disabledCompletion).not.toHaveProperty("completedAt");
		expect(existsSync(join(disabled.projectRoot, "memory", "agent"))).toBe(
			false,
		);
	});

	// @cosmo-behavior plan:coding-agnostic-framework#B-025
	test("run_driver honors an explicit legacy bundled envelopePath", async () => {
		const fixture = await setupFixture({ taskCount: 1 });
		const frameworkRoot = process.cwd();
		const legacyEnvelopePath = join(
			frameworkRoot,
			"bundled",
			"coding",
			"drivers",
			"templates",
			"envelope.md",
		);
		backendMocks.run.mockResolvedValue(successResult());

		const result = await runDriver(fixture, {
			envelopePath: legacyEnvelopePath,
			frameworkRoot,
		});
		await waitForCompletion(result.workdir);
		const spec = await readSpec(result.workdir);

		expect(spec.promptTemplate.envelopePath).toBe(legacyEnvelopePath);
		expect(spec.promptTemplate.envelopePath).toContain(
			"bundled/coding/drivers/templates/envelope.md",
		);
		expect(spec.promptTemplate.envelopePath).not.toContain(
			"bundled/coding/coding",
		);
		await expect(
			readFile(spec.promptTemplate.envelopePath, "utf-8"),
		).resolves.toBe(await readFile(legacyEnvelopePath, "utf-8"));
	});

	// @cosmo-behavior plan:drive-resilience-state-model#B-012
	test("run_driver uses the project root for repository commit locking", async () => {
		const fixture = await setupFixture({ taskCount: 1 });
		const frameworkRoot = join(temp.path, "framework-root");
		await mkdir(frameworkRoot, { recursive: true });
		await initGit(fixture.projectRoot);
		await installCommitLockProbeHook(fixture.projectRoot, frameworkRoot);
		backendMocks.run.mockImplementation(async (invocation) => {
			await mkdir(join(fixture.projectRoot, "src"), { recursive: true });
			await writeFile(
				join(fixture.projectRoot, "src", `${invocation.taskId}.txt`),
				"committed by driver\n",
				"utf-8",
			);
			return successResult();
		});

		const result = await runDriver(fixture, {
			commitPolicy: "driver-commits",
			postflightCommands: [nodeCommand("process.exit(0)")],
			frameworkRoot,
		});
		const completion = await waitForCompletion(result.workdir);
		const events = await tailEvents(result.eventLogPath);

		expect(completion.outcome).toBe("completed");
		expect(events.events).toContainEqual(
			expect.objectContaining({
				type: "commit_made",
				sha: expect.stringMatching(/^[0-9a-f]{40}$/),
			}),
		);
		expect(
			await readFile(join(fixture.projectRoot, "hook-observed.txt"), "utf-8"),
		).toBe("project-lock-present\nframework-lock-absent\n");
	});

	// @cosmo-behavior plan:drive-resilience-state-model#B-013
	test("run_driver propagates state commit policy defaults and overrides", async () => {
		const fixture = await setupFixture({ taskCount: 1 });
		await initGit(fixture.projectRoot);
		backendMocks.run.mockResolvedValue(successResult());

		const defaulted = await runDriver(fixture, {
			commitPolicy: "driver-commits",
		});
		await waitForCompletion(defaulted.workdir);
		const defaultedSpec = await readSpec(defaulted.workdir);
		expect(defaultedSpec.stateCommitPolicy).toBeUndefined();
		expect(resolveStateCommitPolicy(defaultedSpec)).toBe("final-state-commit");

		const overridden = await runDriver(fixture, {
			commitPolicy: "driver-commits",
			stateCommitPolicy: "none",
		});
		await waitForCompletion(overridden.workdir);
		const overriddenSpec = await readSpec(overridden.workdir);
		expect(overriddenSpec.stateCommitPolicy).toBe("none");
		expect(resolveStateCommitPolicy(overriddenSpec)).toBe("none");
	});

	test("driver postverify failure blocks task and does not commit", async () => {
		const fixture = await setupFixture({ taskCount: 1 });
		await initGit(fixture.projectRoot);
		const beforeHead = await git(fixture.projectRoot, ["rev-parse", "HEAD"]);
		const updateSpy = vi.spyOn(TaskManager.prototype, "updateTask");
		backendMocks.run.mockImplementation(async (invocation) => {
			await mkdir(join(fixture.projectRoot, "src"), { recursive: true });
			await writeFile(
				join(fixture.projectRoot, "src", `${invocation.taskId}.txt`),
				"uncommitted\n",
				"utf-8",
			);
			return unknownResult();
		});

		const result = await runDriver(fixture, {
			commitPolicy: "driver-commits",
			postflightCommands: [
				nodeCommand("process.stderr.write('verify failed'); process.exit(3)"),
			],
		});
		const events = await waitForTerminalEvents(result.eventLogPath);
		const task = await fixture.taskManager.getTask(onlyTaskId(fixture));
		const afterHead = await git(fixture.projectRoot, ["rev-parse", "HEAD"]);

		const specDebug = await readFile(
			join(result.workdir, "spec.json"),
			"utf-8",
		);
		expect(
			task?.status,
			`${specDebug}\n${events.map((event) => JSON.stringify(event)).join("\n")}`,
		).toBe("Blocked");
		expect(task?.implementationNotes).toContain("post-verify failed");
		expect(updateStatuses(updateSpy)).toEqual(["In Progress", "Blocked"]);
		const blockedUpdate = updateSpy.mock.calls.at(-1)?.[1] as
			| TaskUpdateInput
			| undefined;
		expect(blockedUpdate).toMatchObject({
			status: "Blocked",
			implementationNotes: expect.stringContaining("verify failed"),
		});
		expect(blockedUpdate).not.toHaveProperty("note");
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "task_blocked",
				reason: expect.stringContaining("post-verify failed"),
			}),
		);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "run_aborted",
				reason: expect.stringContaining("post-verify failed"),
			}),
		);
		expect(events.map((event) => event.type)).not.toContain("commit_made");
		expect(afterHead.trim()).toBe(beforeHead.trim());
		expect(
			await git(fixture.projectRoot, ["diff", "--cached", "--name-only"]),
		).toBe("");
	});
});

interface Fixture {
	projectRoot: string;
	planSlug: string;
	envelopePath: string;
	taskIds: string[];
	taskManager: TaskManager;
}

interface DriverResultDetails {
	runId: string;
	planSlug: string;
	workdir: string;
	eventLogPath: string;
}

interface RunDriverOverrides {
	branch?: string;
	commitPolicy?: "driver-commits" | "backend-commits" | "no-commit";
	preflightCommands?: string[];
	postflightCommands?: string[];
	frameworkRoot?: string;
	stateCommitPolicy?: "final-state-commit" | "none";
	envelopePath?: string;
	omitEnvelopePath?: boolean;
	runtime?: Pick<
		CosmonautsRuntime,
		| "agentRegistry"
		| "domainContext"
		| "domainResolver"
		| "domainsDir"
		| "projectSkills"
		| "skillPaths"
	>;
}

function onlyTaskId(fixture: Fixture): string {
	const taskId = fixture.taskIds[0];
	if (!taskId) {
		throw new Error("expected fixture task");
	}
	return taskId;
}

async function setupFixture({
	taskCount,
}: {
	taskCount: number;
}): Promise<Fixture> {
	const projectRoot = join(temp.path, "project");
	await mkdir(projectRoot, { recursive: true });
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init();

	const taskIds: string[] = [];
	for (let index = 0; index < taskCount; index++) {
		const task = await taskManager.createTask({
			title: `Driver E2E Task ${index + 1}`,
			labels: [`plan:${PLAN_SLUG}`],
		});
		taskIds.push(task.id);
	}

	const envelopePath = join(projectRoot, "driver-envelope.md");
	await writeFile(envelopePath, "Driver envelope instructions\n", "utf-8");

	return {
		projectRoot,
		planSlug: PLAN_SLUG,
		envelopePath,
		taskIds,
		taskManager,
	};
}

async function runDriver(
	fixture: Fixture,
	overrides: RunDriverOverrides = {},
): Promise<DriverResultDetails> {
	const pi = createMockPi(fixture.projectRoot, {
		sessionId: PARENT_SESSION_ID,
	});
	registerDriverTool(
		pi as never,
		async () =>
			(overrides.runtime ??
				({
					agentRegistry: {},
					domainResolver: {},
					domainsDir: fixture.projectRoot,
					domainContext: "coding",
					projectSkills: [],
					skillPaths: [],
				} as never)) as CosmonautsRuntime,
		overrides.frameworkRoot ?? fixture.projectRoot,
	);
	registerWatchEventsTool(pi as never);

	const tool = pi.getTool("run_driver") as
		| { execute: unknown; parameters: unknown }
		| undefined;
	expect(tool?.execute).toBeTypeOf("function");
	expect(tool?.parameters).toBeDefined();

	const params: {
		planSlug: string;
		taskIds: string[];
		backend: "cosmonauts-subagent";
		mode: "inline";
		envelopePath?: string;
		commitPolicy: "driver-commits" | "backend-commits" | "no-commit";
		stateCommitPolicy?: "final-state-commit" | "none";
		preflightCommands: string[];
		postflightCommands: string[];
		branch?: string;
	} = {
		planSlug: fixture.planSlug,
		taskIds: fixture.taskIds,
		backend: "cosmonauts-subagent",
		mode: "inline",
		commitPolicy: overrides.commitPolicy ?? "no-commit",
		stateCommitPolicy: overrides.stateCommitPolicy,
		preflightCommands: overrides.preflightCommands ?? [],
		postflightCommands: overrides.postflightCommands ?? [],
		branch: overrides.branch,
	};
	if (!overrides.omitEnvelopePath) {
		params.envelopePath = overrides.envelopePath ?? fixture.envelopePath;
	}

	const response = (await pi.callTool("run_driver", params)) as {
		details: DriverResultDetails;
	};

	return response.details;
}

function workerRuntime(
	domainContext: string | undefined,
	targetDomain: string | undefined,
): Pick<
	CosmonautsRuntime,
	| "agentRegistry"
	| "domainContext"
	| "domainResolver"
	| "domainsDir"
	| "projectSkills"
	| "skillPaths"
> {
	const domains = new Set(
		["coding", targetDomain].filter((value): value is string => Boolean(value)),
	);
	const definitions = [...domains].map(workerDefinition);
	const bindingResolver = {
		resolveAgentReference(qualifiedId: string) {
			const [role, agentId] = qualifiedId.split("/");
			if (!role || !agentId) throw new Error("Expected qualified worker");
			const resolvedDomain =
				role === "coding" && targetDomain ? targetDomain : role;
			return {
				requested: { role, agentId, qualifiedId },
				resolved: {
					role: resolvedDomain,
					agentId,
					qualifiedId: `${resolvedDomain}/${agentId}`,
				},
				binding: {
					role,
					domainId: resolvedDomain,
					source: resolvedDomain === role ? "default" : "project",
				},
			};
		},
	} as never;
	return {
		agentRegistry: new AgentRegistry(definitions, { bindingResolver }),
		domainContext,
		domainResolver: {} as never,
		domainsDir: temp.path,
		projectSkills: [],
		skillPaths: [],
	};
}

function workerDefinition(domain: string): AgentDefinition {
	return {
		id: "worker",
		domain,
		description: `${domain} worker`,
		capabilities: [],
		model: "test/model",
		tools: "none",
		extensions: [],
		skills: [],
		projectContext: false,
		session: "ephemeral",
		loop: false,
	};
}

async function writeEpisodicConfig(
	projectRoot: string,
	enabled: boolean,
): Promise<void> {
	const configDir = join(projectRoot, ".cosmonauts");
	await mkdir(configDir, { recursive: true });
	await writeFile(
		join(configDir, "config.json"),
		JSON.stringify({ episodicLog: { enabled } }),
		"utf-8",
	);
}

async function readSpec(workdir: string): Promise<DriverRunSpec> {
	return JSON.parse(
		await readFile(join(workdir, "spec.json"), "utf-8"),
	) as DriverRunSpec;
}

async function waitForCompletion(workdir: string): Promise<DriverResult> {
	const completionPath = join(workdir, "run.completion.json");
	const deadline = Date.now() + 5_000;
	let lastError: unknown;

	while (Date.now() < deadline) {
		try {
			return JSON.parse(
				await readFile(completionPath, "utf-8"),
			) as DriverResult;
		} catch (error) {
			lastError = error;
		}
		await delay(10);
	}

	throw new Error(
		`Timed out waiting for run completion in ${completionPath}: ${formatError(lastError)}`,
	);
}

async function waitForTerminalEvents(
	eventLogPath: string,
): Promise<DriverEvent[]> {
	const deadline = Date.now() + 5_000;
	let lastError: unknown;

	while (Date.now() < deadline) {
		try {
			const { events } = await tailEvents(eventLogPath);
			if (events.some((event) => TERMINAL_EVENTS.has(event.type))) {
				return events;
			}
		} catch (error) {
			lastError = error;
		}
		await delay(10);
	}

	throw new Error(
		`Timed out waiting for terminal driver event in ${eventLogPath}: ${formatError(lastError)}`,
	);
}

function captureDriverBusEvents(
	projectRoot: string,
	planSlug: string,
): {
	busEvents: DriverBusEvent[];
	spawnEvents: SpawnActivityEvent[];
	persistenceErrors: string[];
	types(): string[];
	dispose(): void;
} {
	const busEvents: DriverBusEvent[] = [];
	const spawnEvents: SpawnActivityEvent[] = [];
	const persistenceErrors: string[] = [];
	const tokens = [
		activityBus.subscribe<DriverActivityBusEvent>(
			"driver_activity",
			(event) => {
				recordPersistenceCheck(projectRoot, planSlug, event, persistenceErrors);
				busEvents.push(event);
			},
		),
		activityBus.subscribe<DriverEventBusEvent>("driver_event", (event) => {
			recordPersistenceCheck(projectRoot, planSlug, event, persistenceErrors);
			busEvents.push(event);
		}),
		activityBus.subscribe<SpawnActivityEvent>("spawn_activity", (event) => {
			spawnEvents.push(event);
		}),
	];

	return {
		busEvents,
		spawnEvents,
		persistenceErrors,
		types: () => [
			...busEvents.map((event) => event.type),
			...spawnEvents.map((event) => event.type),
		],
		dispose() {
			for (const token of tokens) {
				activityBus.unsubscribe(token);
			}
		},
	};
}

function recordPersistenceCheck(
	projectRoot: string,
	planSlug: string,
	busEvent: DriverBusEvent,
	errors: string[],
): void {
	try {
		const logPath = join(
			projectRoot,
			"missions",
			"sessions",
			planSlug,
			"runs",
			busEvent.runId,
			"events.jsonl",
		);
		const loggedEvents = readLoggedEvents(logPath);
		const wasPersisted = loggedEvents.some((event) => {
			if (busEvent.type === "driver_event") {
				return JSON.stringify(event) === JSON.stringify(busEvent.event);
			}

			return (
				event.type === "driver_activity" &&
				event.runId === busEvent.runId &&
				event.parentSessionId === busEvent.parentSessionId &&
				event.taskId === busEvent.taskId &&
				JSON.stringify(event.activity) === JSON.stringify(busEvent.activity)
			);
		});
		if (!wasPersisted) {
			errors.push(`bus event ${busEvent.type} published before JSONL append`);
		}
	} catch (error) {
		errors.push(formatError(error));
	}
}

function readLoggedEvents(logPath: string): DriverEvent[] {
	return readFileSync(logPath, "utf-8")
		.split("\n")
		.filter((line) => line.length > 0)
		.map((line) => JSON.parse(line) as DriverEvent);
}

async function emitBackendActivity(
	invocation: BackendInvocation,
): Promise<void> {
	await invocation.eventSink({
		type: "driver_activity",
		runId: invocation.runId,
		parentSessionId: invocation.parentSessionId,
		timestamp: new Date().toISOString(),
		taskId: invocation.taskId,
		activity: {
			kind: "tool_start",
			toolName: "stub-backend",
			summary: `stubbed ${invocation.taskId}`,
		},
	});
}

function successResult(): BackendRunResult {
	return { exitCode: 0, stdout: "OUTCOME:success\n", durationMs: 1 };
}

function unknownResult(): BackendRunResult {
	return { exitCode: 0, stdout: "no structured report\n", durationMs: 1 };
}

function updateStatuses(updateSpy: {
	mock: { calls: Array<unknown[]> };
}): Array<TaskUpdateInput["status"]> {
	return updateSpy.mock.calls.map(
		(call) => (call[1] as TaskUpdateInput).status,
	);
}

function isTaskDone(
	event: DriverEvent,
): event is Extract<DriverEvent, { type: "task_done" }> {
	return event.type === "task_done";
}

async function initGit(projectRoot: string): Promise<void> {
	await git(projectRoot, ["init", "-b", "main"]);
	await git(projectRoot, ["config", "user.email", "driver@example.com"]);
	await git(projectRoot, ["config", "user.name", "Driver Test"]);
	await git(projectRoot, ["add", "."]);
	await git(projectRoot, ["commit", "-m", "initial"]);
}

async function installCommitLockProbeHook(
	projectRoot: string,
	frameworkRoot: string,
): Promise<void> {
	const hookPath = join(projectRoot, ".git", "hooks", "pre-commit");
	const projectLockPath = getRepoCommitLockPath(projectRoot);
	const frameworkLockPath = getRepoCommitLockPath(frameworkRoot);
	const observedPath = join(projectRoot, "hook-observed.txt");
	const script = `#!/bin/sh
if test -f ${shellQuote(projectLockPath)}; then
  printf 'project-lock-present\n' > ${shellQuote(observedPath)}
else
  printf 'project-lock-missing\n' > ${shellQuote(observedPath)}
  exit 1
fi
if test -f ${shellQuote(frameworkLockPath)}; then
  printf 'framework-lock-present\n' >> ${shellQuote(observedPath)}
  exit 1
fi
printf 'framework-lock-absent\n' >> ${shellQuote(observedPath)}
`;
	await writeFile(hookPath, script, "utf-8");
	await chmod(hookPath, 0o755);
}

async function git(cwd: string, args: string[]): Promise<string> {
	const { stdout } = await execFileAsync("git", args, { cwd });
	return stdout.toString();
}

function nodeCommand(script: string): string {
	return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
