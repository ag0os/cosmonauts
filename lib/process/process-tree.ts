/**
 * POSIX process-tree reaping for a child spawned `detached`. The child's
 * process group alone is not its tree: a descendant may start a group or
 * session of its own (Claude Code runs every Bash-tool command in its own
 * group), and a group signal never reaches it. So the tree is listed with
 * `ps`: the child, the members of its group, every process found from those
 * by parent pid, and the members of each group one of them leads.
 *
 * A process that left the tree before a listing cannot be found: one already
 * re-parented to init in a group of its own, such as a daemon that forked
 * and called setsid, or a descendant orphaned before the child exited on its
 * own while outside the child's group.
 */
import { execFile } from "node:child_process";
import { processGroupExists, reapProcessGroup } from "./process-group.ts";

export interface ProcessEntry {
	readonly pid: number;
	readonly ppid: number;
	readonly pgid: number;
	/** `ps` state; a zombie's starts with `Z`. */
	readonly stat: string;
	readonly command: string;
}

/** Every process on the machine, or why they could not be listed. */
export type ListProcesses = () => Promise<readonly ProcessEntry[] | Error>;

/** How long one `ps` listing may take. */
export const PROCESS_LISTING_TIMEOUT_MS = 1_000;
const POLL_MS = 25;

export const listProcesses: ListProcesses = () =>
	new Promise((resolve) => {
		execFile(
			"ps",
			["-A", "-ww", "-o", "pid=,ppid=,pgid=,stat=,command="],
			{ timeout: PROCESS_LISTING_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 },
			(error, stdout) => {
				if (error) resolve(error);
				else resolve(parseProcessListing(stdout));
			},
		);
	});

export function parseProcessListing(text: string): ProcessEntry[] {
	const entries: ProcessEntry[] = [];
	for (const line of text.split("\n")) {
		const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s?(.*)$/u.exec(line);
		if (!match) continue;
		entries.push({
			pid: Number(match[1]),
			ppid: Number(match[2]),
			pgid: Number(match[3]),
			stat: match[4] ?? "",
			command: (match[5] ?? "").trim(),
		});
	}
	return entries;
}

export type TreeReap =
	| { readonly kind: "gone"; readonly by: "exit" | "SIGTERM" | "SIGKILL" }
	| { readonly kind: "survived"; readonly reason: string }
	| { readonly kind: "unverified"; readonly reason: string };

export interface ReapProcessTreeOptions {
	readonly graceMs: number;
	readonly killWaitMs: number;
	readonly list: ListProcesses;
}

/**
 * SIGTERM to the whole listed tree, a grace period, a fresh listing, then
 * SIGKILL to everything listed, each bounded. `gone` only when every listed
 * process and every group signalled is gone. When `ps` fails, only the
 * child's group is reaped and the result is `unverified` at best.
 */
export async function reapProcessTree(
	rootPid: number,
	options: ReapProcessTreeOptions,
): Promise<TreeReap> {
	const first = await options.list();
	if (first instanceof Error) return reapGroupOnly(rootPid, options, first);
	const tree = new TrackedTree(rootPid, first);
	if (!tree.anyAlive()) return { kind: "gone", by: "exit" };
	const steps = [
		{ signal: "SIGTERM", waitMs: options.graceMs },
		{ signal: "SIGKILL", waitMs: options.killWaitMs },
	] as const;
	for (const [index, { signal, waitMs }] of steps.entries()) {
		if (index > 0) tree.relist(await options.list());
		const failure = tree.signal(signal);
		if (failure)
			return {
				kind: "survived",
				reason: `failed to send ${signal} to the tree of process ${rootPid}: ${failure.message}`,
			};
		if (await tree.waitGone(waitMs)) return { kind: "gone", by: signal };
	}
	const survivors = await tree.survivors(options.list);
	if (survivors.length === 0) return { kind: "gone", by: "SIGKILL" };
	return {
		kind: "survived",
		reason: `still running after SIGTERM and SIGKILL: ${survivors.map(describeProcess).join("; ")}`,
	};
}

async function reapGroupOnly(
	rootPid: number,
	options: ReapProcessTreeOptions,
	listingError: Error,
): Promise<TreeReap> {
	const reaped = await reapProcessGroup(rootPid, {
		termGraceMs: options.graceMs,
		killGraceMs: options.killWaitMs,
	});
	if (reaped.kind === "survived")
		return { kind: "survived", reason: reaped.reason };
	return {
		kind: "unverified",
		reason: `could not list processes (${listingError.message}); only process group ${rootPid} was checked`,
	};
}

function describeProcess(entry: ProcessEntry): string {
	const command =
		entry.command.length > 120
			? `${entry.command.slice(0, 117)}...`
			: entry.command;
	return `${entry.pid} (${command})`;
}

/**
 * The listed tree of one child, and the groups it owns: the child's own
 * group plus each group led by a listed process. A group is signalled as a
 * group only when this tree owns it; a listed process in another group is
 * signalled alone.
 */
class TrackedTree {
	private readonly rootPid: number;
	private members = new Map<number, ProcessEntry>();
	private readonly ownedGroups: Set<number>;
	/** Never signalled: this process and the group it runs in. */
	private readonly self: { pid: number; pgid?: number };

	constructor(rootPid: number, table: readonly ProcessEntry[]) {
		this.rootPid = rootPid;
		this.ownedGroups = new Set([rootPid]);
		this.self = {
			pid: process.pid,
			pgid: table.find((entry) => entry.pid === process.pid)?.pgid,
		};
		this.members = this.collect(table, new Map());
	}

	anyAlive(): boolean {
		return (
			[...this.members.values()].some((entry) => !isZombie(entry)) ||
			[...this.ownedGroups].some((group) => processGroupExists(group))
		);
	}

	/**
	 * Replaces the members with a fresh listing's: the known members still
	 * running the same command, the child's group, and everything found from
	 * them. A failed listing keeps the members known so far.
	 */
	relist(table: readonly ProcessEntry[] | Error): void {
		if (table instanceof Error) return;
		this.members = this.collect(table, this.members);
	}

	signal(signal: NodeJS.Signals): Error | undefined {
		for (const group of this.ownedGroups) {
			if (!this.signallable(group)) continue;
			const failure = send(-group, signal);
			if (failure) return failure;
		}
		for (const entry of this.members.values()) {
			if (this.ownedGroups.has(entry.pgid)) continue;
			const failure = send(entry.pid, signal);
			if (failure) return failure;
		}
		return undefined;
	}

	async waitGone(waitMs: number): Promise<boolean> {
		const deadline = Date.now() + waitMs;
		while (true) {
			if (this.allGone()) return true;
			if (Date.now() >= deadline) return false;
			await new Promise((settle) => setTimeout(settle, POLL_MS));
		}
	}

	/** What a fresh listing still shows of the tree; zombies are not running. */
	async survivors(list: ListProcesses): Promise<ProcessEntry[]> {
		const table = await list();
		if (table instanceof Error)
			return [...this.members.values()].filter((entry) => alive(entry.pid));
		return [...this.collect(table, this.members).values()].filter(
			(entry) => !isZombie(entry) && alive(entry.pid),
		);
	}

	private allGone(): boolean {
		for (const entry of this.members.values())
			if (alive(entry.pid)) return false;
		for (const group of this.ownedGroups)
			if (this.signallable(group) && processGroupExists(group)) return false;
		return true;
	}

	private signallable(group: number): boolean {
		return group > 1 && group !== this.self.pgid;
	}

	private collect(
		table: readonly ProcessEntry[],
		known: ReadonlyMap<number, ProcessEntry>,
	): Map<number, ProcessEntry> {
		const found = new Map<number, ProcessEntry>();
		const queue = table.filter(
			(entry) =>
				entry.pid === this.rootPid ||
				this.ownedGroups.has(entry.pgid) ||
				known.get(entry.pid)?.command === entry.command,
		);
		while (queue.length > 0) {
			const entry = queue.shift() as ProcessEntry;
			if (found.has(entry.pid) || !this.trackable(entry)) continue;
			found.set(entry.pid, entry);
			if (entry.pgid === entry.pid && this.signallable(entry.pid))
				this.ownedGroups.add(entry.pid);
			for (const other of table)
				if (other.ppid === entry.pid || other.pgid === entry.pid)
					queue.push(other);
		}
		return found;
	}

	private trackable(entry: ProcessEntry): boolean {
		return entry.pid > 1 && entry.pid !== this.self.pid;
	}
}

function isZombie(entry: ProcessEntry): boolean {
	return entry.stat.startsWith("Z");
}

function alive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return !(
			error instanceof Error &&
			"code" in error &&
			error.code === "ESRCH"
		);
	}
}

/** An already-gone target is success: the goal is that nothing survives. */
function send(target: number, signal: NodeJS.Signals): Error | undefined {
	try {
		process.kill(target, signal);
		return undefined;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ESRCH")
			return undefined;
		return error instanceof Error ? error : new Error(String(error));
	}
}
