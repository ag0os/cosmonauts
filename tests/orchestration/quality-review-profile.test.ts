import { expect, it } from "vitest";
import {
	assertQualityReviewModelIdentity,
	buildQualityReviewPanelPrompt,
} from "../../lib/orchestration/quality-review-context.ts";
import { enforceQualityReviewProfile } from "../../lib/orchestration/quality-review-profile.ts";

it("binds a panel prompt to the host captured diff and base", () => {
	const prompt = buildQualityReviewPanelPrompt(
		{
			runId: "qm-one",
			workspaceRoot: "/tmp/clone",
			materialsRoot: "/tmp/materials",
			base: "a".repeat(40),
			changedFiles: ["src/a.ts"],
			hostRunStoreRoot: "/tmp/host",
			artifactSink: {} as never,
			activeSpawns: new Set(),
			allowedLenses: new Set(["reviewer"]),
			attemptedLenses: new Set(),
			integrityFailures: [],
		},
		"Review this change",
	);
	expect(prompt).toContain("/tmp/materials/full.diff");
	expect(prompt).toContain("a".repeat(40));
	expect(prompt).toContain("src/a.ts");
	expect(prompt).toContain("Review this change");
});

it("rejects a reviewer model changed after Pi session creation", () => {
	const resolved = { provider: "test", id: "expected" };
	expect(() =>
		assertQualityReviewModelIdentity(resolved, {
			provider: "test",
			id: "actual",
		}),
	).toThrow(/model changed/);
	expect(() => assertQualityReviewModelIdentity(resolved, undefined)).toThrow(
		/model changed/,
	);
	expect(() =>
		assertQualityReviewModelIdentity(resolved, resolved),
	).not.toThrow();
});

it("limits manager tools to read, analysis and panel spawn", () => {
	expect(
		enforceQualityReviewProfile(
			[
				"read",
				"grep",
				"find",
				"ls",
				"bash",
				"edit",
				"write",
				"chain_run",
				"drive_run",
				"task_create",
				"plan_edit",
				"spawn_agent",
				"analysis_status",
				"analysis_audit",
			],
			"manager",
		),
	).toEqual([
		"read",
		"grep",
		"find",
		"ls",
		"spawn_agent",
		"analysis_status",
		"analysis_audit",
	]);
});

it("limits panel children to file reading", () => {
	expect(
		enforceQualityReviewProfile(
			[
				"read",
				"grep",
				"find",
				"ls",
				"bash",
				"write",
				"spawn_agent",
				"analysis_status",
			],
			"reviewer",
		),
	).toEqual(["read", "grep", "find", "ls"]);
});
