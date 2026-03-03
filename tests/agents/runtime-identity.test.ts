import { describe, expect, test } from "vitest";
import {
	appendAgentIdentityMarker,
	buildAgentIdentityMarker,
	extractAgentIdFromSystemPrompt,
} from "../../lib/agents/runtime-identity.ts";

describe("runtime identity markers", () => {
	test("buildAgentIdentityMarker emits hidden marker format", () => {
		expect(buildAgentIdentityMarker("cosmo")).toBe(
			"<!-- COSMONAUTS_AGENT_ID:cosmo -->",
		);
	});

	test("appendAgentIdentityMarker appends marker to existing prompt", () => {
		const appended = appendAgentIdentityMarker("Base prompt", "worker");
		expect(appended).toContain("Base prompt");
		expect(appended).toContain("COSMONAUTS_AGENT_ID:worker");
	});

	test("appendAgentIdentityMarker returns marker when prompt is undefined", () => {
		const appended = appendAgentIdentityMarker(undefined, "planner");
		expect(appended).toBe("<!-- COSMONAUTS_AGENT_ID:planner -->");
	});

	test("extractAgentIdFromSystemPrompt reads marker case-insensitively", () => {
		const systemPrompt =
			"header\n<!-- cosmonauts_agent_id:Task-Manager -->\nfooter";
		expect(extractAgentIdFromSystemPrompt(systemPrompt)).toBe("task-manager");
	});

	test("extractAgentIdFromSystemPrompt returns undefined when marker missing", () => {
		expect(extractAgentIdFromSystemPrompt("no marker")).toBeUndefined();
	});
});
