import { describe, expect, test } from "vitest";
import {
	appendAgentIdentityMarker,
	buildAgentIdentityMarker,
	extractAgentIdFromSystemPrompt,
	qualifyAgentId,
} from "../../lib/agents/runtime-identity.ts";

describe("runtime identity markers", () => {
	test("qualifyAgentId prefixes the domain when present", () => {
		expect(qualifyAgentId("worker", "coding")).toBe("coding/worker");
	});

	test("qualifyAgentId leaves IDs unchanged without a domain", () => {
		expect(qualifyAgentId("worker")).toBe("worker");
	});

	test("buildAgentIdentityMarker emits hidden marker format", () => {
		expect(buildAgentIdentityMarker("cody")).toBe(
			"<!-- COSMONAUTS_AGENT_ID:cody -->",
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

	test("extractAgentIdFromSystemPrompt uses the last marker", () => {
		const systemPrompt = [
			"header",
			"<!-- COSMONAUTS_AGENT_ID:worker -->",
			"prompt body",
			"<!-- COSMONAUTS_AGENT_ID:cody -->",
			"footer",
		].join("\n");
		expect(extractAgentIdFromSystemPrompt(systemPrompt)).toBe("cody");
	});

	test("extractAgentIdFromSystemPrompt returns undefined when marker missing", () => {
		expect(extractAgentIdFromSystemPrompt("no marker")).toBeUndefined();
	});

	test("buildAgentIdentityMarker supports qualified IDs", () => {
		expect(buildAgentIdentityMarker("coding/worker")).toBe(
			"<!-- COSMONAUTS_AGENT_ID:coding/worker -->",
		);
	});

	test("extractAgentIdFromSystemPrompt extracts qualified ID", () => {
		const systemPrompt =
			"header\n<!-- COSMONAUTS_AGENT_ID:coding/worker -->\nfooter";
		expect(extractAgentIdFromSystemPrompt(systemPrompt)).toBe("coding/worker");
	});

	test("extractAgentIdFromSystemPrompt uses last marker with qualified IDs", () => {
		const systemPrompt = [
			"<!-- COSMONAUTS_AGENT_ID:shared/diagnostics -->",
			"body",
			"<!-- COSMONAUTS_AGENT_ID:coding/cody -->",
		].join("\n");
		expect(extractAgentIdFromSystemPrompt(systemPrompt)).toBe("coding/cody");
	});
});
