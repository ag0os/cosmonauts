const INTERRUPT_SIGNALS = ["SIGINT", "SIGTERM"] as const;

/** Where interrupt signals come from; `process` outside tests. */
export interface SignalSource {
	once(event: NodeJS.Signals, listener: () => void): unknown;
	off(event: NodeJS.Signals, listener: () => void): unknown;
}

/**
 * Abort the run on SIGINT or SIGTERM so it can clean up before the process
 * exits. A second signal gets the default behavior, because each listener
 * fires once.
 */
export async function withInterruptSignal<T>(
	source: SignalSource,
	run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
	const controller = new AbortController();
	const listeners = INTERRUPT_SIGNALS.map((name) => {
		const listener = () =>
			controller.abort(new Error(`interrupted by ${name}`));
		source.once(name, listener);
		return { name, listener };
	});
	try {
		return await run(controller.signal);
	} finally {
		for (const { name, listener } of listeners) source.off(name, listener);
	}
}
