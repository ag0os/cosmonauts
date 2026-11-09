import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import type { RunStartResult } from "../../lib/durable-runtime/index.ts";
import { runDurableChain } from "../../lib/orchestration/durable-chain-runner.ts";
import { useTempDir } from "../helpers/fs.ts";
import { runtimeDouble } from "../helpers/runtime-double.ts";

const mocks = vi.hoisted(() => ({
	runStart: vi.fn<() => Promise<RunStartResult>>(),
}));
vi.mock("../../lib/orchestration/agent-spawner.ts", () => ({
	createPiSpawner: () => ({ spawn: vi.fn(), dispose: vi.fn() }),
}));
vi.mock("../../lib/durable-runtime/index.ts", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../lib/durable-runtime/index.ts")
	>()),
	runStart: mocks.runStart,
}));

const tmp = useTempDir("durable-chain-exits-");
const registry = new AgentRegistry([
	{
		id: "scribe",
		domain: "studio",
		description: "scribe",
		model: "test/model",
		capabilities: [],
		tools: "none",
		extensions: [],
		skills: [],
		projectContext: false,
		session: "ephemeral",
		loop: false,
	} satisfies AgentDefinition,
]);

async function runWith(result: RunStartResult) {
	mocks.runStart.mockResolvedValueOnce(result);
	const root = join(tmp.path, "project");
	await mkdir(root, { recursive: true });
	return runDurableChain({
		runtime: runtimeDouble(),
		projectRoot: root,
		registry,
		domainContext: "studio",
		steps: [{ name: "scribe" }],
	});
}

const ref = { scope: "chain", runId: "run" };
const run = { ...ref, status: "running" } as never;

test("an interruption that is not the chain deadline still fails the run loudly", async () => {
	await expect(
		runWith({
			type: "interrupted",
			ref,
			createdRun: true,
			passes: 0,
			run,
			steps: [],
			diagnostics: [],
			interruption: {
				reason: "graph_mismatch",
				exitReason: "interrupted",
				details: "not a timeout",
			},
		}),
	).rejects.toThrow("Durable chain run interrupted: graph_mismatch");
});

test("a scheduler that stops short of a terminal state still fails loudly", async () => {
	await expect(
		runWith({
			type: "scheduler",
			ref,
			createdRun: true,
			passes: 1,
			run,
			steps: [],
			diagnostics: [],
			exitReason: "drained",
		}),
	).rejects.toThrow("did not reach a terminal state");
});
