import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import "./orchestration-mocks.ts";
import { registerDriverTool } from "../../domains/shared/extensions/orchestration/driver-tool.ts";
import { AgentRegistry } from "../../lib/agents/index.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import type { DriverDeps } from "../../lib/driver/driver.ts";
import { resolveDriveEpisodeWorker } from "../../lib/driver/episode-identity.ts";
import type {
	DriverHandle,
	DriverResult,
	DriverRunSpec,
} from "../../lib/driver/types.ts";
import type { CosmonautsRuntime } from "../../lib/runtime.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi } from "./orchestration-helpers.ts";

const driverMocks = vi.hoisted(() => ({
	runInline: vi.fn(),
	startDetached: vi.fn(
		(spec: DriverRunSpec, _deps: DriverDeps): DriverHandle => {
			const result: DriverResult = {
				runId: spec.runId,
				outcome: "completed",
				tasksDone: spec.taskIds.length,
				tasksBlocked: 0,
			};
			return {
				runId: spec.runId,
				planSlug: spec.planSlug,
				workdir: spec.workdir,
				eventLogPath: spec.eventLogPath,
				abort: vi.fn<() => Promise<void>>(async () => undefined),
				result: Promise.resolve(result),
			};
		},
	),
}));

vi.mock("../../lib/driver/driver.ts", () => ({
	runInline: driverMocks.runInline,
	startDetached: driverMocks.startDetached,
}));

const temp = useTempDir("driver-tool-detached-test-");
const PLAN_SLUG = "driver-tool-detached";
const PARENT_SESSION_ID = "driver-tool-detached-parent";

describe("run_driver detached mode", () => {
	beforeEach(() => {
		driverMocks.runInline.mockClear();
		driverMocks.startDetached.mockClear();
	});

	test("preserves tool registration shape while accepting detached-capable parameters", async () => {
		const fixture = await setupFixture("schema");
		const pi = createMockPi(fixture.projectRoot);

		registerDriverTool(pi as never, vi.fn(), fixture.projectRoot);

		const tool = pi.getTool("run_driver") as
			| { execute: unknown; parameters: unknown; label?: string }
			| undefined;
		expect(tool?.execute).toBeTypeOf("function");
		expect(tool?.label).toBe("Run Driver");
		const schema = JSON.stringify(tool?.parameters);
		expect(schema).toContain("cosmonauts-subagent");
		expect(schema).toContain("codex");
		expect(schema).toContain("claude-cli");
		expect(schema).toContain("inline");
		expect(schema).toContain("detached");
	});

	test("routes detached codex runs to startDetached and returns handle details", async () => {
		const fixture = await setupFixture("codex");
		const pi = createMockPi(fixture.projectRoot, {
			sessionId: PARENT_SESSION_ID,
		});
		const getRuntime = vi.fn();
		registerDriverTool(pi as never, getRuntime as never, fixture.projectRoot);

		const response = (await pi.callTool("run_driver", {
			planSlug: fixture.planSlug,
			taskIds: fixture.taskIds,
			backend: "codex",
			mode: "detached",
			envelopePath: fixture.envelopePath,
			commitPolicy: "no-commit",
		})) as { details: DriverRunDetails };

		expect(response.details).toMatchObject({
			runId: expect.stringMatching(/^run-/),
			scope: fixture.planSlug,
			planSlug: fixture.planSlug,
			eventLogPath: expect.stringContaining("events.jsonl"),
		});
		expect(response.details.workdir).toContain(
			join("missions", "sessions", fixture.planSlug, "runs"),
		);
		expect(driverMocks.startDetached).toHaveBeenCalledTimes(1);
		expect(driverMocks.runInline).not.toHaveBeenCalled();
		expect(getRuntime).not.toHaveBeenCalled();

		const [spec, deps] = driverMocks.startDetached.mock.calls[0] as [
			DriverRunSpec,
			DriverDeps,
		];
		expect(spec).toMatchObject({
			runId: response.details.runId,
			parentSessionId: PARENT_SESSION_ID,
			projectRoot: fixture.projectRoot,
			planSlug: fixture.planSlug,
			taskIds: fixture.taskIds,
			backendName: "codex",
			commitPolicy: "no-commit",
		});
		expect(spec).not.toHaveProperty("episodeSource");
		expect(spec).not.toHaveProperty("episodeAttemptId");
		expect(deps.backend.name).toBe("codex");
		expect(existsSync(spec.workdir)).toBe(false);
		expect(existsSync(join(spec.workdir, "spec.json"))).toBe(false);
	});

	test("keeps false-config detached specs free of episode metadata and runtime resolution", async () => {
		const fixture = await setupFixture("disabled-false");
		await writeEpisodicConfig(fixture.projectRoot, false);
		const pi = createMockPi(fixture.projectRoot, {
			sessionId: PARENT_SESSION_ID,
		});
		const getRuntime = vi.fn();
		registerDriverTool(pi as never, getRuntime as never, fixture.projectRoot);

		await pi.callTool("run_driver", {
			planSlug: fixture.planSlug,
			taskIds: fixture.taskIds,
			backend: "claude-cli",
			mode: "detached",
			envelopePath: fixture.envelopePath,
			commitPolicy: "no-commit",
		});

		const [spec] = driverMocks.startDetached.mock.calls[0] as [
			DriverRunSpec,
			DriverDeps,
		];
		expect(spec).not.toHaveProperty("episodeSource");
		expect(spec).not.toHaveProperty("episodeAttemptId");
		expect(getRuntime).not.toHaveBeenCalled();
		expect(existsSync(join(fixture.projectRoot, "memory", "agent"))).toBe(
			false,
		);
	});

	test("freezes enabled detached Codex and Claude specs from bound Pi runtimes", async () => {
		const cases = [
			{
				name: "default",
				domainContext: undefined,
				targetDomain: "coding",
				backend: "codex",
			},
			{
				name: "main",
				domainContext: "main",
				targetDomain: "coding",
				backend: "claude-cli",
			},
			{
				name: "project-bound",
				domainContext: "coding",
				targetDomain: "project-coding",
				backend: "codex",
			},
			{
				name: "live-bound",
				domainContext: "coding",
				targetDomain: "live-coding",
				backend: "claude-cli",
			},
		] as const;

		for (const testCase of cases) {
			const fixture = await setupFixture(`enabled-${testCase.name}`);
			await writeEpisodicConfig(fixture.projectRoot, true);
			const runtime = workerRuntime(
				testCase.domainContext,
				testCase.targetDomain,
			);
			const getRuntime = vi.fn(async () => runtime as CosmonautsRuntime);
			const pi = createMockPi(fixture.projectRoot, {
				sessionId: PARENT_SESSION_ID,
			});
			registerDriverTool(pi as never, getRuntime as never, fixture.projectRoot);

			await pi.callTool("run_driver", {
				planSlug: fixture.planSlug,
				taskIds: fixture.taskIds,
				backend: testCase.backend,
				mode: "detached",
				envelopePath: fixture.envelopePath,
				commitPolicy: "no-commit",
			});

			const call = driverMocks.startDetached.mock.calls.at(-1);
			const spec = call?.[0];
			const executed = resolveDriveEpisodeWorker(runtime);
			expect(spec?.backendName, testCase.name).toBe(testCase.backend);
			expect(spec?.episodeSource, testCase.name).toBe(executed?.qualifiedId);
			expect(spec?.episodeSource, testCase.name).toBe(
				`${testCase.targetDomain}/worker`,
			);
			expect(spec?.episodeAttemptId, testCase.name).toMatch(/^attempt-/u);
			expect(getRuntime, testCase.name).toHaveBeenCalledTimes(1);
		}
	});

	// @cosmo-behavior plan:orchestration-surface-consolidation#B-006
	test("returns scope alongside runId and rejects the reserved chain plan slug", async () => {
		const fixture = await setupFixture("reserved-scope");
		const pi = createMockPi(fixture.projectRoot, {
			sessionId: PARENT_SESSION_ID,
		});
		const getRuntime = vi.fn();
		registerDriverTool(pi as never, getRuntime as never, fixture.projectRoot);

		const response = (await pi.callTool("run_driver", {
			planSlug: "chain",
			taskIds: fixture.taskIds,
			backend: "codex",
			mode: "detached",
			envelopePath: fixture.envelopePath,
			commitPolicy: "no-commit",
		})) as { details: ReservedScopeDetails };

		expect(response.details).toEqual({
			error: "reserved_scope",
			planSlug: "chain",
			scope: "chain",
			message:
				'Plan slug "chain" is reserved for graph-backed chain runs and cannot be used for Drive.',
		});
		expect(driverMocks.startDetached).not.toHaveBeenCalled();
		expect(driverMocks.runInline).not.toHaveBeenCalled();
		expect(getRuntime).not.toHaveBeenCalled();
		expect(
			existsSync(join(fixture.projectRoot, "missions", "sessions", "chain")),
		).toBe(false);
	});

	test("defaults omitted mode to detached for four or more tasks", async () => {
		const fixture = await setupFixture("implicit-detached", { taskCount: 4 });
		const pi = createMockPi(fixture.projectRoot, {
			sessionId: PARENT_SESSION_ID,
		});
		const getRuntime = vi.fn();
		registerDriverTool(pi as never, getRuntime as never, fixture.projectRoot);

		const response = (await pi.callTool("run_driver", {
			planSlug: fixture.planSlug,
			taskIds: fixture.taskIds,
			backend: "codex",
			envelopePath: fixture.envelopePath,
			commitPolicy: "no-commit",
		})) as { details: DriverRunDetails };

		expect(response.details.runId).toMatch(/^run-/);
		expect(driverMocks.startDetached).toHaveBeenCalledTimes(1);
		expect(driverMocks.runInline).not.toHaveBeenCalled();
		expect(getRuntime).not.toHaveBeenCalled();

		const [spec] = driverMocks.startDetached.mock.calls[0] as [
			DriverRunSpec,
			DriverDeps,
		];
		expect(spec.taskIds).toEqual(fixture.taskIds);
		expect(spec.backendName).toBe("codex");
	});

	test("preserves explicit inline mode for four or more tasks", async () => {
		const fixture = await setupFixture("explicit-inline", { taskCount: 4 });
		const pi = createMockPi(fixture.projectRoot, {
			sessionId: PARENT_SESSION_ID,
		});
		const getRuntime = vi.fn(async () => ({
			agentRegistry: {},
			domainResolver: {},
			domainsDir: fixture.projectRoot,
			domainContext: "coding",
			projectSkills: [],
			skillPaths: [],
		}));
		driverMocks.runInline.mockImplementationOnce(
			(spec: DriverRunSpec, _deps: DriverDeps): DriverHandle => {
				const result: DriverResult = {
					runId: spec.runId,
					outcome: "completed",
					tasksDone: spec.taskIds.length,
					tasksBlocked: 0,
				};
				return {
					runId: spec.runId,
					planSlug: spec.planSlug,
					workdir: spec.workdir,
					eventLogPath: spec.eventLogPath,
					abort: vi.fn<() => Promise<void>>(async () => undefined),
					result: Promise.resolve(result),
				};
			},
		);
		registerDriverTool(pi as never, getRuntime as never, fixture.projectRoot);

		await pi.callTool("run_driver", {
			planSlug: fixture.planSlug,
			taskIds: fixture.taskIds,
			backend: "cosmonauts-subagent",
			mode: "inline",
			envelopePath: fixture.envelopePath,
			commitPolicy: "no-commit",
		});

		expect(driverMocks.runInline).toHaveBeenCalledTimes(1);
		expect(driverMocks.startDetached).not.toHaveBeenCalled();
		expect(getRuntime).toHaveBeenCalledTimes(1);
	});

	test("rejects cosmonauts-subagent detached runs before startDetached", async () => {
		const fixture = await setupFixture("unsupported");
		const pi = createMockPi(fixture.projectRoot);
		const getRuntime = vi.fn();
		registerDriverTool(pi as never, getRuntime as never, fixture.projectRoot);

		const response = (await pi.callTool("run_driver", {
			planSlug: fixture.planSlug,
			taskIds: fixture.taskIds,
			backend: "cosmonauts-subagent",
			mode: "detached",
			envelopePath: fixture.envelopePath,
		})) as { details: UnsupportedDetachedBackendDetails };

		expect(response.details).toEqual({
			error: "detached_backend_not_supported",
			backend: "cosmonauts-subagent",
			mode: "detached",
			message:
				"Backend cosmonauts-subagent is not supported for detached mode.",
		});
		expect(driverMocks.startDetached).not.toHaveBeenCalled();
		expect(driverMocks.runInline).not.toHaveBeenCalled();
		expect(getRuntime).not.toHaveBeenCalled();
		expect(
			existsSync(
				join(
					fixture.projectRoot,
					"missions",
					"sessions",
					fixture.planSlug,
					"runs",
				),
			),
		).toBe(false);
	});

	test("rejects omitted-mode cosmonauts-subagent runs that default to detached", async () => {
		const fixture = await setupFixture("implicit-detached-unsupported", {
			taskCount: 4,
		});
		const pi = createMockPi(fixture.projectRoot);
		const getRuntime = vi.fn();
		registerDriverTool(pi as never, getRuntime as never, fixture.projectRoot);

		const response = (await pi.callTool("run_driver", {
			planSlug: fixture.planSlug,
			taskIds: fixture.taskIds,
			backend: "cosmonauts-subagent",
			envelopePath: fixture.envelopePath,
		})) as { details: UnsupportedDetachedBackendDetails };

		expect(response.details).toEqual({
			error: "detached_backend_not_supported",
			backend: "cosmonauts-subagent",
			mode: "detached",
			message:
				"Backend cosmonauts-subagent is not supported for detached mode.",
		});
		expect(driverMocks.startDetached).not.toHaveBeenCalled();
		expect(driverMocks.runInline).not.toHaveBeenCalled();
		expect(getRuntime).not.toHaveBeenCalled();
	});
});

interface Fixture {
	projectRoot: string;
	planSlug: string;
	envelopePath: string;
	taskIds: string[];
}

interface DriverRunDetails {
	runId: string;
	scope: string;
	planSlug: string;
	workdir: string;
	eventLogPath: string;
}

interface ReservedScopeDetails {
	error: "reserved_scope";
	planSlug: "chain";
	scope: "chain";
	message: string;
}

interface UnsupportedDetachedBackendDetails {
	error: "detached_backend_not_supported";
	backend: "cosmonauts-subagent";
	mode: "detached";
	message: string;
}

async function setupFixture(
	name: string,
	options?: { taskCount?: number },
): Promise<Fixture> {
	const projectRoot = join(temp.path, name, "project");
	await mkdir(projectRoot, { recursive: true });
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init();
	const taskIds: string[] = [];
	for (let index = 0; index < (options?.taskCount ?? 1); index++) {
		const task = await taskManager.createTask({
			title: `Detached Tool Fixture ${name} ${index + 1}`,
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

function workerRuntime(
	domainContext: string | undefined,
	targetDomain: string,
): Pick<CosmonautsRuntime, "agentRegistry" | "domainContext"> {
	const definitions = [...new Set(["coding", targetDomain])].map(
		workerDefinition,
	);
	const bindingResolver = {
		resolveAgentReference(qualifiedId: string) {
			const [role, agentId] = qualifiedId.split("/");
			if (!role || !agentId) throw new Error("Expected qualified worker");
			const resolvedDomain = role === "coding" ? targetDomain : role;
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
					source:
						resolvedDomain === role
							? "default"
							: targetDomain === "live-coding"
								? "live"
								: "project",
				},
			};
		},
	} as never;
	return {
		agentRegistry: new AgentRegistry(definitions, { bindingResolver }),
		domainContext,
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
