import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
	generateArchitectureMap,
	typescriptSourceAnalyzer,
} from "../../lib/architecture-map/index.ts";
import { handleArtifactViewerRequest } from "../../lib/artifact-viewer/index.ts";
import { PlanManager } from "../../lib/plans/index.ts";
import { serializeTask } from "../../lib/tasks/task-serializer.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createTaskRecordFixture } from "../helpers/tasks.ts";

const tmp = useTempDir("artifact-viewer-server-");

describe("artifact-viewer server", () => {
	test("serves architecture map pages and missing map empty state @cosmo-behavior plan:code-structure-map#B-014", async () => {
		const home = await request("/");
		expect(home.statusCode).toBe(200);
		expect(home.body).toContain("/architecture/");

		await mkdir(join(tmp.path, "src", "shared"), { recursive: true });
		await mkdir(join(tmp.path, "src", "domain"), { recursive: true });
		await writeFile(
			join(tmp.path, "src", "shared", "index.ts"),
			"export const sharedValue = 1;\n",
			"utf-8",
		);
		await writeFile(
			join(tmp.path, "src", "domain", "index.ts"),
			"import { sharedValue } from '../shared/index.ts';\nexport const domainValue = sharedValue;\n",
			"utf-8",
		);
		await generateArchitectureMap({
			projectRoot: tmp.path,
			analyzer: typescriptSourceAnalyzer,
		});

		const index = await request("/architecture/");
		const modulePage = await request("/architecture/modules/src/domain");

		expect(index.statusCode).toBe(200);
		expect(index.body).toContain("Freshness: current");
		expect(index.body).toContain("Module Graph");
		expect(index.body).toContain("/architecture/modules/src/domain");
		expect(index.body).toContain("/architecture/modules/src/shared");
		expect(index.body).toContain("Architecture Map");
		expect(modulePage.statusCode).toBe(200);
		expect(modulePage.body).toContain("src/domain");
		expect(modulePage.body).toContain("Back to architecture map");

		const serverSource = await readFile(
			join(process.cwd(), "lib", "artifact-viewer", "server.ts"),
			"utf-8",
		);
		expect(serverSource).toContain("checkArchitectureMapStatFreshness");
		expect(serverSource).not.toContain("checkArchitectureMapFreshness(");
		expect(serverSource).not.toContain("createProjectSnapshot");

		const missingRoot = `${tmp.path}-missing`;
		await mkdir(missingRoot, { recursive: true });
		const missing = await handleArtifactViewerRequest({
			projectRoot: missingRoot,
			url: "/architecture/",
		});
		expect(missing.statusCode).toBe(200);
		expect(missing.body).toContain("No architecture map found");
		expect(missing.body).toContain("cosmonauts architecture generate");
	});

	test("serves plan pages with read only task status and empty states @cosmo-behavior plan:code-structure-map#B-015", async () => {
		const emptyList = await request("/plans/");
		expect(emptyList.statusCode).toBe(200);
		expect(emptyList.body).toContain("No plans found");
		await expect(access(join(tmp.path, "missions", "tasks"))).rejects.toThrow();

		const manager = new PlanManager(tmp.path);
		await manager.createPlan({
			slug: "empty-plan",
			title: "Empty Plan",
			description: "# Empty\n\nNo task files.",
		});
		const emptyPlan = await request("/plans/empty-plan");
		expect(emptyPlan.statusCode).toBe(200);
		expect(emptyPlan.body).toContain(
			"missions/tasks/config.json was not found",
		);
		await expect(access(join(tmp.path, "missions", "tasks"))).rejects.toThrow();

		await manager.createPlan({
			slug: "viewer-plan",
			title: "Viewer Plan",
			description: "# Plan Body\n\nImplement the route.",
			spec: "# Spec Body\n\nRoute requirements.",
		});
		await writeFile(
			join(tmp.path, "missions", "plans", "viewer-plan", "review.md"),
			"# Review Body\n\nLooks consistent.",
			"utf-8",
		);
		await mkdir(join(tmp.path, "missions", "tasks"), { recursive: true });
		await writeFile(
			join(tmp.path, "missions", "tasks", "TASK-123 - Viewer Task.md"),
			serializeTask(
				createTaskRecordFixture({
					id: "TASK-123",
					title: "Viewer Task",
					status: "In Progress",
					labels: ["plan:viewer-plan"],
				}),
			),
			"utf-8",
		);

		const list = await request("/plans/");
		const page = await request("/plans/viewer-plan");

		expect(list.body).toContain("/plans/viewer-plan");
		expect(page.statusCode).toBe(200);
		expect(page.body).toContain("Plan Body");
		expect(page.body).toContain("Spec Body");
		expect(page.body).toContain("Review Body");
		expect(page.body).toContain("Read-only Task Status");
		expect(page.body).toContain("TASK-123");
		expect(page.body).toContain("Viewer Task");
		await expect(
			access(join(tmp.path, "missions", "tasks", "config.json")),
		).rejects.toThrow();
	});

	test("rejects traversal routes before artifact reads @cosmo-behavior plan:code-structure-map#B-017", async () => {
		const dependencies = {
			loadArchitectureIndex: vi.fn(),
			loadArchitectureModule: vi.fn(),
			listPlans: vi.fn(),
			loadPlanPage: vi.fn(),
			checkArchitectureFreshness: vi.fn(),
		};

		for (const url of [
			"/plans/../x",
			"/plans/%2e%2e%2fx",
			"/architecture/modules/../secret",
			"/architecture/modules/lib/%2e%2e/secret",
		]) {
			const response = await handleArtifactViewerRequest({
				projectRoot: tmp.path,
				url,
				dependencies,
			});
			expect(response.statusCode).toBe(400);
		}

		expect(dependencies.loadArchitectureIndex).not.toHaveBeenCalled();
		expect(dependencies.loadArchitectureModule).not.toHaveBeenCalled();
		expect(dependencies.listPlans).not.toHaveBeenCalled();
		expect(dependencies.loadPlanPage).not.toHaveBeenCalled();
		expect(dependencies.checkArchitectureFreshness).not.toHaveBeenCalled();
	});
});

async function request(url: string) {
	return await handleArtifactViewerRequest({
		projectRoot: tmp.path,
		url,
	});
}
