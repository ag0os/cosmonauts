import { beforeEach, describe, expect, test, vi } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";
import { runChain } from "../../lib/orchestration/chain-runner.ts";
import type {
	AgentSpawner,
	ChainConfig,
	SpawnResult,
} from "../../lib/orchestration/types.ts";

const spawnerRef = vi.hoisted(() => ({
	current: undefined as AgentSpawner | undefined,
}));

vi.mock("../../lib/orchestration/agent-spawner.ts", () => ({
	createPiSpawner: () => spawnerRef.current,
}));

function createMockSpawner(): AgentSpawner {
	const result: SpawnResult = {
		success: true,
		sessionId: "mock-session",
		messages: [],
	};

	return {
		spawn: vi.fn(async () => result),
		dispose: vi.fn(),
	};
}

function makeDef(id: string, domain: string): AgentDefinition {
	return {
		id,
		description: `Test ${id}`,
		capabilities: [],
		model: "test/model",
		tools: "none",
		extensions: [],
		skills: ["*"],
		projectContext: false,
		session: "ephemeral",
		loop: false,
		domain,
	};
}

function makeConfig(overrides: Partial<ChainConfig>): ChainConfig {
	return {
		steps: [],
		projectRoot: "/tmp/test-project",
		registry: new AgentRegistry([]),
		...overrides,
	};
}

describe("chain-runner cosmo migration (cosmo-migration)", () => {
	beforeEach(() => {
		spawnerRef.current = createMockSpawner();
	});

	test("adds migration hint when an unresolved cosmo stage fails", async () => {
		const registry = new AgentRegistry([makeDef("cody", "coding")]);
		const steps = parseChain("cosmo", registry);

		const result = await runChain(makeConfig({ steps, registry }));

		expect(result.success).toBe(false);
		expect(result.stageResults).toHaveLength(1);
		expect(result.stageResults[0]?.error).toContain(
			'Unknown agent role "cosmo"',
		);
		expect(result.stageResults[0]?.error).toContain("main/cosmo");
		expect(result.stageResults[0]?.error).toContain("coding/cody");
		expect(spawnerRef.current?.spawn).not.toHaveBeenCalled();
	});
});
