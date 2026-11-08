// Content acceptance retained until the corresponding deletion PR.
import { codingChainAdapter } from "../../bundled/coding/chain-adapter.ts";
import { setRuntimeHost } from "../../lib/runtime-host.ts";
import { installContentTestHost } from "../helpers/library-host.ts";
/**
 * Tests for orchestration extension wiring.
 * Verifies the cached CosmonautsRuntime is used and forwarded to runtime calls.
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import "./orchestration-mocks.ts";

vi.mock("../../lib/packages/dev-bundled.ts", () => ({
	discoverFrameworkBundledPackageDirs: vi.fn(async () => [
		"/framework/bundled/alpha",
	]),
}));

import type { AgentDefinition } from "../../lib/agents/index.ts";
import { AgentRegistry } from "../../lib/agents/index.ts";
import {
	registerSessionPolicy,
	removeSessionPolicy,
} from "../../lib/agents/session-policy.ts";
import type { DomainRegistry } from "../../lib/domains/registry.ts";
import { DomainResolver } from "../../lib/domains/resolver.ts";
import { FileRunStore } from "../../lib/durable-runtime/index.ts";
import orchestrationExtension from "../../lib/extensions/orchestration/index.ts";
import { createPiSpawner } from "../../lib/orchestration/agent-spawner.ts";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";
import { runChain } from "../../lib/orchestration/chain-runner.ts";
import { createQualityReviewArtifactSink } from "../../lib/orchestration/quality-review-artifacts.ts";
import type { QualityReviewSessionContext } from "../../lib/orchestration/quality-review-context.ts";
import { launchQualityReview } from "../../lib/orchestration/quality-review-launch.ts";
import { enforceQualityReviewProfile } from "../../lib/orchestration/quality-review-profile.ts";
import { renderQualityReviewReport } from "../../lib/orchestration/quality-review-report.ts";
import { createQualityReviewSessionPolicy } from "../../lib/orchestration/quality-review-session-policy.ts";
import { qualityReviewSessionPolicies } from "../../lib/orchestration/quality-review-session-provider.ts";
import {
	getOrCreateTracker,
	removeTracker,
} from "../../lib/orchestration/spawn-tracker.ts";
import {
	createMockPi,
	flushAsync,
	loadOrchestrationDomainFixtures,
	testDomainsDir,
} from "./orchestration-helpers.ts";
import { getOrchestrationMocks } from "./orchestration-mocks.ts";

const mocks = getOrchestrationMocks();
function registerQualityReviewSession(
	sessionId: string,
	context: QualityReviewSessionContext,
) {
	registerSessionPolicy(
		sessionId,
		createQualityReviewSessionPolicy(context),
		context.baseRuntime,
	);
}
const removeQualityReviewSession = removeSessionPolicy;

async function assertToolsRefused(
	pi: ReturnType<typeof createMockPi>,
	tools: readonly string[],
): Promise<void> {
	for (const tool of tools)
		await expect(pi.callTool(tool, {})).rejects.toThrow(
			`Tool refused by session profile: ${tool}`,
		);
}

async function assertMutatingSpawnsDenied(
	pi: ReturnType<typeof createMockPi>,
): Promise<void> {
	for (const role of [
		"fixer",
		"coordinator",
		"worker",
		"verifier",
		"integration-verifier",
	]) {
		const denied = (await pi.callTool("spawn_agent", {
			role,
			prompt: "change code",
		})) as { details: { status: string } };
		expect(denied.details.status).toBe("denied");
	}
}

async function assertPanelReadOnly(
	workspaceRoot: string,
	panelTools: string[],
	qualityContext: Parameters<typeof registerQualityReviewSession>[1],
): Promise<void> {
	const panelSessionId = "scripted-panel-session";
	const panel = createMockPi(workspaceRoot, {
		sessionId: panelSessionId,
		systemPrompt: "<!-- COSMONAUTS_AGENT_ID:coding/reviewer -->",
		allowedTools: panelTools,
	});
	orchestrationExtension(panel as never);
	await assertToolsRefused(panel, [
		"bash",
		"write",
		"edit",
		"chain_run",
		"spawn_agent",
	]);
	registerQualityReviewSession(panelSessionId, qualityContext);
	try {
		await expect(
			panel.callTool("spawn_agent", { role: "worker", prompt: "change code" }),
		).rejects.toThrow("Tool refused by session profile: spawn_agent");
	} finally {
		removeQualityReviewSession(panelSessionId);
	}
}

describe("orchestration extension", () => {
	const runtimeCreateMock = vi.mocked(mocks.runtimeCreate);
	const _parseChainMock = vi.mocked(parseChain);
	const _runChainMock = vi.mocked(runChain);
	const _createPiSpawnerMock = vi.mocked(createPiSpawner);

	let realRegistry: AgentRegistry;
	let realDomainRegistry: DomainRegistry;

	beforeAll(async () => {
		const fixtures = await loadOrchestrationDomainFixtures({
			domainId: "alpha",
		});
		realRegistry = fixtures.agentRegistry;
		realDomainRegistry = fixtures.domainRegistry;
	});

	function mockRuntime(overrides?: {
		domainContext?: string;
		projectSkills?: readonly string[];
		skillPaths?: readonly string[];
		agentRegistry?: AgentRegistry;
	}) {
		const resolver = new DomainResolver(realDomainRegistry);
		runtimeCreateMock.mockResolvedValue({
			chainAdapter: codingChainAdapter,
			sessionPolicies: qualityReviewSessionPolicies,
			workerAgent: "alpha/worker",
			chains: [],
			agentRegistry: overrides?.agentRegistry ?? realRegistry,
			domainContext: overrides?.domainContext,
			projectSkills: overrides?.projectSkills ?? [],
			skillPaths: overrides?.skillPaths ?? [],
			domainRegistry: realDomainRegistry,
			domainResolver: resolver,
			domainsDir: testDomainsDir,
		});
	}

	beforeEach(() => {
		setRuntimeHost(runtimeCreateMock);
		vi.clearAllMocks();
		mockRuntime();
	});

	function createExtensionPi(
		cwd = "/tmp/project",
		options?: Parameters<typeof createMockPi>[1],
	) {
		const pi = createMockPi(cwd, {
			defaultSystemPrompt: "<!-- COSMONAUTS_AGENT_ID:alpha/cody -->",
			...options,
		});
		orchestrationExtension(pi as never);
		return { cwd, pi };
	}

	function makeAgent(
		id: string,
		domain: string,
		overrides: Partial<AgentDefinition> = {},
	): AgentDefinition {
		return {
			id,
			domain,
			description: `${domain}/${id}`,
			capabilities: [],
			model: "test/model",
			tools: "none",
			extensions: [],
			skills: [],
			projectContext: false,
			session: "ephemeral",
			loop: false,
			...overrides,
		};
	}

	function mockChildSession(session: Record<string, unknown>) {
		mocks.createAgentSessionFromDefinition.mockResolvedValue({
			session,
			sessionFilePath: undefined,
		});
	}

	function createIdleChildSession(
		sessionId: string,
		extra?: Record<string, unknown>,
	) {
		return Object.assign(
			{
				sessionId,
				messages: [],
				prompt: vi.fn().mockResolvedValue(undefined),
				subscribe: vi.fn(() => vi.fn()),
				dispose: vi.fn(),
			},
			extra,
		);
	}

	function createReportChildSession(sessionId: string, report: string) {
		return createIdleChildSession(sessionId, {
			messages: [
				{
					role: "assistant",
					content: [{ type: "text", text: report }],
				},
			],
		});
	}

	async function expectAcceptedSpawn(
		pi: ReturnType<typeof createMockPi>,
		params: Record<string, unknown>,
		delayMs = 0,
	): Promise<{ status: string; spawnId: string }> {
		const result = (await pi.callTool("spawn_agent", params)) as {
			details: { status: string; spawnId: string };
		};
		await flushAsync(delayMs);
		expect(result.details.status).toBe("accepted");
		return result.details;
	}

	test("spawn_agent routes the resolved canonical QM through a durable refusal without a session", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "spawn-qm-"));
		const sessionId = `qm-parent-${Date.now()}`;
		const registry = new AgentRegistry([
			makeAgent("cody", "coding", { subagents: ["quality-manager"] }),
			makeAgent("quality-manager", "coding"),
		]);
		mockRuntime({ domainContext: "coding", agentRegistry: registry });
		const { pi } = createExtensionPi(projectRoot, {
			sessionId,
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:coding/cody -->",
		});
		const tracker = getOrCreateTracker(sessionId);
		try {
			const accepted = (await pi.callTool("spawn_agent", {
				role: "quality-manager",
				prompt: "review",
			})) as { details: { status: string } };
			expect(accepted.details.status).toBe("accepted");
			const completion = await tracker.nextCompletion();
			expect(completion.type).toBe("spawn_failed");
			expect(JSON.stringify(completion)).not.toContain("/artifacts/");
			expect(mocks.createAgentSessionFromDefinition).not.toHaveBeenCalled();
			const runs = await new FileRunStore({
				rootDir: join(projectRoot, "missions", "sessions"),
			}).listRecentRuns({ scope: "chain" });
			expect(runs).toHaveLength(1);
			expect(
				await readFile(
					join(runs[0]?.artifactsDir ?? "", "qm", "final.md"),
					"utf8",
				),
			).toContain("Verdict: refused");
			expect(
				await readFile(
					join(runs[0]?.artifactsDir ?? "", "qm", "final.md"),
					"utf8",
				),
			).toContain('Operator note (non-authoritative): "review"');
		} finally {
			removeTracker(sessionId);
			await rm(projectRoot, { recursive: true, force: true });
		}
	});

	test("quality panel spawn resolves the base runtime without importing clone domains", async () => {
		const clone = await mkdtemp(join(tmpdir(), "qm-panel-base-"));
		const sessionId = `qm-base-parent-${Date.now()}`;
		const marker = join(clone, "evil-imported");
		const evil = join(clone, ".cosmonauts", "domains", "evil");
		await (await import("node:fs/promises")).mkdir(evil, { recursive: true });
		await writeFile(
			join(evil, "domain.ts"),
			`import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'bad'); export const manifest = { id: 'evil', description: 'evil' };`,
		);
		const registry = new AgentRegistry([
			makeAgent("quality-manager", "coding", {
				subagents: ["security-reviewer"],
			}),
			makeAgent("security-reviewer", "coding", { description: "BASE-OWNED" }),
		]);
		const fixture = await loadOrchestrationDomainFixtures({
			domainId: "coding",
		});
		const baseRuntime = {
			agentRegistry: registry,
			domainContext: "coding",
			domainResolver: new DomainResolver(fixture.domainRegistry),
			domainsDir: testDomainsDir,
			projectSkills: [],
			skillPaths: [],
		};
		runtimeCreateMock.mockImplementation(async () => {
			throw new Error("clone runtime imported");
		});
		const { pi } = createExtensionPi(clone, {
			sessionId,
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:coding/quality-manager -->",
		});
		registerQualityReviewSession(sessionId, {
			runId: "qm-test",
			workspaceRoot: clone,
			base: "a".repeat(40),
			materialsRoot: clone,
			changedFiles: [],
			hostRunStoreRoot: clone,
			artifactSink: {
				reviewersOpen: () => true,
				writeReviewer: vi.fn(),
			} as never,
			activeSpawns: new Set(),
			allowedLenses: new Set(["security-reviewer"]),
			attemptedLenses: new Set(),
			integrityFailures: [],
			baseRuntime: baseRuntime as never,
		});
		mockChildSession(
			createReportChildSession("panel-base-session", "review complete"),
		);
		try {
			const accepted = (await pi.callTool("spawn_agent", {
				role: "security-reviewer",
				prompt: "review",
			})) as { details: { status: string } };
			expect(accepted.details.status).toBe("accepted");
			expect(mocks.createAgentSessionFromDefinition).toHaveBeenCalledWith(
				expect.objectContaining({ description: "BASE-OWNED" }),
				expect.anything(),
				expect.anything(),
				expect.anything(),
			);
			expect(runtimeCreateMock).not.toHaveBeenCalled();
			await expect(readFile(marker)).rejects.toMatchObject({ code: "ENOENT" });
		} finally {
			removeQualityReviewSession(sessionId);
			removeTracker(sessionId);
			await rm(clone, { recursive: true, force: true });
		}
	});

	// @cosmo-behavior plan:qm-chain-safety#B-001
	test("a scripted QM and panel refuse mutation tools and a forbidden spawn without changing the checkout", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "qm-scripted-isolation-"));
		const sessionId = "scripted-qm-session";
		const fixture = await loadOrchestrationDomainFixtures({
			domainId: "coding",
		});
		const resolver = new DomainResolver(fixture.domainRegistry);
		const registry = new AgentRegistry([
			makeAgent("quality-manager", "coding", { subagents: ["reviewer"] }),
			makeAgent("reviewer", "coding"),
			makeAgent("verifier", "coding"),
			makeAgent("worker", "coding"),
			makeAgent("fixer", "coding"),
			makeAgent("coordinator", "coding"),
			makeAgent("integration-verifier", "coding"),
		]);
		runtimeCreateMock.mockResolvedValue({
			chainAdapter: codingChainAdapter,
			sessionPolicies: qualityReviewSessionPolicies,
			workerAgent: "alpha/worker",
			chains: [],
			agentRegistry: registry,
			domainContext: "coding",
			projectSkills: [],
			skillPaths: [],
			domainRegistry: fixture.domainRegistry,
			domainResolver: resolver,
			domainsDir: testDomainsDir,
		});
		const { execFileSync } = await import("node:child_process");
		const git = (...args: string[]) =>
			execFileSync("git", args, { cwd: projectRoot, encoding: "utf8" }).trim();
		try {
			git("init", "-q");
			git("config", "user.email", "test@example.com");
			git("config", "user.name", "Test");
			await writeFile(join(projectRoot, ".gitignore"), "missions/sessions/\n");
			await writeFile(join(projectRoot, "tracked.txt"), "base\n");
			git("add", ".gitignore", "tracked.txt");
			git("commit", "-qm", "base");
			await writeFile(join(projectRoot, "tracked.txt"), "staged\n");
			git("add", "tracked.txt");
			await writeFile(join(projectRoot, "tracked.txt"), "unstaged\n");
			await writeFile(join(projectRoot, "untracked.txt"), "untracked\n");
			const headRef = git("symbolic-ref", "HEAD");
			const snapshot = async () => ({
				head: await readFile(join(projectRoot, ".git", "HEAD")),
				refs: await readFile(join(projectRoot, ".git", headRef)),
				index: await readFile(join(projectRoot, ".git", "index")),
				tracked: await readFile(join(projectRoot, "tracked.txt")),
				untracked: await readFile(join(projectRoot, "untracked.txt")),
			});
			const before = await snapshot();
			const result = await launchQualityReview({
				projectRoot,
				execute: async (context) => {
					const candidateTools = [
						"read",
						"grep",
						"find",
						"ls",
						"bash",
						"write",
						"edit",
						"chain_run",
						"spawn_agent",
					];
					const managerTools = enforceQualityReviewProfile(
						candidateTools,
						"manager",
					);
					const panelTools = enforceQualityReviewProfile(
						candidateTools,
						"reviewer",
					);
					const pi = createMockPi(context.workspaceRoot ?? "", {
						sessionId,
						systemPrompt: "<!-- COSMONAUTS_AGENT_ID:coding/quality-manager -->",
						allowedTools: managerTools,
					});
					orchestrationExtension(pi as never);
					await assertToolsRefused(pi, ["bash", "write", "edit", "chain_run"]);
					const qualityContext = {
						runId: context.runId,
						baseRuntime: {
							agentRegistry: registry,
							domainContext: "coding",
							domainResolver: resolver,
							domainsDir: testDomainsDir,
							projectSkills: [],
							skillPaths: [],
						} as never,
						workspaceRoot: context.workspaceRoot ?? "",
						materialsRoot: context.materialsRoot ?? "",
						base: context.base ?? "",
						changedFiles: context.changedFiles ?? [],
						hostRunStoreRoot: context.hostRunStoreRoot,
						artifactSink: context.artifactSink,
						activeSpawns: context.activeChildIds,
						allowedLenses: new Set(["reviewer"]),
						attemptedLenses: new Set<string>(),
						integrityFailures: [],
					};
					registerQualityReviewSession(sessionId, qualityContext);
					try {
						await assertMutatingSpawnsDenied(pi);
						await assertPanelReadOnly(
							context.workspaceRoot ?? "",
							panelTools,
							qualityContext,
						);
						return {
							markdown: renderQualityReviewReport({
								verdict: "not-ready",
								reason: "forbidden attempts refused",
							}),
						};
					} finally {
						removeQualityReviewSession(sessionId);
					}
				},
			});
			const report = await readFile(
				join(
					projectRoot,
					"missions",
					"sessions",
					"chain",
					"runs",
					result.ref.runId,
					"artifacts",
					"qm",
					"final.md",
				),
				"utf8",
			);
			expect(result.stepResult.outcome, report).toBe("success");
			expect(await snapshot()).toEqual(before);
		} finally {
			removeQualityReviewSession(sessionId);
			await rm(projectRoot, { recursive: true, force: true });
		}
	});

	async function runScriptedReviewerPanel(childMessages: unknown[]) {
		const projectRoot = await mkdtemp(join(tmpdir(), "qm-reviewer-final-"));
		const sessionId = `qm-reviewer-final-${Date.now()}`;
		const fixture = await loadOrchestrationDomainFixtures({
			domainId: "coding",
		});
		const resolver = new DomainResolver(fixture.domainRegistry);
		const registry = new AgentRegistry([
			makeAgent("quality-manager", "coding", { subagents: ["reviewer"] }),
			makeAgent("reviewer", "coding"),
		]);
		const reviewerModel = { provider: "test", id: "reviewer-model" };
		mocks.createAgentSessionFromDefinition.mockResolvedValue({
			session: createIdleChildSession("reviewer-child", {
				model: reviewerModel,
				messages: childMessages,
			}),
			sessionFilePath: undefined,
			resolvedModel: reviewerModel,
		});
		const { execFileSync } = await import("node:child_process");
		const git = (...args: string[]) =>
			execFileSync("git", args, { cwd: projectRoot, encoding: "utf8" });
		git("init", "-q");
		git("config", "user.email", "test@example.com");
		git("config", "user.name", "Test");
		await writeFile(join(projectRoot, ".gitignore"), "missions/sessions/\n");
		await writeFile(join(projectRoot, "tracked.txt"), "base\n");
		git("add", ".gitignore", "tracked.txt");
		git("commit", "-qm", "base");
		const integrityFailures: string[] = [];
		const followUps: string[] = [];
		try {
			const result = await launchQualityReview({
				projectRoot,
				execute: async (context) => {
					const pi = createMockPi(context.workspaceRoot ?? "", {
						sessionId,
						systemPrompt: "<!-- COSMONAUTS_AGENT_ID:coding/quality-manager -->",
					});
					orchestrationExtension(pi as never);
					const qualityContext = {
						runId: context.runId,
						baseRuntime: {
							agentRegistry: registry,
							domainContext: "coding",
							domainResolver: resolver,
							domainsDir: testDomainsDir,
							projectSkills: [],
							skillPaths: [],
						} as never,
						workspaceRoot: context.workspaceRoot ?? "",
						materialsRoot: context.materialsRoot ?? "",
						base: context.base ?? "",
						changedFiles: context.changedFiles ?? [],
						hostRunStoreRoot: context.hostRunStoreRoot,
						artifactSink: context.artifactSink,
						activeSpawns: context.activeChildIds,
						allowedLenses: new Set(["reviewer"]),
						attemptedLenses: new Set<string>(),
						integrityFailures,
						assessmentActive: true,
					};
					registerQualityReviewSession(sessionId, qualityContext);
					try {
						await expectAcceptedSpawn(pi, {
							role: "reviewer",
							prompt: "review",
						});
						for (let i = 0; i < 100 && qualityContext.activeSpawns.size; i++)
							await flushAsync(5);
						followUps.push(
							...pi.sendUserMessage.mock.calls.map(([text]) => String(text)),
						);
					} finally {
						removeQualityReviewSession(sessionId);
						removeTracker(sessionId);
					}
					// The production launcher fails the assessment on the same list.
					if (integrityFailures.length > 0)
						throw new Error(integrityFailures.join("; "));
					return {
						markdown: renderQualityReviewReport({
							verdict: "ready",
							reason: "reviewed",
						}),
						requiredLenses: ["reviewer"],
					};
				},
			});
			const artifacts = join(
				projectRoot,
				"missions",
				"sessions",
				"chain",
				"runs",
				result.ref.runId,
				"artifacts",
				"qm",
			);
			const reviewerFile = await readFile(
				join(artifacts, "reviewers", "reviewer.md"),
				"utf8",
			).catch(() => undefined);
			return {
				report: await readFile(join(artifacts, "final.md"), "utf8"),
				reviewerFile,
				integrityFailures,
				followUps,
			};
		} finally {
			await rm(projectRoot, { recursive: true, force: true });
		}
	}

	function assistantMessage(
		text: string | undefined,
		extra: Record<string, unknown> = {},
	) {
		return {
			role: "assistant",
			content: text === undefined ? [] : [{ type: "text", text }],
			stopReason: "stop",
			...extra,
		};
	}

	// @cosmo-behavior plan:qm-chain-safety#B-003
	test.each([
		[
			"a text-less provider error after retries",
			[
				assistantMessage("I'll start by reading the diff."),
				assistantMessage("", {
					stopReason: "error",
					errorMessage: "usage limit reached",
				}),
			],
			"final assistant message error: usage limit reached",
		],
		[
			"a provider error after partial text",
			[
				assistantMessage("Partial review before the stream broke", {
					stopReason: "error",
					errorMessage: "stream reset",
				}),
			],
			"final assistant message error: stream reset",
		],
		[
			"an aborted final message",
			[assistantMessage("Halfway through", { stopReason: "aborted" })],
			"final assistant message aborted",
		],
		[
			"a final message with no text of its own",
			[assistantMessage("Earlier review text"), assistantMessage(undefined)],
			"final assistant message has no text of its own",
		],
		[
			"a final message stopped at the token limit",
			[assistantMessage("Review cut off mid-", { stopReason: "length" })],
			"final assistant message stopped at the token limit",
		],
		["no assistant message at all", [], "no final assistant message"],
	])("a reviewer ending in %s is a failed review, not evidence", async (_name, messages, reason) => {
		const { report, reviewerFile, integrityFailures, followUps } =
			await runScriptedReviewerPanel(messages);
		expect(reviewerFile).toBeUndefined();
		expect(integrityFailures).toEqual([
			`Reviewer reviewer evidence rejected: ${reason}`,
		]);
		expect(report).toContain("Verdict: failed");
		expect(report).toContain(`Reviewer reviewer evidence rejected: ${reason}`);
		expect(report).not.toContain("reviewer completed");
		expect(followUps).toEqual([expect.stringContaining("failed")]);
	});

	test("a reviewer whose final message has its own text is recorded as evidence", async () => {
		const { reviewerFile, integrityFailures } = await runScriptedReviewerPanel([
			assistantMessage("Earlier thinking"),
			assistantMessage("Final review: no findings."),
		]);
		expect(integrityFailures).toEqual([]);
		expect(reviewerFile).toContain("Final review: no findings.");
		expect(reviewerFile).not.toContain("Earlier thinking");
	});

	test("discards a panel completion that arrives after assessment", async () => {
		const hostRoot = await mkdtemp(join(tmpdir(), "qm-late-panel-"));
		const store = new FileRunStore({ rootDir: hostRoot });
		const run = await store.createRun({ scope: "chain", runId: "qm-late" });
		const artifactSink = createQualityReviewArtifactSink({ store, run });
		mockRuntime({
			domainContext: "coding",
			agentRegistry: new AgentRegistry([
				makeAgent("quality-manager", "coding", { subagents: ["reviewer"] }),
				makeAgent("reviewer", "coding"),
			]),
		});
		const sessionId = "late-panel-parent";
		const { pi } = createExtensionPi("/private/snapshot", {
			sessionId,
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:coding/quality-manager -->",
		});
		const qualityContext = {
			runId: "qm-late",
			baseRuntime: await runtimeCreateMock({
				builtinDomainsDir: testDomainsDir,
				projectRoot: "/private/base",
			}),
			workspaceRoot: "/private/snapshot",
			materialsRoot: "/private/materials",
			base: "a".repeat(40),
			changedFiles: [],
			hostRunStoreRoot: "/operator/run-store",
			artifactSink,
			activeSpawns: new Set<string>(),
			allowedLenses: new Set(["reviewer"]),
			attemptedLenses: new Set<string>(),
			integrityFailures: [] as string[],
			assessmentActive: true,
		};
		let settlePrompt: (() => void) | undefined;
		const pending = new Promise<void>((resolve) => {
			settlePrompt = resolve;
		});
		const child = createIdleChildSession("late-reviewer", {
			abort: vi.fn(),
			prompt: vi.fn(() => pending),
			messages: [
				{
					role: "assistant",
					content: [{ type: "text", text: "late full review" }],
				},
			],
		});
		mockChildSession(child);
		registerQualityReviewSession(sessionId, qualityContext);
		try {
			const accepted = (await pi.callTool("spawn_agent", {
				role: "reviewer",
				prompt: "review",
			})) as { details: { status: string } };
			expect(accepted.details.status, JSON.stringify(accepted)).toBe(
				"accepted",
			);
			await artifactSink.sealReviewers();
			settlePrompt?.();
			await flushAsync(10);
			await expect(
				readFile(join(run.artifactsDir, "qm", "reviewers", "reviewer.md")),
			).rejects.toMatchObject({ code: "ENOENT" });
			expect(
				(
					await store.readEvents({ scope: "chain", runId: "qm-late" })
				).events.filter(({ event }) => event.type === "artifact_written"),
			).toHaveLength(0);
			expect(child.abort).not.toHaveBeenCalled();
		} finally {
			removeQualityReviewSession(sessionId);
			await rm(hostRoot, { recursive: true, force: true });
		}
	});
});

beforeEach(installContentTestHost);
