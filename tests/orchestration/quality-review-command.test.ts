import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	runQualityReviewCommand,
	terminateActiveQualityReviewCommands,
} from "../../lib/orchestration/quality-review-command.ts";

describe("quality review host commands", () => {
	it("kills a real process group when the host signal handler runs", async () => {
		const pending = runQualityReviewCommand({
			command: process.execPath,
			args: ["-e", "setInterval(() => {}, 1000)"],
			cwd: tmpdir(),
			env: process.env,
			timeoutMs: 3000,
		});
		expect(process.listeners("SIGINT")).toContain(
			terminateActiveQualityReviewCommands,
		);
		expect(process.listeners("SIGTERM")).toContain(
			terminateActiveQualityReviewCommands,
		);
		expect(process.listeners("exit")).toContain(
			terminateActiveQualityReviewCommands,
		);
		terminateActiveQualityReviewCommands();
		const result = await pending;
		expect(result.timedOut).toBe(false);
		expect(result.exitCode).toBeNull();
	});
	it("finishes on leader exit while a detached grandchild holds stdout", async () => {
		const started = Date.now();
		const result = await runQualityReviewCommand({
			command: process.execPath,
			args: [
				"-e",
				"require('node:child_process').spawn('sleep', ['5'], {detached: true, stdio: ['ignore', 'inherit', 'ignore']}); setInterval(() => {}, 1000)",
			],
			cwd: tmpdir(),
			env: process.env,
			timeoutMs: 1000,
		});
		expect(result.timedOut).toBe(true);
		expect(Date.now() - started).toBeLessThan(2500);
	});
	it("preserves SIGTERM default termination for a host without its own handler", async () => {
		const modulePath = fileURLToPath(
			new URL(
				"../../lib/orchestration/quality-review-command.ts",
				import.meta.url,
			),
		);
		const script = `import { runQualityReviewCommand } from ${JSON.stringify(modulePath)}; const pending = runQualityReviewCommand({ command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], cwd: ${JSON.stringify(tmpdir())}, env: process.env, timeoutMs: 10000 }); process.stdout.write('READY\\n'); await pending;`;
		const host = spawn("bun", ["-e", script], {
			stdio: ["ignore", "pipe", "pipe"],
		});
		try {
			await new Promise<void>((resolve, reject) => {
				host.stdout.on("data", (chunk: Buffer) => {
					if (chunk.toString().includes("READY")) resolve();
				});
				host.once("error", reject);
			});
			host.kill("SIGTERM");
			const signal = await Promise.race([
				new Promise<NodeJS.Signals | null>((resolve) =>
					host.once("exit", (_code, exitSignal) => resolve(exitSignal)),
				),
				new Promise<never>((_resolve, reject) =>
					setTimeout(() => reject(new Error("host survived SIGTERM")), 1500),
				),
			]);
			expect(signal).toBe("SIGTERM");
		} finally {
			host.kill("SIGKILL");
		}
	});
});
