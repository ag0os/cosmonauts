import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadDomains } from "../../lib/domains/loader.ts";
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
		expect(domains[0]!.manifest.id).toBe("alpha");
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
		expect(domains[0]!.manifest.id).toBe("valid");
	});

	it("loads agent definitions and stamps domain ID", async () => {
		const domainDir = join(tmp.path, "testdomain");
		const agentsDir = join(domainDir, "agents");
		await mkdir(agentsDir, { recursive: true });
		await writeDomainManifest(domainDir, "testdomain");
		await writeAgentDef(agentsDir, "my-agent");

		const domains = await loadDomains(tmp.path);
		expect(domains).toHaveLength(1);

		const agents = domains[0]!.agents;
		expect(agents.size).toBe(1);
		expect(agents.has("my-agent")).toBe(true);
		expect(agents.get("my-agent")!.domain).toBe("testdomain");
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
		expect(domains[0]!.capabilities).toEqual(new Set(["core", "tasks"]));
	});

	it("indexes prompts from .md files", async () => {
		const domainDir = join(tmp.path, "prm");
		const promptsDir = join(domainDir, "prompts");
		await mkdir(promptsDir, { recursive: true });
		await writeDomainManifest(domainDir, "prm");
		await writeFile(join(promptsDir, "worker.md"), "# Worker");

		const domains = await loadDomains(tmp.path);
		expect(domains[0]!.prompts).toEqual(new Set(["worker"]));
	});

	it("indexes skills as subdirectories", async () => {
		const domainDir = join(tmp.path, "sk");
		const skillsDir = join(domainDir, "skills");
		await mkdir(join(skillsDir, "typescript"), { recursive: true });
		await mkdir(join(skillsDir, "python"), { recursive: true });
		await writeDomainManifest(domainDir, "sk");

		const domains = await loadDomains(tmp.path);
		expect(domains[0]!.skills).toEqual(new Set(["typescript", "python"]));
	});

	it("indexes extensions as subdirectories", async () => {
		const domainDir = join(tmp.path, "ext");
		const extDir = join(domainDir, "extensions");
		await mkdir(join(extDir, "tasks"), { recursive: true });
		await mkdir(join(extDir, "todo"), { recursive: true });
		await writeDomainManifest(domainDir, "ext");

		const domains = await loadDomains(tmp.path);
		expect(domains[0]!.extensions).toEqual(new Set(["tasks", "todo"]));
	});

	it("returns empty sets when resource directories are missing", async () => {
		const domainDir = join(tmp.path, "minimal");
		await mkdir(domainDir, { recursive: true });
		await writeDomainManifest(domainDir, "minimal");

		const domains = await loadDomains(tmp.path);
		const domain = domains[0]!;
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
		expect(domains[0]!.workflows).toEqual([
			{ name: "test-flow", description: "Test", chain: "a -> b" },
		]);
	});

	it("sets rootDir to the absolute domain directory path", async () => {
		const domainDir = join(tmp.path, "rooted");
		await mkdir(domainDir, { recursive: true });
		await writeDomainManifest(domainDir, "rooted");

		const domains = await loadDomains(tmp.path);
		expect(domains[0]!.rootDir).toBe(domainDir);
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
		expect(domains[0]!.agents.size).toBe(2);
		expect(domains[0]!.agents.has("agent-a")).toBe(true);
		expect(domains[0]!.agents.has("agent-b")).toBe(true);
	});
});
