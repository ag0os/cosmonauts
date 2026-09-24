import { spawn } from "node:child_process";

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
		const output: Buffer[] = [];
		let timedOut = false;
		let cancelled = false;
		let finished = false;
		const killGroup = () => {
			if (!child.pid) return;
			try {
				process.kill(-child.pid, "SIGKILL");
			} catch {
				child.kill("SIGKILL");
			}
		};
		const abort = () => {
			cancelled = true;
			killGroup();
		};
		options.signal?.addEventListener("abort", abort, { once: true });
		const timer = setTimeout(() => {
			timedOut = true;
			killGroup();
		}, options.timeoutMs);
		child.stdout.on("data", (data: Buffer) => output.push(data));
		child.stderr.on("data", (data: Buffer) => output.push(data));
		const finish = (exitCode: number | null, error?: string) => {
			if (finished) return;
			finished = true;
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
