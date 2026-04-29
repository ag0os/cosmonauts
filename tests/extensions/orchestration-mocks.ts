import { vi } from "vitest";

const orchestrationMocks = vi.hoisted(() => ({
	runtimeCreate: vi.fn(),
	parseChain: vi.fn(),
	runChain: vi.fn(),
	createPiSpawner: vi.fn(),
	createAgentSessionFromDefinition: vi.fn(),
}));

export function getOrchestrationMocks() {
	return orchestrationMocks;
}

vi.mock("../../lib/runtime.ts", () => ({
	CosmonautsRuntime: {
		create: orchestrationMocks.runtimeCreate,
	},
}));

vi.mock("../../lib/orchestration/chain-parser.ts", () => ({
	parseChain: orchestrationMocks.parseChain,
}));

vi.mock("../../lib/orchestration/chain-runner.ts", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("../../lib/orchestration/chain-runner.ts")
		>();
	return {
		...actual,
		runChain: orchestrationMocks.runChain,
	};
});

vi.mock("../../lib/orchestration/agent-spawner.ts", () => ({
	createPiSpawner: orchestrationMocks.createPiSpawner,
}));

vi.mock("../../lib/orchestration/session-factory.ts", () => ({
	createAgentSessionFromDefinition:
		orchestrationMocks.createAgentSessionFromDefinition,
}));
