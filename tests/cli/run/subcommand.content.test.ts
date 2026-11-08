import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createRunProgram } from "../../../cli/run/subcommand.ts";
import type { CliRuntimeOptions } from "../../../cli/runtime-bootstrap.ts";
import type { DriverHandle, DriverRunSpec } from "../../../lib/driver/types.ts";
import { runQualityReview } from "../../../lib/orchestration/quality-review-run.ts";
import { captureCliOutput } from "../../helpers/cli.ts";
import { useTempDir } from "../../helpers/fs.ts";

const chainMocks = vi.hoisted(() => ({
	executeChainExpression: vi.fn(),
}));

const driverMocks = vi.hoisted(() => ({
	runInline: vi.fn((spec: DriverRunSpec): DriverHandle => {
		const result = {
			runId: spec.runId,
			outcome: "completed" as const,
			tasksDone: spec.taskIds.length,
			tasksBlocked: 0,
		};
		return {
			runId: spec.runId,
			planSlug: spec.planSlug,
			workdir: spec.workdir,
			eventLogPath: spec.eventLogPath,
			result: writeFile(
				join(spec.workdir, "run.completion.json"),
				`${JSON.stringify(result, null, 2)}\n`,
				"utf-8",
			).then(() => result),
			abort: vi.fn(),
		};
	}),
	launchDetached: vi.fn(async (spec: DriverRunSpec) => ({
		runId: spec.runId,
		planSlug: spec.planSlug,
		workdir: spec.workdir,
		eventLogPath: spec.eventLogPath,
		pid: 1234,
	})),
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
	launchDetached: driverMocks.launchDetached,
	runInline: driverMocks.runInline,
}));

vi.mock("../../../lib/driver/backend-resolution.ts", () => ({
	resolveConfiguredExternalBackend:
		backendMocks.resolveConfiguredExternalBackend,
}));

const temp = useTempDir("run-subcommand-");
const _DRIVE_PLAN = "drive-plan";

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
		driverMocks.launchDetached.mockClear();
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

	test("status points to the persisted QM full report", async () => {
		const review = await runQualityReview({ projectRoot: temp.path });
		await parseRun(["status", review.ref.runId]);
		const status = JSON.parse(output.stdout());
		expect(status).toMatchObject({
			found: true,
			status: "blocked",
		});
		expect(status.artifacts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "qm/final.md",
					path: expect.stringContaining("/artifacts/qm/final.md"),
				}),
			]),
		);
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
});

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
