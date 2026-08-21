import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { renderPlanEditSuccess } from "../../cli/plans/commands/edit.ts";
import { renderTaskCreateSuccess } from "../../cli/tasks/commands/create.ts";
import { renderTaskEditSuccess } from "../../cli/tasks/commands/edit.ts";
import { buildAgentIdentityMarker } from "../../lib/agents/runtime-identity.ts";
import { PlanManager } from "../../lib/plans/plan-manager.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi, type MockPi } from "../helpers/mocks/index.ts";

const tmp = useTempDir("episodic-pre-w3-baseline-");
const FIXED_TIME = "2026-07-21T12:00:00.000Z";
const CODING_DOMAIN = ["cod", "ing"].join("");

describe("pre-W3 disabled baselines", () => {
	test("keeps gated effects inert off and freezes reload while restart and agent switch adopt both gate transitions @cosmo-behavior plan:knowledge-surface#B-008", async () => {
		const inventoryPath = join(
			process.cwd(),
			"tests/fixtures/knowledge-seed-inventory.json",
		);
		const inventory = JSON.parse(await readFile(inventoryPath, "utf-8")) as {
			markdown: { path: string; sha256: string; distilledAtRaw: string }[];
			bundles: {
				path: string;
				sha256: string;
				headerRaw: string;
				header: Record<string, unknown>;
				records: {
					ordinal: number;
					id: string;
					rawTimestamp: string;
					fields: Record<string, unknown>;
				}[];
			}[];
			backfill: {
				archivedPlanSlugs: string[];
				distilledSlugs: string[];
				missingSlugs: string[];
				sourceInputs: Record<string, { path: string; sha256: string }[]>;
			};
		};

		expect(inventory.markdown).toHaveLength(36);
		expect(inventory.bundles).toHaveLength(10);
		expect(
			inventory.bundles.reduce(
				(count, bundle) => count + bundle.records.length,
				0,
			),
		).toBe(100);
		expect(inventory.backfill.missingSlugs).toHaveLength(19);

		for (const entry of inventory.markdown) {
			expect(entry.path, entry.path).toMatch(/^memory\/.+\.md$/u);
			expect(entry.sha256, entry.path).toMatch(/^[a-f0-9]{64}$/u);
			expect(entry.distilledAtRaw, entry.path).toBeTruthy();
		}
		for (const bundle of inventory.bundles) {
			expect(bundle.path, bundle.path).toMatch(
				/^memory\/.+\.knowledge\.jsonl$/u,
			);
			expect(bundle.sha256, bundle.path).toMatch(/^[a-f0-9]{64}$/u);
			expect(JSON.parse(bundle.headerRaw)).toEqual(bundle.header);
			for (const [index, record] of bundle.records.entries()) {
				expect(record.ordinal).toBe(index + 1);
				expect(record.fields.id).toBe(record.id);
				expect(record.fields.createdAt).toBe(record.rawTimestamp);
			}
		}

		const derivedMissing = inventory.backfill.archivedPlanSlugs.filter(
			(slug) => !inventory.backfill.distilledSlugs.includes(slug),
		);
		expect(derivedMissing).toEqual(inventory.backfill.missingSlugs);
		expect(Object.keys(inventory.backfill.sourceInputs).sort()).toEqual(
			inventory.backfill.missingSlugs,
		);
		for (const inputs of Object.values(inventory.backfill.sourceInputs)) {
			for (const input of inputs) {
				expect(
					sha256(await readFile(join(process.cwd(), input.path))),
					input.path,
				).toBe(input.sha256);
			}
		}

		const offBaseline = JSON.parse(
			await readFile(
				join(
					process.cwd(),
					"tests/fixtures/knowledge-surface-off-baselines.json",
				),
				"utf-8",
			),
		) as {
			promptCorrectionAllowlist: string[];
			promptFiles: { path: string; sha256: string }[];
			packageSurface: unknown;
			wrapperFiles: { path: string; sha256: string }[];
			configTransitions: Record<string, unknown>;
			toolContracts: Record<string, unknown>;
			authorization: Record<string, unknown>;
			promptCorrectionRegions: {
				path: string;
				regions: { start: string; end: string }[];
				baselineContent: string;
			}[];
		};
		expect(offBaseline.promptCorrectionAllowlist).toEqual([
			"AGENTS.md",
			`bundled/${CODING_DOMAIN}/prompts/distiller.md`,
			"domains/shared/skills/archive/SKILL.md",
		]);
		expect(
			offBaseline.promptCorrectionRegions.map((entry) => entry.path).toSorted(),
		).toEqual(offBaseline.promptCorrectionAllowlist.toSorted());
		for (const allowed of offBaseline.promptCorrectionRegions) {
			const prompt = offBaseline.promptFiles.find(
				(entry) => entry.path === allowed.path,
			);
			expect(prompt, allowed.path).toBeDefined();
			expect(sha256(allowed.baselineContent), allowed.path).toBe(
				prompt?.sha256,
			);
			for (const region of allowed.regions) {
				expect(
					allowed.baselineContent,
					`${allowed.path}:${region.start}`,
				).toContain(region.start);
				if (region.end !== "<EOF>") {
					expect(
						allowed.baselineContent,
						`${allowed.path}:${region.end}`,
					).toContain(region.end);
				}
			}
			expect(
				stripCorrectionRegions(
					await readFile(join(process.cwd(), allowed.path), "utf-8"),
					allowed.regions,
				),
				`${allowed.path} changed outside the exact D-009 correction regions`,
			).toBe(stripCorrectionRegions(allowed.baselineContent, allowed.regions));
		}
		for (const prompt of offBaseline.promptFiles) {
			if (offBaseline.promptCorrectionAllowlist.includes(prompt.path)) continue;
			expect(
				sha256(await readFile(join(process.cwd(), prompt.path))),
				prompt.path,
			).toBe(prompt.sha256);
		}
		const packageJson = JSON.parse(
			await readFile(join(process.cwd(), "package.json"), "utf-8"),
		) as { keywords?: unknown; pi?: unknown };
		expect({ keywords: packageJson.keywords, pi: packageJson.pi }).toEqual(
			offBaseline.packageSurface,
		);
		expect(offBaseline.wrapperFiles).toHaveLength(2);
		expect(offBaseline.toolContracts).toMatchObject({
			agentMemory: {
				remember: { name: "remember", executionMode: "sequential" },
				recall: { name: "recall", parameterNames: ["limit", "query"] },
			},
			architectureMemory: {
				architectureMapRead: { name: "architecture_map_read" },
			},
		});
		expect(offBaseline.authorization).toEqual({
			agentMemory: {
				authorizedAgent: "main/cosmo",
				unauthorizedStatus: "unauthorized",
				resetEvents: ["session_start", "session_shutdown"],
			},
			architectureMemory: {
				authorizedAgents: [
					`${CODING_DOMAIN}/coordinator`,
					`${CODING_DOMAIN}/plan-reviewer`,
					`${CODING_DOMAIN}/planner`,
					`${CODING_DOMAIN}/quality-manager`,
					`${CODING_DOMAIN}/worker`,
				],
				unauthorizedStatus: "scope-ineligible",
				resetEvents: ["session_start", "session_shutdown"],
			},
		});
		expect(offBaseline.configTransitions).toEqual({
			reload: { offToOn: "off", onToOff: "on" },
			plainNew: { offToOn: "off", onToOff: "on" },
			restart: { offToOn: "on", onToOff: "off" },
			agentSwitch: { offToOn: "on", onToOff: "off" },
		});
	});

	test("freezes authored-memory tools, bytes, and files when episodic config is absent", async () => {
		const projectRoot = join(tmp.path, "authored-project");
		const userRoot = join(tmp.path, "authored-user");
		const pi = createMockPi({ cwd: projectRoot });
		const { createAgentMemoryExtension } = await import(
			"../../domains/shared/extensions/agent-memory/index.ts"
		);
		createAgentMemoryExtension({
			userCosmonautsRoot: userRoot,
			now: () => new Date(FIXED_TIME),
		})(pi as never);

		expect(toolContract(pi, "remember")).toEqual({
			name: "remember",
			label: "Remember",
			description:
				"Save an explicit note, user profile, or playbook to agent memory.",
			executionMode: "sequential",
			parameterNames: [
				"changeSummary",
				"confirmUpdate",
				"content",
				"description",
				"kind",
				"scope",
				"tags",
				"title",
				"type",
			],
		});
		expect(toolContract(pi, "recall")).toEqual({
			name: "recall",
			label: "Recall",
			description:
				"Search authored agent-memory records: notes, the user profile, and playbooks.",
			executionMode: undefined,
			parameterNames: ["limit", "query"],
		});

		await authorizeCosmo(pi, projectRoot);
		const saved = asToolResult(
			await pi.callTool("remember", {
				content: "The disabled baseline stays authored-only.",
				description: "Pinned authored-memory output.",
				kind: "semantic",
				scope: "project",
				tags: ["baseline"],
				title: "Pre-W3 baseline",
			}),
		);
		const savedDetails = asRecord(saved.details);
		const humanPath = asString(savedDetails.humanPath);
		expect(saved.content).toEqual([
			{
				type: "text",
				text: `Saved "Pre-W3 baseline" to project memory: ${humanPath}`,
			},
		]);
		expect(savedDetails).toEqual({
			status: "saved",
			type: "note",
			title: "Pre-W3 baseline",
			scope: "project",
			kind: "semantic",
			tags: ["baseline"],
			timestamp: FIXED_TIME,
			path: join(projectRoot, humanPath),
			humanPath,
		});

		const recalled = asToolResult(
			await pi.callTool("recall", { query: "disabled baseline" }),
		);
		const recallDetails = asRecord(recalled.details);
		expect(recalled.content[0]?.text).toContain(
			'Found 1 authored memory record for "disabled baseline".',
		);
		expect(Object.keys(recallDetails).sort()).toEqual([
			"limit",
			"query",
			"records",
			"searchedScopes",
			"skippedScopes",
			"stats",
			"status",
			"warnings",
		]);
		expect(recallDetails).toMatchObject({
			status: "matched",
			query: "disabled baseline",
			limit: 5,
			searchedScopes: ["project", "user"],
			skippedScopes: [],
			warnings: [],
		});
		expect(recallDetails.records).toEqual([
			{
				type: "note",
				title: "Pre-W3 baseline",
				description: "Pinned authored-memory output.",
				scope: "project",
				kind: "semantic",
				tags: ["baseline"],
				timestamp: FIXED_TIME,
				path: join(projectRoot, humanPath),
				humanPath,
				content: "The disabled baseline stays authored-only.",
			},
		]);

		const injection = asRecord(await authorizeCosmo(pi, projectRoot));
		const message = asRecord(injection.message);
		expect(message).toEqual({
			customType: "agent-memory-context",
			display: false,
			content: [
				"Agent memory index context",
				"Current disk authored memory for this Cosmo turn.",
				"## Authored memory index",
				"Up to 50 most recent project/user notes and playbooks, ordered by timestamp then path.",
				"This section contains compact metadata only, not record bodies.",
				"Use recall(query) for full authored memory record details before relying on an entry.",
				"- type: note",
				"  title: Pre-W3 baseline",
				"  scope: project",
				"  kind: semantic",
				`  timestamp: ${FIXED_TIME}`,
				"  description: Pinned authored-memory output.",
				`  path: ${humanPath}`,
				"",
			].join("\n"),
		});
		expect(await listFiles(projectRoot)).toEqual([
			"memory/agent/index.md",
			humanPath,
		]);
		expect(await listFiles(userRoot)).toEqual([]);
	});

	test("freezes context-free managers, Pi tools, CLI output, and files when episodic config is absent", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(FIXED_TIME));
		const projectRoot = join(tmp.path, "lifecycle-project");
		const pi = createMockPi({ cwd: projectRoot });
		const [{ default: plansExtension }, { default: tasksExtension }] =
			await Promise.all([
				import("../../domains/shared/extensions/plans/index.ts"),
				import("../../domains/shared/extensions/tasks/index.ts"),
			]);
		plansExtension(pi as never);
		tasksExtension(pi as never);

		const planToolResult = asToolResult(
			await pi.callTool("plan_create", {
				slug: "baseline-plan",
				title: "Baseline Plan",
				description: "Pinned plan body.",
				spec: "Pinned plan spec.",
			}),
		);
		expect(planToolResult.content).toEqual([
			{
				type: "text",
				text: [
					"Created plan: baseline-plan",
					"Title: Baseline Plan",
					"Status: active",
					"Description: Pinned plan body.",
					"Spec: included",
				].join("\n"),
			},
		]);

		const taskToolResult = asToolResult(
			await pi.callTool("task_create", {
				title: "Baseline Task",
				description: "Pinned task body.",
				labels: ["plan:baseline-plan"],
			}),
		);
		expect(taskToolResult.content).toEqual([
			{ type: "text", text: "Created task TASK-001: Baseline Task" },
		]);

		const planManager = new PlanManager(projectRoot);
		const taskManager = new TaskManager(projectRoot);
		const updatedPlan = await planManager.updatePlan("baseline-plan", {
			status: "completed",
		});
		const updatedTask = await taskManager.updateTask("TASK-001", {
			status: "Done",
		});

		expect(Object.keys(updatedPlan).sort()).toEqual([
			"behaviorsReviewPending",
			"body",
			"createdAt",
			"slug",
			"spec",
			"status",
			"title",
			"updatedAt",
		]);
		expect(updatedPlan).toMatchObject({
			slug: "baseline-plan",
			title: "Baseline Plan",
			status: "completed",
			body: "Pinned plan body.",
			spec: "Pinned plan spec.",
			createdAt: new Date(FIXED_TIME),
			updatedAt: new Date(FIXED_TIME),
		});
		expect(Object.keys(updatedTask).sort()).toEqual([
			"acceptanceCriteria",
			"assignee",
			"createdAt",
			"dependencies",
			"description",
			"dueDate",
			"id",
			"implementationNotes",
			"implementationPlan",
			"labels",
			"priority",
			"rawContent",
			"status",
			"title",
			"updatedAt",
		]);
		expect(updatedTask).toMatchObject({
			id: "TASK-001",
			title: "Baseline Task",
			status: "Done",
			description: "Pinned task body.",
			labels: ["plan:baseline-plan"],
			dependencies: [],
			acceptanceCriteria: [],
			createdAt: new Date(FIXED_TIME),
			updatedAt: new Date(FIXED_TIME),
		});

		expect(renderPlanEditSuccess(updatedPlan, ["status"], "human")).toEqual([
			"Updated plan baseline-plan: Baseline Plan",
			"Changed: status",
		]);
		expect(
			renderTaskCreateSuccess(taskToolResult.details as never, "human"),
		).toEqual(["Created task TASK-001: Baseline Task"]);
		expect(
			renderTaskEditSuccess(
				updatedTask,
				{ status: "Done" },
				[{ field: "status", oldValue: "To Do", newValue: "Done" }],
				"human",
			),
		).toEqual([
			"Updated task TASK-001: Baseline Task",
			"Changed: status (To Do → Done)",
		]);
		expect(await listFiles(projectRoot)).toEqual([
			"missions/plans/baseline-plan/plan.md",
			"missions/plans/baseline-plan/spec.md",
			"missions/tasks/TASK-001 - Baseline Task.md",
			"missions/tasks/config.json",
		]);
	});
});

function sha256(value: string | Buffer): string {
	return createHash("sha256").update(value).digest("hex");
}

function stripCorrectionRegions(
	content: string,
	regions: readonly { start: string; end: string }[],
): string {
	let stripped = content;
	for (const region of regions) {
		const start = stripped.indexOf(region.start);
		if (start < 0) throw new Error(`Missing correction start: ${region.start}`);
		const end =
			region.end === "<EOF>"
				? stripped.length
				: stripped.indexOf(region.end, start + region.start.length);
		if (end < 0) throw new Error(`Missing correction end: ${region.end}`);
		stripped = `${stripped.slice(0, start)}<D-009-CORRECTION>${stripped.slice(end)}`;
	}
	return stripped;
}

interface ToolResult {
	readonly content: readonly { readonly type: string; readonly text: string }[];
	readonly details: unknown;
}

function asToolResult(value: unknown): ToolResult {
	return value as ToolResult;
}

function asRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("Expected an object baseline value");
	}
	return value as Record<string, unknown>;
}

function asString(value: unknown): string {
	if (typeof value !== "string") throw new Error("Expected a string value");
	return value;
}

async function authorizeCosmo(pi: MockPi, cwd: string): Promise<unknown> {
	return pi.fireEvent(
		"before_agent_start",
		{ systemPrompt: buildAgentIdentityMarker("main/cosmo") },
		{ cwd },
	);
}

function toolContract(pi: MockPi, name: string): Record<string, unknown> {
	const tool = pi.tools.get(name) as unknown as {
		readonly name: string;
		readonly label: string;
		readonly description: string;
		readonly executionMode?: string;
		readonly parameters: { readonly properties?: Record<string, unknown> };
	};
	if (!tool) throw new Error(`Missing tool ${name}`);
	return {
		name: tool.name,
		label: tool.label,
		description: tool.description,
		executionMode: tool.executionMode,
		parameterNames: Object.keys(tool.parameters.properties ?? {}).sort(),
	};
}

async function listFiles(root: string): Promise<string[]> {
	const files: string[] = [];
	await visit(root, files);
	return files.sort();

	async function visit(directory: string, output: string[]): Promise<void> {
		try {
			const entries = await readdir(directory, { withFileTypes: true });
			for (const entry of entries) {
				const path = join(directory, entry.name);
				if (entry.isDirectory()) {
					await visit(path, output);
				} else {
					output.push(relative(root, path));
				}
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
			throw error;
		}
	}
}
