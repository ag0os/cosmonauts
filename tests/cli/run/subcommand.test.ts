import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createRunProgram } from "../../../cli/run/subcommand.ts";
import type { CliRuntimeOptions } from "../../../cli/runtime-bootstrap.ts";
import { parseCliRuntimeOptions } from "../../../cli/runtime-bootstrap.ts";
import { FileRunStore } from "../../../lib/durable-runtime/index.ts";
import { captureCliOutput } from "../../helpers/cli.ts";
import { useTempDir } from "../../helpers/fs.ts";

const chainMocks = vi.hoisted(() => ({
	executeChainExpression: vi.fn(),
}));

vi.mock("../../../cli/chain-execution.ts", () => ({
	executeChainExpression: chainMocks.executeChainExpression,
}));

const temp = useTempDir("run-subcommand-");

describe("cosmonauts run", () => {
	let output: ReturnType<typeof captureCliOutput>;
	let originalCwd: string;

	beforeEach(() => {
		originalCwd = process.cwd();
		process.chdir(temp.path);
		output = captureCliOutput();
		process.exitCode = undefined;
		chainMocks.executeChainExpression.mockReset();
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

	// @cosmo-behavior plan:orchestration-surface-consolidation#B-011
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

	// @cosmo-behavior plan:orchestration-surface-consolidation#B-013
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

function runtimeFixture(chains: unknown[]) {
	return {
		chains,
		domainsDir: "/tmp/domains",
		domainContext: "coding",
		agentRegistry: {},
		projectSkills: [],
		skillPaths: [],
	} as never;
}
