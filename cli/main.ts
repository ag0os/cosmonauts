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

import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { InteractiveMode, runPrintMode } from "@mariozechner/pi-coding-agent";
import { Command, CommanderError } from "commander";
import { buildInitPrompt } from "../extensions/init/index.ts";
import { COSMO_DEFINITION } from "../lib/agents/definitions.ts";
import { parseChain } from "../lib/orchestration/chain-parser.ts";
import {
	getDefaultStagePrompt,
	runChain,
} from "../lib/orchestration/chain-runner.ts";
import type { ChainStage } from "../lib/orchestration/types.ts";
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
// Chain Prompt Injection
// ============================================================================

/**
 * Inject a user prompt into the first chain stage by appending it to the
 * stage's default operational prompt.
 */
function injectUserPrompt(
	stages: ChainStage[],
	prompt: string | undefined,
): void {
	const first = stages[0];
	if (!prompt || !first) return;

	const defaultPrompt = getDefaultStagePrompt(first.name);
	stages[0] = {
		...first,
		prompt: `${defaultPrompt}\n\nUser request: ${prompt}`,
	};
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
		.option("-w, --workflow <name>", "Run a named workflow")
		.option("-c, --chain <expression>", "Run a raw chain DSL expression")
		.option("-m, --model <provider/model-id>", "Override the default model")
		.option(
			"-t, --thinking [level]",
			"Set thinking level (default: high when flag present)",
		)
		.option("--list-workflows", "List available workflows and exit")
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
		workflow: opts.workflow,
		chain: opts.chain,
		model: opts.model,
		thinking,
		init: isInit,
		listWorkflows: opts.listWorkflows ?? false,
	};
}

// ============================================================================
// Mode Dispatch
// ============================================================================

async function run(options: CliOptions): Promise<void> {
	const cwd = process.cwd();

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

	// Resolve model override once (shared across modes)
	const model = options.model ? resolveModel(options.model) : undefined;

	// 1. init → create Cosmo session in print mode, send init prompt
	if (options.init) {
		const { session } = await createSession({
			definition: COSMO_DEFINITION,
			cwd,
			model,
			thinkingLevel: options.thinking,
			persistent: false,
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
		});

		if (!result.success) {
			process.exitCode = 1;
		}
		return;
	}

	// 4. --print → non-interactive Cosmo session
	if (options.print) {
		if (!options.prompt) {
			throw new Error("--print requires a prompt argument");
		}

		const { session } = await createSession({
			definition: COSMO_DEFINITION,
			cwd,
			model,
			thinkingLevel: options.thinking,
			persistent: false,
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
	// TODO: After --workflow/--chain, drop into Cosmo REPL (DESIGN.md future behavior)
	const result = await createSession({
		definition: COSMO_DEFINITION,
		cwd,
		model,
		thinkingLevel: options.thinking,
		persistent: true,
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
