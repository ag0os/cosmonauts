/**
 * CLI entry point for cosmonauts.
 *
 * Modes:
 *   cosmonauts                              → interactive REPL
 *   cosmonauts "prompt"                     → interactive with initial prompt
 *   cosmonauts --print "prompt"             → non-interactive (run, output, exit)
 *   cosmonauts --workflow name "prompt"     → named workflow (non-interactive)
 *   cosmonauts --chain "a -> b" "prompt"    → raw chain DSL (non-interactive)
 *   cosmonauts init                         → agent-driven AGENTS.md bootstrap
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { InteractiveMode, runPrintMode } from "@mariozechner/pi-coding-agent";
import { Command, CommanderError } from "commander";
import { buildInitPrompt } from "../domains/shared/extensions/init/index.ts";
import {
	type AgentRegistry,
	createRegistryFromDomains,
} from "../lib/agents/index.ts";
import { loadProjectConfig } from "../lib/config/index.ts";
import { loadDomains } from "../lib/domains/loader.ts";
import { parseChain } from "../lib/orchestration/chain-parser.ts";
import {
	injectUserPrompt,
	runChain,
} from "../lib/orchestration/chain-runner.ts";
import { listWorkflows, resolveWorkflow } from "../lib/workflows/loader.ts";
import { createChainEventLogger } from "./chain-event-logger.ts";
import { createSession } from "./session.ts";
import type { CliOptions } from "./types.ts";

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
// Model Resolution
// ============================================================================

/**
 * Resolve a "provider/model-id" string into a Pi Model object.
 * Duplicated from agent-spawner.ts to avoid coupling CLI to spawner internals.
 */
function resolveModel(modelId: string) {
	const slashIndex = modelId.indexOf("/");
	if (slashIndex === -1) {
		throw new Error(
			`Invalid model ID "${modelId}": expected "provider/model" format`,
		);
	}

	const provider = modelId.slice(0, slashIndex);
	const id = modelId.slice(slashIndex + 1);

	const model = getModel(
		provider as Parameters<typeof getModel>[0],
		id as never,
	);
	if (!model) {
		throw new Error(`Model not found: provider="${provider}", id="${id}"`);
	}

	return model;
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
	};
}

// ============================================================================
// Mode Dispatch
// ============================================================================

async function run(options: CliOptions): Promise<void> {
	const cwd = process.cwd();

	// Load project config once for the session
	const projectConfig = await loadProjectConfig(cwd);
	const projectSkills = projectConfig.skills;

	// Bootstrap domain loading and build registry
	const domainsDir = resolve(
		fileURLToPath(import.meta.url),
		"..",
		"..",
		"domains",
	);
	const domains = await loadDomains(domainsDir);
	const registry: AgentRegistry = createRegistryFromDomains(domains);

	// Effective domain context: CLI flag takes priority over project config
	const domainContext = options.domain ?? projectConfig.domain;

	// --list-domains: print all discovered domains and exit
	if (options.listDomains) {
		if (domains.length === 0) {
			console.log("No domains found.");
		} else {
			for (const d of domains) {
				console.log(`  ${d.manifest.id}  ${d.manifest.description}`);
			}
		}
		return;
	}

	// --list-workflows: print available workflows and exit
	if (options.listWorkflows) {
		const workflows = await listWorkflows(cwd);
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
		const agents = options.domain
			? registry.resolveInDomain(options.domain)
			: registry.listAll();
		for (const def of agents) {
			console.log(`  ${def.id}  ${def.description}`);
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
		const cosmoDefinition = registry.resolve("cosmo", domainContext);
		const { session } = await createSession({
			definition: cosmoDefinition,
			cwd,
			model,
			thinkingLevel: options.thinking,
			persistent: false,
			projectSkills,
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
		const stages = parseChain(options.chain);
		injectUserPrompt(stages, options.prompt);

		const result = await runChain({
			stages,
			projectRoot: cwd,
			onEvent: createChainEventLogger(),
			projectSkills,
			completionLabel: options.completionLabel,
			...(options.thinking && { thinking: { default: options.thinking } }),
		});

		if (!result.success) {
			process.exitCode = 1;
		}
		return;
	}

	// 3. --workflow → resolve to chain, run, exit
	if (options.workflow) {
		const wf = await resolveWorkflow(options.workflow, cwd);
		const stages = parseChain(wf.chain);
		injectUserPrompt(stages, options.prompt);

		const result = await runChain({
			stages,
			projectRoot: cwd,
			onEvent: createChainEventLogger(),
			projectSkills,
			completionLabel: options.completionLabel,
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
			model,
			thinkingLevel: options.thinking,
			persistent: false,
			projectSkills,
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
		model,
		thinkingLevel: options.thinking,
		persistent: true,
		projectSkills,
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
