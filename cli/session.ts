/**
 * Session creation for CLI modes.
 *
 * Mirrors agent-spawner.ts logic but differs in two key ways:
 * - Configurable session persistence (persistent for interactive, ephemeral for print)
 * - Returns AgentSessionRuntime for use with InteractiveMode / runPrintMode
 */

import { join } from "node:path";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import {
	type AgentSessionRuntime,
	type CreateAgentSessionRuntimeFactory,
	createAgentSessionFromServices,
	createAgentSessionRuntime,
	createAgentSessionServices,
	getAgentDir,
	SessionManager,
} from "@mariozechner/pi-coding-agent";
import { buildSessionParams } from "../lib/agents/session-assembly.ts";
import type { AgentDefinition } from "../lib/agents/types.ts";
import type { DomainResolver } from "../lib/domains/resolver.ts";

/**
 * Encode a cwd into Pi's session directory path.
 * Uses Pi's getAgentDir() for the base path (respects PI_CODING_AGENT_DIR)
 * and matches Pi's internal encoding: `--<cwd-with-slashes-replaced>--`.
 */
function piSessionDir(cwd: string): string {
	const safePath = `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
	return join(getAgentDir(), "sessions", safePath);
}

export interface CreateSessionOptions {
	/** Agent definition to build the session from */
	definition: AgentDefinition;
	/** Working directory */
	cwd: string;
	/** Absolute path to the root domains directory (fallback when no resolver) */
	domainsDir: string;
	/** Domain resolver for multi-source path resolution. When provided, takes precedence over domainsDir. */
	resolver?: DomainResolver;
	/** Model ID override string, e.g. "anthropic/claude-sonnet-4-5" */
	model?: string;
	/** Thinking level override */
	thinkingLevel?: ThinkingLevel;
	/** Whether to persist session to disk (interactive) or keep in-memory (print) */
	persistent: boolean;
	/** Project-level skill filter list (from .cosmonauts/config.json) */
	projectSkills?: readonly string[];
	/** Explicit skill directories (domain dirs + config skillPaths). */
	skillPaths?: readonly string[];
}

/**
 * Create a Pi AgentSessionRuntime from an AgentDefinition.
 *
 * The caller chooses the execution mode:
 * - InteractiveMode for REPL
 * - runPrintMode for non-interactive
 */
export async function createSession(
	options: CreateSessionOptions,
): Promise<AgentSessionRuntime> {
	const {
		definition: def,
		cwd,
		domainsDir,
		resolver,
		model: modelOverride,
		thinkingLevel: thinkingLevelOverride,
		persistent,
		projectSkills,
		skillPaths,
	} = options;

	const params = await buildSessionParams({
		def,
		cwd,
		domainsDir,
		resolver,
		projectSkills,
		skillPaths,
		modelOverride,
		thinkingLevelOverride,
	});

	// Resource loader options for our custom prompt/extension/skill setup.
	const resourceLoaderOptions = {
		...(params.promptContent && { appendSystemPrompt: params.promptContent }),
		noExtensions: true,
		noSkills: true,
		...(params.extensionPaths.length > 0 && {
			additionalExtensionPaths: params.extensionPaths,
		}),
		...(params.skillsOverride && { skillsOverride: params.skillsOverride }),
		...(params.additionalSkillPaths && {
			additionalSkillPaths: params.additionalSkillPaths,
		}),
		...(!params.projectContext && {
			agentsFilesOverride: () => ({ agentsFiles: [] }),
		}),
	};

	// Scope persistent sessions by agent ID so each agent resumes its own history.
	// cosmo uses the default (unscoped) directory for backward compatibility.
	const sessionDir =
		def.id !== "cosmo" ? join(piSessionDir(cwd), def.id) : undefined;
	const sessionManager = persistent
		? SessionManager.continueRecent(cwd, sessionDir)
		: SessionManager.inMemory();

	const createRuntime: CreateAgentSessionRuntimeFactory = async ({
		cwd: effectiveCwd,
		sessionManager: sm,
		sessionStartEvent,
	}) => {
		const services = await createAgentSessionServices({
			cwd: effectiveCwd,
			resourceLoaderOptions,
		});
		const result = await createAgentSessionFromServices({
			services,
			sessionManager: sm,
			sessionStartEvent,
			model: params.model,
			thinkingLevel: params.thinkingLevel,
			tools: params.tools,
		});
		return {
			...result,
			services,
			diagnostics: services.diagnostics,
		};
	};

	return createAgentSessionRuntime(createRuntime, {
		cwd,
		agentDir: getAgentDir(),
		sessionManager,
	});
}
