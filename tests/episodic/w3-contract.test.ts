import type { Dirent } from "node:fs";
import {
	access,
	mkdir,
	readdir,
	readFile,
	stat,
	unlink,
	utimes,
	writeFile,
} from "node:fs/promises";
import { join, relative, sep } from "node:path";
import matter from "gray-matter";
import { describe, expect, test } from "vitest";
import { createAgentMemoryExtension } from "../../domains/shared/extensions/agent-memory/index.ts";
import { buildAgentIdentityMarker } from "../../lib/agents/runtime-identity.ts";
import { recordEpisode } from "../../lib/memory/episode.ts";
import {
	EPISODE_ACTIONS,
	type EpisodeAction,
	parseEpisodeRecord,
} from "../../lib/memory/episodic-records.ts";
import {
	createMarkdownMemoryStore,
	type MemoryWarning,
	type RetrievedMemoryRecord,
} from "../../lib/memory/index.ts";
import { PlanManager } from "../../lib/plans/plan-manager.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi, type MockPi } from "../helpers/mocks/index.ts";

const tmp = useTempDir("w3-episodic-contract-");
const FIXED_TIME = "2026-07-21T12:00:00.000Z";

describe("W3 episodic integration contract", () => {
	test("keeps absent and false gates at W2 bytes while every episode action stays disabled", async () => {
		for (const [name, config] of [
			["absent", undefined],
			["false", { enabled: false, warningThreshold: 1 }],
		] as const) {
			const projectRoot = join(tmp.path, `${name}-capture-project`);
			const userRoot = join(tmp.path, `${name}-capture-user`);
			if (config) await writeEpisodicConfig(projectRoot, config);

			for (const [index, action] of EPISODE_ACTIONS.entries()) {
				await expect(
					recordEpisode({
						projectRoot,
						userCosmonautsRoot: userRoot,
						event: episodeEvent(action, index),
					}),
				).resolves.toEqual({ kind: "disabled" });
			}
			await expect(access(join(projectRoot, "memory"))).rejects.toMatchObject({
				code: "ENOENT",
			});
			await expect(access(join(userRoot, "memory"))).rejects.toMatchObject({
				code: "ENOENT",
			});
		}

		const absent = await runDisabledW2Scenario({
			projectRoot: join(tmp.path, "absent-w2-project"),
			userRoot: join(tmp.path, "absent-w2-user"),
		});
		const explicitlyFalse = await runDisabledW2Scenario({
			projectRoot: join(tmp.path, "false-w2-project"),
			userRoot: join(tmp.path, "false-w2-user"),
			episodicLog: { enabled: false, warningThreshold: 1 },
		});

		expect(absent.normalizedBytes).toBe(explicitlyFalse.normalizedBytes);
		expect(absent.projectFiles).toEqual(explicitlyFalse.projectFiles);
		expect(absent.userFiles).toEqual([]);
		expect(explicitlyFalse.userFiles).toEqual([]);
		expect(absent.projectFiles.map((file) => file.path)).toEqual([
			"agent/index.md",
			expect.stringMatching(/^agent\/notes\/.*\.md$/u),
		]);
		expect(
			absent.projectFiles.some((file) => file.path.includes("episodes")),
		).toBe(false);
	});

	test("rescans the complete enabled vocabulary across isolated project and user stores", async () => {
		const projectRoot = join(tmp.path, "enabled-project");
		const userRoot = join(tmp.path, "enabled-user");
		const baselineProject = join(tmp.path, "injection-baseline-project");
		const baselineUser = join(tmp.path, "injection-baseline-user");
		for (const root of [projectRoot, baselineProject]) {
			await writeEpisodicConfig(root, {
				enabled: true,
				warningThreshold: 1,
			});
		}

		for (const [root, user] of [
			[projectRoot, userRoot],
			[baselineProject, baselineUser],
		] as const) {
			const store = createMarkdownMemoryStore({
				projectRoot: root,
				userCosmonautsRoot: user,
			});
			await expect(store.write(authoredNote())).resolves.toMatchObject({
				kind: "written",
			});
		}

		const episodePaths = new Map<EpisodeAction, string>();
		for (const [index, action] of EPISODE_ACTIONS.entries()) {
			const result = await recordEpisode({
				projectRoot,
				userCosmonautsRoot: userRoot,
				event: episodeEvent(action, index),
			});
			expect(result.kind, action).toBe("recorded");
			if (result.kind !== "recorded") {
				throw new Error(`Expected ${action} to be recorded`);
			}
			episodePaths.set(action, result.path);
		}

		const deletedPath = requiredPath(episodePaths, "plan.created");
		await unlink(deletedPath);
		await expect(access(deletedPath)).rejects.toMatchObject({ code: "ENOENT" });

		const editedPath = requiredPath(episodePaths, "memory.saved");
		const edited = matter(await readFile(editedPath, "utf-8"));
		const editedTags = Array.isArray(edited.data.tags)
			? edited.data.tags.filter(
					(tag): tag is string =>
						typeof tag === "string" && tag !== "writer:cosmonauts",
				)
			: [];
		await writeFile(
			editedPath,
			matter.stringify(
				`${edited.content.trim()}\n\nHUMAN_EDITED_EPISODE remains current disk truth.\n`,
				{ ...edited.data, tags: editedTags },
			),
			"utf-8",
		);

		const malformedPath = join(
			projectRoot,
			"memory",
			"agent",
			"episodes",
			"malformed-human-episode.md",
		);
		await writeFile(malformedPath, "not an OKF episode\n", "utf-8");

		const wakePath = requiredPath(episodePaths, "autonomy.wake");
		const oldMtime = new Date("2000-01-01T00:00:00.000Z");
		await utimes(wakePath, oldMtime, oldMtime);
		expect((await stat(wakePath)).mtime.toISOString()).toBe(
			"2000-01-01T00:00:00.000Z",
		);

		const baseline = await memorySession(baselineProject, baselineUser);
		const enabled = await memorySession(projectRoot, userRoot);
		expect(enabled.injection).toEqual(baseline.injection);
		const [baselineIndex, enabledIndex] = await Promise.all([
			readFile(join(baselineProject, "memory", "agent", "index.md"), "utf-8"),
			readFile(join(projectRoot, "memory", "agent", "index.md"), "utf-8"),
		]);
		expect(enabledIndex).toBe(baselineIndex);
		expect(enabledIndex).not.toContain("episode");

		const recalled = asToolResult(
			await enabled.pi.callTool("recall", {
				query: "W3 integration",
				limit: 20,
			}),
		);
		const recallDetails = asRecord(recalled.details);
		const records = asRecords(recallDetails.records);
		const episodes = records.filter((record) => record.type === "episode");
		const actions = episodes
			.map((record) => parseEpisodeRecord(record)?.action)
			.filter((action): action is EpisodeAction => action !== undefined)
			.toSorted();
		expect(actions).toEqual(
			EPISODE_ACTIONS.filter((action) => action !== "plan.created").toSorted(),
		);
		expect(recallDetails.stats).toMatchObject({
			filesScanned: 9,
			bytesRead: expect.any(Number),
			durationMs: expect.any(Number),
		});
		const warnings = asWarnings(recallDetails.warnings);
		expect(
			warnings.filter((warning) =>
				warning.message.includes("episode log large"),
			),
		).toHaveLength(2);
		expect(warnings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: expect.stringContaining(join("enabled-project", "memory")),
					message: "episode log large — 6 records; run consolidation",
				}),
				expect.objectContaining({
					path: expect.stringContaining(join("enabled-user", "memory")),
					message: "episode log large — 2 records; run consolidation",
				}),
				expect.objectContaining({ path: malformedPath }),
			]),
		);

		const humanRecall = asToolResult(
			await enabled.pi.callTool("recall", {
				query: "HUMAN_EDITED_EPISODE",
				limit: 20,
			}),
		);
		const humanEpisode = asRecords(asRecord(humanRecall.details).records).find(
			(record) => record.path === editedPath,
		);
		expect(humanEpisode?.content).toContain("HUMAN_EDITED_EPISODE");
		expect(humanEpisode?.tags).not.toContain("writer:cosmonauts");
		expect(parseEpisodeRecord(requiredRecord(humanEpisode))).not.toHaveProperty(
			"writer",
		);

		const freshStore = createMarkdownMemoryStore({
			projectRoot,
			userCosmonautsRoot: userRoot,
			episodeWarningThreshold: 1,
		});
		const freshWake = await freshStore.retrieve(
			{ projectRoot, scopes: ["project", "user"] },
			{
				text: "W3 integration autonomy.wake",
				recordTypes: ["episode"],
			},
		);
		expect(freshWake.records).toHaveLength(1);
		const wake = requiredRecord(freshWake.records[0]);
		expect(wake).toMatchObject({
			path: wakePath,
			source: "autonomy/host",
			timestamp: "2026-07-21T12:07:00.000Z",
		});
		expect(parseEpisodeRecord(wake)).toEqual({
			action: "autonomy.wake",
			outcome: "succeeded",
			subject: { kind: "trigger", id: "schedule:daily" },
			payload: { kind: "job", id: "maintenance/daily" },
			writer: "cosmonauts",
		});
	});

	test("keeps primary persistence successful while an awaited capture warning is reported", async () => {
		const projectRoot = join(tmp.path, "capture-failure-project");
		await writeEpisodicConfig(projectRoot, { enabled: true });
		await mkdir(join(projectRoot, "memory", "agent"), { recursive: true });
		await writeFile(
			join(projectRoot, "memory", "agent", "episodes"),
			"blocks the episode directory\n",
			"utf-8",
		);
		const warnings: MemoryWarning[] = [];
		const manager = new PlanManager(projectRoot, {
			episodeSource: "cosmonauts/cli",
			reportEpisodeWarning: async (warning) => {
				warnings.push(warning);
			},
		});

		const plan = await manager.createPlan({
			slug: "capture-failure",
			title: "Capture failure remains non-fatal",
			description: "Primary persistence is load-bearing; episodes are not.",
		});

		expect(plan).toMatchObject({
			slug: "capture-failure",
			status: "active",
		});
		expect(
			await readFile(
				join(projectRoot, "missions", "plans", "capture-failure", "plan.md"),
				"utf-8",
			),
		).toContain("Capture failure remains non-fatal");
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatchObject({
			path: expect.stringContaining(join("memory", "agent", "episodes")),
			message: expect.stringMatching(/^Episode capture skipped:/u),
		});
	});
});

function episodeEvent(action: EpisodeAction, index: number) {
	const conventions: Record<
		EpisodeAction,
		{
			readonly scope: "project" | "user";
			readonly source: string;
			readonly outcome: string;
			readonly subject: { readonly kind: string; readonly id: string };
			readonly payload?: { readonly kind: string; readonly id: string };
		}
	> = {
		"chain.run": {
			scope: "project",
			source: "example/planner",
			outcome: "succeeded",
			subject: { kind: "chain", id: "chain-integration" },
		},
		"drive.run": {
			scope: "project",
			source: "bound/worker",
			outcome: "completed",
			subject: { kind: "run", id: "run-integration" },
		},
		"plan.created": {
			scope: "project",
			source: "cosmonauts/cli",
			outcome: "active",
			subject: { kind: "plan", id: "integration-plan" },
		},
		"plan.status-changed": {
			scope: "project",
			source: "cosmonauts/cli",
			outcome: "completed",
			subject: { kind: "plan", id: "integration-plan" },
		},
		"task.created": {
			scope: "project",
			source: "main/cosmo",
			outcome: "to-do",
			subject: { kind: "task", id: "TASK-900" },
		},
		"task.status-changed": {
			scope: "project",
			source: "main/cosmo",
			outcome: "done",
			subject: { kind: "task", id: "TASK-900" },
		},
		"memory.saved": {
			scope: "user",
			source: "main/cosmo",
			outcome: "succeeded",
			subject: { kind: "memory", id: "memory/agent/profile.md" },
		},
		"autonomy.wake": {
			scope: "user",
			source: "autonomy/host",
			outcome: "succeeded",
			subject: { kind: "trigger", id: "schedule:daily" },
			payload: { kind: "job", id: "maintenance/daily" },
		},
	};
	const convention = conventions[action];
	return {
		...convention,
		action,
		summary: `W3 integration ${action}`,
		details: `Persisted integration evidence for ${action}.`,
		timestamp: new Date(Date.UTC(2026, 6, 21, 12, index, 0)).toISOString(),
	};
}

function authoredNote() {
	return {
		type: "note",
		scope: "project" as const,
		kind: "semantic" as const,
		title: "W3 integration authored note",
		description: "Identical authored bytes for injection comparison.",
		content: "Authored memory remains independent from the episode log.",
		tags: ["integration"],
		timestamp: FIXED_TIME,
	};
}

async function writeEpisodicConfig(
	projectRoot: string,
	episodicLog: {
		readonly enabled: boolean;
		readonly warningThreshold?: number;
	},
): Promise<void> {
	await mkdir(join(projectRoot, ".cosmonauts"), { recursive: true });
	await writeFile(
		join(projectRoot, ".cosmonauts", "config.json"),
		JSON.stringify({ episodicLog }),
		"utf-8",
	);
}

async function memorySession(projectRoot: string, userRoot: string) {
	const pi = createMockPi({ cwd: projectRoot });
	createAgentMemoryExtension({ userCosmonautsRoot: userRoot })(pi as never);
	const injection = await authorizeCosmo(pi, projectRoot);
	return { pi, injection };
}

async function authorizeCosmo(pi: MockPi, projectRoot: string) {
	return pi.fireEvent(
		"before_agent_start",
		{ systemPrompt: buildAgentIdentityMarker("main/cosmo") },
		{ cwd: projectRoot },
	);
}

async function runDisabledW2Scenario(options: {
	readonly projectRoot: string;
	readonly userRoot: string;
	readonly episodicLog?: {
		readonly enabled: boolean;
		readonly warningThreshold?: number;
	};
}) {
	if (options.episodicLog) {
		await writeEpisodicConfig(options.projectRoot, options.episodicLog);
	}
	const pi = createMockPi({ cwd: options.projectRoot });
	createAgentMemoryExtension({
		userCosmonautsRoot: options.userRoot,
		now: () => new Date(FIXED_TIME),
	})(pi as never);
	const firstInjection = await authorizeCosmo(pi, options.projectRoot);
	const remember = await pi.callTool("remember", {
		content: "The explicit W2 save remains sequential.",
		description: "W2 parity evidence.",
		scope: "project",
		title: "W2 parity",
	});
	const recall = await pi.callTool("recall", { query: "explicit W2" });
	const secondInjection = await authorizeCosmo(pi, options.projectRoot);
	const rememberTool = pi.tools.get("remember") as
		| { readonly executionMode?: string; readonly parameters?: unknown }
		| undefined;
	const normalizedBytes = JSON.stringify(
		{ firstInjection, remember, recall, secondInjection, rememberTool },
		(key, value: unknown) => {
			if (key === "durationMs") return 0;
			if (typeof value !== "string") return value;
			return value
				.split(options.projectRoot)
				.join("<project>")
				.split(options.userRoot)
				.join("<user>");
		},
	);
	expect(rememberTool?.executionMode).toBe("sequential");
	expect(normalizedBytes).not.toContain('"episode"');
	return {
		normalizedBytes,
		projectFiles: await fileSnapshot(options.projectRoot, "memory"),
		userFiles: await fileSnapshot(options.userRoot, "memory"),
	};
}

interface FileSnapshotEntry {
	readonly path: string;
	readonly bytes: string;
}

async function fileSnapshot(
	root: string,
	subtree: string,
): Promise<FileSnapshotEntry[]> {
	const start = join(root, subtree);
	const entries: FileSnapshotEntry[] = [];

	async function walk(directory: string): Promise<void> {
		let children: Dirent[];
		try {
			children = await readdir(directory, { withFileTypes: true });
		} catch (error: unknown) {
			if (
				error &&
				typeof error === "object" &&
				"code" in error &&
				(error as NodeJS.ErrnoException).code === "ENOENT"
			) {
				return;
			}
			throw error;
		}
		for (const child of children) {
			const path = join(directory, child.name);
			if (child.isDirectory()) {
				await walk(path);
				continue;
			}
			entries.push({
				path: relative(start, path).split(sep).join("/"),
				bytes: await readFile(path, "utf-8"),
			});
		}
	}

	await walk(start);
	return entries.toSorted((left, right) => left.path.localeCompare(right.path));
}

interface ToolResult {
	readonly details: unknown;
}

function asToolResult(value: unknown): ToolResult {
	return value as ToolResult;
}

function asRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("Expected record-shaped integration data");
	}
	return value as Record<string, unknown>;
}

function asRecords(value: unknown): RetrievedMemoryRecord[] {
	if (!Array.isArray(value)) throw new Error("Expected recalled records");
	return value as RetrievedMemoryRecord[];
}

function asWarnings(value: unknown): MemoryWarning[] {
	if (!Array.isArray(value)) throw new Error("Expected recall warnings");
	return value as MemoryWarning[];
}

function requiredPath(
	paths: ReadonlyMap<EpisodeAction, string>,
	action: EpisodeAction,
): string {
	const path = paths.get(action);
	if (!path) throw new Error(`Missing path for ${action}`);
	return path;
}

function requiredRecord(
	record: RetrievedMemoryRecord | undefined,
): RetrievedMemoryRecord {
	if (!record) throw new Error("Expected recalled episode");
	return record;
}
