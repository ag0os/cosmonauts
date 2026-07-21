import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerCreateCommand } from "../../../../cli/plans/commands/create.ts";
import {
	createMarkdownMemoryStore,
	parseEpisodeRecord,
} from "../../../../lib/memory/index.ts";
import { PlanManager } from "../../../../lib/plans/plan-manager.ts";
import {
	type CommandTestContext,
	type captureCommandOutput,
	createCommandProgram,
	createCommandTestContext,
	type mockProcessExitThrow,
} from "../../../helpers/cli.ts";

describe("plan create command", () => {
	let tempDir: string;
	let manager: PlanManager;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "plan-create-test-"));
		manager = new PlanManager(tempDir);
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("creates a plan with slug and title", async () => {
		const plan = await manager.createPlan({
			slug: "test-plan",
			title: "Test Plan",
		});

		expect(plan.slug).toBe("test-plan");
		expect(plan.title).toBe("Test Plan");
		expect(plan.status).toBe("active");
	});

	it("creates a plan with description", async () => {
		const plan = await manager.createPlan({
			slug: "with-desc",
			title: "With Description",
			description: "A detailed description.",
		});

		expect(plan.body).toBe("A detailed description.");
	});

	it("creates a plan with spec", async () => {
		const plan = await manager.createPlan({
			slug: "with-spec",
			title: "With Spec",
			spec: "# Spec content",
		});

		expect(plan.spec).toBe("# Spec content");
	});

	it("rejects duplicate slugs", async () => {
		await manager.createPlan({ slug: "dupe", title: "First" });

		await expect(
			manager.createPlan({ slug: "dupe", title: "Second" }),
		).rejects.toThrow("Plan already exists: dupe");
	});

	it("rejects invalid slugs", async () => {
		await expect(
			manager.createPlan({ slug: "Invalid_Slug", title: "Bad" }),
		).rejects.toThrow(/Invalid plan slug/);
	});
});

describe("plan create CLI episodic capture", () => {
	let context: CommandTestContext;
	let output: ReturnType<typeof captureCommandOutput>;
	let exit: ReturnType<typeof mockProcessExitThrow>;

	beforeEach(async () => {
		context = await createCommandTestContext("plan-create-episode-test-");
		output = context.output;
		exit = context.exit;
	});

	afterEach(async () => {
		await context.restore();
	});

	it("preserves disabled output and creates no episodic files", async () => {
		await parsePlanCreate([
			"node",
			"test",
			"create",
			"--slug",
			"disabled-cli-plan",
			"--title",
			"Disabled CLI Plan",
		]);

		expect(output.stdout()).toBe(
			"Created plan disabled-cli-plan: Disabled CLI Plan\n",
		);
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
		await expect(access(join(context.tempDir, "memory"))).rejects.toMatchObject(
			{
				code: "ENOENT",
			},
		);
	});

	it("records enabled create provenance as cosmonauts/cli", async () => {
		await writeEpisodicConfig(context.tempDir);
		await parsePlanCreate([
			"node",
			"test",
			"create",
			"--slug",
			"enabled-cli-plan",
			"--title",
			"Enabled CLI Plan",
		]);

		expect(output.stdout()).toBe(
			"Created plan enabled-cli-plan: Enabled CLI Plan\n",
		);
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
		const records = await readProjectEpisodes(context.tempDir);
		expect(records).toHaveLength(1);
		expect(records[0]?.source).toBe("cosmonauts/cli");
		expect(records[0] && parseEpisodeRecord(records[0])).toMatchObject({
			action: "plan.created",
			outcome: "active",
			subject: { kind: "plan", id: "enabled-cli-plan" },
		});
	});

	it("keeps create successful and warns once when capture fails", async () => {
		await writeEpisodicConfig(context.tempDir);
		await writeFile(join(context.tempDir, "memory"), "path collision", "utf-8");
		await parsePlanCreate([
			"node",
			"test",
			"create",
			"--slug",
			"warning-cli-plan",
			"--title",
			"Warning CLI Plan",
		]);

		expect(output.stdout()).toBe(
			"Created plan warning-cli-plan: Warning CLI Plan\n",
		);
		expect(output.stderr()).toContain("Episode capture skipped");
		expect(output.stderr().match(/Episode capture skipped/gu)).toHaveLength(1);
		expect(exit.calls()).toEqual([]);
		expect(
			await new PlanManager(context.tempDir).getPlan("warning-cli-plan"),
		).toMatchObject({ slug: "warning-cli-plan", status: "active" });
	});
});

async function parsePlanCreate(argv: string[]): Promise<void> {
	await createCommandProgram(registerCreateCommand).parseAsync(argv);
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

async function readProjectEpisodes(projectRoot: string) {
	return (
		await createMarkdownMemoryStore({ projectRoot }).retrieve(
			{ projectRoot, scopes: ["project"] },
			{ text: "", recordTypes: ["episode"] },
		)
	).records;
}
