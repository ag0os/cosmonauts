import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	createMarkdownMemoryStore,
	parseEpisodeRecord,
} from "../../lib/memory/index.ts";
import type { MemoryWarning } from "../../lib/memory/types.ts";
import { PlanManager } from "../../lib/plans/plan-manager.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";

type FsOperation = (...args: never[]) => Promise<unknown>;

const fsMocks = vi.hoisted(() => ({
	unlink: vi.fn<(...args: never[]) => Promise<unknown>>(),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	return { ...actual, unlink: fsMocks.unlink };
});

let actualFs: typeof import("node:fs/promises");
let tempDir: string;

beforeEach(async () => {
	actualFs =
		await vi.importActual<typeof import("node:fs/promises")>(
			"node:fs/promises",
		);
	fsMocks.unlink.mockReset();
	fsMocks.unlink.mockImplementation((...args) =>
		(actualFs.unlink as unknown as FsOperation)(...args),
	);
	tempDir = await mkdtemp(join(tmpdir(), "transition-capture-"));
});

afterEach(async () => {
	vi.restoreAllMocks();
	await rm(tempDir, { recursive: true, force: true });
});

/**
 * D-498-1 §3: when the entity lock cannot be confirmed released, the primary
 * update still stands but transition capture is skipped rather than run under a
 * lock this process still owns (Design §7 "release, then capture").
 */
describe("transition capture when lock release is unconfirmed", () => {
	test("plan status update persists, warns, and skips capture", async () => {
		const projectRoot = join(tempDir, "plan-unconfirmed");
		await writeEpisodicConfig(projectRoot);
		const warnings: MemoryWarning[] = [];
		const manager = new PlanManager(projectRoot, {
			episodeSource: "custom/plan-owner",
			reportEpisodeWarning: async (warning) => {
				warnings.push(warning);
			},
		});
		await manager.createPlan({ slug: "held-plan", title: "Held Plan" });
		failEpisodeLockRelease();

		const updated = await manager.updatePlan("held-plan", {
			status: "completed",
		});

		// Primary update is never overturned by a lock-release failure (D-008).
		expect(updated.status).toBe("completed");
		expect(
			await readFile(
				join(projectRoot, "missions/plans/held-plan/plan.md"),
				"utf-8",
			),
		).toContain("status: completed");
		expect(await readStatusTransitions(projectRoot, "plan")).toEqual([]);
		expect(warnings).toEqual([
			{
				path: expect.stringContaining("episode-plan-held-plan.lock"),
				message: expect.stringMatching(
					/release could not be confirmed.*skipping transition episode capture/iu,
				),
			},
		]);
	});

	test("task status update persists, warns, and skips capture", async () => {
		const projectRoot = join(tempDir, "task-unconfirmed");
		await writeEpisodicConfig(projectRoot);
		const warnings: MemoryWarning[] = [];
		const manager = new TaskManager(projectRoot, {
			episodeSource: "custom/task-owner",
			reportEpisodeWarning: async (warning) => {
				warnings.push(warning);
			},
		});
		const created = await manager.createTask({ title: "Held Task" });
		failEpisodeLockRelease();

		const updated = await manager.updateTask(created.id, {
			status: "In Progress",
		});

		expect(updated.status).toBe("In Progress");
		expect(await readStatusTransitions(projectRoot, "task")).toEqual([]);
		expect(warnings).toEqual([
			{
				path: expect.stringContaining(".lock"),
				message: expect.stringMatching(
					/release could not be confirmed.*skipping transition episode capture/iu,
				),
			},
		]);
	});

	test("captures the transition and stays silent when release succeeds", async () => {
		const projectRoot = join(tempDir, "plan-confirmed");
		await writeEpisodicConfig(projectRoot);
		const warnings: MemoryWarning[] = [];
		const manager = new PlanManager(projectRoot, {
			episodeSource: "custom/plan-owner",
			reportEpisodeWarning: async (warning) => {
				warnings.push(warning);
			},
		});
		await manager.createPlan({ slug: "released-plan", title: "Released Plan" });

		const updated = await manager.updatePlan("released-plan", {
			status: "completed",
		});

		expect(updated.status).toBe("completed");
		expect(await readStatusTransitions(projectRoot, "plan")).toHaveLength(1);
		expect(warnings).toEqual([]);
	});
});

/** Make releasing any episode-transition lock fail permanently. */
function failEpisodeLockRelease(): void {
	fsMocks.unlink.mockImplementation(async (...args) => {
		const [target] = args as unknown as [string];
		if (typeof target === "string" && target.includes("episode-")) {
			throw Object.assign(new Error("persistent unlink failure"), {
				code: "EIO",
			});
		}
		return (actualFs.unlink as unknown as FsOperation)(...args);
	});
}

async function writeEpisodicConfig(projectRoot: string): Promise<void> {
	const configDir = join(projectRoot, ".cosmonauts");
	await mkdir(configDir, { recursive: true });
	await writeFile(
		join(configDir, "config.json"),
		JSON.stringify({ episodicLog: { enabled: true } }),
		"utf-8",
	);
}

async function readStatusTransitions(
	projectRoot: string,
	kind: "plan" | "task",
) {
	const records = (
		await createMarkdownMemoryStore({ projectRoot }).retrieve(
			{ projectRoot, scopes: ["project"] },
			{ text: "", recordTypes: ["episode"] },
		)
	).records;
	return records.filter(
		(record) => parseEpisodeRecord(record)?.action === `${kind}.status-changed`,
	);
}
