import { describe, expect, test, vi } from "vitest";
import { registerDriverTool } from "../../domains/shared/extensions/orchestration/driver-tool.ts";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import type { CosmonautsRuntime } from "../../lib/runtime.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi } from "./orchestration-helpers.ts";

const temp = useTempDir("orchestration-authority-");

function agent(id: string, subagents: string[] = []): AgentDefinition {
	return {
		id,
		domain: "coding",
		description: id,
		capabilities: [],
		model: "test/model",
		tools: "none",
		extensions: [],
		skills: [],
		projectContext: false,
		session: "ephemeral",
		loop: false,
		subagents,
	};
}

describe("run_driver caller authority", () => {
	// @cosmo-behavior plan:qm-chain-safety#B-001
	test("denies a caller without worker authority before task discovery", async () => {
		const init = vi.spyOn(TaskManager.prototype, "init");
		const pi = createMockPi(temp.path, {
			systemPrompt: "<!-- COSMONAUTS_AGENT_ID:coding/reviewer -->",
		});
		const runtime = {
			agentRegistry: new AgentRegistry([agent("reviewer"), agent("worker")]),
			domainContext: "coding",
		} as CosmonautsRuntime;
		registerDriverTool(pi as never, async () => runtime, temp.path);

		try {
			const result = await pi.callTool("run_driver", {
				planSlug: "authority-test",
				backend: "codex",
			});
			expect(result).toMatchObject({
				content: [
					{ text: "run_driver denied: coding/reviewer cannot start worker" },
				],
			});
			expect(init).not.toHaveBeenCalled();
		} finally {
			init.mockRestore();
		}
	});

	test("denies an unknown caller and an unknown worker before task discovery", async () => {
		const init = vi.spyOn(TaskManager.prototype, "init");
		try {
			for (const [callerRole, definitions, expected] of [
				[
					"coding/missing",
					[agent("worker")],
					"unknown caller coding/missing cannot start worker",
				],
				[
					"coding/reviewer",
					[agent("reviewer")],
					"coding/reviewer cannot start worker: unknown target",
				],
			] as const) {
				const pi = createMockPi(temp.path, {
					systemPrompt: `<!-- COSMONAUTS_AGENT_ID:${callerRole} -->`,
				});
				const runtime = {
					agentRegistry: new AgentRegistry(definitions),
					domainContext: "coding",
				} as CosmonautsRuntime;
				registerDriverTool(pi as never, async () => runtime, temp.path);
				const result = await pi.callTool("run_driver", {
					planSlug: "authority-test",
					backend: "codex",
				});
				expect(result).toMatchObject({
					content: [{ text: `run_driver denied: ${expected}` }],
				});
			}
			expect(init).not.toHaveBeenCalled();
		} finally {
			init.mockRestore();
		}
	});

	test("allows a listed lead and denies a markerless tool invocation", async () => {
		const runtime = {
			agentRegistry: new AgentRegistry([
				agent("lead", ["worker"]),
				agent("worker"),
			]),
			domainContext: "coding",
		} as CosmonautsRuntime;
		for (const systemPrompt of [
			"<!-- COSMONAUTS_AGENT_ID:coding/lead -->",
			"",
		]) {
			const pi = createMockPi(temp.path, { systemPrompt });
			registerDriverTool(pi as never, async () => runtime, temp.path);
			const result = await pi.callTool("run_driver", {
				planSlug: "chain",
				backend: "codex",
			});
			expect(result).toMatchObject({
				details: { error: systemPrompt ? "reserved_scope" : "unauthorized" },
			});
		}
	});
});
