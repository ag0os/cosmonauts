import { describe, expect, test } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { authorizeAgentStart } from "../../lib/extensions/orchestration/authorization.ts";

const actor = (id: string, domain: string): AgentDefinition => ({
	id,
	domain,
	description: "Consumer actor",
	model: "test/model",
	tools: "none",
	capabilities: [],
	extensions: [],
	skills: [],
	projectContext: false,
	session: "ephemeral",
	loop: false,
});
const reference = {
	requested: {
		role: "studio",
		agentId: "assembler",
		qualifiedId: "studio/assembler",
	},
	resolved: {
		role: "vendor",
		agentId: "assembler",
		qualifiedId: "vendor/assembler",
	},
	binding: { role: "studio", domainId: "vendor", source: "default" as const },
};

describe("bound chain admission", () => {
	test("authorizes the frozen provider instead of re-resolving the display name", () => {
		const registry = new AgentRegistry([
			{ ...actor("leader", "host"), subagents: ["vendor/assembler"] },
			actor("assembler", "studio"),
			actor("assembler", "vendor"),
		]);
		expect(
			authorizeAgentStart({
				registry,
				domainContext: "host",
				callerRole: "leader",
				targetRole: "studio/assembler",
				targetReference: reference,
			}),
		).toBeUndefined();
		expect(
			authorizeAgentStart({
				registry,
				domainContext: "host",
				callerRole: "leader",
				targetRole: "studio/assembler",
			}),
		).toContain("cannot start");
	});

	test("refuses an unavailable frozen provider even when the live name is available", () => {
		const registry = new AgentRegistry([
			{ ...actor("leader", "host"), subagents: ["studio/assembler"] },
			actor("assembler", "studio"),
		]);
		expect(
			authorizeAgentStart({
				registry,
				domainContext: "host",
				callerRole: "leader",
				targetRole: "studio/assembler",
				targetReference: reference,
			}),
		).toContain("unavailable or internal");
	});

	test("refuses an inconsistent requested and resolved actor before allowlist admission", () => {
		const registry = new AgentRegistry([
			{ ...actor("leader", "host"), subagents: ["vendor/assembler"] },
			actor("assembler", "vendor"),
		]);
		expect(
			authorizeAgentStart({
				registry,
				domainContext: "host",
				callerRole: "leader",
				targetRole: "studio/assembler",
				targetReference: {
					...reference,
					requested: { ...reference.requested, agentId: "other" },
				},
			}),
		).toContain("invalid binding");
	});
});
