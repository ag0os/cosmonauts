/**
 * Session creation for CLI modes.
 *
 * Mirrors agent-spawner.ts logic but differs in two key ways:
 * - Configurable session persistence (persistent for interactive, ephemeral for print)
 * - Returns session without sending a prompt (caller controls execution mode)
 */

import { join } from "node:path";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { Api, Model } from "@mariozechner/pi-ai";
import {
	type CreateAgentSessionResult,
	createAgentSession,
	DefaultResourceLoader,
	type ResourceDiagnostic,
	SessionManager,
	type Skill,
} from "@mariozechner/pi-coding-agent";
import type { AgentDefinition } from "../lib/agents/types.ts";
import {
	resolveExtensionPaths,
	resolveTools,
} from "../lib/orchestration/agent-spawner.ts";
import { loadPrompts } from "../lib/prompts/index.ts";

/**
 * Default Pi session directory for a given cwd.
 * Mirrors Pi's internal path: ~/.pi/agent/sessions/<encoded-cwd>/
 */
function defaultSessionDir(cwd: string): string {
	const encoded = cwd.replace(/[/:]/g, "-");
	const home = process.env.HOME ?? process.env.USERPROFILE ?? "~";
	return join(home, ".pi", "agent", "sessions", encoded);
}

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
		...(Array.isArray(def.skills) && {
			skillsOverride: (base: {
				skills: Skill[];
				diagnostics: ResourceDiagnostic[];
			}) => ({
				skills: base.skills.filter((s) => def.skills?.includes(s.name)),
				diagnostics: base.diagnostics,
			}),
		}),
		...(!def.projectContext && {
			agentsFilesOverride: () => ({ agentsFiles: [] }),
		}),
	});
	await loader.reload();

	// Scope persistent sessions by agent ID so each agent resumes its own history.
	// cosmo uses the default (unscoped) directory for backward compatibility.
	const sessionDir =
		def.id !== "cosmo" ? join(defaultSessionDir(cwd), def.id) : undefined;
	const sessionManager = persistent
		? SessionManager.continueRecent(cwd, sessionDir)
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
