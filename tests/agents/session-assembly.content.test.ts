import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, vi } from "vitest";
import { buildSessionParams } from "../../lib/agents/session-assembly.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { loadDomainsFromSources } from "../../lib/domains/loader.ts";
import { DomainRegistry } from "../../lib/domains/registry.ts";
import { DomainResolver } from "../../lib/domains/resolver.ts";
import { qualityReviewPolicyFor } from "../../lib/orchestration/quality-review-profile.ts";
import { CosmonautsRuntime } from "../../lib/runtime.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi } from "../helpers/mocks/index.ts";

vi.mock("@earendil-works/pi-ai/providers/all", () => ({
	builtinModels: () => ({
		getModel: (provider: string, id: string) => ({ provider, id }),
	}),
}));
const tmp = useTempDir("session-assembly-content-");

test("does not give an ordinary reviewer session the quality child profile", async () => {
	const def: AgentDefinition = {
		id: "reviewer",
		domain: "coding",
		description: "Ordinary reviewer",
		instructions: { kind: "inline", content: "Review the supplied input." },
		model: "anthropic/test-sonnet",
		tools: "coding",
		memory: {},
		capabilities: [],
		extensions: [],
		skills: [],
		projectContext: false,
		session: "ephemeral",
		loop: false,
	};
	const options = { def, cwd: tmp.path, domainsDir: join(tmp.path, "absent") };
	const ordinary = await buildSessionParams(options);
	const panel = await buildSessionParams({
		...options,
		sessionPolicy: qualityReviewPolicyFor(def, true),
	});
	expect(ordinary.sessionPolicy).toBeUndefined();
	expect(ordinary.tools).toContain("bash");
	expect(panel.sessionPolicy?.toolPreset).toBe("readonly");
	expect(panel.tools).toEqual(["read", "grep", "find", "ls"]);
});

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const REPO_DOMAINS_DIR = join(REPO_ROOT, "domains");

test("composes exactly one framework recall for every shipped definition", async () => {
	const loadedDomains = await loadDomainsFromSources([
		{
			domainsDir: REPO_DOMAINS_DIR,
			origin: "builtin",
			precedence: 1,
		},
		{
			domainsDir: join(REPO_ROOT, "bundled", "coding"),
			sourceType: "domain-root",
			origin: "bundled",
			precedence: 2,
		},
	]);
	const resolver = new DomainResolver(new DomainRegistry(loadedDomains));
	const definitions = loadedDomains.flatMap((domain) =>
		[...domain.agents.values()].map((definition) => ({
			...definition,
			domain: domain.manifest.id,
		})),
	);

	for (const def of definitions) {
		const params = await buildSessionParams({
			runtime: await CosmonautsRuntime.create({
				projectRoot: tmp.path,
				projectConfig: { knowledgeSurface: { enabled: true } },
				domains: loadedDomains,
			}),
			def,
			cwd: tmp.path,
			domainsDir: REPO_DOMAINS_DIR,
			resolver,
			loadConfig: async () => ({
				knowledgeSurface: { enabled: true },
			}),
		});
		const inline = params.extensionFactories[0];
		if (!inline || typeof inline === "function") {
			throw new Error(`Expected named inline extension for ${def.id}`);
		}
		const pi = createMockPi({ cwd: tmp.path });
		pi.registerTool({
			name: "unrelated",
			execute: async () => ({ content: [], details: { status: "ok" } }),
		});
		await inline.factory(pi as never);

		expect(
			[...pi.tools.keys()].filter((name) => name === "recall"),
			def.id,
		).toHaveLength(1);
		expect(pi.tools.has("unrelated"), def.id).toBe(true);
		expect(
			((await pi.callTool("unrelated", {})) as { details: unknown }).details,
		).toEqual({ status: "ok" });
	}
});
