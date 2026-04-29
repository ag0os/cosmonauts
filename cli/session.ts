/**
 * Session creation for CLI modes.
 *
 * Mirrors agent-spawner.ts logic but differs in two key ways:
 * - Configurable session persistence (persistent for interactive, ephemeral for print)
 * - Returns AgentSessionRuntime for use with InteractiveMode / runPrintMode
 */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";

/**
 * Absolute path to the cosmonauts-shipped themes directory (advertised via
 * `pi.themes` in package.json). Only populated when the directory actually
 * exists — packaged installs that omit the themes/ dir skip this silently
 * instead of triggering a Pi theme-path diagnostic.
 */
const COSMONAUTS_THEMES_DIR: string | undefined = (() => {
	const dir = resolve(fileURLToPath(import.meta.url), "..", "..", "themes");
	return existsSync(dir) ? dir : undefined;
})();

/**
 * Thrown for benign user-initiated aborts (cancel resume, decline fork).
 * The top-level error handler checks for this to exit with status 0
 * instead of printing an error and setting status 1.
 */
export class GracefulExitError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "GracefulExitError";
	}
}

import {
	type AgentSessionRuntime,
	AuthStorage,
	type CreateAgentSessionRuntimeFactory,
	createAgentSessionFromServices,
	createAgentSessionRuntime,
	createAgentSessionServices,
	getAgentDir,
	SessionManager,
} from "@mariozechner/pi-coding-agent";
import type { AgentRegistry } from "../lib/agents/resolver.ts";
import {
	buildSessionParams,
	type SessionParams,
} from "../lib/agents/session-assembly.ts";
import type { AgentDefinition } from "../lib/agents/types.ts";
import type { DomainResolver } from "../lib/domains/resolver.ts";
import {
	clearPendingSwitch,
	consumePendingSwitch,
} from "../lib/interactive/agent-switch.ts";
import { buildToolAllowlist } from "../lib/orchestration/definition-resolution.ts";
import type { PiFlags } from "./pi-flags.ts";

/**
 * Encode a cwd into Pi's session directory path.
 * Uses Pi's getAgentDir() for the base path (respects PI_CODING_AGENT_DIR)
 * and matches Pi's internal encoding: `--<cwd-with-slashes-replaced>--`.
 */
function piSessionDir(cwd: string): string {
	const safePath = `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
	return join(getAgentDir(), "sessions", safePath);
}

/** Convert SessionParams to Pi's resource loader options object. */
function toResourceLoaderOptions(
	params: SessionParams,
	piFlags?: PiFlags,
	invocationCwd?: string,
) {
	const noThemes = piFlags?.noThemes === true;
	// Resolve --theme paths against the original invocation cwd, not Pi's
	// effective cwd (which may change on session switch/fork/resume).
	const baseCwd = invocationCwd ?? process.cwd();
	const explicitThemePaths = (piFlags?.themes ?? []).map((p) =>
		resolve(baseCwd, p),
	);
	// --no-themes disables auto-discovery but still honors explicit --theme files
	// (matches Pi's semantics).
	const themePaths =
		noThemes || COSMONAUTS_THEMES_DIR === undefined
			? explicitThemePaths
			: [COSMONAUTS_THEMES_DIR, ...explicitThemePaths];

	return {
		...(params.promptContent && { appendSystemPrompt: [params.promptContent] }),
		noExtensions: true,
		noSkills: true,
		...(params.extensionPaths.length > 0 && {
			additionalExtensionPaths: params.extensionPaths,
		}),
		...(params.skillsOverride && { skillsOverride: params.skillsOverride }),
		...(params.additionalSkillPaths && {
			additionalSkillPaths: params.additionalSkillPaths,
		}),
		...(noThemes && { noThemes: true }),
		...(themePaths.length > 0 && { additionalThemePaths: themePaths }),
		...(!params.projectContext && {
			agentsFilesOverride: () => ({ agentsFiles: [] }),
		}),
	};
}

interface CreateSessionOptions {
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
	/**
	 * Whether to persist session to disk (interactive) or keep in-memory (print).
	 * When piFlags are provided, session management is derived from them instead.
	 */
	persistent: boolean;
	/** Pi CLI flags for session management (continue, resume, session, fork, etc.). */
	piFlags?: PiFlags;
	/** Project-level skill filter list (from .cosmonauts/config.json) */
	projectSkills?: readonly string[];
	/** Explicit skill directories (domain dirs + config skillPaths). */
	skillPaths?: readonly string[];
	/** Ignore project-level skill filtering and expose the full discovered catalogue. */
	ignoreProjectSkills?: boolean;
	/** Registry for resolving pending agent switch IDs. */
	agentRegistry?: AgentRegistry;
	/** Domain context from --domain flag or runtime config, for agent ID resolution. */
	domainContext?: string;
	/** Absolute extension paths always injected (e.g. the agent-switch extension). */
	extraExtensionPaths?: string[];
}

// ============================================================================
// Session Path Resolution (mirrors Pi's resolveSessionPath)
// ============================================================================

interface ResolvedSession {
	type: "path" | "local" | "global" | "not_found";
	path?: string;
	cwd?: string;
	arg: string;
}

/**
 * Resolve a session argument to an actual file path.
 * Accepts file paths, partial UUIDs (matched against local then global sessions).
 */
async function resolveSessionPath(
	sessionArg: string,
	cwd: string,
	sessionDir?: string,
): Promise<ResolvedSession> {
	// If it looks like a file path, use as-is
	if (
		sessionArg.includes("/") ||
		sessionArg.includes("\\") ||
		sessionArg.endsWith(".jsonl")
	) {
		return { type: "path", path: sessionArg, arg: sessionArg };
	}

	// Try to match as session ID in current project first
	const localSessions = await SessionManager.list(cwd, sessionDir);
	const localMatch = localSessions.find((s) => s.id.startsWith(sessionArg));
	if (localMatch) {
		return { type: "local", path: localMatch.path, arg: sessionArg };
	}

	// Try global search across all projects
	const allSessions = await SessionManager.listAll();
	const globalMatch = allSessions.find((s) => s.id.startsWith(sessionArg));
	if (globalMatch) {
		return {
			type: "global",
			path: globalMatch.path,
			cwd: globalMatch.cwd,
			arg: sessionArg,
		};
	}

	return { type: "not_found", arg: sessionArg };
}

// ============================================================================
// Interactive Prompts
// ============================================================================

/** Prompt user for yes/no confirmation via stdin. */
async function promptConfirm(message: string): Promise<boolean> {
	const { createInterface } = await import("node:readline");
	return new Promise((resolve) => {
		const rl = createInterface({
			input: process.stdin,
			output: process.stdout,
		});
		rl.question(`${message} [y/N] `, (answer) => {
			rl.close();
			resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
		});
	});
}

// ============================================================================
// Session Flag Validation
// ============================================================================

/**
 * Validate that session flags don't conflict.
 * Mirrors Pi's validateForkFlags — --fork cannot be combined with
 * --session, --continue, --resume, or --no-session.
 */
function validateSessionFlags(piFlags: PiFlags): void {
	if (!piFlags.fork) return;

	const conflicts: string[] = [];
	if (piFlags.session) conflicts.push("--session");
	if (piFlags.continue) conflicts.push("--continue");
	if (piFlags.resume) conflicts.push("--resume");
	if (piFlags.noSession) conflicts.push("--no-session");

	if (conflicts.length > 0) {
		throw new Error(`--fork cannot be combined with ${conflicts.join(", ")}`);
	}
}

// ============================================================================
// Session Manager Resolution
// ============================================================================

/**
 * Resolve which SessionManager to use based on Pi flags and fallback behavior.
 * Follows Pi's priority cascade: noSession → fork → session → resume → continue → default.
 */
async function resolveSessionManager(opts: {
	piFlags?: PiFlags;
	persistent: boolean;
	cwd: string;
	sessionDir?: string;
}): Promise<SessionManager> {
	const { piFlags, persistent, cwd, sessionDir } = opts;

	if (piFlags) {
		validateSessionFlags(piFlags);
	}

	if (piFlags?.noSession) {
		const manager = resolveNoSessionStrategy();
		if (manager) {
			return manager;
		}
	}

	const forkManager = await resolveForkStrategy(piFlags, cwd, sessionDir);
	if (forkManager) {
		return forkManager;
	}

	const sessionManager = await resolveSessionStrategy(piFlags, cwd, sessionDir);
	if (sessionManager) {
		return sessionManager;
	}

	const resumeManager = await resolveResumeStrategy(piFlags, cwd, sessionDir);
	if (resumeManager) {
		return resumeManager;
	}

	return resolveContinueOrDefaultStrategy(piFlags, persistent, cwd, sessionDir);
}

function resolveNoSessionStrategy(): SessionManager | undefined {
	return SessionManager.inMemory();
}

async function resolveForkStrategy(
	piFlags: PiFlags | undefined,
	cwd: string,
	sessionDir?: string,
): Promise<SessionManager | undefined> {
	if (piFlags?.fork) {
		const resolved = await resolveSessionPath(piFlags.fork, cwd, sessionDir);
		if (resolved.type === "not_found") {
			throw new Error(`No session found matching '${resolved.arg}'`);
		}
		return SessionManager.forkFrom(
			requireResolvedPath(resolved),
			cwd,
			sessionDir,
		);
	}
	return undefined;
}

async function resolveSessionStrategy(
	piFlags: PiFlags | undefined,
	cwd: string,
	sessionDir?: string,
): Promise<SessionManager | undefined> {
	if (piFlags?.session) {
		const resolved = await resolveSessionPath(piFlags.session, cwd, sessionDir);
		switch (resolved.type) {
			case "path":
			case "local":
				return SessionManager.open(requireResolvedPath(resolved), sessionDir);
			case "global": {
				// Session belongs to another project — offer to fork (mirrors Pi)
				console.warn(`Session found in different project: ${resolved.cwd}`);
				const shouldFork = await promptConfirm(
					"Fork this session into current directory?",
				);
				if (!shouldFork) {
					throw new GracefulExitError("Aborted.");
				}
				return SessionManager.forkFrom(
					requireResolvedPath(resolved),
					cwd,
					sessionDir,
				);
			}
			case "not_found":
				throw new Error(`No session found matching '${resolved.arg}'`);
		}
	}
	return undefined;
}

async function resolveResumeStrategy(
	piFlags: PiFlags | undefined,
	cwd: string,
	sessionDir?: string,
): Promise<SessionManager | undefined> {
	if (piFlags?.resume) {
		// List local + global sessions, let user pick (mirrors Pi's selectSession)
		const localSessions = await SessionManager.list(cwd, sessionDir);
		const allSessions = await SessionManager.listAll();
		const sessions = mergeResumeSessions(localSessions, allSessions);

		if (sessions.length === 0) {
			console.log("No sessions found.");
			throw new GracefulExitError("No sessions available to resume.");
		}

		printResumeSessionChoices(sessions, localSessions.length);
		const selected = await promptResumeSelection(sessions.length);

		if (selected === null) {
			// Cancel — abort, don't create a new session
			console.log("No session selected.");
			throw new GracefulExitError("No session selected.");
		}

		return openSelectedResumeSession(
			sessions,
			selected,
			localSessions.length,
			cwd,
			sessionDir,
		);
	}
	return undefined;
}

function resolveContinueOrDefaultStrategy(
	piFlags: PiFlags | undefined,
	persistent: boolean,
	cwd: string,
	sessionDir?: string,
): SessionManager {
	if (piFlags?.continue) {
		return SessionManager.continueRecent(cwd, sessionDir);
	}
	return persistent
		? SessionManager.continueRecent(cwd, sessionDir)
		: SessionManager.inMemory();
}

type ListedSession = Awaited<ReturnType<typeof SessionManager.list>>[number];

function mergeResumeSessions(
	localSessions: readonly ListedSession[],
	allSessions: readonly ListedSession[],
): ListedSession[] {
	const localPaths = new Set(localSessions.map((session) => session.path));
	const globalOnly = allSessions.filter(
		(session) => !localPaths.has(session.path),
	);
	return [...localSessions, ...globalOnly];
}

function printResumeSessionChoices(
	sessions: readonly ListedSession[],
	localSessionCount: number,
): void {
	console.log("Available sessions:");
	for (let i = 0; i < sessions.length; i++) {
		const session = sessions[i];
		if (session === undefined) {
			continue;
		}
		const preview = session.firstMessage?.slice(0, 60) ?? "(no messages)";
		const marker = i >= localSessionCount ? " (other project)" : "";
		console.log(`  ${i + 1}. [${session.id.slice(0, 8)}] ${preview}${marker}`);
	}
}

async function promptResumeSelection(
	sessionCount: number,
): Promise<number | null> {
	const { createInterface } = await import("node:readline");
	return new Promise((resolve) => {
		const rl = createInterface({
			input: process.stdin,
			output: process.stdout,
		});
		rl.question("Select session number (or Enter to cancel): ", (answer) => {
			rl.close();
			const selectedIndex = parseSessionSelection(answer, sessionCount);
			resolve(selectedIndex);
		});
	});
}

function parseSessionSelection(
	answer: string,
	sessionCount: number,
): number | null {
	const num = Number.parseInt(answer, 10);
	if (Number.isNaN(num) || num < 1 || num > sessionCount) {
		return null;
	}
	return num - 1;
}

function openSelectedResumeSession(
	sessions: readonly ListedSession[],
	selected: number,
	localSessionCount: number,
	cwd: string,
	sessionDir?: string,
): SessionManager {
	const chosen = sessions[selected];
	if (chosen === undefined) {
		throw new GracefulExitError("No session selected.");
	}
	if (selected >= localSessionCount) {
		return SessionManager.forkFrom(chosen.path, cwd, sessionDir);
	}
	return SessionManager.open(chosen.path, sessionDir);
}

function requireResolvedPath(resolved: ResolvedSession): string {
	if (resolved.path === undefined) {
		throw new Error(`No session found matching '${resolved.arg}'`);
	}
	return resolved.path;
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
		piFlags,
		projectSkills,
		skillPaths,
		ignoreProjectSkills,
		agentRegistry,
		domainContext,
		extraExtensionPaths,
	} = options;

	const params = await buildSessionParams({
		def,
		cwd,
		domainsDir,
		resolver,
		projectSkills,
		skillPaths,
		ignoreProjectSkills,
		modelOverride,
		thinkingLevelOverride,
		extraExtensionPaths,
	});

	const resourceLoaderOptions = toResourceLoaderOptions(params, piFlags, cwd);

	// Scope persistent sessions by agent ID so each agent resumes its own history.
	// cosmo uses the default (unscoped) directory for backward compatibility.
	const baseSessionDir = piFlags?.sessionDir ?? undefined;
	const sessionDir = baseSessionDir
		? baseSessionDir
		: def.id !== "cosmo"
			? join(piSessionDir(cwd), def.id)
			: undefined;

	// Session manager cascade (matches Pi's priority order):
	// noSession → fork → session → resume → continue → persistent default → inMemory
	const sessionManager = await resolveSessionManager({
		piFlags,
		persistent,
		cwd,
		sessionDir,
	});

	// Share a single AuthStorage across session switches (handoff, /agent, /new)
	// to avoid file lock contention with in-flight OAuth token refreshes.
	const sharedAuthStorage = AuthStorage.create();

	const createRuntime: CreateAgentSessionRuntimeFactory = async ({
		cwd: effectiveCwd,
		sessionManager: sm,
		sessionStartEvent,
	}) => {
		const pendingAgentId = consumePendingSwitch();

		if (pendingAgentId !== undefined) {
			if (agentRegistry !== undefined) {
				try {
					const newDef = agentRegistry.resolve(pendingAgentId, domainContext);
					const newParams = await buildSessionParams({
						def: newDef,
						cwd,
						domainsDir,
						resolver,
						projectSkills,
						skillPaths,
						ignoreProjectSkills,
						modelOverride,
						thinkingLevelOverride,
						extraExtensionPaths,
					});
					const newResourceLoaderOptions = toResourceLoaderOptions(
						newParams,
						piFlags,
						cwd,
					);
					// Use the session manager Pi already prepared (sm) — it carries
					// the new session header and parentSession lineage from
					// ctx.newSession({ parentSession, setup }). Creating our own
					// SessionManager would reopen old history and drop the link.
					const services = await createAgentSessionServices({
						cwd: effectiveCwd,
						authStorage: sharedAuthStorage,
						resourceLoaderOptions: newResourceLoaderOptions,
					});
					const result = await createAgentSessionFromServices({
						services,
						sessionManager: sm,
						sessionStartEvent,
						model: newParams.model,
						thinkingLevel: newParams.thinkingLevel,
						tools: buildToolAllowlist(newParams.tools, services.resourceLoader),
					});
					return {
						...result,
						services,
						diagnostics: services.diagnostics,
					};
				} catch (error) {
					clearPendingSwitch();
					throw error;
				}
			} else {
				console.warn(
					`[cosmonauts] Agent switch requested for "${pendingAgentId}" but no agent registry is available. Continuing with current agent.`,
				);
			}
		}

		const services = await createAgentSessionServices({
			cwd: effectiveCwd,
			authStorage: sharedAuthStorage,
			resourceLoaderOptions,
		});
		const result = await createAgentSessionFromServices({
			services,
			sessionManager: sm,
			sessionStartEvent,
			model: params.model,
			thinkingLevel: params.thinkingLevel,
			tools: buildToolAllowlist(params.tools, services.resourceLoader),
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
