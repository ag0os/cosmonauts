import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createRunProgram } from "../../../cli/run/subcommand.ts";
import type { CliRuntimeOptions } from "../../../cli/runtime-bootstrap.ts";
import { parseCliRuntimeOptions } from "../../../cli/runtime-bootstrap.ts";
import type { DriverHandle, DriverRunSpec } from "../../../lib/driver/types.ts";
import { FileRunStore } from "../../../lib/durable-runtime/index.ts";
import { TaskManager } from "../../../lib/tasks/task-manager.ts";
import type { Task } from "../../../lib/tasks/task-types.ts";
import { captureCliOutput } from "../../helpers/cli.ts";
import { useTempDir } from "../../helpers/fs.ts";

const chainMocks = vi.hoisted(() => ({
	executeChainExpression: vi.fn(),
}));

const driverMocks = vi.hoisted(() => ({
	runInline: vi.fn(
		(spec: DriverRunSpec): DriverHandle => ({
			runId: spec.runId,
			planSlug: spec.planSlug,
			workdir: spec.workdir,
			eventLogPath: spec.eventLogPath,
			result: Promise.resolve({
				runId: spec.runId,
				outcome: "completed" as const,
				tasksDone: spec.taskIds.length,
				tasksBlocked: 0,
			}),
			abort: vi.fn(),
		}),
	),
	startDetached: vi.fn(
		(spec: DriverRunSpec): DriverHandle => ({
			runId: spec.runId,
			planSlug: spec.planSlug,
			workdir: spec.workdir,
			eventLogPath: spec.eventLogPath,
			result: Promise.resolve({
				runId: spec.runId,
				outcome: "completed" as const,
				tasksDone: spec.taskIds.length,
				tasksBlocked: 0,
			}),
			abort: vi.fn(),
		}),
	),
}));

const backendMocks = vi.hoisted(() => ({
	resolveConfiguredExternalBackend: vi.fn((name: string) => ({
		name,
		capabilities: { canCommit: false, isolatedFromHostSource: true },
		run: vi.fn(),
	})),
}));

vi.mock("../../../cli/chain-execution.ts", () => ({
	executeChainExpression: chainMocks.executeChainExpression,
}));

vi.mock("../../../lib/driver/driver.ts", () => ({
	runInline: driverMocks.runInline,
	startDetached: driverMocks.startDetached,
}));

vi.mock("../../../lib/driver/backend-resolution.ts", () => ({
	resolveConfiguredExternalBackend:
		backendMocks.resolveConfiguredExternalBackend,
}));

const temp = useTempDir("run-subcommand-");
const DRIVE_PLAN = "drive-plan";

describe("cosmonauts run", () => {
	let output: ReturnType<typeof captureCliOutput>;
	let originalCwd: string;

	beforeEach(() => {
		originalCwd = process.cwd();
		process.chdir(temp.path);
		output = captureCliOutput();
		process.exitCode = undefined;
		chainMocks.executeChainExpression.mockReset();
		driverMocks.runInline.mockClear();
		driverMocks.startDetached.mockClear();
		backendMocks.resolveConfiguredExternalBackend.mockClear();
		chainMocks.executeChainExpression.mockResolvedValue({
			success: true,
			stageResults: [],
			totalDurationMs: 0,
			errors: [],
		});
	});

	afterEach(() => {
		output.restore();
		process.chdir(originalCwd);
		process.exitCode = undefined;
		vi.restoreAllMocks();
	});

	// @cosmo-behavior plan:orchestration-surface-consolidation#B-010
	test("parses runtime flags before run and passes them to run chain execution", async () => {
		const parsed = parseCliRuntimeOptions([
			"--theme",
			"solarized",
			"--domain",
			"coding",
			"--plugin-dir",
			"/tmp/domain-a",
			"--model",
			"test/model",
			"--thinking",
			"low",
			"--completion-label",
			"plan:ship",
			"--profile",
			"run",
			"chain",
			"verify",
			"check this",
		]);
		expect(parsed.remaining).toEqual(["run", "chain", "verify", "check this"]);
		expect(parsed.options).toEqual({
			piFlags: { themes: ["solarized"] },
			domain: "coding",
			pluginDirs: ["/tmp/domain-a"],
			model: "test/model",
			thinking: "low",
			completionLabel: "plan:ship",
			profile: true,
		});

		const runtime = runtimeFixture([
			{
				name: "verify",
				description: "Review the project",
				chain: "quality-manager",
			},
		]);
		const runtimeOptions = parsed.options;
		await parseRun(["chain", "verify", "check this"], {
			runtimeOptions,
			runtime,
		});

		expect(chainMocks.executeChainExpression).toHaveBeenCalledWith({
			runtime,
			cwd: temp.path,
			chainExpr: "quality-manager",
			options: {
				...runtimeOptions,
				prompt: "check this",
			},
		});
		expect(JSON.parse(output.stdout())).toMatchObject({
			chain: {
				source: "named",
				input: "verify",
				name: "verify",
				expression: "quality-manager",
			},
			result: { success: true },
		});
		expect(output.stderr()).toBe("");
	});

	// @cosmo-behavior plan:orchestration-surface-consolidation#B-012
	test("starts Drive through run drive and rejects the reserved chain plan slug", async () => {
		const fixture = await setupDriveFixture(2);

		await parseRun([
			"drive",
			"--plan",
			DRIVE_PLAN,
			"--task-ids",
			fixture.tasks.map((task) => task.id).join(","),
			"--backend",
			"codex",
			"--mode",
			"inline",
			"--envelope",
			fixture.envelopePath,
		]);

		expect(driverMocks.runInline).toHaveBeenCalledTimes(1);
		expect(driverMocks.startDetached).not.toHaveBeenCalled();
		expect(driverMocks.runInline.mock.calls[0]?.[0]).toMatchObject({
			projectRoot: process.cwd(),
			planSlug: DRIVE_PLAN,
			taskIds: fixture.tasks.map((task) => task.id),
			backendName: "codex",
			commitPolicy: "driver-commits",
		});
		expect(JSON.parse(output.stdout())).toMatchObject({
			runId: expect.stringMatching(/^run-/),
			scope: DRIVE_PLAN,
			outcome: "completed",
			tasksDone: 2,
			tasksBlocked: 0,
		});

		resetOutput();
		driverMocks.runInline.mockClear();
		await parseRun([
			"drive",
			"--plan",
			DRIVE_PLAN,
			"--task-ids",
			fixture.tasks[0]?.id ?? "TASK-001",
			"--backend",
			"codex",
			"--mode",
			"detached",
			"--envelope",
			fixture.envelopePath,
		]);

		expect(driverMocks.startDetached).toHaveBeenCalledTimes(1);
		expect(JSON.parse(output.stdout())).toMatchObject({
			runId: expect.stringMatching(/^run-/),
			scope: DRIVE_PLAN,
			planSlug: DRIVE_PLAN,
			workdir: expect.stringContaining(
				`missions/sessions/${DRIVE_PLAN}/runs/run-`,
			),
			eventLogPath: expect.stringContaining("events.jsonl"),
		});

		resetOutput();
		driverMocks.startDetached.mockClear();
		await expect(
			parseRun([
				"drive",
				"--plan",
				"chain",
				"--task-ids",
				fixture.tasks[0]?.id ?? "TASK-001",
				"--backend",
				"codex",
				"--mode",
				"inline",
				"--envelope",
				fixture.envelopePath,
			]),
		).rejects.toThrow(
			'Plan slug "chain" is reserved for graph-backed chain runs and cannot be used for Drive.',
		);
		expect(driverMocks.runInline).not.toHaveBeenCalled();
		expect(driverMocks.startDetached).not.toHaveBeenCalled();
	});

	// @cosmo-behavior plan:orchestration-surface-consolidation#B-014
	// @cosmo-behavior plan:orchestration-surface-consolidation#B-019
	test("rejects run spawn", async () => {
		await expect(parseRun(["spawn", "coding/worker", "do it"])).rejects.toThrow(
			"unknown command 'spawn'",
		);
		expect(output.stdout()).toBe("");
	});

	// @cosmo-behavior plan:orchestration-surface-consolidation#B-013
	test("status watch and list use normalized store observations with inferred scope", async () => {
		const store = new FileRunStore({
			rootDir: join(temp.path, "missions", "sessions"),
		});
		const record = await store.createRun({
			scope: "plan-a",
			runId: "run-observe",
			status: "running",
			metadata: { source: "test" },
		});
		await store.appendEvent(record, {
			type: "run_started",
			runId: record.runId,
		});
		await store.appendEvent(record, {
			type: "run_completed",
			runId: record.runId,
			result: { outcome: "completed" },
		});

		await parseRun(["status", "run-observe"]);
		expect(JSON.parse(output.stdout())).toMatchObject({
			found: true,
			scope: "plan-a",
			runId: "run-observe",
			status: "completed",
			statusSource: "event",
		});
		expect(output.stderr()).toBe("");

		resetOutput();
		await parseRun(["watch", "run-observe", "--since-seq", "1"]);
		expect(JSON.parse(output.stdout())).toMatchObject({
			found: true,
			scope: "plan-a",
			runId: "run-observe",
			cursor: 2,
			events: [
				{
					seq: 2,
					text: "2 run_completed: completed",
				},
			],
		});
		expect(output.stderr()).toBe("");

		resetOutput();
		await parseRun(["list", "--scope", "plan-a"]);
		expect(JSON.parse(output.stdout())).toEqual([
			expect.objectContaining({
				scope: "plan-a",
				runId: "run-observe",
				status: "completed",
				statusSource: "event",
				metadata: { source: "test" },
			}),
		]);
		expect(output.stderr()).toBe("");
	});

	test("status and list reconcile a running record from a terminal event", async () => {
		const store = new FileRunStore({
			rootDir: join(temp.path, "missions", "sessions"),
		});
		const record = await store.createRun({
			scope: "plan-a",
			runId: "run-stale-running",
			status: "running",
			metadata: { source: "drive" },
		});
		await writeFile(
			record.eventsPath,
			[
				JSON.stringify({
					seq: 1,
					timestamp: "2026-06-24T17:00:00.000Z",
					runId: record.runId,
					event: { type: "run_started", runId: record.runId },
				}),
				JSON.stringify({
					seq: 2,
					timestamp: "2026-06-24T17:01:00.000Z",
					runId: record.runId,
					event: {
						type: "run_failed",
						runId: record.runId,
						reason: "operator stopped run",
					},
				}),
			].join("\n"),
			"utf-8",
		);

		await parseRun(["status", "run-stale-running"]);
		expect(JSON.parse(output.stdout())).toMatchObject({
			found: true,
			scope: "plan-a",
			runId: "run-stale-running",
			status: "failed",
			statusSource: "event",
			recordStatus: "running",
			eventStatus: "failed",
			updatedAt: "2026-06-24T17:01:00.000Z",
		});
		expect(output.stderr()).toBe("");

		resetOutput();
		await parseRun(["list", "--scope", "plan-a"]);
		expect(JSON.parse(output.stdout())).toEqual([
			expect.objectContaining({
				scope: "plan-a",
				runId: "run-stale-running",
				status: "failed",
				statusSource: "event",
				recordStatus: "running",
				updatedAt: "2026-06-24T17:01:00.000Z",
				metadata: { source: "drive" },
			}),
		]);
		expect(output.stderr()).toBe("");
	});

	test("resolves named chains from a bound default domain", async () => {
		const runtime = runtimeFixture(
			[],
			[
				{
					manifest: { id: "coding", description: "Coding" },
					chains: [
						{
							name: "coding-chain",
							description: "Coding chain",
							chain: "coordinator",
						},
					],
				},
				{
					manifest: { id: "ruby-coding", description: "Ruby coding" },
					chains: [
						{
							name: "ruby-chain",
							description: "Ruby chain",
							chain: "ruby-planner",
						},
					],
				},
			],
			{
				domainContext: "coding",
				bindingResolver: {
					resolveKnownRole: vi.fn((role: string) =>
						role === "coding" ? { role, domainId: "ruby-coding" } : undefined,
					),
				},
			},
		);

		await parseRun(["chain", "ruby-chain", "check ruby"], { runtime });

		expect(chainMocks.executeChainExpression).toHaveBeenCalledWith({
			runtime,
			cwd: temp.path,
			chainExpr: "ruby-planner",
			options: {
				piFlags: {},
				prompt: "check ruby",
			},
		});
		expect(JSON.parse(output.stdout())).toMatchObject({
			chain: {
				source: "named",
				input: "ruby-chain",
				name: "ruby-chain",
				expression: "ruby-planner",
			},
			result: { success: true },
		});
	});

	// @cosmo-behavior plan:orchestration-surface-consolidation#B-011
	test("reports internal named chain access instead of falling back to DSL", async () => {
		const runtime = runtimeFixture(
			[],
			[
				{
					manifest: {
						id: "coding",
						description: "Coding",
						internal: { chains: ["private-review"] },
					},
					chains: [
						{
							name: "private-review",
							description: "Private review",
							chain: "maintainer",
						},
					],
				},
			],
		);

		await expect(
			parseRun(["chain", "private-review"], { runtime }),
		).rejects.toThrow(
			'Named chain "private-review" is internal to domain "coding"',
		);
		expect(chainMocks.executeChainExpression).not.toHaveBeenCalled();
	});

	test("chain list is reserved while --name list executes a project chain", async () => {
		await mkdir(join(temp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(temp.path, ".cosmonauts", "config.json"),
			`${JSON.stringify(
				{
					chains: {
						list: {
							description: "Project list chain",
							chain: "planner -> reviewer",
						},
					},
				},
				null,
				2,
			)}\n`,
			"utf-8",
		);
		const runtime = runtimeFixture([
			{
				name: "verify",
				description: "Review the project",
				chain: "quality-manager",
			},
		]);

		await parseRun(["chain", "list"], { runtime });
		expect(chainMocks.executeChainExpression).not.toHaveBeenCalled();
		expect(JSON.parse(output.stdout())).toEqual([
			{
				name: "verify",
				description: "Review the project",
				chain: "quality-manager",
			},
			{
				name: "list",
				description: "Project list chain",
				chain: "planner -> reviewer",
			},
		]);

		resetOutput();
		await parseRun(["chain", "--name", "list", "do it"], { runtime });
		expect(chainMocks.executeChainExpression).toHaveBeenCalledWith({
			runtime,
			cwd: temp.path,
			chainExpr: "planner -> reviewer",
			options: {
				piFlags: {},
				prompt: "do it",
			},
		});
		expect(JSON.parse(output.stdout())).toMatchObject({
			chain: {
				source: "named",
				input: "list",
				name: "list",
				expression: "planner -> reviewer",
			},
			result: { success: true },
		});
	});

	async function parseRun(
		argv: string[],
		options: {
			runtimeOptions?: CliRuntimeOptions;
			runtime?: ReturnType<typeof runtimeFixture>;
		} = {},
	): Promise<void> {
		const runtime = options.runtime ?? runtimeFixture([]);
		const program = createRunProgram({
			runtimeOptions: options.runtimeOptions,
			createContext: async () => ({
				cwd: temp.path,
				frameworkRoot: temp.path,
				domainsDir: join(temp.path, "domains"),
				runtime,
			}),
		});
		program.exitOverride();
		await program.parseAsync(argv, { from: "user" });
	}

	function resetOutput(): void {
		output.restore();
		output = captureCliOutput();
	}
});

async function setupDriveFixture(count: number): Promise<{
	tasks: Task[];
	envelopePath: string;
}> {
	const manager = new TaskManager(temp.path);
	await manager.init();
	const tasks: Task[] = [];
	for (let index = 0; index < count; index++) {
		tasks.push(
			await manager.createTask({
				title: `Drive task ${index + 1}`,
				labels: [`plan:${DRIVE_PLAN}`],
			}),
		);
	}
	const envelopePath = join(temp.path, "envelope.md");
	await writeFile(envelopePath, "Envelope\n", "utf-8");
	return { tasks, envelopePath };
}

function runtimeFixture(
	chains: unknown[],
	domains: unknown[] = [],
	options: { domainContext?: string; bindingResolver?: unknown } = {},
) {
	return {
		chains,
		domains,
		domainsDir: "/tmp/domains",
		domainContext: options.domainContext,
		bindingResolver: options.bindingResolver,
		agentRegistry: {},
		projectSkills: [],
		skillPaths: [],
	} as never;
}
