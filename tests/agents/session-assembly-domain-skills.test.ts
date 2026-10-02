/**
 * The skills a real agent's session sees under a project `skills` allowlist:
 * an agent keeps the skills its own domain ships and it names, while other
 * domains' skills and wildcard agents stay filtered by the list.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { buildSessionParams } from "../../lib/agents/session-assembly.ts";
import { discoverFrameworkBundledPackageDirs } from "../../lib/packages/dev-bundled.ts";
import { CosmonautsRuntime } from "../../lib/runtime.ts";

vi.mock("@earendil-works/pi-ai/providers/all", () => ({
	builtinModels: () => ({
		getModel: (provider: string, id: string) => ({ provider, id }),
	}),
}));

const REPOSITORY_ROOT = resolve(
	fileURLToPath(import.meta.url),
	"..",
	"..",
	"..",
);

/** A project allowlist from before the lean domain: no `contract`, no `git-workflow`. */
const ALLOWLIST = ["tdd", "typescript", "react", "plan"];

let projectRoot: string;
let runtime: CosmonautsRuntime;

beforeAll(async () => {
	projectRoot = await mkdtemp(join(tmpdir(), "domain-skills-"));
	await mkdir(join(projectRoot, ".cosmonauts"));
	await writeFile(
		join(projectRoot, ".cosmonauts/config.json"),
		JSON.stringify({ skills: ALLOWLIST }),
	);
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

/** The skill names Pi's resource loader keeps for the agent's session. */
async function visibleSkills(role: string, domain: string): Promise<string[]> {
	const def = runtime.agentRegistry.resolve(role, domain);
	const params = await buildSessionParams({
		def,
		cwd: projectRoot,
		domainsDir: runtime.domainsDir,
		resolver: runtime.domainResolver,
		projectSkills: runtime.projectSkills,
		skillPaths: runtime.skillPaths,
	});
	const agentDir = await mkdtemp(join(tmpdir(), "domain-skills-agent-"));
	try {
		const loader = new DefaultResourceLoader({
			cwd: projectRoot,
			agentDir,
			noExtensions: true,
			noSkills: true,
			noPromptTemplates: true,
			noThemes: true,
			noContextFiles: true,
			...(params.skillsOverride && { skillsOverride: params.skillsOverride }),
			...(params.additionalSkillPaths && {
				additionalSkillPaths: params.additionalSkillPaths,
			}),
		});
		await loader.reload();
		return loader
			.getSkills()
			.skills.map((skill) => skill.name)
			.sort();
	} finally {
		await rm(agentDir, { recursive: true, force: true });
	}
}

describe("a domain's own skills under a project allowlist", () => {
	test("the lean lead sees the contract skill its domain ships, beside the allowlisted ones", async () => {
		expect(await visibleSkills("lead", "lean")).toEqual([
			"contract",
			"react",
			"tdd",
			"typescript",
		]);
	});

	test("the lean lead's coding-domain skills stay filtered by the allowlist", async () => {
		const skills = await visibleSkills("lead", "lean");

		expect(skills).not.toContain("rails-api");
		expect(skills).not.toContain("git-workflow");
	});

	test("a wildcard agent gains no domain skill outside the allowlist", async () => {
		const skills = await visibleSkills("worker", "coding");

		expect(skills).toContain("tdd");
		expect(skills).toContain("plan");
		expect(skills).not.toContain("contract");
		expect(skills).not.toContain("git-workflow");
		expect(skills).not.toContain("rails-api");
	});
});
