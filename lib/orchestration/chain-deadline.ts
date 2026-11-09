/** The chain-wide deadline that the inline and durable runners both enforce between steps. */
export const DEFAULT_CHAIN_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function chainTimeoutError(options: {
	timeoutMs: number;
	stepIndex: number;
	stepCount: number;
}): string {
	return `Chain timed out after ${options.timeoutMs}ms before step ${options.stepIndex + 1} of ${options.stepCount}`;
}
