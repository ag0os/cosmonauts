import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createRegistryFromDomains } from "../../../lib/agents/index.ts";
import type { AgentDefinition } from "../../../lib/agents/types.ts";
import { loadDomainsFromSources } from "../../../lib/domains/index.ts";
import { createCosmonautsSubagentBackend } from "../../../lib/driver/backends/cosmonauts-subagent.ts";
import type { BackendInvocation } from "../../../lib/driver/backends/types.ts";
import { createPiSpawner } from "../../../lib/orchestration/agent-spawner.ts";

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
					content: [{ type: "text", text: "resolved" }],
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
});

async function createInvocation(): Promise<BackendInvocation> {
	tempDir = await mkdtemp(join(tmpdir(), "cosmonauts-subagent-resolution-"));
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
