/**
 * CLI entry point for cosmonauts.
 *
 * Modes:
 *   cosmonauts                              → interactive REPL
 *   cosmonauts "prompt"                     → interactive with initial prompt
 *   cosmonauts --print "prompt"             → non-interactive (run, output, exit)
 *   cosmonauts --workflow name "prompt"     → named workflow (non-interactive)
 *   cosmonauts --chain "a -> b" "prompt"    → raw chain DSL (non-interactive)
 *   cosmonauts --dump-prompt [-a agent]     → dump composed system prompt to stdout
 *   cosmonauts --dump-prompt --file path    → dump composed system prompt to file
 *   cosmonauts init                         → agent-driven AGENTS.md bootstrap
 *   cosmonauts task <command>               → task management subcommands
 *   cosmonauts plan <command>               → plan management subcommands
 */

import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import { InteractiveMode, runPrintMode } from "@mariozechner/pi-coding-agent";
import { Command, CommanderError } from "commander";
import { buildInitPrompt } from "../domains/shared/extensions/init/index.ts";
import {
	appendAgentIdentityMarker,
	qualifyAgentId,
} from "../lib/agents/runtime-identity.ts";
import { assemblePrompts } from "../lib/domains/prompt-assembly.ts";
import { resolveModel } from "../lib/orchestration/agent-spawner.ts";
import { parseChain } from "../lib/orchestration/chain-parser.ts";
import {
	injectUserPrompt,
	runChain,
} from "../lib/orchestration/chain-runner.ts";
import {
	discoverBundledPackageDirs,
	discoverFrameworkBundledPackageDirs,
	isCosmonautsFrameworkRepo,
} from "../lib/packages/dev-bundled.ts";
import { CosmonautsRuntime } from "../lib/runtime.ts";
import { listWorkflows, resolveWorkflow } from "../lib/workflows/loader.ts";
import { createChainEventLogger } from "./chain-event-logger.ts";
import { createCreateProgram } from "./create/subcommand.ts";
import {
	createInstallProgram,
	createPackagesProgram,
	createUninstallProgram,
} from "./packages/subcommand.ts";
import { createPlanProgram } from "./plans/index.ts";
import { createSession } from "./session.ts";
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
	// Detect "init" subcommand before Commander sees it
	const isInit = argv.length > 0 && argv[0] === "init";
	const effectiveArgv = isInit ? argv.slice(1) : argv;

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
		.option("-w, --workflow <name>", "Run a named workflow")
		.option("-c, --chain <expression>", "Run a raw chain DSL expression")
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
		.argument("[prompt...]", "Prompt text");

	// Parse without calling process.exit on error
	program.exitOverride();
	program.parse(effectiveArgv, { from: "user" });

	const opts = program.opts();

	// Handle thinking level: flag present without value defaults to "high"
	let thinking: ThinkingLevel | undefined;
	if (opts.thinking !== undefined) {
		if (opts.thinking === true) {
			// --thinking without a value
			thinking = "high";
		} else {
			thinking = parseThinkingLevel(opts.thinking);
		}
	}

	const promptArgs: string[] = program.args;
	const prompt = promptArgs.length > 0 ? promptArgs.join(" ") : undefined;

	const pluginDirs: string[] = opts.pluginDir ?? [];

	return {
		prompt,
		print: opts.print ?? false,
		agent: opts.agent,
		workflow: opts.workflow,
		chain: opts.chain,
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
		pluginDirs: pluginDirs.length > 0 ? pluginDirs : undefined,
	};
}

// ============================================================================
// Mode Dispatch
// ============================================================================

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

	const {
		agentRegistry: registry,
		domainContext,
		workflows: domainWorkflows,
		projectSkills,
		skillPaths,
	} = runtime;

	// First-run detection: guide users to install a domain when none are present.
	// Meta commands (install, uninstall, packages, create, update) are routed
	// before run() is called and never reach this check.
	// Informational flags and init are allowed through to handle the domain-less state gracefully.
	const hasNonSharedDomain =
		runtime.domains.filter((d) => d.manifest.id !== "shared").length > 0;
	const isBypassCommand =
		options.init ||
		options.listDomains ||
		options.listWorkflows ||
		options.listAgents ||
		options.dumpPrompt;
	if (!hasNonSharedDomain && !isBypassCommand) {
		console.error(
			"No domains installed. Install the coding domain to get started:",
		);
		console.error("  cosmonauts install coding");
		console.error("  cosmonauts install coding-minimal  (lightweight)");
		process.exitCode = 1;
		return;
	}

	// --list-domains: print all discovered domains and exit
	if (options.listDomains) {
		if (runtime.domains.length === 0) {
			console.log("No domains found.");
		} else {
			for (const d of runtime.domains) {
				console.log(`  ${d.manifest.id}  ${d.manifest.description}`);
			}
		}
		return;
	}

	// --list-workflows: print available workflows and exit
	if (options.listWorkflows) {
		const workflows = await listWorkflows(cwd, domainWorkflows);
		if (workflows.length === 0) {
			console.log("No workflows available.");
		} else {
			for (const wf of workflows) {
				console.log(`  ${wf.name}  ${wf.description}`);
			}
		}
		return;
	}

	// --list-agents: print available agent IDs and exit
	if (options.listAgents) {
		const agents = domainContext
			? registry.resolveInDomain(domainContext)
			: registry.listAll();
		for (const def of agents) {
			console.log(`  ${def.id}  ${def.description}`);
		}
		return;
	}

	// --dump-prompt: assemble and output the full system prompt for an agent
	if (options.dumpPrompt) {
		const agentId = options.agent ?? "cosmo";
		const def = registry.resolve(agentId, domainContext);
		const domain = def.domain ?? "coding";

		let prompt = await assemblePrompts({
			agentId: def.id,
			domain,
			capabilities: def.capabilities,
			domainsDir: runtime.domainsDir,
			resolver: runtime.domainResolver,
		});
		prompt = appendAgentIdentityMarker(prompt, qualifyAgentId(def.id, domain));

		if (options.dumpPromptFile) {
			await writeFile(options.dumpPromptFile, prompt, "utf-8");
			console.log(`Wrote ${def.id} prompt to ${options.dumpPromptFile}`);
		} else {
			process.stdout.write(prompt);
			process.stdout.write("\n");
		}
		return;
	}

	// Resolve agent definition: --agent overrides the default (cosmo)
	const definition = options.agent
		? registry.resolve(options.agent, domainContext)
		: registry.resolve("cosmo", domainContext);

	// Resolve model override once (shared across modes)
	const model = options.model ? resolveModel(options.model) : undefined;

	// 1. init → always uses Cosmo (bootstrap requires full coding tools)
	if (options.init) {
		// Without a domain, Cosmo is not available. Guide the user to install one first.
		if (!hasNonSharedDomain) {
			console.log(
				"No domains installed. Install a domain to use cosmonauts init:",
			);
			console.log("  cosmonauts install coding");
			console.log("  cosmonauts install coding-minimal  (lightweight)");
			console.log();
			console.log(
				"After installing a domain, run `cosmonauts init` again to set up your project.",
			);
			process.exitCode = 1;
			return;
		}

		const cosmoDefinition = registry.resolve("cosmo", domainContext);
		const { session } = await createSession({
			definition: cosmoDefinition,
			cwd,
			domainsDir: runtime.domainsDir,
			resolver: runtime.domainResolver,
			model,
			thinkingLevel: options.thinking,
			persistent: false,
			projectSkills,
			skillPaths,
		});

		try {
			await runPrintMode(session, {
				mode: "text",
				initialMessage: buildInitPrompt(cwd),
			});
		} finally {
			session.dispose();
		}
		return;
	}

	// 2. --chain → parse chain, run, exit
	if (options.chain) {
		const stages = parseChain(options.chain, registry, domainContext);
		injectUserPrompt(stages, options.prompt);

		const result = await runChain({
			stages,
			projectRoot: cwd,
			domainContext,
			onEvent: createChainEventLogger(),
			projectSkills,
			skillPaths,
			completionLabel: options.completionLabel,
			registry,
			domainsDir: runtime.domainsDir,
			resolver: runtime.domainResolver,
			...(options.thinking && { thinking: { default: options.thinking } }),
		});

		if (!result.success) {
			process.exitCode = 1;
		}
		return;
	}

	// 3. --workflow → resolve to chain, run, exit
	if (options.workflow) {
		const wf = await resolveWorkflow(options.workflow, cwd, domainWorkflows);
		const stages = parseChain(wf.chain, registry, domainContext);
		injectUserPrompt(stages, options.prompt);

		const result = await runChain({
			stages,
			projectRoot: cwd,
			domainContext,
			onEvent: createChainEventLogger(),
			projectSkills,
			skillPaths,
			completionLabel: options.completionLabel,
			registry,
			domainsDir: runtime.domainsDir,
			resolver: runtime.domainResolver,
			...(options.thinking && { thinking: { default: options.thinking } }),
		});

		if (!result.success) {
			process.exitCode = 1;
		}
		return;
	}

	// 4. --print → non-interactive session
	if (options.print) {
		if (!options.prompt) {
			throw new Error("--print requires a prompt argument");
		}

		const { session } = await createSession({
			definition,
			cwd,
			domainsDir: runtime.domainsDir,
			resolver: runtime.domainResolver,
			model,
			thinkingLevel: options.thinking,
			persistent: false,
			projectSkills,
			skillPaths,
		});

		try {
			await runPrintMode(session, {
				mode: "text",
				initialMessage: options.prompt,
			});
		} finally {
			session.dispose();
		}
		return;
	}

	// 5. default → interactive REPL
	// TODO: After --workflow/--chain, drop into Cosmo REPL
	const result = await createSession({
		definition,
		cwd,
		domainsDir: runtime.domainsDir,
		resolver: runtime.domainResolver,
		model,
		thinkingLevel: options.thinking,
		persistent: true,
		projectSkills,
		skillPaths,
	});

	const interactive = new InteractiveMode(result.session, {
		modelFallbackMessage: result.modelFallbackMessage,
		initialMessage: options.prompt,
	});

	await interactive.init();
	await interactive.run();
}

// ============================================================================
// Entry Point
// ============================================================================

const subcommand = process.argv[2];
if (
	subcommand === "task" ||
	subcommand === "plan" ||
	subcommand === "skills" ||
	subcommand === "create" ||
	subcommand === "install" ||
	subcommand === "uninstall" ||
	subcommand === "packages" ||
	subcommand === "update"
) {
	const programs: Record<string, () => Command> = {
		task: createTaskProgram,
		plan: createPlanProgram,
		skills: createSkillsProgram,
		create: createCreateProgram,
		install: createInstallProgram,
		uninstall: createUninstallProgram,
		packages: createPackagesProgram,
		update: createUpdateProgram,
	};
	// subcommand is guaranteed to be in the map by the if-check above
	const createProgram = programs[subcommand];
	if (!createProgram) throw new Error(`Unknown subcommand: ${subcommand}`);
	const program = createProgram();
	program
		.parseAsync(process.argv.slice(3), { from: "user" })
		.catch((err: unknown) => {
			const message = err instanceof Error ? err.message : String(err);
			process.stderr.write(`cosmonauts ${subcommand}: ${message}\n`);
			process.exitCode = 1;
		});
} else {
	try {
		const options = parseCliArgs(process.argv.slice(2));

		run(options).catch((err: unknown) => {
			const message = err instanceof Error ? err.message : String(err);
			process.stderr.write(`cosmonauts: ${message}\n`);
			process.exitCode = 1;
		});
	} catch (err: unknown) {
		// Commander throws CommanderError for --help and --version (exitOverride mode)
		if (err instanceof CommanderError) {
			process.exitCode = err.exitCode;
		} else {
			const message = err instanceof Error ? err.message : String(err);
			process.stderr.write(`cosmonauts: ${message}\n`);
			process.exitCode = 1;
		}
	}
} // end else (non-subcommand path)
