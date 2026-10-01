/**
 * Which processes a piece of work owns: every child `runChild` spawned
 * inside `ownProcesses`, and every process it found in that child's tree,
 * until the runner confirmed the whole tree gone. The scope follows the
 * async context, so nothing between the owner and the runner passes it on.
 * Once closed, the owner refuses new children: work the owner stopped
 * waiting for cannot start a process nobody will check.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const scope = new AsyncLocalStorage<ProcessOwner>();

export class ProcessOwner {
	private readonly owned = new Set<number>();
	private open = true;

	get closed(): boolean {
		return !this.open;
	}

	/** Starts tracking one child; undefined once the owner is closed. */
	claim(): ProcessClaim | undefined {
		if (!this.open) return undefined;
		return new ProcessClaim(this.owned);
	}

	/** The pids owned now, ascending. */
	current(): number[] {
		return [...this.owned].sort((a, b) => a - b);
	}

	/** Stops accepting children and returns the pids still owned, ascending. */
	close(): number[] {
		this.open = false;
		return this.current();
	}
}

/** One child's pids: its own and those found in its tree. */
export class ProcessClaim {
	private readonly owned: Set<number>;
	private readonly mine = new Set<number>();

	constructor(owned: Set<number>) {
		this.owned = owned;
	}

	add(pids: Iterable<number>): void {
		for (const pid of pids) {
			if (!Number.isInteger(pid) || pid <= 0) continue;
			this.mine.add(pid);
			this.owned.add(pid);
		}
	}

	/** The runner confirmed every one of them gone. */
	release(): void {
		for (const pid of this.mine) this.owned.delete(pid);
		this.mine.clear();
	}
}

/** Runs `work` with `owner` as the owner of every child it starts. */
export function ownProcesses<T>(
	owner: ProcessOwner,
	work: () => Promise<T>,
): Promise<T> {
	return scope.run(owner, work);
}

/** The owner of the current async context, if any. */
export function currentProcessOwner(): ProcessOwner | undefined {
	return scope.getStore();
}
