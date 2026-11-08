import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import worker from "../../bundled/coding/agents/worker.ts";
import cosmo from "../../domains/main/agents/cosmo.ts";
import authoredAdapter from "../../domains/shared/extensions/agent-memory/index.ts";
import architectureAdapter from "../../domains/shared/extensions/architecture-memory/index.ts";
import { resolveMemoryGrants } from "../../lib/agents/declaration.ts";
import { buildSessionParams } from "../../lib/agents/session-assembly.ts";
import { loadDomains } from "../../lib/domains/loader.ts";
import { DomainRegistry } from "../../lib/domains/registry.ts";
import { DomainResolver } from "../../lib/domains/resolver.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi } from "../helpers/mocks/index.ts";

const tmp = useTempDir("content-memory-grants-");
describe("current content memory adapters", () => {
	test("the raw authored adapter uses the consumer grant and fails closed when it is removed", async () => {
		const saved = cosmo.memory;
		try {
			const pi = createMockPi({ cwd: tmp.path });
			authoredAdapter(pi as never);
			await pi.fireEvent(
				"before_agent_start",
				{ systemPrompt: "<!-- COSMONAUTS_AGENT_ID:main/cosmo -->" },
				{ cwd: tmp.path },
			);
			expect(
				await pi.callTool("remember", {
					content: "Declared content grant",
					scope: "project",
				}),
			).toMatchObject({ details: { status: "saved" } });
			Object.assign(cosmo, { memory: undefined });
			const denied = createMockPi({ cwd: tmp.path });
			authoredAdapter(denied as never);
			await denied.fireEvent(
				"before_agent_start",
				{ systemPrompt: "<!-- COSMONAUTS_AGENT_ID:main/cosmo -->" },
				{ cwd: tmp.path },
			);
			expect(
				await denied.callTool("remember", { content: "No longer allowed" }),
			).toMatchObject({ details: { status: "unauthorized" } });
		} finally {
			Object.assign(cosmo, { memory: saved });
		}
	});

	test("the raw architecture adapter excludes a consumer whose grant is removed", async () => {
		const saved = worker.memory;
		try {
			Object.assign(worker, { memory: undefined });
			const pi = createMockPi({ cwd: tmp.path });
			architectureAdapter(pi as never);
			await pi.fireEvent(
				"before_agent_start",
				{ systemPrompt: "<!-- COSMONAUTS_AGENT_ID:coding/worker -->" },
				{ cwd: tmp.path },
			);
			expect(await pi.callTool("architecture_map_read", {})).toMatchObject({
				details: { status: "scope-ineligible" },
			});
		} finally {
			Object.assign(worker, { memory: saved });
		}
	});
});

// Direct module imports deliberately bypass the proposed loader guard.
// Removing that policy must not remove the pin on the content migration itself.
test("shipped content never selects obsolete memory extensions independently of loader validation", async () => {
	for (const root of [
		"domains/main/agents",
		"bundled/coding/agents",
		"bundled/lean/agents",
	]) {
		for (const file of await readdir(resolve(root))) {
			if (!file.endsWith(".ts")) continue;
			const { default: definition } = await import(resolve(root, file));
			expect(definition.extensions, `${root}/${file}`).not.toContain(
				"agent-memory",
			);
			expect(definition.extensions, `${root}/${file}`).not.toContain(
				"architecture-memory",
			);
		}
	}
});

// Derived from the base providers actually selected, not the now-removed id allowlist.
const BASE_GRANTS: Record<string, readonly string[]> = {
	"main/cosmo": ["authored", "episodes"],
	"coding/cody": ["episodes"],
	"coding/coordinator": ["architecture", "episodes"],
	"coding/distiller": ["proposals"],
	"coding/explorer": [],
	"coding/fixer": [],
	"coding/integration-verifier": ["episodes"],
	"coding/performance-reviewer": [],
	"coding/plan-reviewer": ["architecture", "episodes"],
	"coding/planner": ["architecture", "episodes"],
	"coding/quality-manager": [],
	"coding/refactorer": ["episodes"],
	"coding/reviewer": [],
	"coding/security-reviewer": [],
	"coding/spec-writer": ["episodes"],
	"coding/task-manager": ["episodes"],
	"coding/ux-reviewer": [],
	"coding/verifier": [],
	"coding/worker": ["architecture", "episodes"],
	"lean/lead": [],
	"lean/builder": [],
	"lean/checker": [],
	"lean/code-reviewer": [],
};

test("shipped declarations retain exactly their base-derived memory surface", async () => {
	const domains = [
		...(await loadDomains(resolve("domains"))),
		...(await loadDomains(resolve("bundled"))),
	];
	const found = Object.fromEntries(
		domains.flatMap((domain) =>
			[...domain.agents.values()].map((def) => {
				const key = `${def.domain}/${def.id}`;
				const expected = BASE_GRANTS[key];
				expect(expected, key).toBeDefined();
				if (!expected) throw new Error(`Unexpected shipped agent ${key}`);
				expect(resolveMemoryGrants(def.memory), key).toEqual({
					knowledge: true,
					authored: expected.includes("authored"),
					proposals: expected.includes("proposals"),
					architecture: expected.includes("architecture"),
					episodes: expected.includes("episodes"),
				});
				return [key, def];
			}),
		),
	);
	expect(Object.keys(found).sort()).toEqual(Object.keys(BASE_GRANTS).sort());
	const distiller = found["coding/distiller"];
	if (!distiller) throw new Error("Missing shipped distiller");
	const assembled = await buildSessionParams({
		def: distiller,
		cwd: tmp.path,
		resolver: new DomainResolver(new DomainRegistry(domains)),
		loadConfig: async () => ({ knowledgeSurface: { enabled: true } }),
	});
	const pi = createMockPi({
		cwd: tmp.path,
		systemPrompt: assembled.promptContent,
	});
	for (const ext of assembled.extensionFactories)
		await (typeof ext === "function" ? ext : ext.factory)(pi as never);
	const result = await pi.callTool("propose_knowledge", {
		planSlug: "surface",
		type: "decision",
		title: "Preserve writer",
		description: "Existing identity",
		content: "The consumer owns its declaration.",
		tags: [],
		source: "missions/plans/surface/plan.md",
		sourceDate: "2026-11-07T00:00:00.000Z",
	});
	expect(result).toMatchObject({
		details: { status: "written", record: { writer: "coding/distiller" } },
	});
});
