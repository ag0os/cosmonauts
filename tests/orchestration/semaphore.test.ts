import { describe, expect, test } from "vitest";
import { Semaphore } from "../../lib/orchestration/semaphore.ts";

describe("Semaphore", () => {
	test("acquire resolves immediately when slots are available", async () => {
		const sem = new Semaphore(2);
		expect(sem.available).toBe(2);

		await sem.acquire();
		expect(sem.available).toBe(1);

		await sem.acquire();
		expect(sem.available).toBe(0);
	});

	test("available getter reflects current state after acquire and release", async () => {
		const sem = new Semaphore(3);
		await sem.acquire();
		await sem.acquire();
		expect(sem.available).toBe(1);

		sem.release();
		expect(sem.available).toBe(2);

		sem.release();
		expect(sem.available).toBe(3);
	});

	test("acquire queues callers when all slots are occupied", async () => {
		const sem = new Semaphore(1);
		await sem.acquire(); // slot taken

		let resolved = false;
		const pending = sem.acquire().then(() => {
			resolved = true;
		});

		// Flush microtasks — queued acquire should not resolve yet.
		await Promise.resolve();
		expect(resolved).toBe(false);

		sem.release(); // unblock
		await pending;
		expect(resolved).toBe(true);
	});

	test("queued acquires resolve in FIFO order", async () => {
		const sem = new Semaphore(1);
		await sem.acquire(); // fill the slot

		const order: number[] = [];
		const p1 = sem.acquire().then(() => order.push(1));
		const p2 = sem.acquire().then(() => order.push(2));
		const p3 = sem.acquire().then(() => order.push(3));

		sem.release(); // unblocks waiter 1
		await p1;
		expect(order).toEqual([1]);

		sem.release(); // unblocks waiter 2
		await p2;
		expect(order).toEqual([1, 2]);

		sem.release(); // unblocks waiter 3
		await p3;
		expect(order).toEqual([1, 2, 3]);
	});

	test("enforces max concurrency under concurrent acquisition", async () => {
		const sem = new Semaphore(2);
		let active = 0;
		let maxObserved = 0;

		const run = async () => {
			await sem.acquire();
			active++;
			maxObserved = Math.max(maxObserved, active);
			// Yield so other coroutines can interleave.
			await Promise.resolve();
			active--;
			sem.release();
		};

		await Promise.all([run(), run(), run(), run(), run()]);
		expect(maxObserved).toBeLessThanOrEqual(2);
	});

	test("throws when maxConcurrency is less than 1", () => {
		expect(() => new Semaphore(0)).toThrow();
	});
});
