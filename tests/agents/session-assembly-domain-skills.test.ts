/**
 * The skills a real agent's session sees under a project `skills` allowlist:
 * an agent keeps the skills its own domain ships and it names, while other
 * domains' skills and wildcard agents stay filtered by the list.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { buildSessionParams } from "../../lib/agents/session-assembly.ts";
import { CosmonautsRuntime } from "../../lib/runtime.ts";

vi.mock("@earendil-works/pi-ai/providers/all", () => ({
	builtinModels: () => ({
		getModel: (provider: string, id: string) => ({ provider, id }),
	}),
}));

const ALLOWLIST = ["listed"];

let projectRoot: string;
let runtime: CosmonautsRuntime;

beforeAll(async () => {
	projectRoot = await mkdtemp(join(tmpdir(), "domain-skills-"));
	await mkdir(join(projectRoot, ".cosmonauts"));
	await writeFile(
		join(projectRoot, ".cosmonauts/config.json"),
		JSON.stringify({ skills: ALLOWLIST }),
	);

	const domainsRoot = join(projectRoot, "synthetic-domains");
	for (const [domain, id, skills, resources] of [
		["studio", "lead", ["own", "foreign"], ["own"]],
		["reference", "worker", ["*"], ["foreign", "listed"]],
	] as const) {
		const root = join(domainsRoot, domain);
		await mkdir(join(root, "agents"), { recursive: true });
		await writeFile(
			join(root, "domain.ts"),
			`export default ${JSON.stringify({ id: domain, description: "Synthetic skills", lead: id })};`,
		);
		await writeFile(
			join(root, "agents", `${id}.ts`),
			`export default ${JSON.stringify({ id, description: "Synthetic agent", instructions: { kind: "inline", content: "Use the supplied skills." }, model: "anthropic/test-sonnet", tools: "none", extensions: [], capabilities: [], skills, memory: {}, projectContext: false, session: "ephemeral", loop: false })};`,
		);
		for (const name of resources) {
			await mkdir(join(root, "skills", name), { recursive: true });
			await writeFile(
				join(root, "skills", name, "SKILL.md"),
				`---\nname: ${name}\ndescription: Synthetic ${name} skill\n---\n# ${name}\n`,
			);
		}
	}
	runtime = await CosmonautsRuntime.create({
		builtinDomainsDir: domainsRoot,
		projectRoot,
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
		runtime,
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
	test("a named agent retains the own-domain skill it explicitly declares", async () => {
		expect(await visibleSkills("lead", "studio")).toEqual(["own"]);
	});
	test("an explicitly named foreign skill stays filtered by the project allowlist", async () => {
		expect(await visibleSkills("lead", "studio")).not.toContain("foreign");
	});
	test("a wildcard agent gains only the project's listed skill", async () => {
		expect(await visibleSkills("worker", "reference")).toEqual(["listed"]);
	});
});
