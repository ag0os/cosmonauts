import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	loadDomains,
	loadDomainsFromSources,
} from "../../lib/domains/loader.ts";
import type { DomainMergeConflict } from "../../lib/domains/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("domain-loader-");

/** Write a minimal domain.ts manifest file. */
async function writeDomainManifest(
	dir: string,
	id: string,
	extras = "",
): Promise<void> {
	await writeFile(
		join(dir, "domain.ts"),
		`export const manifest = { id: "${id}", description: "Test domain ${id}" ${extras} };\n`,
	);
}

/** Write a minimal agent definition file. */
async function writeAgentDef(agentsDir: string, id: string): Promise<void> {
	await writeFile(
		join(agentsDir, `${id}.ts`),
		`const definition = {
	id: "${id}",
	description: "Agent ${id}",
	capabilities: ["core"],
	model: "test/model",
	tools: "none",
	extensions: [],
	projectContext: false,
	session: "ephemeral",
	loop: false,
};
export default definition;
`,
	);
}

describe("loadDomains", () => {
	it("discovers domains from a directory", async () => {
		const alphaDir = join(tmp.path, "alpha");
		await mkdir(alphaDir, { recursive: true });
		await writeDomainManifest(alphaDir, "alpha");

		const domains = await loadDomains(tmp.path);
		expect(domains).toHaveLength(1);
		expect(domains[0]?.manifest.id).toBe("alpha");
	});

	it("sorts shared first, then alphabetical", async () => {
		const zetaDir = join(tmp.path, "zeta");
		const sharedDir = join(tmp.path, "shared");
		const alphaDir = join(tmp.path, "alpha");
		await mkdir(zetaDir, { recursive: true });
		await mkdir(sharedDir, { recursive: true });
		await mkdir(alphaDir, { recursive: true });
		await writeDomainManifest(zetaDir, "zeta");
		await writeDomainManifest(sharedDir, "shared");
		await writeDomainManifest(alphaDir, "alpha");

		const domains = await loadDomains(tmp.path);
		expect(domains.map((d) => d.manifest.id)).toEqual([
			"shared",
			"alpha",
			"zeta",
		]);
	});

	it("skips directories without domain.ts", async () => {
		const validDir = join(tmp.path, "valid");
		const noManifestDir = join(tmp.path, "no-manifest");
		await mkdir(validDir, { recursive: true });
		await mkdir(noManifestDir, { recursive: true });
		await writeDomainManifest(validDir, "valid");
		// no-manifest has no domain.ts

		const domains = await loadDomains(tmp.path);
		expect(domains).toHaveLength(1);
		expect(domains[0]?.manifest.id).toBe("valid");
	});

	it("loads legacy agent definitions without skills using wildcard fallback", async () => {
		const domainDir = join(tmp.path, "testdomain");
		const agentsDir = join(domainDir, "agents");
		await mkdir(agentsDir, { recursive: true });
		await writeDomainManifest(domainDir, "testdomain");
		await writeAgentDef(agentsDir, "my-agent");

		const domains = await loadDomains(tmp.path);
		expect(domains).toHaveLength(1);

		const agents = domains[0]?.agents;
		expect(agents).toBeDefined();
		if (!agents) throw new Error("Expected agents map to be defined");
		expect(agents.size).toBe(1);
		expect(agents.has("my-agent")).toBe(true);
		expect(agents.get("my-agent")?.domain).toBe("testdomain");
		expect(agents.get("my-agent")?.skills).toEqual(["*"]);
	});

	it("indexes capabilities from .md files", async () => {
		const domainDir = join(tmp.path, "caps");
		const capsDir = join(domainDir, "capabilities");
		await mkdir(capsDir, { recursive: true });
		await writeDomainManifest(domainDir, "caps");
		await writeFile(join(capsDir, "core.md"), "# Core");
		await writeFile(join(capsDir, "tasks.md"), "# Tasks");
		await writeFile(join(capsDir, "not-markdown.txt"), "skip me");

		const domains = await loadDomains(tmp.path);
		expect(domains[0]?.capabilities).toEqual(new Set(["core", "tasks"]));
	});

	it("indexes prompts from .md files", async () => {
		const domainDir = join(tmp.path, "prm");
		const promptsDir = join(domainDir, "prompts");
		await mkdir(promptsDir, { recursive: true });
		await writeDomainManifest(domainDir, "prm");
		await writeFile(join(promptsDir, "worker.md"), "# Worker");

		const domains = await loadDomains(tmp.path);
		expect(domains[0]?.prompts).toEqual(new Set(["worker"]));
	});

	it("indexes skills as subdirectories", async () => {
		const domainDir = join(tmp.path, "sk");
		const skillsDir = join(domainDir, "skills");
		await mkdir(join(skillsDir, "typescript"), { recursive: true });
		await mkdir(join(skillsDir, "python"), { recursive: true });
		await writeDomainManifest(domainDir, "sk");

		const domains = await loadDomains(tmp.path);
		expect(domains[0]?.skills).toEqual(new Set(["typescript", "python"]));
	});

	it("indexes extensions as subdirectories", async () => {
		const domainDir = join(tmp.path, "ext");
		const extDir = join(domainDir, "extensions");
		await mkdir(join(extDir, "tasks"), { recursive: true });
		await mkdir(join(extDir, "todo"), { recursive: true });
		await writeDomainManifest(domainDir, "ext");

		const domains = await loadDomains(tmp.path);
		expect(domains[0]?.extensions).toEqual(new Set(["tasks", "todo"]));
	});

	it("returns empty sets when resource directories are missing", async () => {
		const domainDir = join(tmp.path, "minimal");
		await mkdir(domainDir, { recursive: true });
		await writeDomainManifest(domainDir, "minimal");

		const domains = await loadDomains(tmp.path);
		const domain = domains[0];
		expect(domain).toBeDefined();
		if (!domain) throw new Error("Expected domain to be defined");
		expect(domain.agents.size).toBe(0);
		expect(domain.capabilities.size).toBe(0);
		expect(domain.prompts.size).toBe(0);
		expect(domain.skills.size).toBe(0);
		expect(domain.extensions.size).toBe(0);
		expect(domain.workflows).toEqual([]);
	});

	it("loads workflows from workflows.ts if present", async () => {
		const domainDir = join(tmp.path, "wf");
		await mkdir(domainDir, { recursive: true });
		await writeDomainManifest(domainDir, "wf");
		await writeFile(
			join(domainDir, "workflows.ts"),
			`export const workflows = [{ name: "test-flow", description: "Test", chain: "a -> b" }];\n`,
		);

		const domains = await loadDomains(tmp.path);
		expect(domains[0]?.workflows).toEqual([
			{ name: "test-flow", description: "Test", chain: "a -> b" },
		]);
	});

	it("sets rootDirs to a single-element array with the absolute domain directory path", async () => {
		const domainDir = join(tmp.path, "rooted");
		await mkdir(domainDir, { recursive: true });
		await writeDomainManifest(domainDir, "rooted");

		const domains = await loadDomains(tmp.path);
		expect(domains[0]?.rootDirs).toEqual([domainDir]);
	});

	it("returns empty array for empty domains directory", async () => {
		const domains = await loadDomains(tmp.path);
		expect(domains).toEqual([]);
	});

	it("loads multiple agents from the same domain", async () => {
		const domainDir = join(tmp.path, "multi");
		const agentsDir = join(domainDir, "agents");
		await mkdir(agentsDir, { recursive: true });
		await writeDomainManifest(domainDir, "multi");
		await writeAgentDef(agentsDir, "agent-a");
		await writeAgentDef(agentsDir, "agent-b");

		const domains = await loadDomains(tmp.path);
		expect(domains[0]?.agents.size).toBe(2);
		expect(domains[0]?.agents.has("agent-a")).toBe(true);
		expect(domains[0]?.agents.has("agent-b")).toBe(true);
	});
});

// ============================================================================
// loadDomainsFromSources
// ============================================================================

const tmpA = useTempDir("domain-sources-a-");
const tmpB = useTempDir("domain-sources-b-");

describe("loadDomainsFromSources", () => {
	it("loads domains from a single source", async () => {
		const domainDir = join(tmpA.path, "alpha");
		await mkdir(domainDir, { recursive: true });
		await writeDomainManifest(domainDir, "alpha");

		const result = await loadDomainsFromSources([
			{ domainsDir: tmpA.path, origin: "built-in", precedence: 0 },
		]);

		expect(result).toHaveLength(1);
		expect(result[0]?.manifest.id).toBe("alpha");
		expect(result[0]?.rootDirs).toEqual([domainDir]);
	});

	it("loads from multiple sources with no conflicts (different domain IDs)", async () => {
		const alphaDir = join(tmpA.path, "alpha");
		await mkdir(alphaDir, { recursive: true });
		await writeDomainManifest(alphaDir, "alpha");

		const betaDir = join(tmpB.path, "beta");
		await mkdir(betaDir, { recursive: true });
		await writeDomainManifest(betaDir, "beta");

		const result = await loadDomainsFromSources([
			{ domainsDir: tmpA.path, origin: "built-in", precedence: 0 },
			{ domainsDir: tmpB.path, origin: "user-package", precedence: 10 },
		]);

		expect(result).toHaveLength(2);
		expect(result.map((d) => d.manifest.id).sort()).toEqual(["alpha", "beta"]);
	});

	it("applies default merge strategy: unions resources, higher precedence wins on agent conflicts", async () => {
		// Source A (lower precedence): domain "shared" with capability "core" and agent "worker"
		const sharedA = join(tmpA.path, "shared");
		const capsA = join(sharedA, "capabilities");
		const agentsA = join(sharedA, "agents");
		await mkdir(capsA, { recursive: true });
		await mkdir(agentsA, { recursive: true });
		await writeDomainManifest(sharedA, "shared");
		await writeFile(join(capsA, "core.md"), "# Core A");
		await writeAgentDef(agentsA, "worker");

		// Source B (higher precedence): domain "shared" with capability "extra" and same agent "worker"
		const sharedB = join(tmpB.path, "shared");
		const capsB = join(sharedB, "capabilities");
		const agentsB = join(sharedB, "agents");
		await mkdir(capsB, { recursive: true });
		await mkdir(agentsB, { recursive: true });
		await writeDomainManifest(sharedB, "shared");
		await writeFile(join(capsB, "extra.md"), "# Extra B");
		await writeAgentDef(agentsB, "worker");

		const result = await loadDomainsFromSources([
			{ domainsDir: tmpA.path, origin: "built-in", precedence: 0 },
			{ domainsDir: tmpB.path, origin: "user-package", precedence: 10 },
		]);

		expect(result).toHaveLength(1);
		const merged = result[0];
		expect(merged).toBeDefined();
		if (!merged) throw new Error("Expected merged domain");
		expect(merged.manifest.id).toBe("shared");
		// Union of capabilities from both sources
		expect(merged.capabilities).toEqual(new Set(["core", "extra"]));
		// Higher-precedence rootDir comes first
		expect(merged.rootDirs[0]).toBe(sharedB);
		expect(merged.rootDirs[1]).toBe(sharedA);
		// Agent from higher-precedence source wins
		expect(merged.agents.has("worker")).toBe(true);
	});

	it("invokes merge strategy callback for each conflict", async () => {
		const domainA = join(tmpA.path, "coding");
		await mkdir(domainA, { recursive: true });
		await writeDomainManifest(domainA, "coding");

		const domainB = join(tmpB.path, "coding");
		await mkdir(domainB, { recursive: true });
		await writeDomainManifest(domainB, "coding");

		const conflicts: DomainMergeConflict[] = [];
		await loadDomainsFromSources(
			[
				{ domainsDir: tmpA.path, origin: "built-in", precedence: 0 },
				{ domainsDir: tmpB.path, origin: "user-package", precedence: 10 },
			],
			(conflict) => {
				conflicts.push(conflict);
				return "merge";
			},
		);

		expect(conflicts).toHaveLength(1);
		expect(conflicts[0]?.domainId).toBe("coding");
	});

	it("replace strategy: incoming domain completely replaces existing", async () => {
		const domainA = join(tmpA.path, "coding");
		const capsA = join(domainA, "capabilities");
		await mkdir(capsA, { recursive: true });
		await writeDomainManifest(domainA, "coding");
		await writeFile(join(capsA, "from-a.md"), "# A");

		const domainB = join(tmpB.path, "coding");
		const capsB = join(domainB, "capabilities");
		await mkdir(capsB, { recursive: true });
		await writeDomainManifest(domainB, "coding");
		await writeFile(join(capsB, "from-b.md"), "# B");

		const result = await loadDomainsFromSources(
			[
				{ domainsDir: tmpA.path, origin: "built-in", precedence: 0 },
				{ domainsDir: tmpB.path, origin: "user-package", precedence: 10 },
			],
			() => "replace",
		);

		expect(result).toHaveLength(1);
		const domain = result[0];
		expect(domain).toBeDefined();
		if (!domain) throw new Error("Expected domain");
		// Only source B's capabilities (the higher-precedence replacement)
		expect(domain.capabilities).toEqual(new Set(["from-b"]));
		expect(domain.rootDirs).toEqual([domainB]);
	});

	it("skip strategy: incoming (higher-precedence) domain is discarded", async () => {
		const domainA = join(tmpA.path, "coding");
		const capsA = join(domainA, "capabilities");
		await mkdir(capsA, { recursive: true });
		await writeDomainManifest(domainA, "coding");
		await writeFile(join(capsA, "from-a.md"), "# A");

		const domainB = join(tmpB.path, "coding");
		const capsB = join(domainB, "capabilities");
		await mkdir(capsB, { recursive: true });
		await writeDomainManifest(domainB, "coding");
		await writeFile(join(capsB, "from-b.md"), "# B");

		const result = await loadDomainsFromSources(
			[
				{ domainsDir: tmpA.path, origin: "built-in", precedence: 0 },
				{ domainsDir: tmpB.path, origin: "user-package", precedence: 10 },
			],
			() => "skip",
		);

		expect(result).toHaveLength(1);
		const domain = result[0];
		expect(domain).toBeDefined();
		if (!domain) throw new Error("Expected domain");
		// Only source A's capabilities (lower-precedence, kept because incoming was skipped)
		expect(domain.capabilities).toEqual(new Set(["from-a"]));
		expect(domain.rootDirs).toEqual([domainA]);
	});

	it("result is sorted with shared first, then alphabetical", async () => {
		for (const name of ["zeta", "shared", "alpha"]) {
			const dir = join(tmpA.path, name);
			await mkdir(dir, { recursive: true });
			await writeDomainManifest(dir, name);
		}

		const result = await loadDomainsFromSources([
			{ domainsDir: tmpA.path, origin: "built-in", precedence: 0 },
		]);

		expect(result.map((d) => d.manifest.id)).toEqual([
			"shared",
			"alpha",
			"zeta",
		]);
	});
});
