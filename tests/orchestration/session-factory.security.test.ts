import { writeFileSync } from "node:fs";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";

const mocks = vi.hoisted(() => ({
	createAgentSession: vi.fn(),
	sessionOpen: vi.fn(),
	sessionInMemory: vi.fn(),
	buildSessionParams: vi.fn(),
	loaderOptions: vi.fn(),
	unrelatedTool: vi.fn(async () => "spawned-tool-called"),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
	AuthStorage: {
		create: () => ({ kind: "auth-storage" }),
	},
	createAgentSession: mocks.createAgentSession,
	DefaultResourceLoader: class {
		private readonly options: {
			extensionFactories?: { name: string }[];
			additionalExtensionPaths?: string[];
		};
		constructor(options: {
			extensionFactories?: { name: string }[];
			additionalExtensionPaths?: string[];
		}) {
			this.options = options;
			mocks.loaderOptions(options);
		}
		async reload() {}
		getExtensions() {
			const pathExtensions = (this.options.additionalExtensionPaths ?? []).map(
				(path) => ({
					path,
					tools: path.includes("quality-tools")
						? new Map([
								...[
									"spawn_agent",
									"analysis_audit",
									"bash",
									"edit",
									"write",
									"chain_run",
									"drive_run",
									"task_create",
									"plan_edit",
								].map((name): [string, object] => [name, {}]),
							])
						: path.includes("conflict")
							? new Map([["recall", {}]])
							: new Map([
									["spawned_unrelated_tool", { execute: mocks.unrelatedTool }],
								]),
				}),
			);
			return {
				extensions: [
					...(this.options.extensionFactories ?? []).map((factory) => ({
						path: `<inline:${factory.name}>`,
						tools: new Map([["recall", {}]]),
					})),
					...pathExtensions,
				],
				errors: [],
				runtime: {},
			};
		}
	},
	getAgentDir: () => "/tmp/test-agent-dir",
	ModelRegistry: {
		create: () => ({ find: vi.fn(() => undefined) }),
	},
	SessionManager: {
		open: mocks.sessionOpen,
		inMemory: mocks.sessionInMemory,
	},
	SettingsManager: {
		inMemory: vi.fn(() => ({ setProjectTrusted: vi.fn() })),
	},
}));

vi.mock("../../lib/agents/session-assembly.ts", () => ({
	buildSessionParams: mocks.buildSessionParams,
}));

import { createPiSpawner } from "../../lib/orchestration/agent-spawner.ts";
import { createAgentSessionFromDefinition } from "../../lib/orchestration/session-factory.ts";

const TEST_AGENT: AgentDefinition = {
	id: "planner",
	description: "Test planner",
	capabilities: [],
	model: "test/model",
	tools: "none",
	extensions: [],
	skills: ["*"],
	projectContext: false,
	session: "ephemeral",
	loop: false,
	domain: "coding",
};

describe("session-factory planSlug validation", () => {
	test("uses base project config and context files while the session cwd is the clone", async () => {
		const root = await mkdtemp(join(tmpdir(), "qm-base-session-"));
		const baseProjectRoot = join(root, "base");
		const workspaceRoot = join(root, "checkout");
		const hostRunStoreRoot = join(root, "store");
		try {
			await mkdir(join(baseProjectRoot, ".cosmonauts"), { recursive: true });
			await mkdir(join(workspaceRoot, ".cosmonauts"), { recursive: true });
			await writeFile(
				join(baseProjectRoot, ".cosmonauts", "config.json"),
				JSON.stringify({ skills: ["base"] }),
			);
			await writeFile(
				join(workspaceRoot, ".cosmonauts", "config.json"),
				JSON.stringify({ skills: ["changed"] }),
			);
			await writeFile(join(baseProjectRoot, "AGENTS.md"), "base instructions");
			await writeFile(join(workspaceRoot, "AGENTS.md"), "changed instructions");
			mocks.buildSessionParams.mockResolvedValue({
				promptContent: "panel",
				tools: ["read"],
				extensionPaths: [],
				extensionFactories: [],
				knowledgeSurfaceEnabled: false,
				projectContext: true,
				model: { provider: "test", id: "model" },
				qualityReviewProfile: "reviewer",
			});
			await createAgentSessionFromDefinition(
				TEST_AGENT,
				{
					role: "coding/reviewer",
					cwd: workspaceRoot,
					prompt: "review",
					qualityReviewChild: true,
					qualityReviewContext: {
						runId: "one",
						workspaceRoot,
						baseProjectRoot,
						materialsRoot: join(root, "materials"),
						base: "a".repeat(40),
						changedFiles: [],
						hostRunStoreRoot,
						artifactSink: {} as never,
						activeSpawns: new Set(),
						allowedLenses: new Set(["reviewer"]),
						attemptedLenses: new Set(),
						integrityFailures: [],
					},
				},
				"/tmp/domains",
			);
			const assembly = mocks.buildSessionParams.mock.calls.at(-1)?.[0];
			expect((await assembly.loadConfig(workspaceRoot)).skills).toEqual([
				"base",
			]);
			const loader = mocks.loaderOptions.mock.calls.at(-1)?.[0];
			expect(loader.cwd).toBe(workspaceRoot);
			expect(loader.agentsFilesOverride().agentsFiles).toEqual([
				{
					path: join(baseProjectRoot, "AGENTS.md"),
					content: "base instructions",
				},
			]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
	test("replaces the QM project-tools path with its run-local authorization factory", async () => {
		const hostRunStoreRoot = await mkdtemp(
			join(tmpdir(), "qm-session-consent-"),
		);
		try {
			mocks.buildSessionParams.mockResolvedValue({
				promptContent: "manager",
				tools: ["analysis_status", "analysis_audit"],
				extensionPaths: ["/tmp/domains/shared/extensions/project-tools"],
				extensionFactories: [],
				knowledgeSurfaceEnabled: false,
				projectContext: false,
				model: { provider: "test", id: "model" },
				qualityReviewProfile: "manager",
			});
			const authorization = {
				runId: "one",
				snapshotRealPath: "/tmp/review-clone",
				consented: true,
				authorizationFor: vi.fn(),
				dispose: vi.fn(),
			};
			await createAgentSessionFromDefinition(
				TEST_AGENT,
				{
					role: "coding/quality-manager",
					cwd: "/tmp/review-clone",
					prompt: "review",
					qualityReviewContext: {
						hostRunStoreRoot,
						workspaceRoot: "/tmp/review-clone",
						materialsRoot: "/tmp/materials",
						base: "a".repeat(40),
						changedFiles: [],
						runId: "one",
						analysisConsent: authorization,
						artifactSink: {} as never,
						activeSpawns: new Set(),
						allowedLenses: new Set(["reviewer"]),
						attemptedLenses: new Set(),
						integrityFailures: [],
					},
				},
				"/tmp/domains",
			);
			const options = mocks.loaderOptions.mock.calls.at(-1)?.[0] as {
				additionalExtensionPaths?: string[];
				extensionFactories?: unknown[];
			};
			expect(options.additionalExtensionPaths).toBeUndefined();
			expect(options.extensionFactories).toHaveLength(1);
		} finally {
			await rm(hostRunStoreRoot, { recursive: true, force: true });
		}
	});
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.buildSessionParams.mockResolvedValue({
			promptContent: "system prompt",
			tools: [],
			extensionPaths: [],
			extensionFactories: [],
			knowledgeSurfaceEnabled: false,
			skillsOverride: undefined,
			additionalSkillPaths: undefined,
			projectContext: false,
			model: { id: "test/model" },
			thinkingLevel: undefined,
		});
		mocks.sessionInMemory.mockReturnValue({ kind: "in-memory" });
		mocks.sessionOpen.mockReturnValue({ kind: "file-backed" });
		mocks.createAgentSession.mockResolvedValue({
			session: {
				sessionId: "session-1",
				model: { provider: "observed", id: "resolved-model" },
			},
		});
	});

	test("assembles panel skill locations from the base export without source or host paths", async () => {
		const sourceRoot = await mkdtemp(join(tmpdir(), "qm-source-skills-"));
		const workspaceRoot = await mkdtemp(join(tmpdir(), "qm-clone-skills-"));
		const baseProjectRoot = await mkdtemp(join(tmpdir(), "qm-base-skills-"));
		const hostRunStoreRoot = await mkdtemp(join(tmpdir(), "qm-host-skills-"));
		const suffix = join("bundled", "coding", "skills");
		await mkdir(join(sourceRoot, suffix), { recursive: true });
		await mkdir(join(workspaceRoot, suffix), { recursive: true });
		await mkdir(join(baseProjectRoot, suffix), { recursive: true });
		mocks.buildSessionParams.mockImplementation(
			async ({ skillPaths }: { skillPaths: string[] }) => ({
				promptContent: `Panel system prompt\n${skillPaths.map((path) => `<location>${path}</location>`).join("\n")}`,
				tools: [],
				extensionPaths: [],
				extensionFactories: [],
				knowledgeSurfaceEnabled: false,
				additionalSkillPaths: skillPaths,
				projectContext: false,
				model: { provider: "test", id: "model" },
				qualityReviewProfile: "reviewer",
			}),
		);
		try {
			await createAgentSessionFromDefinition(
				TEST_AGENT,
				{
					role: "coding/reviewer",
					cwd: workspaceRoot,
					prompt: "review",
					skillPaths: [join(sourceRoot, suffix)],
					qualityReviewChild: true,
					qualityReviewContext: {
						runId: "qm-skills",
						sourceRoot,
						baseProjectRoot,
						workspaceRoot,
						materialsRoot: workspaceRoot,
						base: "a".repeat(40),
						changedFiles: [],
						hostRunStoreRoot,
						artifactSink: {} as never,
						activeSpawns: new Set(),
						allowedLenses: new Set(["reviewer"]),
						attemptedLenses: new Set(),
						integrityFailures: [],
					},
				},
				"/tmp/domains",
			);
			const loader = mocks.loaderOptions.mock.calls.at(-1)?.[0] as {
				systemPrompt?: string;
				additionalSkillPaths?: string[];
			};
			const fullSystemPrompt = `${loader.systemPrompt}\n${loader.additionalSkillPaths?.map((path) => `<location>${path}</location>`).join("\n")}`;
			expect(fullSystemPrompt).toContain(join(baseProjectRoot, suffix));
			expect(fullSystemPrompt).not.toContain(join(workspaceRoot, suffix));
			expect(fullSystemPrompt).not.toContain(sourceRoot);
			expect(fullSystemPrompt).not.toContain(hostRunStoreRoot);
		} finally {
			await rm(sourceRoot, { recursive: true, force: true });
			await rm(workspaceRoot, { recursive: true, force: true });
			await rm(baseProjectRoot, { recursive: true, force: true });
			await rm(hostRunStoreRoot, { recursive: true, force: true });
		}
	});

	test("attributes the model exposed by Pi after session creation", async () => {
		const result = await createAgentSessionFromDefinition(
			TEST_AGENT,
			{ role: "planner", cwd: "/tmp/project", prompt: "plan" },
			"/tmp/domains",
		);
		expect(result.resolvedModel).toEqual({
			provider: "observed",
			id: "resolved-model",
		});
	});

	test("keeps unrelated extension tools callable in enabled spawned sessions", async () => {
		const factory = {
			name: "cosmonauts-knowledge-surface",
			factory: vi.fn(),
		};
		mocks.buildSessionParams.mockResolvedValue({
			promptContent: "system prompt",
			tools: [],
			extensionPaths: ["/installed/unrelated/index.ts"],
			extensionFactories: [factory],
			knowledgeSurfaceEnabled: true,
			skillsOverride: undefined,
			additionalSkillPaths: undefined,
			projectContext: false,
			model: { id: "test/model" },
			thinkingLevel: undefined,
		});
		mocks.createAgentSession.mockImplementation(async (options) => ({
			session: {
				sessionId: "session-1",
				model: { provider: "observed", id: "resolved-model" },
				async callTool(name: string, args?: unknown) {
					if (!options.tools.includes(name)) {
						throw new Error(`Tool ${name} is not callable`);
					}
					for (const extension of options.resourceLoader.getExtensions()
						.extensions) {
						const tool = extension.tools.get(name) as
							| { execute?: (input?: unknown) => Promise<unknown> }
							| undefined;
						if (tool?.execute) return tool.execute(args);
					}
					throw new Error(`Tool ${name} has no executable definition`);
				},
			},
		}));

		const result = await createAgentSessionFromDefinition(
			TEST_AGENT,
			{ role: "planner", cwd: "/tmp/project", prompt: "plan" },
			"/tmp/domains",
		);

		expect(mocks.loaderOptions).toHaveBeenCalledWith(
			expect.objectContaining({
				additionalExtensionPaths: ["/installed/unrelated/index.ts"],
				extensionFactories: [factory],
			}),
		);
		await expect(
			(
				result.session as unknown as {
					callTool(name: string): Promise<unknown>;
				}
			).callTool("spawned_unrelated_tool"),
		).resolves.toBe("spawned-tool-called");
		expect(mocks.unrelatedTool).toHaveBeenCalledTimes(1);
	});

	test("rejects an enabled spawned-session recall collision before session use", async () => {
		mocks.buildSessionParams.mockResolvedValue({
			promptContent: "system prompt",
			tools: [],
			extensionPaths: ["/installed/conflict/index.ts"],
			extensionFactories: [
				{ name: "cosmonauts-knowledge-surface", factory: vi.fn() },
			],
			knowledgeSurfaceEnabled: true,
			skillsOverride: undefined,
			additionalSkillPaths: undefined,
			projectContext: false,
			model: { id: "test/model" },
			thinkingLevel: undefined,
		});

		await expect(
			createAgentSessionFromDefinition(
				TEST_AGENT,
				{ role: "planner", cwd: "/tmp/project", prompt: "plan" },
				"/tmp/domains",
			),
		).rejects.toThrow(
			/<inline:cosmonauts-knowledge-surface>.*\/installed\/conflict\/index\.ts/,
		);
		expect(mocks.sessionInMemory).not.toHaveBeenCalled();
		expect(mocks.createAgentSession).not.toHaveBeenCalled();
	});

	test("rejects invalid planSlug before creating session persistence paths", async () => {
		await expect(
			createAgentSessionFromDefinition(
				TEST_AGENT,
				{
					role: "planner",
					cwd: "/tmp/project",
					prompt: "plan",
					planSlug: "../../escape",
				},
				"/tmp/domains",
			),
		).rejects.toThrow("Invalid plan slug");

		expect(mocks.sessionOpen).not.toHaveBeenCalled();
		expect(mocks.createAgentSession).not.toHaveBeenCalled();
	});

	// @cosmo-behavior plan:qm-chain-safety#B-001
	test("passes only safe quality tools to Pi after extensions register", async () => {
		mocks.buildSessionParams.mockResolvedValue({
			promptContent: "QM",
			tools: ["read", "grep", "find", "ls", "bash", "edit", "write"],
			extensionPaths: ["/installed/quality-tools/index.ts"],
			extensionFactories: [],
			knowledgeSurfaceEnabled: false,
			projectContext: false,
			model: { provider: "test", id: "model" },
			qualityReviewProfile: "manager",
		});
		await createAgentSessionFromDefinition(
			TEST_AGENT,
			{ role: "quality-manager", cwd: "/tmp/project", prompt: "review" },
			"/tmp/domains",
		);
		expect(mocks.createAgentSession.mock.calls[0]?.[0].tools).toEqual([
			"read",
			"grep",
			"find",
			"ls",
			"spawn_agent",
			"analysis_audit",
		]);
	});

	// @cosmo-behavior plan:qm-chain-safety#B-003
	test("stores a qualified panel session transcript under the host run", async () => {
		const hostRunStoreRoot = await mkdtemp(join(tmpdir(), "qm-host-run-"));
		try {
			mocks.buildSessionParams.mockResolvedValue({
				promptContent: "panel",
				tools: ["read", "grep", "find", "ls", "bash"],
				extensionPaths: [],
				extensionFactories: [],
				knowledgeSurfaceEnabled: false,
				projectContext: false,
				model: { provider: "test", id: "model" },
				qualityReviewProfile: "reviewer",
			});
			const result = await createAgentSessionFromDefinition(
				TEST_AGENT,
				{
					role: "coding/reviewer",
					cwd: "/tmp/review-clone",
					prompt: "review",
					qualityReviewChild: true,
					qualityReviewContext: {
						hostRunStoreRoot,
						workspaceRoot: "/tmp/review-clone",
						materialsRoot: "/tmp/materials",
						base: "a".repeat(40),
						changedFiles: [],
						runId: "one",
						artifactSink: {} as never,
						activeSpawns: new Set(),
						allowedLenses: new Set(["reviewer"]),
						attemptedLenses: new Set(),
						integrityFailures: [],
					},
				},
				"/tmp/domains",
			);
			expect(result.sessionFilePath).toMatch(
				new RegExp(
					`^${hostRunStoreRoot}/transcripts/quality-session-[a-f0-9-]+\\.jsonl$`,
				),
			);
			expect(mocks.createAgentSession.mock.calls[0]?.[0].tools).toEqual([
				"read",
				"grep",
				"find",
				"ls",
			]);
		} finally {
			await rm(hostRunStoreRoot, { recursive: true, force: true });
		}
	});

	test("keeps QM and panel transcripts after their private checkout is removed", async () => {
		const hostRunStoreRoot = await mkdtemp(
			join(tmpdir(), "qm-transcripts-host-"),
		);
		const workspaceRoot = await mkdtemp(
			join(tmpdir(), "qm-transcripts-clone-"),
		);
		try {
			mocks.sessionOpen.mockImplementation((path: string) => {
				writeFileSync(path, "transcript bytes");
				return { kind: "file-backed" };
			});
			mocks.buildSessionParams.mockResolvedValue({
				promptContent: "review",
				tools: ["read", "grep", "find", "ls"],
				extensionPaths: [],
				extensionFactories: [],
				knowledgeSurfaceEnabled: false,
				projectContext: false,
				model: { provider: "test", id: "model" },
				qualityReviewProfile: "reviewer",
			});
			const qualityReviewContext = {
				hostRunStoreRoot,
				workspaceRoot,
				materialsRoot: "/tmp/materials",
				base: "a".repeat(40),
				changedFiles: [],
				runId: "qm-one",
				artifactSink: {} as never,
				activeSpawns: new Set<string>(),
				allowedLenses: new Set(["reviewer"]),
				attemptedLenses: new Set<string>(),
				integrityFailures: [],
			};
			const manager = await createAgentSessionFromDefinition(
				TEST_AGENT,
				{
					role: "quality-manager",
					cwd: workspaceRoot,
					prompt: "review",
					qualityReviewContext,
				},
				"/tmp/domains",
			);
			const panel = await createAgentSessionFromDefinition(
				TEST_AGENT,
				{
					role: "coding/reviewer",
					cwd: workspaceRoot,
					prompt: "review",
					qualityReviewChild: true,
					qualityReviewContext,
				},
				"/tmp/domains",
			);
			expect(await readdir(workspaceRoot)).toEqual([]);
			await rm(workspaceRoot, { recursive: true, force: true });
			expect(await readFile(manager.sessionFilePath ?? "", "utf8")).toBe(
				"transcript bytes",
			);
			expect(await readFile(panel.sessionFilePath ?? "", "utf8")).toBe(
				"transcript bytes",
			);
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
			await rm(hostRunStoreRoot, { recursive: true, force: true });
		}
	});

	test("spawns QM and panel into a private cwd with host-owned transcripts", async () => {
		const hostRunStoreRoot = await mkdtemp(join(tmpdir(), "qm-spawn-host-"));
		const workspaceRoot = await mkdtemp(join(tmpdir(), "qm-spawn-clone-"));
		try {
			let sessionNumber = 0;
			mocks.sessionOpen.mockImplementation((path: string) => {
				writeFileSync(path, "session bytes");
				return { kind: "file-backed" };
			});
			mocks.buildSessionParams.mockImplementation(async ({ def }) => ({
				promptContent: "review",
				tools: ["read", "grep", "find", "ls"],
				extensionPaths: [],
				extensionFactories: [],
				knowledgeSurfaceEnabled: false,
				projectContext: false,
				model: { provider: "test", id: "model" },
				qualityReviewProfile:
					def.id === "quality-manager" ? "manager" : "reviewer",
			}));
			mocks.createAgentSession.mockImplementation(async ({ cwd }) => ({
				session: {
					sessionId: `quality-session-${++sessionNumber}`,
					model: { provider: "observed", id: "model" },
					messages: [],
					prompt: async () => undefined,
					subscribe: () => () => undefined,
					dispose: () => undefined,
					getSessionStats: () => ({
						sessionFile: undefined,
						sessionId: `quality-session-${sessionNumber}`,
						userMessages: 0,
						assistantMessages: 0,
						toolCalls: 0,
						toolResults: 0,
						totalMessages: 0,
						tokens: {
							input: 0,
							output: 0,
							cacheRead: 0,
							cacheWrite: 0,
							total: 0,
						},
						cost: 0,
					}),
					cwd,
				},
			}));
			const qualityReviewContext = {
				hostRunStoreRoot,
				workspaceRoot,
				materialsRoot: "/tmp/materials",
				base: "a".repeat(40),
				changedFiles: [],
				runId: "qm-one",
				artifactSink: {} as never,
				activeSpawns: new Set<string>(),
				allowedLenses: new Set(["reviewer"]),
				attemptedLenses: new Set<string>(),
				integrityFailures: [],
			};
			const registry = new AgentRegistry([
				{ ...TEST_AGENT, id: "quality-manager" },
				{ ...TEST_AGENT, id: "reviewer" },
			]);
			const spawner = createPiSpawner(registry, "/tmp/domains");
			for (const config of [
				{ role: "quality-manager", qualityReviewChild: false },
				{ role: "reviewer", qualityReviewChild: true },
			]) {
				const result = await spawner.spawn({
					...config,
					cwd: workspaceRoot,
					prompt: "review",
					qualityReviewContext,
				});
				expect(result.success, result.error).toBe(true);
			}
			spawner.dispose();
			expect(
				mocks.createAgentSession.mock.calls.map(([options]) => options.cwd),
			).toEqual([workspaceRoot, workspaceRoot]);
			expect(await readdir(workspaceRoot)).toEqual([]);
			const transcripts = await readdir(join(hostRunStoreRoot, "transcripts"));
			expect(
				transcripts.filter((file) => file.endsWith(".jsonl")),
			).toHaveLength(2);
			await rm(workspaceRoot, { recursive: true, force: true });
			for (const file of transcripts)
				expect(
					await readFile(join(hostRunStoreRoot, "transcripts", file), "utf8"),
				).toBeTruthy();
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
			await rm(hostRunStoreRoot, { recursive: true, force: true });
		}
	});
});
