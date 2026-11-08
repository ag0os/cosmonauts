import { join } from "node:path";
import { runConfiguredChain } from "../lib/orchestration/chain-dispatch.ts";
import { ChainProfiler } from "../lib/orchestration/chain-profiler.ts";
import {
	derivePlanSlug,
	injectUserPrompt,
} from "../lib/orchestration/chain-runner.ts";
import { selectChain } from "../lib/orchestration/chain-selection.ts";
import type { ChainResult } from "../lib/orchestration/types.ts";
import type { CosmonautsRuntime } from "../lib/runtime.ts";
import { sessionsDirForPlan } from "../lib/sessions/session-store.ts";
import { createChainEventLogger } from "./chain-event-logger.ts";
import type { CliRuntimeOptions } from "./runtime-bootstrap.ts";

interface ChainExecutionOptions extends CliRuntimeOptions {
	prompt?: string;
}

export async function executeChainExpression({
	runtime,
	options,
	cwd,
	chainExpr,
	terminalGateContext,
}: {
	runtime: CosmonautsRuntime;
	options: ChainExecutionOptions;
	cwd: string;
	chainExpr: string;
	terminalGateContext?: unknown;
}): Promise<ChainResult> {
	const {
		agentRegistry: registry,
		domainContext,
		projectSkills,
		skillPaths,
	} = runtime;

	const { steps, episodes } = selectChain(
		chainExpr,
		runtime.chains,
		runtime.chainAdapter?.defaultEpisodes,
	);
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
			episodes,
			runtime,
			chainAdapter: runtime.chainAdapter,
			sessionPolicies: runtime.sessionPolicies,
			defaultModel: runtime.defaultModel,
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
			terminalGateContext,
			...(options.model && { models: { default: options.model } }),
			...(options.thinking && { thinking: { default: options.thinking } }),
		};
		return await runConfiguredChain(chainConfig);
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
