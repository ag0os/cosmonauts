import { expect, test, vi } from "vitest";
import { executeChainExpression } from "../../cli/chain-execution.ts";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { CosmonautsRuntime } from "../../lib/runtime.ts";
import { useTempDir } from "../helpers/fs.ts";

const host = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("../../lib/orchestration/chain-dispatch.ts", () => ({
	runConfiguredChain: host.run,
}));
const tmp = useTempDir("neutral-cli-chain-");
test("a consumer without an adapter can execute declared topology with capture off", async () => {
	const result = {
		success: true,
		totalDurationMs: 0,
		stageResults: [],
		errors: [],
	};
	host.run.mockResolvedValue(result);
	const runtime = {
		agentRegistry: new AgentRegistry([]),
		chains: [],
		projectSkills: [],
		skillPaths: [],
		defaultModel: "test/model",
	} as unknown as CosmonautsRuntime;
	expect(
		await executeChainExpression({
			runtime,
			options: { piFlags: {} },
			cwd: tmp.path,
			chainExpr: "scribe",
		}),
	).toBe(result);
	expect(host.run).toHaveBeenCalledWith(
		expect.objectContaining({
			episodes: false,
			chainAdapter: undefined,
			defaultModel: "test/model",
			steps: [{ name: "scribe" }],
		}),
	);
});
