import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { createAgentSessionFromDefinition } from "../../lib/orchestration/session-factory.ts";

it("keeps source and host paths out of a real panel reviewer's full system prompt", async () => {
	const sourceRoot = await mkdtemp(join(tmpdir(), "qm-prompt-source-"));
	const workspaceRoot = await mkdtemp(join(tmpdir(), "qm-prompt-clone-"));
	const hostRunStoreRoot = await mkdtemp(join(tmpdir(), "qm-prompt-host-"));
	const relativeSkill = join("bundled", "coding", "skills", "review-scope");
	const skill =
		"---\nname: review-scope\ndescription: Review the captured scope.\n---\n\nReview the captured scope.\n";
	for (const root of [sourceRoot, workspaceRoot]) {
		await mkdir(join(root, relativeSkill), { recursive: true });
		await writeFile(join(root, relativeSkill, "SKILL.md"), skill);
	}
	await mkdir(join(sourceRoot, "bundled", "coding", "skills", "source-only"));
	await writeFile(
		join(sourceRoot, "bundled", "coding", "skills", "source-only", "SKILL.md"),
		"---\nname: source-only\ndescription: Source only.\n---\n",
	);
	const domainsDir = join(workspaceRoot, "domains");
	await mkdir(join(domainsDir, "coding", "prompts"), { recursive: true });
	await writeFile(
		join(domainsDir, "coding", "prompts", "reviewer.md"),
		"Review the captured scope.\n",
	);
	const definition: AgentDefinition = {
		id: "reviewer",
		domain: "coding",
		description: "Review",
		capabilities: [],
		model: "openai/gpt-4o-mini",
		tools: "none",
		extensions: [],
		skills: ["*"],
		projectContext: false,
		session: "ephemeral",
		loop: false,
	};
	try {
		const { session } = await createAgentSessionFromDefinition(
			definition,
			{
				role: "coding/reviewer",
				cwd: workspaceRoot,
				prompt: "review",
				skillPaths: [join(sourceRoot, "bundled", "coding", "skills")],
				qualityReviewChild: true,
				qualityReviewContext: {
					runId: "qm-prompt",
					sourceRoot,
					workspaceRoot,
					materialsRoot: workspaceRoot,
					base: "a".repeat(40),
					changedFiles: [],
					hostRunStoreRoot,
					artifactSink: {} as never,
					activeSpawns: new Set(),
					allowedLenses: new Set(["reviewer"]),
					attemptedLenses: new Set(),
					integrityFailures: [],
				},
			},
			domainsDir,
		);
		try {
			expect(session.systemPrompt).toContain(
				join(workspaceRoot, relativeSkill),
			);
			expect(session.systemPrompt).not.toContain(sourceRoot);
			expect(session.systemPrompt).not.toContain(await realpath(sourceRoot));
			expect(session.systemPrompt).not.toContain(hostRunStoreRoot);
			expect(session.systemPrompt).not.toContain("source-only");
		} finally {
			session.dispose();
		}
	} finally {
		await rm(sourceRoot, { recursive: true, force: true });
		await rm(workspaceRoot, { recursive: true, force: true });
		await rm(hostRunStoreRoot, { recursive: true, force: true });
	}
});
