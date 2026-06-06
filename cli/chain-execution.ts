import { join } from "node:path";
import { parseChain } from "../lib/orchestration/chain-parser.ts";
import { ChainProfiler } from "../lib/orchestration/chain-profiler.ts";
import {
	derivePlanSlug,
	injectUserPrompt,
	runChain,
} from "../lib/orchestration/chain-runner.ts";
import { shouldRunChainInline } from "../lib/orchestration/durable-chain-compiler.ts";
import { runDurableChain } from "../lib/orchestration/durable-chain-runner.ts";
import type { ChainResult } from "../lib/orchestration/types.ts";
import type { CosmonautsRuntime } from "../lib/runtime.ts";
import { sessionsDirForPlan } from "../lib/sessions/session-store.ts";
import { createChainEventLogger } from "./chain-event-logger.ts";
import type { CliRuntimeOptions } from "./runtime-bootstrap.ts";

export interface ChainExecutionOptions extends CliRuntimeOptions {
	prompt?: string;
}

export async function executeChainExpression({
	runtime,
	options,
	cwd,
	chainExpr,
}: {
	runtime: CosmonautsRuntime;
	options: ChainExecutionOptions;
	cwd: string;
	chainExpr: string;
}): Promise<ChainResult> {
	const {
		agentRegistry: registry,
		domainContext,
		projectSkills,
		skillPaths,
	} = runtime;

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

	try {
		const chainConfig = {
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
			...(options.model && { models: { default: options.model } }),
			...(options.thinking && { thinking: { default: options.thinking } }),
		};
		return shouldRunChainInline(steps, {
			completionLabel: options.completionLabel,
		})
			? await runChain(chainConfig)
			: await runDurableChain(chainConfig);
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
}
