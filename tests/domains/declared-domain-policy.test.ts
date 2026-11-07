import { join } from "node:path";
import { expect, test } from "vitest";
import { DomainRegistry } from "../../lib/domains/registry.ts";
import { DomainResolver } from "../../lib/domains/resolver.ts";
import type { DomainManifest, LoadedDomain } from "../../lib/domains/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("declared-domain-policy-");
function domain(
	manifest: DomainManifest,
	resources: string[] = ["common"],
): LoadedDomain {
	return {
		manifest,
		portable: manifest.portable ?? false,
		agents: new Map(),
		capabilities: new Set(resources),
		prompts: new Set(resources),
		skills: new Set(resources),
		extensions: new Set(resources),
		chains: [],
		provenance: [],
		rootDirs: [join(tmp.path, manifest.id)],
	};
}

test("registry and path resolution share declared own, portable and fallback precedence", () => {
	const fallback = domain({
		id: "z-support",
		description: "Fallback",
		resourceFallback: true,
		portable: true,
	});
	const portable = domain({
		id: "a-toolkit",
		description: "Portable",
		portable: true,
	});
	const own = domain({ id: "workspace", description: "Own" });
	const registry = new DomainRegistry([fallback, portable, own]);
	const resolver = new DomainResolver(registry);
	for (const [preferred, expected] of [
		["workspace", own],
		[undefined, portable],
		["z-support", portable],
	] as const) {
		expect(registry.resolveCapability("common", preferred)).toBe(expected);
		expect(resolver.resolveCapabilityPath("common", preferred)).toBe(
			join(tmp.path, expected.manifest.id, "capabilities", "common.md"),
		);
		expect(resolver.resolvePersonaPath("common", preferred)).toBe(
			join(tmp.path, expected.manifest.id, "prompts", "common.md"),
		);
		expect(resolver.resolveExtensionPath("common", preferred)).toBe(
			join(tmp.path, expected.manifest.id, "extensions", "common"),
		);
	}
});

test("a fallback needs no special name or portable grant and remains last for its own lookup", () => {
	const fallback = domain({
		id: "support",
		description: "Fallback",
		resourceFallback: true,
	});
	const registry = new DomainRegistry([
		fallback,
		domain({ id: "workspace", description: "Own" }, []),
	]);
	expect(registry.resolveCapability("common", "workspace")).toBe(fallback);
	expect(registry.resourceOrder("support")).toEqual([fallback]);
	expect(registry.listResourceFallbacks()).toEqual([fallback]);
});

test("the old shared spelling has no authority without a declared fallback trait", () => {
	const ordinary = domain({ id: "shared", description: "Ordinary" });
	const fallback = domain({
		id: "support",
		description: "Fallback",
		resourceFallback: true,
	});
	const registry = new DomainRegistry([ordinary, fallback]);
	expect(registry.resolveCapability("common")).toBe(fallback);
	expect(registry.resolveCapability("common", "shared")).toBe(ordinary);
	expect(registry.resourceOrder("shared")).toEqual([ordinary, fallback]);
	expect(registry.resolveCapability("missing")).toBeUndefined();
});

test("multiple fallback providers retain declaration order and skill roots appear only once", () => {
	const first = domain({
		id: "z-support",
		description: "First",
		resourceFallback: true,
		portable: true,
	});
	const second = domain({
		id: "a-support",
		description: "Second",
		resourceFallback: true,
	});
	const own = domain({ id: "workspace", description: "Own" });
	const registry = new DomainRegistry([first, own, second]);
	expect(registry.resourceOrder()).toEqual([first, second]);
	expect(registry.resolveCapability("common")).toBe(first);
	expect(new DomainResolver(registry).allSkillDirs()).toEqual(
		[own, first, second].map((d) => join(tmp.path, d.manifest.id, "skills")),
	);
});
