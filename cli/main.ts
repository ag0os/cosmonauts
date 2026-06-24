/**
 * CLI entry point for cosmonauts.
 *
 * Modes:
 *   cosmonauts                                    → interactive REPL
 *   cosmonauts "prompt"                           → interactive with initial prompt
 *   cosmonauts --print "prompt"                   → non-interactive (run, output, exit)
 *   cosmonauts run chain name "prompt"             → named chain or chain DSL
 *   cosmonauts run drive --plan slug               → driver run management
 *   cosmonauts -c                                 → continue most recent session
 *   cosmonauts --dump-prompt [-a agent]           → dump composed system prompt to stdout
 *   cosmonauts --dump-prompt --file path          → dump composed system prompt to file
 *   cosmonauts init                               → agent-driven AGENTS.md bootstrap
 *   cosmonauts task <command>                     → task management subcommands
 *   cosmonauts plan <command>                     → plan management subcommands
 *   cosmonauts export ...                         → export packaged agents as binaries
 *
 * Pi flags (session, provider, tools, mode, etc.) pass through automatically.
 * See cli/pi-flags.ts for the full registry.
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { InteractiveMode, runPrintMode } from "@earendil-works/pi-coding-agent";
import { Command, CommanderError } from "commander";
import { resolveDefaultLead } from "../lib/agents/resolve-default-lead.ts";
import {
	appendAgentIdentityMarker,
	qualifyAgentId,
} from "../lib/agents/runtime-identity.ts";
import type { AgentDefinition } from "../lib/agents/types.ts";
import { createDefaultProjectConfig } from "../lib/config/defaults.ts";
import { assemblePrompts } from "../lib/domains/prompt-assembly.ts";
import { buildInitBootstrapPrompt } from "../lib/init/prompt.ts";
import { setSharedRegistry } from "../lib/interactive/agent-switch.ts";
import {
	discoverBundledPackageDirs,
	isCosmonautsFrameworkRepo,
} from "../lib/packages/dev-bundled.ts";
import type { CosmonautsRuntime } from "../lib/runtime.ts";
import { createCreateProgram } from "./create/subcommand.ts";
import { createEjectProgram } from "./eject/subcommand.ts";
import { createExportProgram } from "./export/subcommand.ts";
import {
	createInstallProgram,
	createPackagesProgram,
	createUninstallProgram,
} from "./packages/subcommand.ts";
import { type PiFlagParseResult, parsePiFlags } from "./pi-flags.ts";
import { createPlanProgram } from "./plans/index.ts";
import { createRunProgram } from "./run/subcommand.ts";
import {
	type CliRuntimeOptions,
	createCliRuntimeContext,
	parseCliRuntimeOptions,
	parseThinkingLevel,
} from "./runtime-bootstrap.ts";
import { createScaffoldProgram } from "./scaffold/subcommand.ts";
import { createSession, GracefulExitError } from "./session.ts";
import { createSessionsProgram } from "./sessions/subcommand.ts";
import { printCliError } from "./shared/errors.ts";
import {
	type CliOutputMode,
	getOutputMode,
	printJson,
	printLines,
} from "./shared/output.ts";
import { createSkillsProgram } from "./skills/subcommand.ts";
import { createTaskProgram } from "./tasks/subcommand.ts";
import type { CliOptions } from "./types.ts";
import { createUpdateProgram } from "./update/subcommand.ts";

export { discoverBundledPackageDirs, isCosmonautsFrameworkRepo };

// ============================================================================
// Argument Parsing
// ============================================================================

/**
 * Parse CLI arguments into CliOptions.
 * Exported for testing — not intended for external use.
 */
export function parseCliArgs(argv: string[]): CliOptions {
	const { isInit, effectiveArgv } = detectInitSubcommand(argv);
	const piResult = parsePiFlags(effectiveArgv);
	for (const w of piResult.warnings) {
		console.warn(`[cosmonauts] ${w}`);
	}

	const program = buildCliParser();
	program.parse(piResult.remaining, { from: "user" });

	return normalizeCliOptions(program, isInit, piResult);
}

function detectInitSubcommand(argv: readonly string[]): {
	isInit: boolean;
	effectiveArgv: string[];
} {
	const isInit = argv.length > 0 && argv[0] === "init";
	return {
		isInit,
		effectiveArgv: isInit ? argv.slice(1) : [...argv],
	};
}

function buildCliParser(): Command {
	const program = new Command();

	program
		.name("cosmonauts")
		.description("AI coding orchestration system")
		.version("0.1.0");

	program
		.option("-p, --print", "Non-interactive mode (run, output, exit)")
		.option(
			"-a, --agent <id>",
			"Agent to use (e.g. planner, worker, coordinator)",
		)
		.option(
			"--completion-label <label>",
			'Task label scope for loop completion checks (e.g. "plan:auth-system")',
		)
		.option("-m, --model <provider/model-id>", "Override the default model")
		.option(
			"-t, --thinking [level]",
			"Set thinking level (default: high when flag present)",
		)
		.option("-d, --domain <id>", "Set domain context for agent resolution")
		.option("--list-domains", "List all discovered domains and exit")
		.option("--list-agents", "List available agent IDs and exit")
		.option(
			"--dump-prompt",
			"Dump the composed system prompt for an agent and exit",
		)
		.option(
			"--file <path>",
			"Write output to a file instead of stdout (used with --dump-prompt)",
		)
		.option(
			"--plugin-dir <path>",
			"Add a directory as a session-only domain source (repeatable)",
			(val: string, prev: string[]) => [...prev, val],
			[] as string[],
		)
		.option(
			"--profile",
			"Write profiling trace and summary files after a chain run",
		)
		.option(
			"--json",
			"Emit machine-readable JSON output (for --list-domains, --list-agents)",
		)
		.option(
			"--plain",
			"Emit minimal plain-text output for agents (for --list-domains, --list-agents)",
		)
		.argument("[prompt...]", "Prompt text");

	program.exitOverride();
	return program;
}

function parseThinkingOption(value: unknown): ThinkingLevel | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (value === true) {
		return "high";
	}

	if (typeof value === "string") {
		return parseThinkingLevel(value);
	}

	throw new Error(`Invalid thinking option value: ${String(value)}`);
}

interface ParsedCliOptionValues {
	print?: boolean;
	agent?: string;
	completionLabel?: string;
	model?: string;
	thinking?: unknown;
	domain?: string;
	listDomains?: boolean;
	listAgents?: boolean;
	dumpPrompt?: boolean;
	file?: string;
	profile?: boolean;
	pluginDir?: string[];
	json?: boolean;
	plain?: boolean;
}

function normalizeCliOptions(
	program: Command,
	isInit: boolean,
	piResult: PiFlagParseResult,
): CliOptions {
	const opts = program.opts<ParsedCliOptionValues>();
	const thinking = parseThinkingOption(opts.thinking);

	const promptArgs: string[] = program.args;
	const prompt = promptArgs.length > 0 ? promptArgs.join(" ") : undefined;

	const pluginDirs: string[] = opts.pluginDir ?? [];

	return {
		prompt,
		print: opts.print ?? false,
		agent: opts.agent,
		completionLabel: opts.completionLabel,
		model: opts.model,
		thinking,
		init: isInit,
		listAgents: opts.listAgents ?? false,
		domain: opts.domain,
		listDomains: opts.listDomains ?? false,
		dumpPrompt: opts.dumpPrompt ?? false,
		dumpPromptFile: opts.file,
		profile: opts.profile ?? undefined,
		pluginDirs: pluginDirs.length > 0 ? pluginDirs : undefined,
		json: opts.json ?? false,
		plain: opts.plain ?? false,
		piFlags: piResult.flags,
	};
}

export function buildInitSessionConfig(cwd: string) {
	return {
		ignoreProjectSkills: true as const,
		initialMessage: buildInitBootstrapPrompt({
			cwd,
			defaultConfig: createDefaultProjectConfig(),
		}),
	};
}

// ============================================================================
// Mode Dispatch
// ============================================================================

type CliRunMode =
	| "no-domain-guard"
	| "list-domains"
	| "list-agents"
	| "dump-prompt"
	| "init"
	| "print"
	| "interactive";

export function selectRunMode(
	options: CliOptions,
	hasNonSharedDomain: boolean,
): CliRunMode {
	const isBypassCommand =
		options.init ||
		options.listDomains ||
		options.listAgents ||
		options.dumpPrompt;
	if (!hasNonSharedDomain && !isBypassCommand) {
		return "no-domain-guard";
	}

	if (options.listDomains) return "list-domains";
	if (options.listAgents) return "list-agents";
	if (options.dumpPrompt) return "dump-prompt";
	if (options.init) return "init";
	if (options.print) return "print";
	return "interactive";
}

async function run(options: CliOptions): Promise<void> {
	const { cwd, runtime } = await createCliRuntimeContext(options);

	const mode = selectRunMode(options, hasInstalledDomain(runtime));
	const handlers: Record<CliRunMode, () => Promise<void>> = {
		"no-domain-guard": async () => handleNoDomainGuard(),
		"list-domains": () => handleListDomains(runtime, options),
		"list-agents": () => handleListAgents(runtime, options),
		"dump-prompt": () => handleDumpPrompt(runtime, options),
		init: () => handleInitMode(runtime, options, cwd),
		print: () => handlePrintMode(runtime, options, cwd),
		interactive: () => handleInteractiveMode(runtime, options, cwd),
	};

	await handlers[mode]();
}

export function hasInstalledDomain(runtime: CosmonautsRuntime): boolean {
	return runtime.domains.some(
		(domain) => !["shared", "main"].includes(domain.manifest.id),
	);
}

function handleNoDomainGuard(): void {
	printCliError(
		"No domains installed. Install the coding domain to get started:",
		{},
	);
	printLines(["  cosmonauts install coding"], "stderr");
	process.exitCode = 1;
}

function resolveCliOutputMode(options: CliOptions): CliOutputMode {
	return getOutputMode({ json: options.json, plain: options.plain });
}

/** Domain entry shape used by `--list-domains --json`. */
export interface DomainListItem {
	id: string;
	description: string;
	portable: boolean;
}

/** Agent entry shape used by `--list-agents --json`. */
export interface AgentListItem {
	id: string;
	domain: string | null;
	description: string;
	model: string;
	tools: AgentDefinition["tools"];
	session: AgentDefinition["session"];
}

export function renderDomainsList(
	domains: readonly DomainListItem[],
	mode: CliOutputMode,
): { kind: "json"; value: unknown } | { kind: "lines"; lines: string[] } {
	if (mode === "json") {
		return { kind: "json", value: domains };
	}

	if (mode === "plain") {
		return {
			kind: "lines",
			lines: domains.map((item) => `${item.id}\t${item.description}`),
		};
	}

	return {
		kind: "lines",
		lines:
			domains.length === 0
				? ["No domains found."]
				: domains.map((item) => `  ${item.id}  ${item.description}`),
	};
}

export function renderAgentsList(
	agents: readonly AgentListItem[],
	mode: CliOutputMode,
): { kind: "json"; value: unknown } | { kind: "lines"; lines: string[] } {
	if (mode === "json") {
		return { kind: "json", value: agents };
	}

	if (mode === "plain") {
		return {
			kind: "lines",
			lines: agents.map((item) => `${item.id}\t${item.description}`),
		};
	}

	return {
		kind: "lines",
		lines: agents.map((item) => `  ${item.id}  ${item.description}`),
	};
}

function emit(
	rendered:
		| { kind: "json"; value: unknown }
		| { kind: "lines"; lines: string[] },
): void {
	if (rendered.kind === "json") {
		printJson(rendered.value);
		return;
	}
	printLines(rendered.lines);
}

async function handleListDomains(
	runtime: CosmonautsRuntime,
	options: CliOptions,
): Promise<void> {
	const items: DomainListItem[] = runtime.domains.map((domain) => ({
		id: domain.manifest.id,
		description: domain.manifest.description,
		portable: domain.portable,
	}));
	emit(renderDomainsList(items, resolveCliOutputMode(options)));
}

async function handleListAgents(
	runtime: CosmonautsRuntime,
	options: CliOptions,
): Promise<void> {
	const agents = runtime.domainContext
		? runtime.agentRegistry.resolveInDomain(runtime.domainContext)
		: runtime.agentRegistry.listAll(runtime.domainContext);
	const items: AgentListItem[] = agents.map((agent) => ({
		id: qualifyAgentId(agent.id, agent.domain ?? runtime.domainContext),
		domain: agent.domain ?? runtime.domainContext ?? null,
		description: agent.description,
		model: agent.model,
		tools: agent.tools,
		session: agent.session,
	}));
	emit(renderAgentsList(items, resolveCliOutputMode(options)));
}

async function handleDumpPrompt(
	runtime: CosmonautsRuntime,
	options: CliOptions,
): Promise<void> {
	const definition = resolveDefaultLead(runtime, options);
	const domain = definition.domain ?? "coding";

	let prompt = await assemblePrompts({
		agentId: definition.id,
		domain,
		capabilities: definition.capabilities,
		domainsDir: runtime.domainsDir,
		resolver: runtime.domainResolver,
	});
	prompt = appendAgentIdentityMarker(
		prompt,
		qualifyAgentId(definition.id, domain),
	);

	if (options.dumpPromptFile) {
		await writeFile(options.dumpPromptFile, prompt, "utf-8");
		printLines([`Wrote ${definition.id} prompt to ${options.dumpPromptFile}`]);
		return;
	}

	process.stdout.write(prompt);
	process.stdout.write("\n");
}

async function handleInitMode(
	runtime: CosmonautsRuntime,
	options: CliOptions,
	cwd: string,
): Promise<void> {
	if (!hasInstalledDomain(runtime)) {
		printLines([
			"No domains installed. Install a domain to use cosmonauts init:",
			"  cosmonauts install coding",
			"",
			"After installing a domain, run `cosmonauts init` again to set up your project.",
		]);
		process.exitCode = 1;
		return;
	}

	const initSessionConfig = buildInitSessionConfig(cwd);
	const defaultLeadDefinition = resolveDefaultLead(runtime, options);
	const initRuntime = await createSession({
		definition: defaultLeadDefinition,
		cwd,
		domainsDir: runtime.domainsDir,
		resolver: runtime.domainResolver,
		model: options.model,
		thinkingLevel: options.thinking,
		persistent: false,
		piFlags: options.piFlags,
		projectSkills: runtime.projectSkills,
		skillPaths: runtime.skillPaths,
		ignoreProjectSkills: initSessionConfig.ignoreProjectSkills,
	});

	const interactive = new InteractiveMode(initRuntime, {
		modelFallbackMessage: initRuntime.modelFallbackMessage,
		initialMessage: initSessionConfig.initialMessage,
	});
	await interactive.init();
	await interactive.run();
}

async function handlePrintMode(
	runtime: CosmonautsRuntime,
	options: CliOptions,
	cwd: string,
): Promise<void> {
	if (!options.prompt) {
		throw new Error("--print requires a prompt argument");
	}

	const definition = resolveCliAgent(runtime, options);
	const printRuntime = await createSession({
		definition,
		cwd,
		domainsDir: runtime.domainsDir,
		resolver: runtime.domainResolver,
		model: options.model,
		thinkingLevel: options.thinking,
		persistent: false,
		piFlags: options.piFlags,
		projectSkills: runtime.projectSkills,
		skillPaths: runtime.skillPaths,
	});

	await runPrintMode(printRuntime, {
		mode: "text",
		initialMessage: options.prompt,
	});
}

async function handleInteractiveMode(
	runtime: CosmonautsRuntime,
	options: CliOptions,
	cwd: string,
): Promise<void> {
	const definition = resolveCliAgent(runtime, options);

	// Expose the main registry to extensions via process-global slot.
	// This ensures the /agent command validates against the same registry
	// the session factory uses, including --domain and --plugin-dir overrides.
	setSharedRegistry(runtime.agentRegistry, runtime.domainContext);

	const agentSwitchExtPath = join(
		runtime.domainsDir,
		"shared",
		"extensions",
		"agent-switch",
	);
	const interactiveRuntime = await createSession({
		definition,
		cwd,
		domainsDir: runtime.domainsDir,
		resolver: runtime.domainResolver,
		model: options.model,
		thinkingLevel: options.thinking,
		persistent: true,
		piFlags: options.piFlags,
		projectSkills: runtime.projectSkills,
		skillPaths: runtime.skillPaths,
		agentRegistry: runtime.agentRegistry,
		domainContext: runtime.domainContext,
		extraExtensionPaths: [agentSwitchExtPath],
	});

	const interactive = new InteractiveMode(interactiveRuntime, {
		modelFallbackMessage: interactiveRuntime.modelFallbackMessage,
		initialMessage: options.prompt,
	});

	await interactive.init();
	await interactive.run();
}

function resolveCliAgent(
	runtime: CosmonautsRuntime,
	options: CliOptions,
): AgentDefinition {
	return resolveDefaultLead(runtime, options);
}

// ============================================================================
// Entry Point
// ============================================================================

const subcommand = process.argv[2];
const runInvocation = parseRunInvocation(process.argv.slice(2));
if (runInvocation) {
	const program = createRunProgram({
		runtimeOptions: runInvocation.runtimeOptions,
	});
	program
		.parseAsync(runInvocation.argv, { from: "user" })
		.catch((err: unknown) => {
			const message = err instanceof Error ? err.message : String(err);
			printCliError(message, {}, { prefix: "cosmonauts run" });
			process.exitCode = 1;
		});
} else if (
	subcommand === "task" ||
	subcommand === "plan" ||
	subcommand === "scaffold" ||
	subcommand === "skills" ||
	subcommand === "create" ||
	subcommand === "install" ||
	subcommand === "uninstall" ||
	subcommand === "packages" ||
	subcommand === "update" ||
	subcommand === "eject" ||
	subcommand === "export" ||
	subcommand === "session"
) {
	const programs: Record<string, () => Command> = {
		task: createTaskProgram,
		plan: createPlanProgram,
		scaffold: createScaffoldProgram,
		skills: createSkillsProgram,
		create: createCreateProgram,
		install: createInstallProgram,
		uninstall: createUninstallProgram,
		packages: createPackagesProgram,
		update: createUpdateProgram,
		eject: createEjectProgram,
		export: createExportProgram,
		session: createSessionsProgram,
	};
	// subcommand is guaranteed to be in the map by the if-check above
	const createProgram = programs[subcommand];
	if (!createProgram) throw new Error(`Unknown subcommand: ${subcommand}`);
	const program = createProgram();
	program
		.parseAsync(process.argv.slice(3), { from: "user" })
		.catch((err: unknown) => {
			const message = err instanceof Error ? err.message : String(err);
			printCliError(message, {}, { prefix: `cosmonauts ${subcommand}` });
			process.exitCode = 1;
		});
} else {
	try {
		const options = parseCliArgs(process.argv.slice(2));

		run(options).catch((err: unknown) => {
			if (err instanceof GracefulExitError) {
				// Benign abort (cancel resume, decline fork) — exit cleanly
				return;
			}
			const message = err instanceof Error ? err.message : String(err);
			printCliError(message, {}, { prefix: "cosmonauts" });
			process.exitCode = 1;
		});
	} catch (err: unknown) {
		// Commander throws CommanderError for --help and --version (exitOverride mode)
		if (err instanceof CommanderError) {
			process.exitCode = err.exitCode;
		} else {
			const message = err instanceof Error ? err.message : String(err);
			printCliError(message, {}, { prefix: "cosmonauts" });
			process.exitCode = 1;
		}
	}
} // end else (non-subcommand path)

function parseRunInvocation(
	argv: readonly string[],
): { runtimeOptions: CliRuntimeOptions; argv: string[] } | undefined {
	const parsed = parseCliRuntimeOptions(argv);
	const runIndex = parsed.remaining.indexOf("run");
	if (runIndex === -1 || runIndex > 0) {
		return undefined;
	}
	for (const warning of parsed.warnings) {
		console.warn(`[cosmonauts] ${warning}`);
	}
	return {
		runtimeOptions: parsed.options,
		argv: parsed.remaining.slice(runIndex + 1),
	};
}
