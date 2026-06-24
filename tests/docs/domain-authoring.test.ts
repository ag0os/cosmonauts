import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const DOMAIN_DOC_PATH = "docs/domains.md";
const PROMPT_DOC_PATH = "docs/prompts.md";
const ACTIVE_GUIDANCE_PATHS = [
	"README.md",
	"docs/domains.md",
	"docs/prompts.md",
	"tests/domains/resolver.test.ts",
	"tests/docs/domain-authoring.test.ts",
] as const;

async function readRepoFile(path: string): Promise<string> {
	return readFile(new URL(`../../${path}`, import.meta.url), "utf-8");
}

async function readActiveGuidance(): Promise<string> {
	const contents = await Promise.all(ACTIVE_GUIDANCE_PATHS.map(readRepoFile));
	return contents.join("\n");
}

function retiredSharedPromptPath(): string {
	return ["domains", "shared", "prompts"].join("/");
}

function retiredNestedBundledPath(): string {
	return ["bundled", "coding", "coding"].join("/");
}

describe("domain authoring documentation", () => {
	test("documents every domain authoring asset and config split", async () => {
		// @cosmo-behavior plan:domain-authoring#B-015
		const content = await readRepoFile(DOMAIN_DOC_PATH);

		for (const required of [
			"Manifest",
			"Agent",
			"Persona",
			"Capability",
			"Skill",
			"Extension",
			"Chain",
			"`internal`",
			"activeDomains",
			"domainBindings",
			"`/domain-bind <role> <target-domain>`",
			"path",
			"Format",
			"Declared by",
			"`.cosmonauts/config.json`",
			"`domain.ts`",
		]) {
			expect(content).toContain(required);
		}

		expect(content).toMatch(/Package Layouts/);
		expect(content).toMatch(/single-domain package/i);
		expect(content).toMatch(/multi-domain packages/i);
		expect(content).toContain('`path: "."`');
		expect(content).toMatch(/future resolution only/i);
		expect(content).toMatch(/already-running/i);
		expect(content).toContain("cosmonauts.domain-binding");
		expect(content).toMatch(/session resume, fork, or replacement/i);
		expect(content).toMatch(/Failure Fixes/);
		expect(content).toMatch(/Missing `domain\.ts`/);
		expect(content).toMatch(/Missing persona prompt/);
		expect(content).toMatch(/Same-precedence active providers/);
		expect(content).toMatch(/Binding target is missing or inactive/);
		expect(content).toMatch(/Malformed `domainBindings` entry/);
		expect(content).toMatch(/Live `\/domain-bind` target is unavailable/);
		expect(content).toMatch(/Stale session replay entry/);
	});

	test("describes prompt layers with framework prompt paths and persona-only domain prompts", async () => {
		const content = await readRepoFile(PROMPT_DOC_PATH);

		expect(content).toContain("lib/prompts/framework/base.md");
		expect(content).toContain("lib/prompts/framework/runtime/sub-agent.md");
		expect(content).toMatch(
			/Domain `prompts\/` directories contain personas only/,
		);
		expect(content).not.toContain(retiredSharedPromptPath());
	});

	test("active docs and tests avoid retired runtime path examples", async () => {
		const content = await readActiveGuidance();

		expect(content).not.toContain(retiredNestedBundledPath());
		expect(content).not.toContain(retiredSharedPromptPath());
	});
});
