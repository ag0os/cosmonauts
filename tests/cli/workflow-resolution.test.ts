/**
 * Tests for CLI workflow resolution — verifying that domain-provided workflows
 * are correctly aggregated and passed through to workflow listing/resolution.
 *
 * These tests validate the integration pattern used in cli/main.ts:
 * domains.flatMap(d => d.workflows) → passed to listWorkflows/resolveWorkflow.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { LoadedDomain } from "../../lib/domains/types.ts";
import { listWorkflows, resolveWorkflow } from "../../lib/workflows/loader.ts";
import type { WorkflowDefinition } from "../../lib/workflows/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("cli-workflow-resolution-");

/**
 * Helper: build domain workflows the same way cli/main.ts does.
 */
function aggregateDomainWorkflows(
	domains: Pick<LoadedDomain, "workflows">[],
): WorkflowDefinition[] {
	return domains.flatMap((d) => d.workflows);
}

describe("CLI workflow resolution — domain workflows without project config", () => {
	test("listWorkflows returns domain defaults when no config exists", async () => {
		const domains = [
			{
				workflows: [
					{
						name: "plan-and-build",
						description: "Full pipeline",
						chain: "planner -> task-manager -> coordinator -> quality-manager",
					},
					{
						name: "implement",
						description: "From existing plan",
						chain: "task-manager -> coordinator -> quality-manager",
					},
					{
						name: "verify",
						description: "Review and remediation",
						chain: "quality-manager",
					},
				],
			},
			{ workflows: [] }, // shared domain has no workflows
		];

		const domainWorkflows = aggregateDomainWorkflows(domains);
		const listed = await listWorkflows(tmp.path, domainWorkflows);

		expect(listed).toHaveLength(3);
		expect(listed.map((w) => w.name)).toEqual(
			expect.arrayContaining(["plan-and-build", "implement", "verify"]),
		);
	});

	test("resolveWorkflow finds domain workflow without project config", async () => {
		const domainWorkflows = aggregateDomainWorkflows([
			{
				workflows: [
					{
						name: "plan-and-build",
						description: "Full pipeline",
						chain: "planner -> task-manager -> coordinator -> quality-manager",
					},
				],
			},
		]);

		const wf = await resolveWorkflow(
			"plan-and-build",
			tmp.path,
			domainWorkflows,
		);

		expect(wf.name).toBe("plan-and-build");
		expect(wf.chain).toBe(
			"planner -> task-manager -> coordinator -> quality-manager",
		);
	});

	test("resolveWorkflow throws for unknown name with domain workflows", async () => {
		const domainWorkflows = aggregateDomainWorkflows([
			{
				workflows: [
					{
						name: "plan-and-build",
						description: "Full pipeline",
						chain: "planner -> coordinator",
					},
				],
			},
		]);

		await expect(
			resolveWorkflow("nonexistent", tmp.path, domainWorkflows),
		).rejects.toThrow('Unknown workflow "nonexistent"');
	});
});

describe("CLI workflow resolution — project config overrides domain workflows", () => {
	test("project config workflow overrides domain workflow on name collision", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				workflows: {
					"plan-and-build": {
						description: "Custom pipeline",
						chain: "worker",
					},
				},
			}),
		);

		const domainWorkflows = aggregateDomainWorkflows([
			{
				workflows: [
					{
						name: "plan-and-build",
						description: "Default pipeline",
						chain: "planner -> task-manager -> coordinator -> quality-manager",
					},
					{
						name: "verify",
						description: "Review",
						chain: "quality-manager",
					},
				],
			},
		]);

		const workflows = await listWorkflows(tmp.path, domainWorkflows);

		// Should have 2: overridden plan-and-build + domain verify
		expect(workflows).toHaveLength(2);

		const pab = workflows.find((w) => w.name === "plan-and-build");
		expect(pab?.chain).toBe("worker"); // project config wins
		expect(pab?.description).toBe("Custom pipeline");

		const verify = workflows.find((w) => w.name === "verify");
		expect(verify?.chain).toBe("quality-manager"); // domain default preserved
	});

	test("resolveWorkflow returns project override instead of domain default", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				workflows: {
					implement: {
						description: "Custom implement",
						chain: "coordinator",
					},
				},
			}),
		);

		const domainWorkflows = aggregateDomainWorkflows([
			{
				workflows: [
					{
						name: "implement",
						description: "Domain implement",
						chain: "task-manager -> coordinator -> quality-manager",
					},
				],
			},
		]);

		const wf = await resolveWorkflow("implement", tmp.path, domainWorkflows);

		expect(wf.chain).toBe("coordinator"); // project config wins
		expect(wf.description).toBe("Custom implement");
	});

	test("project config adds new workflows alongside domain defaults", async () => {
		await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
		await writeFile(
			join(tmp.path, ".cosmonauts", "config.json"),
			JSON.stringify({
				workflows: {
					deploy: {
						description: "Deploy workflow",
						chain: "worker",
					},
				},
			}),
		);

		const domainWorkflows = aggregateDomainWorkflows([
			{
				workflows: [
					{
						name: "plan-and-build",
						description: "Full pipeline",
						chain: "planner -> coordinator",
					},
				],
			},
		]);

		const workflows = await listWorkflows(tmp.path, domainWorkflows);

		expect(workflows).toHaveLength(2);
		expect(workflows.map((w) => w.name)).toEqual(
			expect.arrayContaining(["plan-and-build", "deploy"]),
		);
	});
});

describe("CLI workflow resolution — multiple domains", () => {
	test("aggregates workflows from multiple domains", async () => {
		const domainWorkflows = aggregateDomainWorkflows([
			{ workflows: [] }, // shared domain
			{
				workflows: [
					{
						name: "plan-and-build",
						description: "Coding pipeline",
						chain: "planner -> coordinator",
					},
					{
						name: "verify",
						description: "Review",
						chain: "quality-manager",
					},
				],
			},
		]);

		const listed = await listWorkflows(tmp.path, domainWorkflows);

		expect(listed).toHaveLength(2);
		expect(listed.map((w) => w.name)).toContain("plan-and-build");
		expect(listed.map((w) => w.name)).toContain("verify");
	});

	test("later domain workflows override earlier ones on name collision", async () => {
		// Simulates two domains both defining 'build'
		const domainWorkflows = aggregateDomainWorkflows([
			{
				workflows: [
					{
						name: "build",
						description: "Generic build",
						chain: "worker",
					},
				],
			},
			{
				workflows: [
					{
						name: "build",
						description: "Coding build",
						chain: "planner -> coordinator",
					},
				],
			},
		]);

		const listed = await listWorkflows(tmp.path, domainWorkflows);

		// The loader iterates in order, so later domain overwrites earlier
		expect(listed).toHaveLength(1);
		const build = listed.find((w) => w.name === "build");
		expect(build?.description).toBe("Coding build");
		expect(build?.chain).toBe("planner -> coordinator");
	});
});
