/**
 * Tests for the bundled lean domain: discovery beside coding, agent
 * validation, prompt budgets, chain resolution in the orchestration
 * extension's runtime, and coexistence with coding's unqualified role lookups.
 */

import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authorizeAgentStart } from "../../domains/shared/extensions/orchestration/authorization.ts";
import {
	type AgentRegistry,
	createRegistryFromDomains,
} from "../../lib/agents/resolver.ts";
import { loadDomainsFromSources } from "../../lib/domains/loader.ts";
import type { LoadedDomain } from "../../lib/domains/types.ts";
import { validateDomains } from "../../lib/domains/validator.ts";
import { parseChain } from "../../lib/orchestration/chain-parser.ts";
import { getModelForRole } from "../../lib/orchestration/model-resolution.ts";
import { resolveSpawnAgent } from "../../lib/orchestration/spawn-resolution.ts";
import {
	discoverBundledPackageDirs,
	discoverFrameworkBundledPackageDirs,
} from "../../lib/packages/dev-bundled.ts";
import { CosmonautsRuntime } from "../../lib/runtime.ts";

const REPOSITORY_ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const BUNDLED_DIR = join(REPOSITORY_ROOT, "bundled");
const LEAN_PROMPTS_DIR = join(BUNDLED_DIR, "lean", "prompts");
const PROMPT_WORD_LIMIT = 400;

let domains: LoadedDomain[] = [];
let lean: LoadedDomain;
let registry: AgentRegistry;

beforeAll(async () => {
	const bundledDirs = await discoverBundledPackageDirs(BUNDLED_DIR);
	domains = await loadDomainsFromSources([
		{
			domainsDir: join(REPOSITORY_ROOT, "domains"),
			origin: "framework",
			precedence: 1,
		},
		...bundledDirs.map((domainsDir) => ({
			domainsDir,
			sourceType: "domain-root" as const,
			origin: "bundled",
			precedence: 2,
		})),
	]);
	const found = domains.find((domain) => domain.manifest.id === "lean");
	if (!found) throw new Error("Lean domain not loaded");
	lean = found;
	registry = createRegistryFromDomains(domains);
});

function countWords(text: string): number {
	return text.split(/\s+/).filter((word) => word.length > 0).length;
}

describe("lean domain", () => {
	it("is discovered as a bundled package beside coding", async () => {
		const packageNames = (await discoverBundledPackageDirs(BUNDLED_DIR)).map(
			(dir) => basename(dir),
		);

		expect(packageNames).toEqual(expect.arrayContaining(["coding", "lean"]));
		expect(domains.map((domain) => domain.manifest.id)).toEqual(
			expect.arrayContaining(["coding", "lean"]),
		);
	});

	it("names lead as its lead and ships four roles", () => {
		expect(lean.manifest.lead).toBe("lead");
		expect([...lean.agents.keys()].sort()).toEqual([
			"builder",
			"checker",
			"code-reviewer",
			"lead",
		]);
	});

	it("passes domain validation with no diagnostics", () => {
		const diagnostics = validateDomains(domains).filter(
			(diagnostic) => diagnostic.domain === "lean",
		);

		expect(diagnostics).toEqual([]);
	});

	it("keeps every persona prompt within the word budget", async () => {
		const files = (await readdir(LEAN_PROMPTS_DIR)).filter((file) =>
			file.endsWith(".md"),
		);
		expect(files).toHaveLength(lean.agents.size);

		for (const file of files) {
			const text = await readFile(join(LEAN_PROMPTS_DIR, file), "utf-8");
			expect(countWords(text), file).toBeLessThanOrEqual(PROMPT_WORD_LIMIT);
		}
	});

	it("resolves every chain stage to a lean agent through a qualified id", () => {
		expect(lean.chains.map((chain) => chain.name).sort()).toEqual([
			"build",
			"review",
		]);

		for (const chain of lean.chains) {
			const steps = parseChain(chain.chain, registry, "lean");
			for (const step of steps) {
				const stages = "kind" in step ? step.stages : [step];
				for (const stage of stages) {
					expect(stage.name).toMatch(/^lean\//);
					const result = registry.resolveReferenceResult(
						stage.name,
						"lean",
						"lean",
					);
					expect(result.kind, stage.name).toBe("found");
				}
			}
		}
	});

	it("lets the lead start every stage of its chains", () => {
		for (const chain of lean.chains) {
			for (const stage of chain.chain.split("->").map((s) => s.trim())) {
				expect(
					authorizeAgentStart({
						registry,
						domainContext: "lean",
						callerRole: "lean/lead",
						targetRole: stage,
					}),
				).toBeUndefined();
			}
		}
	});
});

describe("coding beside lean", () => {
	it.each([
		"reviewer",
		"verifier",
	])("resolves bare %s from coding to coding's own agent", (role) => {
		const result = registry.resolveReferenceResult(role, undefined, "coding");

		expect(result.kind).toBe("found");
		if (result.kind !== "found") return;
		expect(`${result.definition.domain}/${result.definition.id}`).toBe(
			`coding/${role}`,
		);
	});

	it.each([
		"reviewer",
		"verifier",
	])("never resolves bare %s from coding into lean", (role) => {
		const result = registry.resolveReferenceResult(role, undefined, "coding");

		expect(result.kind).toBe("found");
		if (result.kind !== "found") return;
		expect(result.definition.domain).not.toBe("lean");
	});

	it.each([
		"reviewer",
		"verifier",
	])("lets cody start bare %s without a domain context", (role) => {
		expect(
			authorizeAgentStart({
				registry,
				callerRole: "coding/cody",
				targetRole: role,
			}),
		).toBeUndefined();
	});
});

describe("lean roles in the orchestration extension's runtime", () => {
	let projectRoot: string;
	let runtime: CosmonautsRuntime;

	beforeAll(async () => {
		projectRoot = await mkdtemp(join(tmpdir(), "lean-extension-runtime-"));
		// Same options as the orchestration extension: no domain override, and a
		// project without a configured domain, so domainContext is undefined.
		runtime = await CosmonautsRuntime.create({
			builtinDomainsDir: join(REPOSITORY_ROOT, "domains"),
			projectRoot,
			bundledDirs: await discoverFrameworkBundledPackageDirs(REPOSITORY_ROOT),
			includeUserSources: false,
		});
	});

	afterAll(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	function chainStages(): string[] {
		return lean.chains.flatMap((chain) =>
			chain.chain.split("->").map((stage) => stage.trim()),
		);
	}

	function leadSubagents(): readonly string[] {
		return lean.agents.get("lead")?.subagents ?? [];
	}

	it("runs without a domain context", () => {
		expect(runtime.domainContext).toBeUndefined();
	});

	it("resolves every chain stage to a lean definition at execution time", () => {
		for (const stage of chainStages()) {
			const resolution = resolveSpawnAgent(runtime.agentRegistry, {
				role: stage,
				domainContext: runtime.domainContext,
			});

			expect(resolution?.qualifiedId, stage).toBe(stage);
			expect(resolution?.definition.domain, stage).toBe("lean");
		}
	});

	it("resolves every lead subagent the way spawn_agent does", () => {
		for (const subagent of leadSubagents()) {
			const target = runtime.agentRegistry.resolveReferenceResult(
				subagent,
				runtime.domainContext,
				"lean",
			);
			const reference =
				target.kind === "found"
					? (target.reference ??
						runtime.agentRegistry.resolveReference(
							subagent,
							runtime.domainContext,
							"lean",
						)?.reference)
					: undefined;
			const resolution = resolveSpawnAgent(runtime.agentRegistry, {
				role: subagent,
				agentReference: reference,
				domainContext: runtime.domainContext,
			});

			expect(target.kind, subagent).toBe("found");
			expect(resolution?.qualifiedId, subagent).toBe(subagent);
		}
	});

	it("uses each lean role's own model rather than the fallback", () => {
		for (const role of new Set([...chainStages(), ...leadSubagents()])) {
			const definition = lean.agents.get(role.replace(/^lean\//, ""));

			expect(
				getModelForRole(
					role,
					undefined,
					runtime.agentRegistry,
					runtime.domainContext,
				),
				role,
			).toBe(definition?.model);
		}
	});

	it("runs lean/code-reviewer on its own model", () => {
		expect(
			getModelForRole(
				"lean/code-reviewer",
				undefined,
				runtime.agentRegistry,
				runtime.domainContext,
			),
		).toBe("openai-codex/gpt-5.6-sol");
	});
});
