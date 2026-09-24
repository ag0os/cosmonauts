import { spawn } from "node:child_process";
import type { QualityReviewCommand } from "../config/types.ts";

export interface QualityReviewCheckResult {
	readonly id: string;
	readonly argv: readonly string[];
	readonly exitCode: number | null;
	readonly durationMs: number;
	readonly output: string;
	readonly timedOut: boolean;
}

/** Commands are host configured. Only the literal captured base placeholder is expanded. */
export async function runQualityReviewChecks(options: {
	cwd: string;
	base: string;
	checks: readonly QualityReviewCommand[];
}): Promise<QualityReviewCheckResult[]> {
	if (!/^[a-f0-9]{40,64}$/.test(options.base))
		throw new Error("Quality review base is not a literal commit");
	const results: QualityReviewCheckResult[] = [];
	for (const check of options.checks) {
		const env = { ...process.env };
		delete env.COSMONAUTS_DRIVER_CODEX_ARGS;
		const argv = [
			check.command,
			...check.args.map((arg) => (arg === "{base}" ? options.base : arg)),
		];
		const started = Date.now();
		results.push(
			await new Promise<QualityReviewCheckResult>((resolve) => {
				const child = spawn(argv[0] ?? "", argv.slice(1), {
					cwd: options.cwd,
					env,
					stdio: ["ignore", "pipe", "pipe"],
					shell: false,
				});
				const output: Buffer[] = [];
				let timedOut = false;
				let settled = false;
				const timeout = setTimeout(() => {
					timedOut = true;
					child.kill("SIGKILL");
				}, check.timeoutMs ?? 120_000);
				child.stdout.on("data", (data: Buffer) => output.push(data));
				child.stderr.on("data", (data: Buffer) => output.push(data));
				const finish = (exitCode: number | null, error?: string) => {
					if (settled) return;
					settled = true;
					clearTimeout(timeout);
					resolve({
						id: check.id,
						argv,
						exitCode,
						durationMs: Date.now() - started,
						output: Buffer.concat(output).toString("utf8") + (error ?? ""),
						timedOut,
					});
				};
				child.on("error", (error) => finish(null, error.message));
				child.on("close", (code) => finish(code));
			}),
		);
	}
	return results;
}

export function renderQualityReviewChecks(
	results: readonly QualityReviewCheckResult[],
): string {
	return `# Configured checks\n\n${results.map((result) => `## ${result.id}\n\n- argv: ${JSON.stringify(result.argv)}\n- exit code: ${result.exitCode ?? "unavailable"}\n- duration: ${result.durationMs} ms\n- timed out: ${result.timedOut}\n\n\x60\x60\x60text\n${result.output}\n\x60\x60\x60`).join("\n\n") || "- Not configured."}\n`;
}
