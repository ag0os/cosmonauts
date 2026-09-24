import type { QualityReviewCommand } from "../config/types.ts";
import { runQualityReviewCommand } from "./quality-review-command.ts";

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
	signal?: AbortSignal;
}): Promise<QualityReviewCheckResult[]> {
	if (!/^[a-f0-9]{40,64}$/.test(options.base))
		throw new Error("Quality review base is not a literal commit");
	const results: QualityReviewCheckResult[] = [];
	for (const check of options.checks) {
		if (options.signal?.aborted) throw new Error("Caller cancellation");
		const env = { ...process.env };
		delete env.COSMONAUTS_DRIVER_CODEX_ARGS;
		const argv = [
			check.command,
			...check.args.map((arg) => (arg === "{base}" ? options.base : arg)),
		];
		const started = Date.now();
		const result = await runQualityReviewCommand({
			command: argv[0] ?? "",
			args: argv.slice(1),
			cwd: options.cwd,
			env,
			timeoutMs: check.timeoutMs ?? 120_000,
			signal: options.signal,
		});
		if (result.cancelled) throw new Error("Caller cancellation");
		results.push({
			id: check.id,
			argv,
			exitCode: result.exitCode,
			durationMs: Date.now() - started,
			output: result.output.toString("utf8"),
			timedOut: result.timedOut,
		});
	}
	return results;
}

export function renderQualityReviewChecks(
	results: readonly QualityReviewCheckResult[],
): string {
	return `# Configured checks\n\n${results.map((result) => `## ${result.id}\n\n- argv: ${JSON.stringify(result.argv)}\n- exit code: ${result.exitCode ?? "unavailable"}\n- duration: ${result.durationMs} ms\n- timed out: ${result.timedOut}\n\n\x60\x60\x60text\n${result.output}\n\x60\x60\x60`).join("\n\n") || "- Not configured."}\n`;
}
