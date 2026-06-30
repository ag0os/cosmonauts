type ToolCallSummaryFormatter = (args?: unknown) => string;

const TOOL_SUMMARY_FORMATTERS: Record<string, ToolCallSummaryFormatter> = {
	read: (args) => summarizePathToolCall("read", args),
	write: (args) => summarizePathToolCall("write", args),
	edit: (args) => summarizePathToolCall("edit", args),
	bash: summarizeBashToolCall,
	grep: summarizeGrepToolCall,
	spawn_agent: summarizeSpawnAgentToolCall,
};

/**
 * Produce a one-line summary of a tool call for progress display.
 * Extracts the most useful argument (file path, command, pattern) per tool.
 */
export function summarizeToolCall(toolName: string, args?: unknown): string {
	return TOOL_SUMMARY_FORMATTERS[toolName]?.(args) ?? toolName;
}

function summarizePathToolCall(toolName: string, args?: unknown): string {
	const filePath =
		getStringProperty(args, "file_path") ?? getStringProperty(args, "path");
	if (!filePath) {
		return toolName;
	}

	const base = filePath.split("/").pop() ?? filePath;
	return `${toolName} ${base}`;
}

function summarizeBashToolCall(args?: unknown): string {
	const cmd = getStringProperty(args, "command") ?? "";
	return cmd.length > 60 ? `bash ${cmd.slice(0, 57)}...` : `bash ${cmd}`;
}

function summarizeGrepToolCall(args?: unknown): string {
	const pattern = getStringProperty(args, "pattern") ?? "";
	return pattern.length > 50
		? `grep ${pattern.slice(0, 47)}...`
		: `grep ${pattern}`;
}

function summarizeSpawnAgentToolCall(args?: unknown): string {
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
