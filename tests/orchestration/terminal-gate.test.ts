import { expect, test } from "vitest";
import { buildTerminalGateContext } from "../../lib/orchestration/terminal-gate.ts";

test("forwards raw prompts, host context and independent configured plan values", () => {
	const signal = new AbortController().signal;
	const host = {};
	const stage = {
		name: "approval",
		prompt: "raw",
		instruction: "built",
		expectedPlanSlug: "stage-plan",
	};
	expect(
		buildTerminalGateContext({
			stage,
			projectRoot: "/project",
			terminalGateContext: host,
			signal,
			completionLabel: "plan:configured",
			planSlug: "configured",
		}),
	).toEqual({
		stage,
		projectRoot: "/project",
		hostContext: host,
		signal,
		prompt: "raw",
		completionLabel: "plan:configured",
		planSlug: "stage-plan",
		configuredPlanSlug: "configured",
	});
	expect(
		buildTerminalGateContext({
			stage: { name: "approval" },
			projectRoot: "/project",
			planSlug: "fallback",
		}),
	).toMatchObject({
		planSlug: "fallback",
		configuredPlanSlug: "fallback",
		prompt: undefined,
		hostContext: undefined,
		signal: undefined,
		completionLabel: undefined,
	});
});
