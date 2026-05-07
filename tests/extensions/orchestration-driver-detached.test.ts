import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import "./orchestration-mocks.ts";
import { registerDriverTool } from "../../domains/shared/extensions/orchestration/driver-tool.ts";
import type { DriverDeps } from "../../lib/driver/driver.ts";
import type {
	DriverHandle,
	DriverResult,
	DriverRunSpec,
} from "../../lib/driver/types.ts";
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

		registerDriverTool(pi as never, vi.fn());

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
		registerDriverTool(pi as never, getRuntime as never);

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
		expect(deps.backend.name).toBe("codex");
		expect(existsSync(spec.workdir)).toBe(false);
		expect(existsSync(join(spec.workdir, "spec.json"))).toBe(false);
	});

	test("rejects cosmonauts-subagent detached runs before startDetached", async () => {
		const fixture = await setupFixture("unsupported");
		const pi = createMockPi(fixture.projectRoot);
		const getRuntime = vi.fn();
		registerDriverTool(pi as never, getRuntime as never);

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
});

interface Fixture {
	projectRoot: string;
	planSlug: string;
	envelopePath: string;
	taskIds: string[];
}

interface DriverRunDetails {
	runId: string;
	planSlug: string;
	workdir: string;
	eventLogPath: string;
}

interface UnsupportedDetachedBackendDetails {
	error: "detached_backend_not_supported";
	backend: "cosmonauts-subagent";
	mode: "detached";
	message: string;
}

async function setupFixture(name: string): Promise<Fixture> {
	const projectRoot = join(temp.path, name, "project");
	await mkdir(projectRoot, { recursive: true });
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init();
	const task = await taskManager.createTask({
		title: `Detached Tool Fixture ${name}`,
		labels: [`plan:${PLAN_SLUG}`],
	});
	const envelopePath = join(projectRoot, "driver-envelope.md");
	await writeFile(envelopePath, "Driver envelope instructions\n", "utf-8");

	return {
		projectRoot,
		planSlug: PLAN_SLUG,
		envelopePath,
		taskIds: [task.id],
	};
}
