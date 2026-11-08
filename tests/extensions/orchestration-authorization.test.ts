import { describe, expect, test } from "vitest";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { DomainBindingResolver } from "../../lib/domains/bindings.ts";
import { DomainRegistry } from "../../lib/domains/registry.ts";
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
	test("rejects a supplied provider that differs from the registered binding", () => {
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
		).toContain("invalid binding");
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

test("a requested allowlist entry cannot grant a forged foreign actor", () => {
	const registry = new AgentRegistry([
		{ ...actor("lead", "studio"), subagents: ["studio/assembler"] },
		actor("assembler", "studio"),
		actor("assembler", "vendor"),
	]);
	expect(
		authorizeAgentStart({
			registry,
			domainContext: "studio",
			callerRole: "lead",
			targetRole: "studio/assembler",
			targetReference: reference,
		}),
	).toContain("invalid binding");
	expect(
		authorizeAgentStart({
			registry,
			domainContext: "studio",
			callerRole: "lead",
			targetRole: "vendor/assembler",
		}),
	).toContain("cannot start");
	expect(
		authorizeAgentStart({
			registry,
			domainContext: "studio",
			callerRole: "lead",
			targetRole: "studio/assembler",
		}),
	).toBeUndefined();
});

test("admits the registered provider through requested authority and checks actor consistency", () => {
	const bindingResolver = new DomainBindingResolver({
		registry: new DomainRegistry(
			["studio", "vendor", "host"].map((id) => ({
				manifest: { id, description: id },
				portable: false,
				agents: new Map(),
				capabilities: new Set(),
				prompts: new Set(),
				skills: new Set(),
				extensions: new Set(),
				chains: [],
				provenance: [],
				rootDirs: [],
			})),
		),
		projectBindings: { studio: "vendor" },
	});
	const registry = new AgentRegistry(
		[
			{ ...actor("lead", "host"), subagents: ["studio/assembler"] },
			actor("assembler", "vendor"),
		],
		{ bindingResolver },
	);
	const request = {
		registry,
		domainContext: "host",
		callerRole: "lead",
		targetRole: "display",
		targetReference: reference,
	};
	expect(authorizeAgentStart(request)).toBeUndefined();
	expect(
		authorizeAgentStart({
			...request,
			targetReference: {
				...reference,
				requested: { ...reference.requested, agentId: "other" },
			},
		}),
	).toContain("invalid binding");
	registry.register({ ...actor("lead", "host"), subagents: [] });
	expect(authorizeAgentStart(request)).toContain("cannot start");
});
test("refuses a reference when the requested identity is not registered", () => {
	const registry = new AgentRegistry([
		{ ...actor("lead", "host"), subagents: ["studio/assembler"] },
		actor("assembler", "vendor"),
	]);
	expect(
		authorizeAgentStart({
			registry,
			domainContext: "host",
			callerRole: "lead",
			targetRole: "display",
			targetReference: reference,
		}),
	).toContain("invalid binding");
});
