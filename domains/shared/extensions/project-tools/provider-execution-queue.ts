export class ProviderExecutionQueueAbortedError extends Error {
	readonly reason: unknown;

	constructor(reason: unknown) {
		super(reason instanceof Error ? reason.message : String(reason));
		this.name = "ProviderExecutionQueueAbortedError";
		this.reason = reason;
	}
}

interface QueueWaiter {
	readonly signal?: AbortSignal;
	readonly resolve: (release: () => void) => void;
	readonly reject: (error: ProviderExecutionQueueAbortedError) => void;
	abort?: () => void;
}

/**
 * Session-owned FIFO bound for provider analysis subprocesses.
 *
 * Discovery/introspection finishes before this queue exists. Every capability
 * execution for one detected provider runtime passes through this queue.
 */
export class ProviderExecutionQueue {
	private active = 0;
	private readonly waiters: QueueWaiter[] = [];
	private closed = false;
	private closedReason: unknown;

	constructor(readonly maxConcurrent: number) {
		if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
			throw new Error(
				"Provider execution concurrency must be a positive integer.",
			);
		}
	}

	async run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
		const release = await this.acquire(signal);
		try {
			return await task();
		} finally {
			release();
		}
	}

	close(reason: unknown): void {
		if (this.closed) return;
		this.closed = true;
		this.closedReason = reason;
		const waiters = this.waiters.splice(0);
		for (const waiter of waiters) {
			if (waiter.abort !== undefined) {
				waiter.signal?.removeEventListener("abort", waiter.abort);
			}
			waiter.reject(new ProviderExecutionQueueAbortedError(reason));
		}
	}

	private acquire(signal?: AbortSignal): Promise<() => void> {
		if (this.closed) {
			return Promise.reject(
				new ProviderExecutionQueueAbortedError(this.closedReason),
			);
		}
		if (signal?.aborted) {
			return Promise.reject(
				new ProviderExecutionQueueAbortedError(signal.reason),
			);
		}
		if (this.active < this.maxConcurrent) {
			this.active += 1;
			return Promise.resolve(this.releaseOnce());
		}

		return new Promise((resolve, reject) => {
			const waiter: QueueWaiter = { signal, resolve, reject };
			const abort = (): void => {
				const index = this.waiters.indexOf(waiter);
				if (index < 0) return;
				this.waiters.splice(index, 1);
				signal?.removeEventListener("abort", abort);
				reject(new ProviderExecutionQueueAbortedError(signal?.reason));
			};
			waiter.abort = abort;
			this.waiters.push(waiter);
			signal?.addEventListener("abort", abort, { once: true });
			if (signal?.aborted) {
				abort();
				return;
			}
		});
	}

	private releaseOnce(): () => void {
		let released = false;
		return () => {
			if (released) return;
			released = true;
			this.active -= 1;
			this.startNext();
		};
	}

	private startNext(): void {
		if (this.closed || this.active >= this.maxConcurrent) {
			return;
		}
		const waiter = this.waiters.shift();
		if (waiter === undefined) return;
		if (waiter.abort !== undefined) {
			waiter.signal?.removeEventListener("abort", waiter.abort);
		}
		if (waiter.signal?.aborted) {
			waiter.reject(
				new ProviderExecutionQueueAbortedError(waiter.signal.reason),
			);
			this.startNext();
			return;
		}
		this.active += 1;
		waiter.resolve(this.releaseOnce());
	}
}
