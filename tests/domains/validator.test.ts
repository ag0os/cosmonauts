import { describe, expect, it } from "vitest";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import type { LoadedDomain } from "../../lib/domains/types.ts";
import {
	DomainValidationError,
	validateDomains,
} from "../../lib/domains/validator.ts";

/** Create a minimal agent definition with overrides. */
function makeAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
	return {
		id: "test-agent",
		description: "Test agent",
		capabilities: [],
		model: "test/model",
		tools: "none",
		extensions: [],
		skills: ["*"],
		projectContext: false,
		session: "ephemeral",
		loop: false,
		...overrides,
	};
}

/** Create a minimal LoadedDomain with overrides. */
function makeDomain(overrides: Partial<LoadedDomain> = {}): LoadedDomain {
	return {
		manifest: { id: "test", description: "Test domain" },
		portable: false,
		agents: new Map(),
		capabilities: new Set(),
		prompts: new Set(),
		skills: new Set(),
		extensions: new Set(),
		workflows: [],
		rootDirs: ["/tmp/test"],
		...overrides,
	};
}

/** Create a shared domain with overrides. */
function makeShared(overrides: Partial<LoadedDomain> = {}): LoadedDomain {
	return makeDomain({
		manifest: { id: "shared", description: "Shared domain" },
		...overrides,
	});
}

describe("validateDomains", () => {
	it("returns empty diagnostics for valid domains", () => {
		const shared = makeShared({
			capabilities: new Set(["core"]),
		});
		const coding = makeDomain({
			manifest: { id: "coding", description: "Coding domain" },
			agents: new Map([
				[
					"worker",
					makeAgent({
						id: "worker",
						capabilities: ["core"],
					}),
				],
			]),
			prompts: new Set(["worker"]),
		});

		const diagnostics = validateDomains([shared, coding]);
		expect(diagnostics).toEqual([]);
	});

	describe("Rule 1: Persona prompt exists", () => {
		it("reports error when non-shared agent lacks persona prompt", () => {
			const shared = makeShared();
			const coding = makeDomain({
				manifest: { id: "coding", description: "Coding" },
				agents: new Map([["worker", makeAgent({ id: "worker" })]]),
				prompts: new Set(), // no "worker" prompt
			});

			const diagnostics = validateDomains([shared, coding]);
			const match = diagnostics.find(
				(d) => d.agent === "worker" && d.message.includes("persona prompt"),
			);
			expect(match).toBeDefined();
			expect(match?.severity).toBe("error");
			expect(match?.domain).toBe("coding");
		});

		it("passes when persona prompt exists", () => {
			const shared = makeShared();
			const coding = makeDomain({
				manifest: { id: "coding", description: "Coding" },
				agents: new Map([["worker", makeAgent({ id: "worker" })]]),
				prompts: new Set(["worker"]),
			});

			const diagnostics = validateDomains([shared, coding]);
			const match = diagnostics.find(
				(d) => d.agent === "worker" && d.message.includes("persona prompt"),
			);
			expect(match).toBeUndefined();
		});

		it("skips persona check for shared domain agents", () => {
			const shared = makeShared({
				agents: new Map([["helper", makeAgent({ id: "helper" })]]),
				prompts: new Set(), // no "helper" prompt, but shared is exempt
			});

			const diagnostics = validateDomains([shared]);
			const match = diagnostics.find((d) =>
				d.message.includes("persona prompt"),
			);
			expect(match).toBeUndefined();
		});
	});

	describe("Rule 2: Capabilities resolve", () => {
		it("reports error for unresolvable capability", () => {
			const shared = makeShared({
				capabilities: new Set(["core"]),
			});
			const coding = makeDomain({
				manifest: { id: "coding", description: "Coding" },
				agents: new Map([
					[
						"worker",
						makeAgent({
							id: "worker",
							capabilities: ["core", "nonexistent"],
						}),
					],
				]),
				prompts: new Set(["worker"]),
			});

			const diagnostics = validateDomains([shared, coding]);
			const match = diagnostics.find((d) =>
				d.message.includes('"nonexistent"'),
			);
			expect(match).toBeDefined();
			expect(match?.severity).toBe("error");
			expect(match?.agent).toBe("worker");
		});

		it("passes when capability exists in own domain", () => {
			const shared = makeShared();
			const coding = makeDomain({
				manifest: { id: "coding", description: "Coding" },
				agents: new Map([
					[
						"worker",
						makeAgent({
							id: "worker",
							capabilities: ["coding-rw"],
						}),
					],
				]),
				prompts: new Set(["worker"]),
				capabilities: new Set(["coding-rw"]),
			});

			const diagnostics = validateDomains([shared, coding]);
			const match = diagnostics.find((d) => d.message.includes("Capability"));
			expect(match).toBeUndefined();
		});

		it("passes when capability exists in shared domain", () => {
			const shared = makeShared({
				capabilities: new Set(["core", "tasks"]),
			});
			const coding = makeDomain({
				manifest: { id: "coding", description: "Coding" },
				agents: new Map([
					[
						"worker",
						makeAgent({
							id: "worker",
							capabilities: ["core", "tasks"],
						}),
					],
				]),
				prompts: new Set(["worker"]),
			});

			const diagnostics = validateDomains([shared, coding]);
			const match = diagnostics.find((d) => d.message.includes("Capability"));
			expect(match).toBeUndefined();
		});

		it("passes when capability exists in a portable domain", () => {
			const shared = makeShared();
			const pkg = makeDomain({
				manifest: {
					id: "pkg",
					description: "Portable package",
					portable: true,
				},
				portable: true,
				capabilities: new Set(["portable-cap"]),
			});
			const coding = makeDomain({
				manifest: { id: "coding", description: "Coding" },
				agents: new Map([
					[
						"worker",
						makeAgent({
							id: "worker",
							capabilities: ["portable-cap"],
						}),
					],
				]),
				prompts: new Set(["worker"]),
			});

			const diagnostics = validateDomains([shared, pkg, coding]);
			const match = diagnostics.find((d) =>
				d.message.includes('"portable-cap"'),
			);
			expect(match).toBeUndefined();
		});

		it("still reports error when capability is absent from all tiers", () => {
			const shared = makeShared();
			const pkg = makeDomain({
				manifest: {
					id: "pkg",
					description: "Portable package",
					portable: true,
				},
				portable: true,
				capabilities: new Set(["other-cap"]),
			});
			const coding = makeDomain({
				manifest: { id: "coding", description: "Coding" },
				agents: new Map([
					[
						"worker",
						makeAgent({
							id: "worker",
							capabilities: ["missing-cap"],
						}),
					],
				]),
				prompts: new Set(["worker"]),
			});

			const diagnostics = validateDomains([shared, pkg, coding]);
			const match = diagnostics.find((d) =>
				d.message.includes('"missing-cap"'),
			);
			expect(match).toBeDefined();
			expect(match?.severity).toBe("error");
		});
	});

	describe("Rule 3: Extensions resolve", () => {
		it("reports error for unresolvable extension", () => {
			const shared = makeShared({
				extensions: new Set(["tasks"]),
			});
			const coding = makeDomain({
				manifest: { id: "coding", description: "Coding" },
				agents: new Map([
					[
						"worker",
						makeAgent({
							id: "worker",
							extensions: ["tasks", "missing-ext"],
						}),
					],
				]),
				prompts: new Set(["worker"]),
			});

			const diagnostics = validateDomains([shared, coding]);
			const match = diagnostics.find((d) =>
				d.message.includes('"missing-ext"'),
			);
			expect(match).toBeDefined();
			expect(match?.severity).toBe("error");
			expect(match?.agent).toBe("worker");
		});

		it("passes when extension exists in own domain", () => {
			const shared = makeShared();
			const coding = makeDomain({
				manifest: { id: "coding", description: "Coding" },
				agents: new Map([
					[
						"worker",
						makeAgent({
							id: "worker",
							extensions: ["custom-ext"],
						}),
					],
				]),
				prompts: new Set(["worker"]),
				extensions: new Set(["custom-ext"]),
			});

			const diagnostics = validateDomains([shared, coding]);
			const match = diagnostics.find((d) => d.message.includes("Extension"));
			expect(match).toBeUndefined();
		});

		it("passes when extension exists in shared domain", () => {
			const shared = makeShared({
				extensions: new Set(["tasks", "todo"]),
			});
			const coding = makeDomain({
				manifest: { id: "coding", description: "Coding" },
				agents: new Map([
					[
						"worker",
						makeAgent({
							id: "worker",
							extensions: ["tasks"],
						}),
					],
				]),
				prompts: new Set(["worker"]),
			});

			const diagnostics = validateDomains([shared, coding]);
			const match = diagnostics.find((d) => d.message.includes("Extension"));
			expect(match).toBeUndefined();
		});

		it("passes when extension exists in a portable domain", () => {
			const shared = makeShared();
			const pkg = makeDomain({
				manifest: {
					id: "pkg",
					description: "Portable package",
					portable: true,
				},
				portable: true,
				extensions: new Set(["portable-ext"]),
			});
			const coding = makeDomain({
				manifest: { id: "coding", description: "Coding" },
				agents: new Map([
					[
						"worker",
						makeAgent({
							id: "worker",
							extensions: ["portable-ext"],
						}),
					],
				]),
				prompts: new Set(["worker"]),
			});

			const diagnostics = validateDomains([shared, pkg, coding]);
			const match = diagnostics.find((d) =>
				d.message.includes('"portable-ext"'),
			);
			expect(match).toBeUndefined();
		});
	});

	describe("Rule 4: Subagent entries resolve", () => {
		it("reports warning for unresolvable subagent", () => {
			const shared = makeShared();
			const coding = makeDomain({
				manifest: { id: "coding", description: "Coding" },
				agents: new Map([
					[
						"coordinator",
						makeAgent({
							id: "coordinator",
							subagents: ["worker", "ghost-agent"],
						}),
					],
					["worker", makeAgent({ id: "worker" })],
				]),
				prompts: new Set(["coordinator", "worker"]),
			});

			const diagnostics = validateDomains([shared, coding]);
			const match = diagnostics.find((d) =>
				d.message.includes('"ghost-agent"'),
			);
			expect(match).toBeDefined();
			expect(match?.severity).toBe("warning");
			expect(match?.agent).toBe("coordinator");
		});

		it("passes when subagent exists in another domain", () => {
			const shared = makeShared({
				agents: new Map([["helper", makeAgent({ id: "helper" })]]),
			});
			const coding = makeDomain({
				manifest: { id: "coding", description: "Coding" },
				agents: new Map([
					[
						"coordinator",
						makeAgent({
							id: "coordinator",
							subagents: ["helper"],
						}),
					],
				]),
				prompts: new Set(["coordinator"]),
			});

			const diagnostics = validateDomains([shared, coding]);
			const match = diagnostics.find((d) => d.message.includes("Subagent"));
			expect(match).toBeUndefined();
		});

		it("passes when subagent is domain-qualified", () => {
			const shared = makeShared();
			const coding = makeDomain({
				manifest: { id: "coding", description: "Coding" },
				agents: new Map([
					[
						"coordinator",
						makeAgent({
							id: "coordinator",
							subagents: ["coding/worker"],
						}),
					],
					["worker", makeAgent({ id: "worker" })],
				]),
				prompts: new Set(["coordinator", "worker"]),
			});

			const diagnostics = validateDomains([shared, coding]);
			const match = diagnostics.find(
				(d) =>
					d.agent === "coordinator" && d.message.includes('"coding/worker"'),
			);
			expect(match).toBeUndefined();
		});

		it("passes when agent has no subagents", () => {
			const shared = makeShared();
			const coding = makeDomain({
				manifest: { id: "coding", description: "Coding" },
				agents: new Map([["worker", makeAgent({ id: "worker" })]]),
				prompts: new Set(["worker"]),
			});

			const diagnostics = validateDomains([shared, coding]);
			const match = diagnostics.find((d) => d.message.includes("Subagent"));
			expect(match).toBeUndefined();
		});
	});

	describe("Rule 4b: Portable domain capability overlap warning", () => {
		it("emits a warning when two portable domains provide the same capability", () => {
			const shared = makeShared();
			const pkg1 = makeDomain({
				manifest: {
					id: "pkg1",
					description: "Portable 1",
					portable: true,
				},
				portable: true,
				capabilities: new Set(["shared-cap"]),
			});
			const pkg2 = makeDomain({
				manifest: {
					id: "pkg2",
					description: "Portable 2",
					portable: true,
				},
				portable: true,
				capabilities: new Set(["shared-cap"]),
			});

			const diagnostics = validateDomains([shared, pkg1, pkg2]);
			const overlap = diagnostics.find(
				(d) =>
					d.message.includes('"shared-cap"') &&
					d.message.includes("multiple portable domains"),
			);
			expect(overlap).toBeDefined();
			expect(overlap?.severity).toBe("warning");
			expect(overlap?.message).toContain("pkg1");
			expect(overlap?.message).toContain("pkg2");
		});

		it("does not warn when only one portable domain provides a capability", () => {
			const shared = makeShared();
			const pkg = makeDomain({
				manifest: {
					id: "pkg",
					description: "Portable",
					portable: true,
				},
				portable: true,
				capabilities: new Set(["unique-cap"]),
			});

			const diagnostics = validateDomains([shared, pkg]);
			const overlap = diagnostics.find(
				(d) =>
					d.severity === "warning" &&
					d.message.includes("multiple portable domains"),
			);
			expect(overlap).toBeUndefined();
		});

		it("does not warn for shared domain capabilities even if shared is marked portable", () => {
			// shared is always excluded from portable overlap checks
			const shared: LoadedDomain = {
				manifest: { id: "shared", description: "Shared", portable: true },
				portable: true,
				agents: new Map(),
				capabilities: new Set(["core"]),
				prompts: new Set(),
				skills: new Set(),
				extensions: new Set(),
				workflows: [],
				rootDirs: ["/tmp/shared"],
			};
			const pkg = makeDomain({
				manifest: {
					id: "pkg",
					description: "Portable",
					portable: true,
				},
				portable: true,
				capabilities: new Set(["core"]),
			});

			const diagnostics = validateDomains([shared, pkg]);
			const overlap = diagnostics.find(
				(d) =>
					d.severity === "warning" &&
					d.message.includes("multiple portable domains"),
			);
			expect(overlap).toBeUndefined();
		});
	});

	describe("Rule 5: Domain lead resolves", () => {
		it("reports error when lead is not in domain agents", () => {
			const domain = makeDomain({
				manifest: {
					id: "coding",
					description: "Coding",
					lead: "nonexistent-lead",
				},
				agents: new Map([["worker", makeAgent({ id: "worker" })]]),
				prompts: new Set(["worker"]),
			});

			const diagnostics = validateDomains([domain]);
			const match = diagnostics.find((d) =>
				d.message.includes('"nonexistent-lead"'),
			);
			expect(match).toBeDefined();
			expect(match?.severity).toBe("error");
			expect(match?.domain).toBe("coding");
		});

		it("passes when lead exists in domain agents", () => {
			const domain = makeDomain({
				manifest: {
					id: "coding",
					description: "Coding",
					lead: "cody",
				},
				agents: new Map([["cody", makeAgent({ id: "cody" })]]),
				prompts: new Set(["cody"]),
			});

			const diagnostics = validateDomains([domain]);
			const match = diagnostics.find((d) => d.message.includes("Lead agent"));
			expect(match).toBeUndefined();
		});

		it("passes when lead is not specified", () => {
			const domain = makeDomain({
				manifest: { id: "coding", description: "Coding" },
			});

			const diagnostics = validateDomains([domain]);
			const match = diagnostics.find((d) => d.message.includes("Lead agent"));
			expect(match).toBeUndefined();
		});
	});

	describe("Rule 6: Workflow agents resolve", () => {
		it("reports warning for unresolvable workflow stage", () => {
			const shared = makeShared();
			const coding = makeDomain({
				manifest: { id: "coding", description: "Coding" },
				agents: new Map([["planner", makeAgent({ id: "planner" })]]),
				prompts: new Set(["planner"]),
				workflows: [
					{
						name: "full-pipeline",
						description: "Full",
						chain: "planner -> unknown-agent -> worker",
					},
				],
			});

			const diagnostics = validateDomains([shared, coding]);
			const warnings = diagnostics.filter(
				(d) => d.workflow === "full-pipeline",
			);
			// "unknown-agent" and "worker" are both unresolvable
			expect(warnings.length).toBe(2);
			expect(warnings.every((d) => d.severity === "warning")).toBe(true);
			expect(warnings.some((d) => d.message.includes('"unknown-agent"'))).toBe(
				true,
			);
			expect(warnings.some((d) => d.message.includes('"worker"'))).toBe(true);
		});

		it("passes when all workflow stages are known agents", () => {
			const shared = makeShared({
				agents: new Map([["planner", makeAgent({ id: "planner" })]]),
			});
			const coding = makeDomain({
				manifest: { id: "coding", description: "Coding" },
				agents: new Map([["worker", makeAgent({ id: "worker" })]]),
				prompts: new Set(["worker"]),
				workflows: [
					{
						name: "build",
						description: "Build",
						chain: "planner -> worker",
					},
				],
			});

			const diagnostics = validateDomains([shared, coding]);
			const match = diagnostics.find((d) =>
				d.message.includes("Workflow stage"),
			);
			expect(match).toBeUndefined();
		});

		it("passes when workflow stages are domain-qualified", () => {
			const shared = makeShared();
			const coding = makeDomain({
				manifest: { id: "coding", description: "Coding" },
				agents: new Map([
					["planner", makeAgent({ id: "planner" })],
					["worker", makeAgent({ id: "worker" })],
				]),
				prompts: new Set(["planner", "worker"]),
				workflows: [
					{
						name: "build",
						description: "Build",
						chain: "coding/planner -> coding/worker",
					},
				],
			});

			const diagnostics = validateDomains([shared, coding]);
			const match = diagnostics.find(
				(d) => d.workflow === "build" && d.message.includes('"coding/worker"'),
			);
			expect(match).toBeUndefined();
		});
	});
});

describe("DomainValidationError", () => {
	it("aggregates error-severity diagnostics into a human-readable message", () => {
		const diagnostics = [
			{
				domain: "coding",
				agent: "worker",
				message: 'Missing persona prompt "worker"',
				severity: "error" as const,
			},
			{
				domain: "coding",
				agent: "coordinator",
				message: 'Subagent "ghost" not found',
				severity: "warning" as const,
			},
			{
				domain: "coding",
				agent: "planner",
				message: 'Capability "missing" not found',
				severity: "error" as const,
			},
		];

		const error = new DomainValidationError(diagnostics);
		expect(error.name).toBe("DomainValidationError");
		expect(error.message).toContain("2 errors");
		expect(error.message).toContain("coding/worker");
		expect(error.message).toContain("coding/planner");
		// Warnings should be excluded
		expect(error.diagnostics).toHaveLength(2);
		expect(error.diagnostics.every((d) => d.severity === "error")).toBe(true);
	});

	it("formats singular error correctly", () => {
		const diagnostics = [
			{
				domain: "coding",
				message: 'Lead agent "x" not found',
				severity: "error" as const,
			},
		];

		const error = new DomainValidationError(diagnostics);
		expect(error.message).toContain("1 error");
		expect(error.message).not.toContain("1 errors");
	});

	it("includes workflow in formatted message", () => {
		const diagnostics = [
			{
				domain: "coding",
				workflow: "build",
				message: 'Stage "x" not found',
				severity: "error" as const,
			},
		];

		const error = new DomainValidationError(diagnostics);
		expect(error.message).toContain("workflow:build");
	});
});
