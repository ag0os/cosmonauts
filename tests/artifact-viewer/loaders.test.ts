import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
	loadArchitectureIndexArtifact,
	loadArchitectureModuleArtifact,
	loadPlanArtifact,
	loadPlanTaskStatus,
	loadReviewArtifact,
	renderArtifactMarkdown,
} from "../../lib/artifact-viewer/index.ts";
import { PlanManager } from "../../lib/plans/index.ts";
import { serializeTask } from "../../lib/tasks/task-serializer.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createTaskRecordFixture } from "../helpers/tasks.ts";

const tmp = useTempDir("artifact-viewer-");

describe("artifact-viewer foundation", () => {
	test("escapes loaded artifact markdown before HTML rendering @cosmo-behavior plan:code-structure-map#B-016", async () => {
		const manager = new PlanManager(tmp.path);
		await manager.createPlan({
			slug: "viewer-plan",
			title: "Viewer Plan",
			description: [
				"# Plan",
				"",
				"<script>alert(1)</script>",
				"",
				"- item <img src=x onerror=alert(2)>",
			].join("\n"),
			spec: "Spec has <script>spec()</script>",
		});

		await mkdir(join(tmp.path, "missions", "reviews"), { recursive: true });
		await writeFile(
			join(tmp.path, "missions", "reviews", "review.md"),
			"# Review\n\n<script>review()</script>",
			"utf-8",
		);

		await mkdir(join(tmp.path, "memory", "architecture", "modules", "lib"), {
			recursive: true,
		});
		await writeFile(
			join(tmp.path, "memory", "architecture", "index.md"),
			"# Index\n\n<script>index()</script>",
			"utf-8",
		);
		await writeFile(
			join(tmp.path, "memory", "architecture", "modules", "lib", "agents.md"),
			"# lib/agents\n\n<script>module()</script>",
			"utf-8",
		);

		const documents = await Promise.all([
			loadPlanArtifact({ projectRoot: tmp.path, slug: "viewer-plan" }),
			loadReviewArtifact({ projectRoot: tmp.path, filename: "review.md" }),
			loadArchitectureIndexArtifact({ projectRoot: tmp.path }),
			loadArchitectureModuleArtifact({
				projectRoot: tmp.path,
				resource: "lib/agents",
			}),
		]);

		for (const document of documents) {
			expect(document).not.toBeNull();
			expect(document?.html).not.toContain("<script");
			expect(document?.html).not.toContain("</script>");
			expect(document?.html).toContain("&lt;script&gt;");
		}
		expect(documents[0]?.html).not.toContain("<img");
		expect(documents[0]?.html).toContain("&lt;img src=x onerror=alert(2)&gt;");
	});

	test("renders only the W1 markdown subset and uses escaped preformatted fallback @cosmo-behavior plan:code-structure-map#B-016", async () => {
		const html = renderArtifactMarkdown(
			["# Supported", "", "1. <script>unsupported()</script>"].join("\n"),
		);
		const rendererSource = await readFile(
			join(process.cwd(), "lib", "artifact-viewer", "renderer.ts"),
			"utf-8",
		);

		expect(html).toContain("<h1>Supported</h1>");
		expect(html).toContain(
			"<pre><code>1. &lt;script&gt;unsupported()&lt;/script&gt;</code></pre>",
		);
		expect(html).not.toContain("<script>");
		expect(rendererSource).not.toMatch(/^import /mu);
	});

	test("validates slugs and architecture resources before loading artifacts @cosmo-behavior plan:code-structure-map#B-016", async () => {
		await expect(
			loadPlanArtifact({ projectRoot: tmp.path, slug: "../bad" }),
		).rejects.toThrow("Invalid plan slug");

		await expect(
			loadArchitectureModuleArtifact({
				projectRoot: tmp.path,
				resource: "../secrets",
			}),
		).rejects.toThrow("Invalid architecture resource");

		await expect(
			loadReviewArtifact({ projectRoot: tmp.path, filename: "../review.md" }),
		).rejects.toThrow("Invalid review filename");
	});

	test("loads task status through read-only listing without task scaffolding @cosmo-behavior plan:code-structure-map#B-016", async () => {
		const emptyStatus = await loadPlanTaskStatus({
			projectRoot: tmp.path,
			slug: "empty-plan",
		});

		expect(emptyStatus.counts).toEqual({
			"To Do": 0,
			"In Progress": 0,
			Done: 0,
			Blocked: 0,
		});
		await expect(access(join(tmp.path, "missions", "tasks"))).rejects.toThrow();

		await mkdir(join(tmp.path, "missions", "tasks"), { recursive: true });
		await writeFile(
			join(tmp.path, "missions", "tasks", "TASK-001 - Planned.md"),
			serializeTask(
				createTaskRecordFixture({
					id: "TASK-001",
					title: "Planned",
					labels: ["plan:status-plan"],
					status: "In Progress",
				}),
			),
			"utf-8",
		);
		await writeFile(
			join(tmp.path, "missions", "tasks", "TASK-002 - Other.md"),
			serializeTask(
				createTaskRecordFixture({
					id: "TASK-002",
					title: "Other",
					labels: ["plan:other"],
					status: "Done",
				}),
			),
			"utf-8",
		);

		const status = await loadPlanTaskStatus({
			projectRoot: tmp.path,
			slug: "status-plan",
		});

		expect(status.tasks.map((task) => task.id)).toEqual(["TASK-001"]);
		expect(status.counts["In Progress"]).toBe(1);
		await expect(
			access(join(tmp.path, "missions", "tasks", "config.json")),
		).rejects.toThrow();
	});

	test("plan task status does not parse unrelated task files @cosmo-behavior plan:code-structure-map#B-016", async () => {
		await mkdir(join(tmp.path, "missions", "tasks"), { recursive: true });
		await writeFile(
			join(tmp.path, "missions", "tasks", "TASK-001 - Planned.md"),
			serializeTask(
				createTaskRecordFixture({
					id: "TASK-001",
					title: "Planned",
					labels: ["plan:status-plan"],
					status: "Blocked",
				}),
			),
			"utf-8",
		);
		await writeFile(
			join(tmp.path, "missions", "tasks", "TASK-002 - Other.md"),
			serializeTask(
				createTaskRecordFixture({
					id: "TASK-002",
					title: "Other",
					labels: ["plan:other"],
					status: "Done",
				}),
			),
			"utf-8",
		);

		await vi.resetModules();
		const actualParser = await vi.importActual<
			typeof import("../../lib/tasks/task-parser.ts")
		>("../../lib/tasks/task-parser.ts");
		const parseTask = vi.fn(actualParser.parseTask);
		vi.doMock("../../lib/tasks/task-parser.ts", () => ({
			...actualParser,
			parseTask,
		}));
		const { loadPlanTaskStatus: loadPlanTaskStatusWithMock } = await import(
			"../../lib/artifact-viewer/loaders.ts"
		);

		const status = await loadPlanTaskStatusWithMock({
			projectRoot: tmp.path,
			slug: "status-plan",
		});

		expect(status.tasks.map((task) => task.id)).toEqual(["TASK-001"]);
		expect(status.counts.Blocked).toBe(1);
		expect(parseTask).toHaveBeenCalledTimes(1);
		vi.doUnmock("../../lib/tasks/task-parser.ts");
	});

	test("keeps artifact-viewer imports out of lower-level modules", async () => {
		const roots = ["lib/architecture-map", "lib/plans", "lib/tasks"];
		const offenders: string[] = [];

		for (const root of roots) {
			await collectArtifactViewerImports(root, offenders);
		}

		expect(offenders).toEqual([]);
	});
});

async function collectArtifactViewerImports(
	relativeDir: string,
	offenders: string[],
): Promise<void> {
	const absoluteDir = join(process.cwd(), relativeDir);
	const entries = await readdir(absoluteDir, { withFileTypes: true });
	for (const entry of entries) {
		const relativePath = `${relativeDir}/${entry.name}`;
		if (entry.isDirectory()) {
			await collectArtifactViewerImports(relativePath, offenders);
			continue;
		}
		if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;

		const content = await readFile(join(process.cwd(), relativePath), "utf-8");
		if (content.includes("artifact-viewer")) {
			offenders.push(relativePath);
		}
	}
}
