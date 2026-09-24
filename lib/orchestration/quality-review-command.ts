import { spawn } from "node:child_process";

const activeGroups = new Set<number>();
function killGroup(pid: number): void {
	try {
		process.kill(-pid, "SIGKILL");
	} catch {
		/* already exited */
	}
}
export function terminateActiveQualityReviewCommands(): void {
	for (const pid of activeGroups) killGroup(pid);
}
function listenForHostExit(): void {
	if (activeGroups.size !== 1) return;
	process.on("SIGINT", terminateActiveQualityReviewCommands);
	process.on("SIGTERM", terminateActiveQualityReviewCommands);
	process.on("exit", terminateActiveQualityReviewCommands);
}

function stopListeningForHostExit(): void {
	if (activeGroups.size !== 0) return;
	process.off("SIGINT", terminateActiveQualityReviewCommands);
	process.off("SIGTERM", terminateActiveQualityReviewCommands);
	process.off("exit", terminateActiveQualityReviewCommands);
}

/** Run a host command in its own process group so descendants cannot hold pipes open. */
export function runQualityReviewCommand(options: {
	command: string;
	args: readonly string[];
	cwd: string;
	env: NodeJS.ProcessEnv;
	timeoutMs: number;
	signal?: AbortSignal;
}): Promise<{
	exitCode: number | null;
	output: Buffer;
	timedOut: boolean;
	cancelled: boolean;
}> {
	return new Promise((resolve) => {
		if (options.signal?.aborted) {
			resolve({
				exitCode: null,
				output: Buffer.alloc(0),
				timedOut: false,
				cancelled: true,
			});
			return;
		}
		const child = spawn(options.command, [...options.args], {
			cwd: options.cwd,
			env: options.env,
			stdio: ["ignore", "pipe", "pipe"],
			shell: false,
			detached: true,
		});
		if (child.pid) {
			activeGroups.add(child.pid);
			listenForHostExit();
		}
		const output: Buffer[] = [];
		let timedOut = false;
		let cancelled = false;
		let finished = false;
		const killChildGroup = () => {
			if (!child.pid) return;
			try {
				process.kill(-child.pid, "SIGKILL");
			} catch {
				child.kill("SIGKILL");
			}
		};
		const abort = () => {
			cancelled = true;
			killChildGroup();
		};
		options.signal?.addEventListener("abort", abort, { once: true });
		if (options.signal?.aborted) abort();
		const timer = setTimeout(() => {
			timedOut = true;
			killChildGroup();
		}, options.timeoutMs);
		child.stdout.on("data", (data: Buffer) => output.push(data));
		child.stderr.on("data", (data: Buffer) => output.push(data));
		const finish = (exitCode: number | null, error?: string) => {
			if (finished) return;
			finished = true;
			if (child.pid) activeGroups.delete(child.pid);
			stopListeningForHostExit();
			clearTimeout(timer);
			options.signal?.removeEventListener("abort", abort);
			resolve({
				exitCode,
				output: Buffer.concat(error ? [...output, Buffer.from(error)] : output),
				timedOut,
				cancelled,
			});
		};
		child.on("error", (error) => finish(null, error.message));
		child.on("close", (code) => finish(code));
	});
}
