/**
 * Session creation for CLI modes.
 *
 * Mirrors agent-spawner.ts logic but differs in two key ways:
 * - Configurable session persistence (persistent for interactive, ephemeral for print)
 * - Returns session without sending a prompt (caller controls execution mode)
 */

import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { Api, Model } from "@mariozechner/pi-ai";
import {
	type CreateAgentSessionResult,
	createAgentSession,
	DefaultResourceLoader,
	SessionManager,
} from "@mariozechner/pi-coding-agent";
import type { AgentDefinition } from "../lib/agents/types.ts";
import {
	resolveExtensionPaths,
	resolveTools,
} from "../lib/orchestration/agent-spawner.ts";
import { loadPrompts } from "../lib/prompts/index.ts";

export interface CreateSessionOptions {
	/** Agent definition to build the session from */
	definition: AgentDefinition;
	/** Working directory */
	cwd: string;
	/** Model override (takes precedence over definition.model) */
	model?: Model<Api>;
	/** Thinking level override */
	thinkingLevel?: ThinkingLevel;
	/** Whether to persist session to disk (interactive) or keep in-memory (print) */
	persistent: boolean;
}

/**
 * Create a Pi agent session from an AgentDefinition without sending a prompt.
 *
 * The caller is responsible for choosing the execution mode:
 * - InteractiveMode for REPL
 * - runPrintMode for non-interactive
 * - session.prompt() for direct invocation
 */
export async function createSession(
	options: CreateSessionOptions,
): Promise<CreateAgentSessionResult> {
	const { definition: def, cwd, model, thinkingLevel, persistent } = options;

	const tools = resolveTools(def.tools, cwd);

	const promptContent = def.prompts.length
		? await loadPrompts(def.prompts)
		: undefined;

	const extensionPaths = resolveExtensionPaths(def.extensions);

	const loader = new DefaultResourceLoader({
		cwd,
		...(promptContent && { appendSystemPrompt: promptContent }),
		noExtensions: true,
		...(extensionPaths.length > 0 && {
			additionalExtensionPaths: extensionPaths,
		}),
		noSkills: Array.isArray(def.skills) && def.skills.length === 0,
		...(!def.projectContext && {
			agentsFilesOverride: () => ({ agentsFiles: [] }),
		}),
	});
	await loader.reload();

	const sessionManager = persistent
		? SessionManager.continueRecent(cwd)
		: SessionManager.inMemory();

	return createAgentSession({
		cwd,
		model,
		thinkingLevel,
		tools,
		sessionManager,
		resourceLoader: loader,
	});
}
