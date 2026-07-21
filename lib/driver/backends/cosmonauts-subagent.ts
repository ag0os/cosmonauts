import { readFile } from "node:fs/promises";
import { extractAssistantText } from "../../orchestration/assistant-text.ts";
import type { SpawnAgentResolution } from "../../orchestration/spawn-resolution.ts";
import { summarizeToolCall } from "../../orchestration/tool-call-summary.ts";
import type {
	AgentSpawner,
	SpawnConfig,
	SpawnEvent,
} from "../../orchestration/types.ts";
import type { DriverEvent, SpawnActivity } from "../types.ts";
import type { Backend } from "./types.ts";

interface CosmonautsSubagentBackendDeps {
	spawner: AgentSpawner;
	defaultRole?: string;
	cwd: string;
	domainContext?: string;
	projectSkills?: readonly string[];
	skillPaths?: readonly string[];
	workerResolution?: SpawnAgentResolution;
}

interface DriverActivityFields {
	spawnEvent: SpawnEvent;
	runId: string;
	parentSessionId: string;
	taskId: string;
}

export function createCosmonautsSubagentBackend(
	deps: CosmonautsSubagentBackendDeps,
): Backend {
	return {
		name: "cosmonauts-subagent",
		capabilities: { canCommit: true, isolatedFromHostSource: false },
		async run(invocation) {
			const role =
				deps.workerResolution?.reference?.requested.qualifiedId ??
				deps.defaultRole ??
				"worker";
			const prompt = await readFile(invocation.promptPath, "utf-8");
			const start = Date.now();
			const result = await deps.spawner.spawn({
				role,
				agentReference: deps.workerResolution?.reference,
				prompt,
				cwd: deps.cwd,
				signal: invocation.signal,
				planSlug: invocation.planSlug,
				parentSessionId: invocation.parentSessionId,
				runtimeContext: {
					mode: "sub-agent",
					taskId: invocation.taskId,
					parentRole: "driver",
				},
				domainContext: deps.domainContext,
				projectSkills: deps.projectSkills,
				skillPaths: deps.skillPaths as SpawnConfig["skillPaths"],
				onEvent: (spawnEvent) => {
					const event = mapSpawnEventToDriverActivity({
						spawnEvent,
						runId: invocation.runId,
						parentSessionId: invocation.parentSessionId,
						taskId: invocation.taskId,
					});
					if (event) {
						void invocation.eventSink(event);
					}
				},
			});

			return {
				exitCode: result.success ? 0 : 1,
				stdout: extractAssistantText(result.messages, role),
				durationMs: Date.now() - start,
			};
		},
	};
}

function mapSpawnEventToDriverActivity({
	spawnEvent,
	runId,
	parentSessionId,
	taskId,
}: DriverActivityFields): DriverEvent | undefined {
	const activity = mapSpawnActivity(spawnEvent);
	if (!activity) {
		return undefined;
	}

	return {
		type: "driver_activity",
		runId,
		parentSessionId,
		taskId,
		timestamp: new Date().toISOString(),
		activity,
	};
}

function mapSpawnActivity(event: SpawnEvent): SpawnActivity | undefined {
	switch (event.type) {
		case "agent_resolved":
			return {
				kind: "agent_resolved",
				requestedRole: event.requestedRole,
				resolvedAgentId: event.resolvedAgentId,
			};
		case "tool_execution_start":
			return {
				kind: "tool_start",
				toolName: event.toolName,
				summary: summarizeToolCall(event.toolName, event.args),
			};
		case "tool_execution_end":
			return {
				kind: "tool_end",
				toolName: event.toolName,
				isError: event.isError,
			};
		case "turn_start":
			return { kind: "turn_start" };
		case "turn_end":
			return { kind: "turn_end" };
		case "compaction_start":
			return { kind: "compaction" };
		case "compaction_end":
			return undefined;
	}
}
