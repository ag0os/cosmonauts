import { describe, expect, test } from "vitest";
import { compileSpawnToGraph } from "../../lib/orchestration/spawn-compiler.ts";

describe("compileSpawnToGraph", () => {
	// @cosmo-behavior plan:orchestration-surface-consolidation#B-016
	// @cosmo-behavior plan:orchestration-surface-consolidation#B-019
	test("compiles spawn input into a single cosmonauts-subagent graph step without nested-run fields", () => {
		const compiled = compileSpawnToGraph({
			runId: "spawn-run-1",
			role: "coding/worker",
			domainContext: "coding",
			cwd: "/tmp/cosmonauts/project",
			model: "test/model",
			thinkingLevel: "high",
			prompt: "Implement the task.",
			runtimeContext: {
				mode: "sub-agent",
				parentRole: "planner",
				objective: "Build the feature",
				taskId: "TASK-382",
			},
			projectSkills: ["typescript", "testing"],
			skillPaths: ["/tmp/cosmonauts/skills"],
			compaction: { enabled: true, keepRecentTokens: 2048 },
			planSlug: "orchestration-surface-consolidation",
			parentSessionId: "parent-session-1",
			spawnDepth: 1,
		});

		expect(compiled.scope).toBe("spawn");
		expect(compiled.graph).toEqual({
			steps: [
				{
					id: "spawn-agent",
					runId: "spawn-run-1",
					title: "Spawn coding/worker",
					kind: "agent",
					backend: {
						name: "cosmonauts-subagent",
						options: {
							source: "spawn",
							spawn: {
								role: "coding/worker",
								domainContext: "coding",
								cwd: "/tmp/cosmonauts/project",
								model: "test/model",
								thinkingLevel: "high",
								prompt: "Implement the task.",
								runtimeContext: {
									mode: "sub-agent",
									parentRole: "planner",
									objective: "Build the feature",
									taskId: "TASK-382",
								},
								projectSkills: ["typescript", "testing"],
								skillPaths: ["/tmp/cosmonauts/skills"],
								compaction: { enabled: true, keepRecentTokens: 2048 },
								planSlug: "orchestration-surface-consolidation",
								parentSessionId: "parent-session-1",
								spawnDepth: 1,
							},
						},
					},
					dependsOn: [],
					inputArtifacts: [],
				},
			],
			edges: [],
		});
		expect(JSON.stringify(compiled.graph)).not.toContain("nested-run");
		expect(JSON.stringify(compiled.graph)).not.toContain("parentRunId");
		expect(JSON.stringify(compiled.graph)).not.toContain("parentStepId");
	});
});
