/**
 * Counting semaphore for concurrency control.
 * Used by the spawn tracker to cap concurrent child sessions.
 */
export class Semaphore {
	private _available: number;
	private readonly _queue: Array<() => void> = [];

	constructor(maxConcurrency: number) {
		if (maxConcurrency < 1) {
			throw new Error("maxConcurrency must be at least 1");
		}
		this._available = maxConcurrency;
	}

	/** Current number of free slots. */
	get available(): number {
		return this._available;
	}

	/** Resolves when a slot is available. Queues if all slots are taken. */
	acquire(): Promise<void> {
		if (this._available > 0) {
			this._available--;
			return Promise.resolve();
		}
		return new Promise<void>((resolve) => {
			this._queue.push(resolve);
		});
	}

	/** Frees a slot, unblocking the next queued acquire() waiter (FIFO). */
	release(): void {
		const next = this._queue.shift();
		if (next) {
			// Slot stays consumed — hand it directly to the next waiter.
			next();
		} else {
			this._available++;
		}
	}
}
