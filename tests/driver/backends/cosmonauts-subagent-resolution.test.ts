import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createRegistryFromDomains } from "../../../lib/agents/index.ts";
import type { AgentDefinition } from "../../../lib/agents/types.ts";
import { loadDomainsFromSources } from "../../../lib/domains/index.ts";
import { createCosmonautsSubagentBackend } from "../../../lib/driver/backends/cosmonauts-subagent.ts";
import type { BackendInvocation } from "../../../lib/driver/backends/types.ts";
import { resolveDefaultDriveEnvelopePath } from "../../../lib/driver/default-envelope.ts";
import { runInline } from "../../../lib/driver/driver.ts";
import { createPiSpawner } from "../../../lib/orchestration/agent-spawner.ts";
import { resolveSpawnAgent } from "../../../lib/orchestration/spawn-resolution.ts";
import { TaskManager } from "../../../lib/tasks/task-manager.ts";

const REPO_ROOT = resolve(
	fileURLToPath(import.meta.url),
	"..",
	"..",
	"..",
	"..",
);
const DOMAINS_DIR = join(REPO_ROOT, "domains");
const BUNDLED_CODING_DIR = join(REPO_ROOT, "bundled", "coding");

const sessionFactoryMocks = vi.hoisted(() => ({
	createAgentSessionFromDefinition: vi.fn(),
}));

vi.mock("../../../lib/orchestration/session-factory.ts", () => ({
	createAgentSessionFromDefinition:
		sessionFactoryMocks.createAgentSessionFromDefinition,
}));

let tempDir: string | undefined;

beforeEach(() => {
	sessionFactoryMocks.createAgentSessionFromDefinition.mockReset();
	sessionFactoryMocks.createAgentSessionFromDefinition.mockResolvedValue({
		session: {
			sessionId: "dogfood-worker-session",
			messages: [
				{
					role: "assistant",
					content: [{ type: "text", text: "outcome: success" }],
				},
			],
			prompt: vi.fn(),
			dispose: vi.fn(),
			subscribe: vi.fn(() => vi.fn()),
			getSessionStats: () => ({
				tokens: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					total: 0,
				},
				cost: 0,
				userMessages: 1,
				toolCalls: 0,
			}),
		},
	});
});

afterEach(async () => {
	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true });
		tempDir = undefined;
	}
});

describe("cosmonauts-subagent dogfood worker resolution", () => {
	// @cosmo-behavior plan:coding-agnostic-framework#B-020
	test("resolves default unqualified Drive worker with no domain context to coding/worker", async () => {
		const domains = await loadDomainsFromSources([
			{ domainsDir: DOMAINS_DIR, origin: "framework", precedence: 1 },
			{
				domainsDir: BUNDLED_CODING_DIR,
				sourceType: "domain-root",
				origin: "bundled",
				precedence: 2,
			},
		]);
		const mainDomain = domains.find((domain) => domain.manifest.id === "main");
		const codingDomain = domains.find(
			(domain) => domain.manifest.id === "coding",
		);
		expect(mainDomain?.agents.has("worker")).toBe(false);
		expect(codingDomain?.agents.has("worker")).toBe(true);

		const registry = createRegistryFromDomains(domains);
		const spawner = createPiSpawner(registry, DOMAINS_DIR);
		const backend = createCosmonautsSubagentBackend({
			spawner,
			cwd: REPO_ROOT,
		});

		await backend.run(await createInvocation());

		expect(
			sessionFactoryMocks.createAgentSessionFromDefinition,
		).toHaveBeenCalledTimes(1);
		const [resolvedDefinition, spawnConfig] =
			sessionFactoryMocks.createAgentSessionFromDefinition.mock.calls[0] ?? [];
		const agent = resolvedDefinition as AgentDefinition;
		expect(`${agent.domain}/${agent.id}`).toBe("coding/worker");
		expect(spawnConfig).toMatchObject({
			role: "worker",
			domainContext: undefined,
		});
	});

	// Regression guard (codex P1): a frozen qualified worker resolution must not
	// become the spawner `role`, which session-factory bakes into the session
	// file path (`${role}-<uuid>.jsonl`). Worker SELECTION rides `agentReference`.
	test("keeps the session role a plain worker when a qualified worker resolution is frozen", async () => {
		const domains = await loadDomainsFromSources([
			{ domainsDir: DOMAINS_DIR, origin: "framework", precedence: 1 },
			{
				domainsDir: BUNDLED_CODING_DIR,
				sourceType: "domain-root",
				origin: "bundled",
				precedence: 2,
			},
		]);
		const registry = createRegistryFromDomains(domains);
		const spawner = createPiSpawner(registry, DOMAINS_DIR);
		const frozen = resolveSpawnAgent(registry, {
			role: "coding/worker",
			domainContext: undefined,
			agentReference: undefined,
		});
		if (!frozen) throw new Error("expected coding/worker to resolve");
		expect(frozen.reference?.requested.qualifiedId).toBe("coding/worker");

		const backend = createCosmonautsSubagentBackend({
			spawner,
			cwd: REPO_ROOT,
			workerResolution: frozen,
		});
		await backend.run(await createInvocation());

		const [, spawnConfig] =
			sessionFactoryMocks.createAgentSessionFromDefinition.mock.calls[0] ?? [];
		// role stays the plain worker (never "coding/worker") so session/manifest
		// paths are unchanged, while the frozen reference still selects the agent.
		expect((spawnConfig as { role: string }).role).toBe("worker");
		expect(
			(spawnConfig as { agentReference?: unknown }).agentReference,
		).toEqual(frozen.reference);
	});

	test("runs inline Drive with cosmonauts-subagent, omitted envelope input, and no domain override", async () => {
		const domains = await loadDomainsFromSources([
			{ domainsDir: DOMAINS_DIR, origin: "framework", precedence: 1 },
			{
				domainsDir: BUNDLED_CODING_DIR,
				sourceType: "domain-root",
				origin: "bundled",
				precedence: 2,
			},
		]);
		const registry = createRegistryFromDomains(domains);
		const spawner = createPiSpawner(registry, DOMAINS_DIR);
		const backend = createCosmonautsSubagentBackend({
			spawner,
			cwd: REPO_ROOT,
		});
		const projectRoot = await createTempProject();
		const taskManager = new TaskManager(projectRoot);
		await taskManager.init();
		const task = await taskManager.createTask({
			title: "B-021 dogfood Drive smoke",
			labels: ["review-round:1", "plan:coding-agnostic-framework"],
		});
		const envelopePath = resolveDefaultDriveEnvelopePath({
			frameworkRoot: REPO_ROOT,
		});
		const runId = "run-b021-cosmonauts-subagent-smoke";
		const workdir = join(projectRoot, "runs", runId);
		const eventLogPath = join(workdir, "events.jsonl");

		const handle = runInline(
			{
				runId,
				parentSessionId: "parent-session-b021-smoke",
				projectRoot,
				planSlug: "coding-agnostic-framework",
				taskIds: [task.id],
				backendName: "cosmonauts-subagent",
				promptTemplate: {
					envelopePath,
					envelopeContent: await readFile(envelopePath, "utf-8"),
				},
				preflightCommands: [],
				postflightCommands: [],
				commitPolicy: "no-commit",
				stateCommitPolicy: "none",
				workdir,
				eventLogPath,
			},
			{
				taskManager,
				backend,
				activityBus: { publish: vi.fn() },
				cosmonautsRoot: REPO_ROOT,
			},
		);

		await expect(handle.result).resolves.toMatchObject({
			runId,
			outcome: "completed",
			tasksDone: 1,
		});
		const [resolvedDefinition, spawnConfig] =
			sessionFactoryMocks.createAgentSessionFromDefinition.mock.calls[0] ?? [];
		const agent = resolvedDefinition as AgentDefinition;
		expect(`${agent.domain}/${agent.id}`).toBe("coding/worker");
		expect(spawnConfig).toMatchObject({
			role: "worker",
			domainContext: undefined,
		});
		expect(envelopePath).toBe(
			join(REPO_ROOT, "lib", "prompts", "framework", "drive", "envelope.md"),
		);
		const events = await readFile(eventLogPath, "utf-8");
		expect(events).toContain('"backend":"cosmonauts-subagent"');
		expect(events).toContain(`"taskId":"${task.id}"`);
		expect(events).toContain('"kind":"agent_resolved"');
		expect(events).toContain('"requestedRole":"worker"');
		expect(events).toContain('"resolvedAgentId":"coding/worker"');
	});
});

async function createInvocation(): Promise<BackendInvocation> {
	tempDir = await createTempProject();
	const promptPath = join(tempDir, "prompt.md");
	await writeFile(promptPath, "Resolve the dogfood Drive worker.", "utf-8");

	return {
		runId: "run-dogfood-resolution",
		promptPath,
		workdir: tempDir,
		projectRoot: REPO_ROOT,
		taskId: "TASK-423",
		parentSessionId: "parent-session-dogfood",
		planSlug: "coding-agnostic-framework",
		eventSink: async () => {},
		signal: new AbortController().signal,
	};
}

async function createTempProject(): Promise<string> {
	tempDir = await mkdtemp(join(tmpdir(), "cosmonauts-subagent-resolution-"));
	return tempDir;
}
