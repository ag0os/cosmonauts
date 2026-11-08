import { join } from "node:path";
import { describe, expect, test } from "vitest";
import "./orchestration-mocks.ts";

import {
	FileRunStore,
	type RunStatusSummary,
} from "../../lib/durable-runtime/index.ts";
import orchestrationExtension from "../../lib/extensions/orchestration/index.ts";
import { runQualityReview } from "../../lib/orchestration/quality-review-run.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi } from "./orchestration-helpers.ts";

const temp = useTempDir("orchestration-run-control-");

interface ToolResult<T> {
	content: { type: "text"; text: string }[];
	details: T;
}

describe("orchestration run control tools", () => {
	test("points to the full QM report through run_status", async () => {
		const review = await runQualityReview({ projectRoot: temp.path });
		const pi = createMockPi(temp.path);
		orchestrationExtension(pi as never);
		const status = (await pi.callTool(
			"run_status",
			review.ref,
		)) as ToolResult<RunStatusSummary>;
		expect(
			status.details.artifacts?.find(
				(artifact) => artifact.id === "qm/final.md",
			)?.path,
		).toContain("/artifacts/qm/final.md");
		expect(status.content[0]?.text).toContain("report ");
		expect(status.content[0]?.text).toContain("/artifacts/qm/final.md");
		const store = new FileRunStore({
			rootDir: join(temp.path, "missions", "sessions"),
		});
		await store.appendEvent(review.ref, {
			type: "run_activity",
			runId: review.ref.runId,
			details: {
				kind: "artifact-disposition",
				disposition: "removal-timed-out",
				reason: "removal-timed-out",
				workspace: "/tmp/review-workspace",
			},
		});
		const withDisposition = (await pi.callTool(
			"run_status",
			review.ref,
		)) as ToolResult<RunStatusSummary>;
		expect(withDisposition.content[0]?.text).toContain(
			"disposition removal-timed-out",
		);
		expect(withDisposition.content[0]?.text).toContain("/tmp/review-workspace");
	});
});
