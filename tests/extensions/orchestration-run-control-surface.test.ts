import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { registerDriverTool } from "../../domains/shared/extensions/orchestration/driver-tool.ts";
import { registerRunControlTools } from "../../domains/shared/extensions/orchestration/run-control-tools.ts";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import type {
	Backend,
	BackendInvocation,
	BackendRunResult,
} from "../../lib/driver/backends/types.ts";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";
import { runDurableChain } from "../../lib/orchestration/durable-chain-runner.ts";
import type {
	ChainResult,
	SpawnConfig,
} from "../../lib/orchestration/types.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi } from "./orchestration-helpers.ts";

const spawnerMocks = vi.hoisted(() => ({
	createPiSpawner: vi.fn(),
	dispose: vi.fn(),
	spawn: vi.fn(),
}));

const backendMocks = vi.hoisted(() => {
	const run =
		vi.fn<(invocation: BackendInvocation) => Promise<BackendRunResult>>();
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

vi.mock("../../lib/orchestration/agent-spawner.ts", () => ({
	createPiSpawner: spawnerMocks.createPiSpawner,
}));

vi.mock("../../lib/driver/backends/cosmonauts-subagent.ts", () => ({
	createCosmonautsSubagentBackend: backendMocks.createCosmonautsSubagentBackend,
}));

const temp = useTempDir("orchestration-run-control-surface-");
const PLAN_SLUG = "run-control-surface";
const PARENT_SESSION_ID = "run-control-surface-parent";
const registry = new AgentRegistry([agent("planner")]);

interface RunDriverDetails {
	runId: string;
	scope: string;
	planSlug: string;
	workdir: string;
	eventLogPath: string;
}

describe("orchestration run control surface", () => {
	beforeEach(() => {
		spawnerMocks.createPiSpawner.mockReset();
		spawnerMocks.dispose.mockReset();
		spawnerMocks.spawn.mockReset();
		backendMocks.run.mockReset();
		backendMocks.createCosmonautsSubagentBackend.mockClear();
		spawnerMocks.createPiSpawner.mockReturnValue({
			spawn: spawnerMocks.spawn,
			dispose: spawnerMocks.dispose,
		});
		spawnerMocks.spawn.mockImplementation(async (config: SpawnConfig) => ({
			success: true,
			sessionId: `session-${config.role}`,
			messages: [
				{
					role: "assistant",
					content: [{ type: "text", text: `${config.role} complete` }],
				},
			],
		}));
		backendMocks.run.mockResolvedValue(successResult());
	});

	// @cosmo-behavior plan:orchestration-surface-consolidation#B-007
	test("observes returned chain and Drive run ids through normalized status and watch", async () => {
		const projectRoot = join(temp.path, "project");
		await mkdir(projectRoot, { recursive: true });
		const chainResult = await runDurableChain({
			steps: parseChain("planner", registry),
			projectRoot,
			registry,
		});
		const chainRun = requireRun(chainResult);

		const fixture = await setupDriveFixture(projectRoot);
		const pi = createMockPi(projectRoot, { sessionId: PARENT_SESSION_ID });
		registerDriverTool(pi as never, runtimeFor(projectRoot), projectRoot);
		registerRunControlTools(pi as never);

		const driveResponse = (await pi.callTool("run_driver", {
			planSlug: PLAN_SLUG,
			taskIds: [fixture.taskId],
			backend: "cosmonauts-subagent",
			mode: "inline",
			envelopePath: fixture.envelopePath,
			commitPolicy: "no-commit",
			stateCommitPolicy: "none",
		})) as { details: RunDriverDetails };
		await waitForCompletion(driveResponse.details.workdir);

		expect(driveResponse.details.scope).toBe(PLAN_SLUG);

		const chainStatus = (await pi.callTool("run_status", chainRun)) as {
			details: { scope: string; runId: string; status: string } | undefined;
		};
		const chainWatch = (await pi.callTool("run_watch", chainRun)) as {
			details: {
				scope: string;
				runId: string;
				found: boolean;
				events: unknown[];
			};
		};
		const driveRef = {
			scope: driveResponse.details.scope,
			runId: driveResponse.details.runId,
		};
		const driveStatus = (await pi.callTool("run_status", driveRef)) as {
			details: { scope: string; runId: string; status: string } | undefined;
		};
		const driveWatch = (await pi.callTool("run_watch", driveRef)) as {
			details: {
				scope: string;
				runId: string;
				found: boolean;
				events: unknown[];
			};
		};

		expect(chainStatus.details).toMatchObject({
			scope: "chain",
			runId: chainRun.runId,
			status: "completed",
		});
		expect(chainWatch.details).toMatchObject({
			scope: "chain",
			runId: chainRun.runId,
			found: true,
		});
		expect(chainWatch.details.events.length).toBeGreaterThan(0);
		expect(driveStatus.details).toMatchObject({
			scope: PLAN_SLUG,
			runId: driveRef.runId,
			status: "completed",
		});
		expect(driveWatch.details).toMatchObject({
			scope: PLAN_SLUG,
			runId: driveRef.runId,
			found: true,
		});
		expect(driveWatch.details.events.length).toBeGreaterThan(0);
	});
});

async function setupDriveFixture(projectRoot: string) {
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init();
	const task = await taskManager.createTask({
		title: "Run control surface task",
		labels: [`plan:${PLAN_SLUG}`],
	});
	const envelopePath = join(projectRoot, "driver-envelope.md");
	await writeFile(envelopePath, "Driver envelope instructions\n", "utf-8");
	return { taskId: task.id, envelopePath };
}

function runtimeFor(projectRoot: string) {
	return async () =>
		({
			agentRegistry: registry,
			domainResolver: {},
			domainsDir: projectRoot,
			domainContext: "coding",
			projectSkills: [],
			skillPaths: [],
		}) as never;
}

function requireRun(result: ChainResult): { runId: string; scope: "chain" } {
	if (!result.run) {
		throw new Error("Expected durable chain result to include run metadata.");
	}
	return result.run;
}

async function waitForCompletion(workdir: string): Promise<void> {
	const completionPath = join(workdir, "run.completion.json");
	const deadline = Date.now() + 5_000;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			await readFile(completionPath, "utf-8");
			return;
		} catch (error) {
			lastError = error;
		}
		await delay(10);
	}
	throw new Error(
		`Timed out waiting for run completion in ${completionPath}: ${formatError(lastError)}`,
	);
}

function successResult(): BackendRunResult {
	return {
		exitCode: 0,
		stdout: "OUTCOME:success\n",
		durationMs: 1,
	};
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function agent(id: string): AgentDefinition {
	return {
		id,
		description: `Test ${id}`,
		capabilities: [],
		model: "test/model",
		tools: "none",
		extensions: [],
		skills: ["*"],
		projectContext: false,
		session: "ephemeral",
		loop: false,
		domain: "coding",
	};
}
