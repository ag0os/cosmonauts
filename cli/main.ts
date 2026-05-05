/**
 * CLI entry point for cosmonauts.
 *
 * Modes:
 *   cosmonauts                                    → interactive REPL
 *   cosmonauts "prompt"                           → interactive with initial prompt
 *   cosmonauts --print "prompt"                   → non-interactive (run, output, exit)
 *   cosmonauts -w name "prompt"                   → named workflow (non-interactive)
 *   cosmonauts -w "a -> b" "prompt"               → raw chain DSL (non-interactive)
 *   cosmonauts -w "reviewer[2]" "prompt"           → fan-out DSL (non-interactive)
 *   cosmonauts -w "[planner, reviewer]" "prompt"   → bracket-group DSL (non-interactive)
 *   cosmonauts -c                                 → continue most recent session
 *   cosmonauts --dump-prompt [-a agent]           → dump composed system prompt to stdout
 *   cosmonauts --dump-prompt --file path          → dump composed system prompt to file
 *   cosmonauts init                               → agent-driven AGENTS.md bootstrap
 *   cosmonauts task <command>                     → task management subcommands
 *   cosmonauts plan <command>                     → plan management subcommands
 *   cosmonauts drive <command>                    → driver run management subcommands
 *
 * Pi flags (session, provider, tools, mode, etc.) pass through automatically.
 * See cli/pi-flags.ts for the full registry.
 */

import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import { InteractiveMode, runPrintMode } from "@mariozechner/pi-coding-agent";
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
import { parseChain } from "../lib/orchestration/chain-parser.ts";
import { ChainProfiler } from "../lib/orchestration/chain-profiler.ts";
import {
	derivePlanSlug,
	injectUserPrompt,
	runChain,
} from "../lib/orchestration/chain-runner.ts";
import { isChainDslExpression } from "../lib/orchestration/chain-steps.ts";
import {
	discoverBundledPackageDirs,
	discoverFrameworkBundledPackageDirs,
	isCosmonautsFrameworkRepo,
} from "../lib/packages/dev-bundled.ts";
import { CosmonautsRuntime } from "../lib/runtime.ts";
import { sessionsDirForPlan } from "../lib/sessions/session-store.ts";
import { listWorkflows, resolveWorkflow } from "../lib/workflows/loader.ts";
import type { WorkflowDefinition } from "../lib/workflows/types.ts";
import { createChainEventLogger } from "./chain-event-logger.ts";
import { createCreateProgram } from "./create/subcommand.ts";
import { createDriveProgram } from "./drive/subcommand.ts";
import { createEjectProgram } from "./eject/subcommand.ts";
import {
	createInstallProgram,
	createPackagesProgram,
	createUninstallProgram,
} from "./packages/subcommand.ts";
import { type PiFlagParseResult, parsePiFlags } from "./pi-flags.ts";
import { createPlanProgram } from "./plans/index.ts";
import { createScaffoldProgram } from "./scaffold/subcommand.ts";
import { createSession, GracefulExitError } from "./session.ts";
import { printCliError } from "./shared/errors.ts";
import { printLines } from "./shared/output.ts";
import { createSkillsProgram } from "./skills/subcommand.ts";
import { createTaskProgram } from "./tasks/subcommand.ts";
import type { CliOptions } from "./types.ts";
import { createUpdateProgram } from "./update/subcommand.ts";

export { discoverBundledPackageDirs, isCosmonautsFrameworkRepo };

// ============================================================================
// Thinking Level Validation
// ============================================================================

const VALID_THINKING_LEVELS: ReadonlySet<string> = new Set([
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
]);

function parseThinkingLevel(value: string): ThinkingLevel {
	if (!VALID_THINKING_LEVELS.has(value)) {
		throw new Error(
			`Invalid thinking level "${value}". Valid: ${[...VALID_THINKING_LEVELS].join(", ")}`,
		);
	}
	return value as ThinkingLevel;
}

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
			"-w, --workflow <expression>",
			"Run a named workflow or chain DSL. Named: 'plan-and-build'. Arrow: 'planner -> coordinator'. Fan-out: 'reviewer[2]'. Bracket: '[planner, reviewer]'.",
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
		.option("--list-workflows", "List available workflows and exit")
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
	workflow?: string;
	completionLabel?: string;
	model?: string;
	thinking?: unknown;
	domain?: string;
	listDomains?: boolean;
	listWorkflows?: boolean;
	listAgents?: boolean;
	dumpPrompt?: boolean;
	file?: string;
	profile?: boolean;
	pluginDir?: string[];
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
		workflow: opts.workflow,
		completionLabel: opts.completionLabel,
		model: opts.model,
		thinking,
		init: isInit,
		listWorkflows: opts.listWorkflows ?? false,
		listAgents: opts.listAgents ?? false,
		domain: opts.domain,
		listDomains: opts.listDomains ?? false,
		dumpPrompt: opts.dumpPrompt ?? false,
		dumpPromptFile: opts.file,
		profile: opts.profile ?? undefined,
		pluginDirs: pluginDirs.length > 0 ? pluginDirs : undefined,
		piFlags: piResult.flags,
	};
}

// ============================================================================
// Workflow routing
// ============================================================================

export function shouldParseWorkflowAsRawChainExpression(
	expression: string,
): boolean {
	return isChainDslExpression(expression);
}

export async function resolveWorkflowExpression(
	expression: string,
	projectRoot: string,
	domainWorkflows?: readonly WorkflowDefinition[],
): Promise<string> {
	if (shouldParseWorkflowAsRawChainExpression(expression)) {
		return expression;
	}

	try {
		const workflow = await resolveWorkflow(
			expression,
			projectRoot,
			domainWorkflows,
		);
		return workflow.chain;
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.startsWith(`Unknown workflow "${expression}"`)
		) {
			return expression;
		}
		throw error;
	}
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
	| "list-workflows"
	| "list-agents"
	| "dump-prompt"
	| "init"
	| "workflow"
	| "print"
	| "interactive";

export function selectRunMode(
	options: CliOptions,
	hasNonSharedDomain: boolean,
): CliRunMode {
	const isBypassCommand =
		options.init ||
		options.listDomains ||
		options.listWorkflows ||
		options.listAgents ||
		options.dumpPrompt;
	if (!hasNonSharedDomain && !isBypassCommand) {
		return "no-domain-guard";
	}

	if (options.listDomains) return "list-domains";
	if (options.listWorkflows) return "list-workflows";
	if (options.listAgents) return "list-agents";
	if (options.dumpPrompt) return "dump-prompt";
	if (options.init) return "init";
	if (options.workflow) return "workflow";
	if (options.print) return "print";
	return "interactive";
}

async function run(options: CliOptions): Promise<void> {
	const cwd = process.cwd();
	const frameworkRoot = resolve(fileURLToPath(import.meta.url), "..", "..");
	const domainsDir = join(frameworkRoot, "domains");

	// Dev-mode auto-detection: auto-include bundled/ packages when running
	// from inside the framework repo (name='cosmonauts', bundled/ exists).
	const bundledDirs = await discoverFrameworkBundledPackageDirs(frameworkRoot);

	// Bootstrap: load config, discover domains, build registries
	const runtime = await CosmonautsRuntime.create({
		builtinDomainsDir: domainsDir,
		projectRoot: cwd,
		domainOverride: options.domain,
		bundledDirs,
		pluginDirs: options.pluginDirs,
	});

	const mode = selectRunMode(options, hasInstalledDomain(runtime));
	const handlers: Record<CliRunMode, () => Promise<void>> = {
		"no-domain-guard": async () => handleNoDomainGuard(),
		"list-domains": () => handleListDomains(runtime),
		"list-workflows": () => handleListWorkflows(cwd, runtime.workflows),
		"list-agents": () => handleListAgents(runtime, options),
		"dump-prompt": () => handleDumpPrompt(runtime, options),
		init: () => handleInitMode(runtime, options, cwd),
		workflow: () => handleWorkflowMode(runtime, options, cwd),
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

async function handleListDomains(runtime: CosmonautsRuntime): Promise<void> {
	const lines =
		runtime.domains.length === 0
			? ["No domains found."]
			: runtime.domains.map(
					(domain) => `  ${domain.manifest.id}  ${domain.manifest.description}`,
				);
	printLines(lines);
}

async function handleListWorkflows(
	cwd: string,
	domainWorkflows: readonly WorkflowDefinition[],
): Promise<void> {
	const workflows = await listWorkflows(cwd, domainWorkflows);
	const lines =
		workflows.length === 0
			? ["No workflows available."]
			: workflows.map(
					(workflow) => `  ${workflow.name}  ${workflow.description}`,
				);
	printLines(lines);
}

async function handleListAgents(
	runtime: CosmonautsRuntime,
	_options: CliOptions,
): Promise<void> {
	const agents = runtime.domainContext
		? runtime.agentRegistry.resolveInDomain(runtime.domainContext)
		: runtime.agentRegistry.listAll();
	const lines = agents.map(
		(agent) =>
			`  ${qualifyAgentId(agent.id, agent.domain ?? runtime.domainContext)}  ${agent.description}`,
	);
	printLines(lines);
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

async function handleWorkflowMode(
	runtime: CosmonautsRuntime,
	options: CliOptions,
	cwd: string,
): Promise<void> {
	const {
		agentRegistry: registry,
		domainContext,
		workflows: domainWorkflows,
		projectSkills,
		skillPaths,
	} = runtime;

	const chainExpr = await resolveWorkflowExpression(
		options.workflow ?? "",
		cwd,
		domainWorkflows,
	);
	const steps = parseChain(chainExpr, registry, domainContext);
	injectUserPrompt(steps, options.prompt);

	let profiler: ChainProfiler | undefined;
	let onEvent = createChainEventLogger();

	if (options.profile) {
		const planSlug = derivePlanSlug(options.completionLabel);
		const outputDir = planSlug
			? sessionsDirForPlan(cwd, planSlug)
			: join(cwd, "missions", "sessions", "_profiles");
		const activeProfiler = new ChainProfiler({ outputDir });
		profiler = activeProfiler;
		const logger = onEvent;
		onEvent = (event) => {
			logger(event);
			activeProfiler.handleEvent(event);
		};
	}

	let result: Awaited<ReturnType<typeof runChain>>;
	try {
		result = await runChain({
			steps,
			projectRoot: cwd,
			domainContext,
			onEvent,
			projectSkills,
			skillPaths,
			completionLabel: options.completionLabel,
			registry,
			domainsDir: runtime.domainsDir,
			resolver: runtime.domainResolver,
			...(options.thinking && { thinking: { default: options.thinking } }),
		});
	} finally {
		if (profiler) {
			try {
				const { tracePath, summaryPath } = await profiler.writeOutput();
				process.stderr.write(`Profile trace:   ${tracePath}\n`);
				process.stderr.write(`Profile summary: ${summaryPath}\n`);
			} catch (err) {
				process.stderr.write(`Failed to write profile output: ${err}\n`);
			}
		}
	}

	if (!result.success) {
		process.exitCode = 1;
	}
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
if (
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
	subcommand === "drive"
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
		drive: createDriveProgram,
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
