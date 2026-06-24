/**
 * Tests for shared skill filter helper.
 */

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
	ResourceDiagnostic,
	Skill,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, test } from "vitest";
import planReviewerDefinition from "../../bundled/coding/agents/plan-reviewer.ts";
import plannerDefinition from "../../bundled/coding/agents/planner.ts";
import specWriterDefinition from "../../bundled/coding/agents/spec-writer.ts";
import taskManagerDefinition from "../../bundled/coding/agents/task-manager.ts";
import {
	buildSkillsOverride,
	resolveEffectiveProjectSkills,
	resolveVisibleSkillNames,
	type SkillsOverrideFn,
} from "../../lib/agents/skills.ts";
import { DomainRegistry } from "../../lib/domains/registry.ts";
import { DomainResolver } from "../../lib/domains/resolver.ts";
import type { LoadedDomain } from "../../lib/domains/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("agent-skills-");

/** Helper to create a mock skills base for testing the override function. */
function makeBase(skillNames: string[]) {
	return {
		skills: skillNames.map((name) => ({ name }) as unknown as Skill),
		diagnostics: [] as ResourceDiagnostic[],
	};
}

/** Assert override is defined and return it typed. */
function assertDefined(
	override: SkillsOverrideFn | undefined,
): SkillsOverrideFn {
	expect(override).toBeDefined();
	if (!override) throw new Error("Expected override to be defined");
	return override;
}

async function writeSharedSkill(name: string): Promise<void> {
	const skillDir = join(tmp.path, "shared", "skills", name);
	await mkdir(skillDir, { recursive: true });
	await writeFile(
		join(skillDir, "SKILL.md"),
		`---\nname: ${name}\ndescription: ${name}\n---\n`,
	);
}

function makeDomain(
	id: string,
	overrides: Partial<LoadedDomain> = {},
): LoadedDomain {
	const rootDir = `/domains/${id}`;
	return {
		manifest: { id, description: `Domain ${id}` },
		portable: false,
		agents: new Map(),
		capabilities: new Set(),
		prompts: new Set(),
		skills: new Set(),
		extensions: new Set(),
		chains: [],
		provenance: [
			{ origin: "test", precedence: 0, kind: "domains-dir", rootDir },
		],
		rootDirs: [rootDir],
		...overrides,
	};
}

describe("resolveEffectiveProjectSkills", () => {
	test("preserves shared skills under project-level filters", async () => {
		await writeSharedSkill("plan");

		const result = await resolveEffectiveProjectSkills({
			projectSkills: ["typescript"],
			domainsDir: tmp.path,
		});

		expect(result).toEqual(["plan", "typescript"]);
	});

	test("does not crash when declared shared skill files are missing", async () => {
		await mkdir(join(tmp.path, "shared", "skills", "missing"), {
			recursive: true,
		});

		const result = await resolveEffectiveProjectSkills({
			projectSkills: ["typescript"],
			domainsDir: tmp.path,
		});

		expect(result).toEqual(["typescript"]);
	});

	test("returns undefined when no projectSkills config is present", async () => {
		await writeSharedSkill("plan");

		const result = await resolveEffectiveProjectSkills({
			domainsDir: tmp.path,
		});

		expect(result).toBeUndefined();
	});
});

describe("buildSkillsOverride", () => {
	test("wildcard agent + undefined project → no override", () => {
		const override = buildSkillsOverride(["*"], undefined);
		expect(override).toBeUndefined();
	});

	test("empty agent skills → always returns empty", () => {
		const fn = assertDefined(buildSkillsOverride([], undefined));
		const result = fn(makeBase(["ts", "react", "python"]));
		expect(result.skills).toEqual([]);
	});

	test("empty agent skills + project skills → still empty", () => {
		const fn = assertDefined(buildSkillsOverride([], ["ts", "react"]));
		const result = fn(makeBase(["ts", "react"]));
		expect(result.skills).toEqual([]);
	});

	test("wildcard agent + project skills → filters to project list", () => {
		const fn = assertDefined(buildSkillsOverride(["*"], ["ts", "react"]));
		const result = fn(makeBase(["ts", "react", "python", "go"]));
		expect(result.skills.map((s) => s.name)).toEqual(["ts", "react"]);
	});

	test("agent skills + undefined project → filters to agent list", () => {
		const fn = assertDefined(buildSkillsOverride(["ts", "python"], undefined));
		const result = fn(makeBase(["ts", "react", "python", "go"]));
		expect(result.skills.map((s) => s.name)).toEqual(["ts", "python"]);
	});

	test("agent skills + project skills → filters to intersection", () => {
		const fn = assertDefined(
			buildSkillsOverride(["ts", "python", "go"], ["ts", "react", "go"]),
		);
		const result = fn(makeBase(["ts", "react", "python", "go"]));
		expect(result.skills.map((s) => s.name)).toEqual(["ts", "go"]);
	});

	test("disjoint agent and project skills → empty result", () => {
		const fn = assertDefined(
			buildSkillsOverride(["python", "go"], ["ts", "react"]),
		);
		const result = fn(makeBase(["ts", "react", "python", "go"]));
		expect(result.skills).toEqual([]);
	});

	test("preserves diagnostics in all cases", () => {
		const diagnostics = [
			{ message: "test diagnostic" },
		] as unknown as ResourceDiagnostic[];
		const base = {
			skills: [{ name: "ts" }, { name: "react" }] as unknown as Skill[],
			diagnostics,
		};

		const fn = assertDefined(buildSkillsOverride(["ts"], ["ts", "react"]));
		const result = fn(base);
		expect(result.diagnostics).toBe(diagnostics);
	});

	test("skills not in base are effectively ignored", () => {
		const fn = assertDefined(
			buildSkillsOverride(["ts", "nonexistent"], ["ts", "also-missing"]),
		);
		const result = fn(makeBase(["ts", "react"]));
		expect(result.skills.map((s) => s.name)).toEqual(["ts"]);
	});

	test("filters internal skills from cross-domain effective catalogs", () => {
		// @cosmo-behavior plan:domain-authoring#B-019
		const resolver = new DomainResolver(
			new DomainRegistry([
				makeDomain("coding", {
					skills: new Set(["consumer-skill"]),
				}),
				makeDomain("ruby-coding", {
					manifest: {
						id: "ruby-coding",
						description: "Ruby coding",
						internal: { skills: ["internal-skill"] },
					},
					skills: new Set(["public-skill", "internal-skill"]),
				}),
			]),
		);
		const base = makeBase(["consumer-skill", "public-skill", "internal-skill"]);

		const crossDomainVisibleSkills = resolveVisibleSkillNames({
			resolver,
			requesterDomain: "coding",
		});
		const explicitCrossDomain = assertDefined(
			buildSkillsOverride(
				["public-skill", "internal-skill"],
				undefined,
				crossDomainVisibleSkills,
			),
		);
		expect(explicitCrossDomain(base).skills.map((skill) => skill.name)).toEqual(
			["public-skill"],
		);

		const wildcardCrossDomain = assertDefined(
			buildSkillsOverride(["*"], undefined, crossDomainVisibleSkills),
		);
		expect(wildcardCrossDomain(base).skills.map((skill) => skill.name)).toEqual(
			["consumer-skill", "public-skill"],
		);

		const sameDomainVisibleSkills = resolveVisibleSkillNames({
			resolver,
			requesterDomain: "ruby-coding",
		});
		const sameDomain = assertDefined(
			buildSkillsOverride(
				["public-skill", "internal-skill"],
				undefined,
				sameDomainVisibleSkills,
			),
		);
		expect(sameDomain(base).skills.map((skill) => skill.name)).toEqual([
			"public-skill",
			"internal-skill",
		]);
	});
});

describe("artifact skill allowlists", () => {
	// @cosmo-behavior plan:artifact-format-redesign#B-013
	test("artifact-producing and plan-review agents can load shared artifact guidance", async () => {
		expect(plannerDefinition.skills).toEqual(
			expect.arrayContaining(["work-artifacts", "architecture"]),
		);
		expect(specWriterDefinition.skills).toEqual(
			expect.arrayContaining(["work-artifacts"]),
		);
		expect(taskManagerDefinition.skills).toEqual(
			expect.arrayContaining(["task", "work-artifacts"]),
		);
		expect(planReviewerDefinition.skills).toEqual(
			expect.arrayContaining(["work-artifacts", "architecture"]),
		);

		const agentFiles = await readdir(
			join(process.cwd(), "bundled", "coding", "agents"),
		);
		expect(agentFiles).not.toContain("architect.ts");
	});
});
