import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	AgentPackage,
	InvocationWarning,
	MaterializedInvocation,
	SystemPromptMode,
} from "./types.ts";

interface CreateClaudeCliInvocationOptions {
	readonly cwd: string;
	readonly claudeArgs?: readonly string[];
	readonly env?: NodeJS.ProcessEnv;
	readonly allowApiBilling?: boolean;
	readonly claudeBinary?: string;
	readonly promptMode?: SystemPromptMode;
}

const CLAUDE_TOOLS_BY_AGENT_TOOL_SET = {
	coding: ["Bash", "Edit", "Read", "Write", "Glob", "Grep"],
	readonly: ["Read", "Glob", "Grep"],
	verification: ["Bash", "Read", "Glob", "Grep"],
	none: [],
} as const;

export async function createClaudeCliInvocation(
	agentPackage: AgentPackage,
	options: CreateClaudeCliInvocationOptions,
): Promise<MaterializedInvocation> {
	const tempDir = await mkdtemp(join(tmpdir(), "cosmonauts-claude-cli-"));
	const systemPromptPath = join(tempDir, "system.md");
	await writeFile(systemPromptPath, agentPackage.systemPrompt, "utf-8");

	const promptMode =
		options.promptMode ?? agentPackage.targetOptions.promptMode ?? "append";
	const promptFlag = promptModeFlag(promptMode);
	const tools =
		agentPackage.targetOptions.allowedTools ??
		CLAUDE_TOOLS_BY_AGENT_TOOL_SET[agentPackage.tools];
	const { env, warnings } = buildChildEnv(
		options.env ?? process.env,
		options.allowApiBilling === true,
	);

	return {
		tempDir,
		spec: {
			command: options.claudeBinary ?? "claude",
			args: [
				promptFlag,
				systemPromptPath,
				...toolArgs(tools),
				...(options.claudeArgs ?? []),
			],
			env,
			cwd: options.cwd,
			stdin: "",
			warnings,
		},
		async cleanup() {
			await rm(tempDir, { recursive: true, force: true });
		},
	};
}

function promptModeFlag(promptMode: SystemPromptMode): string {
	return promptMode === "replace"
		? "--system-prompt-file"
		: "--append-system-prompt-file";
}

function toolArgs(tools: readonly string[]): readonly string[] {
	return tools.length === 0 ? [] : ["--tools", tools.join(",")];
}

function buildChildEnv(
	env: NodeJS.ProcessEnv,
	allowApiBilling: boolean,
): {
	readonly env: NodeJS.ProcessEnv;
	readonly warnings: readonly InvocationWarning[];
} {
	const childEnv = { ...env };
	if (allowApiBilling || childEnv.ANTHROPIC_API_KEY === undefined) {
		return { env: childEnv, warnings: [] };
	}

	delete childEnv.ANTHROPIC_API_KEY;
	return {
		env: childEnv,
		warnings: [
			{
				code: "anthropic_api_key_removed",
				message:
					"Cosmonauts removed ANTHROPIC_API_KEY before launching claude-cli to preserve Claude subscription auth. Pass --allow-api-billing to opt into API billing.",
			},
		],
	};
}
