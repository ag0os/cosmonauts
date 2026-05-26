import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const DRIVE_SKILL_PATH = new URL(
	"../../domains/shared/skills/drive/SKILL.md",
	import.meta.url,
);
const DRIVE_README_PATH = new URL(
	"../../lib/driver/README.md",
	import.meta.url,
);

async function readDriveGuidance() {
	const [skill, readme] = await Promise.all([
		readFile(DRIVE_SKILL_PATH, "utf-8"),
		readFile(DRIVE_README_PATH, "utf-8"),
	]);

	return `${skill}\n${readme}`;
}

describe("drive skill", () => {
	// @cosmo-behavior plan:drive-resilience-state-model#B-021
	it("documents finalization recovery state commits no-change tasks and deferred UX followups", async () => {
		const content = await readDriveGuidance();

		expect(content).toContain("finalization_failed");
		expect(content).toContain("pending-finalization.json");
		expect(content).toContain("resume");
		expect(content).toContain("safe external evidence");
		expect(content).toContain("behavioral blocked tasks");
		expect(content).toContain("stateCommitPolicy");
		expect(content).toContain("final-state-commit");
		expect(content).toContain("verification-only");
		expect(content).toContain("no-source-change");
		expect(content).toContain("watch/status/list");
		expect(content).toContain("plan_completion_candidate");
		expect(content).toContain("live-follow UI");
		expect(content).toContain("generated final summary artifacts");
		expect(content).toContain("artifact-conformance enforcement in Drive");
		expect(content).toContain("automatic plan completion");
		expect(content).not.toContain("Drive automatically archives");
		expect(content).not.toContain("Drive automatically pushes");
		expect(content).not.toContain("Drive automatically opens PRs");
	});
});
