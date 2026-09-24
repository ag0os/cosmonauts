import { tmpdir } from "node:os";
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
});
