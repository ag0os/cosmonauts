import { normalizeChain, refuseNormalization } from "./chain-normalization.ts";
import { runChain } from "./chain-runner.ts";
import { shouldRunChainInline } from "./durable-chain-compiler.ts";
import { runDurableChain } from "./durable-chain-runner.ts";
import type { ChainConfig, ChainResult } from "./types.ts";

/** Resolve declarations before routing topology to the inline or durable executor. */
export async function runConfiguredChain(
	config: ChainConfig,
): Promise<ChainResult> {
	const result = normalizeChain(config);
	if (!result.ok) {
		return refuseNormalization(config, result.errors);
	}
	const prepared = { ...config, steps: result.stages };
	return shouldRunChainInline(result.stages, config)
		? runChain(prepared)
		: runDurableChain(prepared);
}
