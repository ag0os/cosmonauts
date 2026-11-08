import { expect, test, vi } from "vitest";
import { resolveEffectiveProjectSkills } from "../../lib/agents/skills.ts";
import { DomainRegistry } from "../../lib/domains/registry.ts";
import { DomainResolver } from "../../lib/domains/resolver.ts";
import type { LoadedDomain } from "../../lib/domains/types.ts";

const mocks = vi.hoisted(() => ({ discover: vi.fn() }));
vi.mock("../../lib/skills/discovery.ts", () => ({
	discoverSkills: mocks.discover,
}));

test("directory skill lookup never invents fallback providers and needs a root to use supplied ids", async () => {
	mocks.discover.mockImplementation(async (domains) => {
		expect(domains).toEqual([]);
		return [];
	});
	expect(
		await resolveEffectiveProjectSkills({
			projectSkills: ["project"],
			domainsDir: "/consumer",
		}),
	).toEqual(["project"]);
	expect(
		await resolveEffectiveProjectSkills({
			projectSkills: ["project"],
			fallbackDomains: ["support"],
		}),
	).toEqual(["project"]);
});

test("owned private skill lookup uses its identity domain and no undeclared extra skill paths", async () => {
	const own: LoadedDomain = {
		manifest: {
			id: "studio",
			description: "Own",
			internal: { skills: ["private"] },
		},
		portable: false,
		agents: new Map(),
		capabilities: new Set(),
		prompts: new Set(),
		extensions: new Set(),
		skills: new Set(["private"]),
		chains: [],
		provenance: [],
		rootDirs: ["/consumer/studio"],
	};
	mocks.discover.mockImplementation(async (domains, paths, options) => {
		if (!domains.length) return [];
		expect(domains).toEqual([own]);
		expect(paths).toEqual([]);
		expect(options).toEqual({ domainContext: "studio" });
		return [{ name: "private" }];
	});
	expect(
		await resolveEffectiveProjectSkills({
			resolver: new DomainResolver(new DomainRegistry([own])),
			projectSkills: ["project"],
			agent: { domain: "studio", skills: ["private"] },
		}),
	).toEqual(["private", "project"]);
});
