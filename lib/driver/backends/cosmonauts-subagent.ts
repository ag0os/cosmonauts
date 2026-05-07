import { readFile } from "node:fs/promises";
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
			const role = deps.defaultRole ?? "worker";
			const prompt = await readFile(invocation.promptPath, "utf-8");
			const start = Date.now();
			const result = await deps.spawner.spawn({
				role,
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
		case "auto_compaction_start":
			return { kind: "compaction" };
		case "auto_compaction_end":
			return undefined;
	}
}

function summarizeToolCall(toolName: string, args: unknown): string {
	switch (toolName) {
		case "read":
		case "write":
		case "edit":
			return summarizePathToolCall(toolName, args);
		case "bash":
			return summarizeBashToolCall(args);
		case "grep":
			return summarizePatternToolCall(args);
		case "spawn_agent":
			return summarizeSpawnAgentToolCall(args);
		default:
			return toolName;
	}
}

function summarizePathToolCall(toolName: string, args: unknown): string {
	const filePath =
		getStringProperty(args, "file_path") ?? getStringProperty(args, "path");
	if (!filePath) {
		return toolName;
	}

	const base = filePath.split("/").pop() ?? filePath;
	return `${toolName} ${base}`;
}

function summarizeBashToolCall(args: unknown): string {
	const command = getStringProperty(args, "command") ?? "";
	return command.length > 60
		? `bash ${command.slice(0, 57)}...`
		: `bash ${command}`;
}

function summarizePatternToolCall(args: unknown): string {
	const pattern = getStringProperty(args, "pattern") ?? "";
	return pattern.length > 50
		? `grep ${pattern.slice(0, 47)}...`
		: `grep ${pattern}`;
}

function summarizeSpawnAgentToolCall(args: unknown): string {
	const role = getStringProperty(args, "role") ?? "";
	return role ? `spawn ${role}` : "spawn_agent";
}

function getStringProperty(
	value: unknown,
	property: string,
): string | undefined {
	if (typeof value !== "object" || value === null) {
		return undefined;
	}

	const candidate = (value as Record<string, unknown>)[property];
	return typeof candidate === "string" ? candidate : undefined;
}

function extractAssistantText(messages: unknown[], role: string): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i] as { role?: string; content?: unknown };
		if (message.role !== "assistant" || !Array.isArray(message.content)) {
			continue;
		}

		const textBlocks: string[] = [];
		for (const block of message.content) {
			const candidate = block as { type?: string; text?: string };
			if (
				candidate.type === "text" &&
				typeof candidate.text === "string" &&
				candidate.text.trim()
			) {
				textBlocks.push(candidate.text.trim());
			}
		}
		if (textBlocks.length > 0) {
			return textBlocks.join("\n\n");
		}
	}

	return `${role} completed`;
}
