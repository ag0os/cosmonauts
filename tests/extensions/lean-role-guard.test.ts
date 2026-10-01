/**
 * Tests for the lean role guard: tool permissions for lean roles that a tool
 * set cannot express, routed by the agent identity in the system prompt.
 */

import { describe, expect, test } from "vitest";
import roleGuard, {
	commandWritesHistory,
} from "../../bundled/lean/extensions/role-guard/index.ts";
import { buildAgentIdentityMarker } from "../../lib/agents/runtime-identity.ts";
import { REPAIR_HEADING } from "../../lib/lean-run/prompts.ts";
import { createMockPi } from "../helpers/mocks/extension-api.ts";

function contextFor(role: string) {
	return {
		cwd: "/repo",
		getSystemPrompt: () => `Persona.\n\n${buildAgentIdentityMarker(role)}`,
	};
}

async function install(prompt = "Implement this plan.") {
	const pi = createMockPi({ cwd: "/repo" });
	roleGuard(pi as never);
	await pi.fireEvent("before_agent_start", { prompt });
	return pi;
}

function toolCall(
	pi: ReturnType<typeof createMockPi>,
	role: string,
	toolName: string,
	input: Record<string, unknown>,
) {
	return pi.fireEvent(
		"tool_call",
		{ type: "tool_call", toolCallId: "c-1", toolName, input },
		contextFor(role),
	) as Promise<{ block?: boolean; reason?: string } | undefined>;
}

describe("lean role guard", () => {
	test("blocks the builder's git commit", async () => {
		const pi = await install();
		const result = await toolCall(pi, "lean/builder", "bash", {
			command: "git add -A && git commit -m wip",
		});
		expect(result?.block).toBe(true);
		expect(result?.reason).toContain("Commits, pushes and pull requests");
	});

	test("lets the builder run tests and read git state", async () => {
		const pi = await install();
		for (const command of ["bun run test", "git status --short", "git diff"])
			expect(
				await toolCall(pi, "lean/builder", "bash", { command }),
				command,
			).toBeUndefined();
	});

	test("lets the builder edit files", async () => {
		const pi = await install();
		expect(
			await toolCall(pi, "lean/builder", "edit", { path: "src/a.ts" }),
		).toBeUndefined();
	});

	test.each(["edit", "write"])("blocks the checker's %s tool", async (tool) => {
		const pi = await install();
		const result = await toolCall(pi, "lean/checker", tool, {
			path: "src/a.ts",
		});
		expect(result).toMatchObject({ block: true });
	});

	test("lets the checker run commands", async () => {
		const pi = await install();
		expect(
			await toolCall(pi, "lean/checker", "bash", { command: "bun run test" }),
		).toBeUndefined();
	});

	test("blocks every tool call in an envelope repair turn", async () => {
		const pi = await install(`${REPAIR_HEADING}\n\nRe-emit the envelope.`);
		for (const [tool, input] of [
			["read", { path: "src/a.ts" }],
			["edit", { path: "src/a.ts" }],
			["bash", { command: "ls" }],
		] as const) {
			const result = await toolCall(pi, "lean/builder", tool, input);
			expect(result, tool).toMatchObject({ block: true });
			expect(result?.reason).toContain("Envelope repair turn");
		}
	});

	test("leaves roles outside the lean domain alone", async () => {
		const pi = await install(`${REPAIR_HEADING}\n\nanything`);
		expect(
			await toolCall(pi, "coding/worker", "bash", { command: "git commit" }),
		).toBeUndefined();
	});
});

describe("commandWritesHistory", () => {
	test.each([
		"git commit -m x",
		"git -C ../repo push origin main",
		"cd x; git rebase main",
		"GIT_EDITOR=true git merge feature",
		"env git cherry-pick abc",
		"gh pr create --fill",
		"git -c user.name=x commit -m y",
		"git --git-dir .git --work-tree . commit -m y",
		"git add -A\ngit commit -m y",
		"(git commit -m y)",
		"{ git commit -m y; }",
		"if true; then git commit -m y; fi",
		"for f in a; do git push; done",
		"true || ! git commit -m y",
		"/usr/bin/git commit -m y",
		"time git commit -m y",
		"nice -n 10 git commit -m y",
		"nohup git push &",
		"exec git push",
		"echo x | xargs -0 git commit -m",
		"sudo git push",
		"echo $(git commit -m y)",
		"echo `git commit -m y`",
		"/opt/bin/gh pr merge 3",
	])("flags %s", (command) => {
		expect(commandWritesHistory(command)).toBe(true);
	});

	test.each([
		"git status",
		"git log --oneline",
		"git diff HEAD",
		"echo git commit",
		"gh pr view 12",
		"bun run test",
		"time bun run test",
		"(cd x && git status)",
		"echo $(git rev-parse HEAD)",
		"rg 'git commit' docs",
	])("lets %s through", (command) => {
		expect(commandWritesHistory(command)).toBe(false);
	});
});
