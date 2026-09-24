import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentSession } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it, vi } from "vitest";
import { createPiSpawner } from "../../lib/orchestration/agent-spawner.ts";
import { launchQualityReview } from "../../lib/orchestration/quality-review-launch.ts";
import { CosmonautsRuntime } from "../../lib/runtime.ts";

const roots: string[] = [];
afterEach(async () => {
	vi.restoreAllMocks();
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

it("launches a quality session without clone Pi settings or appended prompt", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "qm-pi-settings-"));
	roots.push(projectRoot);
	const git = (...args: string[]) =>
		execFileSync("git", args, { cwd: projectRoot });
	git("init", "-q");
	git("config", "user.email", "test@example.com");
	git("config", "user.name", "Test");
	await writeFile(join(projectRoot, ".gitignore"), "missions/sessions/\n");
	git("add", ".gitignore");
	git("commit", "-qm", "base");
	await mkdir(join(projectRoot, ".pi"));
	const marker = join(projectRoot, "npm-command-executed");
	await writeFile(
		join(projectRoot, ".pi", "settings.json"),
		JSON.stringify({
			npmCommand: ["sh", "-c", `touch ${marker}`],
			packages: ["npm:untrusted-package-that-must-not-load"],
		}),
	);
	await writeFile(
		join(projectRoot, ".pi", "APPEND_SYSTEM.md"),
		"CHANGE-CHOSEN APPENDED PROMPT",
	);
	const prompts: string[] = [];
	vi.spyOn(AgentSession.prototype, "prompt").mockImplementation(async function (
		this: AgentSession,
	) {
		prompts.push(this.systemPrompt);
	});
	await launchQualityReview({ projectRoot, assessmentTimeoutMs: 10_000 });
	const frameworkRoot = join(fileURLToPath(new URL("../..", import.meta.url)));
	const runtime = await CosmonautsRuntime.create({
		builtinDomainsDir: join(frameworkRoot, "domains"),
		projectRoot,
		bundledDirs: [join(frameworkRoot, "bundled", "coding")],
		includeUserSources: false,
	});
	const panelSpawner = createPiSpawner(
		runtime.agentRegistry,
		runtime.domainsDir,
		{ resolver: runtime.domainResolver },
	);
	try {
		const panel = await panelSpawner.spawn({
			role: "coding/reviewer",
			cwd: projectRoot,
			prompt: "review",
			qualityReviewChild: true,
			projectSkills: [],
			skillPaths: [],
			qualityReviewContext: {
				runId: "qm-pi-settings-panel",
				workspaceRoot: projectRoot,
				baseProjectRoot: projectRoot,
				materialsRoot: projectRoot,
				base: "a".repeat(40),
				changedFiles: [],
				hostRunStoreRoot: projectRoot,
				artifactSink: {} as never,
				activeSpawns: new Set(),
				allowedLenses: new Set(["reviewer"]),
				attemptedLenses: new Set(),
				integrityFailures: [],
			},
		});
		expect(panel.success, panel.error).toBe(true);
	} finally {
		panelSpawner.dispose();
	}
	expect(prompts.length).toBeGreaterThan(0);
	for (const prompt of prompts)
		expect(prompt).not.toContain("CHANGE-CHOSEN APPENDED PROMPT");
	await expect(readFile(marker)).rejects.toMatchObject({ code: "ENOENT" });
});
