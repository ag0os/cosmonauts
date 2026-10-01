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

/** A child whose descendants the runner could not enumerate. */
export interface UnverifiedTree {
	readonly pid: number;
	readonly reason: string;
	/** The owner's label when the child was claimed, such as the run's stage. */
	readonly label?: string;
}

export interface ProcessOwnerOptions {
	/** Read at each claim and kept with any tree that ends unverified. */
	readonly label?: () => string;
}

interface OwnedState {
	readonly owned: Set<number>;
	readonly unverified: UnverifiedTree[];
}

export class ProcessOwner {
	private readonly state: OwnedState = { owned: new Set(), unverified: [] };
	private readonly label: (() => string) | undefined;
	private open = true;

	constructor(options: ProcessOwnerOptions = {}) {
		this.label = options.label;
	}

	get closed(): boolean {
		return !this.open;
	}

	/** Starts tracking one child; undefined once the owner is closed. */
	claim(): ProcessClaim | undefined {
		if (!this.open) return undefined;
		return new ProcessClaim(this.state, this.label?.());
	}

	/** The pids owned now, ascending. */
	current(): number[] {
		return [...this.state.owned].sort((a, b) => a - b);
	}

	/** Children whose trees ended unverified, in the order they ended. */
	unverified(): UnverifiedTree[] {
		return [...this.state.unverified];
	}

	/** Stops accepting children and returns the pids still owned, ascending. */
	close(): number[] {
		this.open = false;
		return this.current();
	}
}

/** One child's pids: its own and those found in its tree. */
export class ProcessClaim {
	private readonly state: OwnedState;
	private readonly label: string | undefined;
	private readonly mine = new Set<number>();

	constructor(state: OwnedState, label?: string) {
		this.state = state;
		this.label = label;
	}

	add(pids: Iterable<number>): void {
		for (const pid of pids) {
			if (!Number.isInteger(pid) || pid <= 0) continue;
			this.mine.add(pid);
			this.state.owned.add(pid);
		}
	}

	/** The runner confirmed every one of them gone. */
	release(): void {
		for (const pid of this.mine) this.state.owned.delete(pid);
		this.mine.clear();
	}

	/** The runner could not enumerate the descendants of `pid`; its pids stay owned. */
	unverified(pid: number, reason: string): void {
		this.state.unverified.push({
			pid,
			reason,
			...(this.label === undefined ? {} : { label: this.label }),
		});
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
