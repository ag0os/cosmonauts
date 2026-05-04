import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	loadDomainsFromSources,
	validateDomains,
} from "../lib/domains/index.ts";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const DOMAINS_DIR = resolve(REPO_ROOT, "domains");
const BUNDLED_CODING_DIR = resolve(REPO_ROOT, "bundled", "coding");
const CODING_DOMAIN_DIR = resolve(BUNDLED_CODING_DIR, "coding");
const CODY_AGENT_PATH = resolve(CODING_DOMAIN_DIR, "agents", "cody.ts");
const COSMO_AGENT_PATH = resolve(CODING_DOMAIN_DIR, "agents", "cosmo.ts");
const OLD_CODING_AGENT_ID = "cosmo.ts".slice(0, -3);
const CODY_PROMPT_PATH = resolve(CODING_DOMAIN_DIR, "prompts", "cody.md");
const COSMO_PROMPT_PATH = resolve(CODING_DOMAIN_DIR, "prompts", "cosmo.md");

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function loadCodingDomain() {
	const domains = await loadDomainsFromSources([
		{ domainsDir: DOMAINS_DIR, origin: "framework", precedence: 1 },
		{ domainsDir: BUNDLED_CODING_DIR, origin: "bundled", precedence: 2 },
	]);
	const codingDomain = domains.find(
		(domain) => domain.manifest.id === "coding",
	);

	if (!codingDomain) {
		throw new Error("Coding domain not loaded");
	}

	return { codingDomain, domains };
}

describe("coding-domain-rename coding cody rename complete", () => {
	it("deletes old cosmo files and creates cody files", async () => {
		expect(await fileExists(COSMO_AGENT_PATH)).toBe(false);
		expect(await fileExists(COSMO_PROMPT_PATH)).toBe(false);
		expect(await fileExists(CODY_AGENT_PATH)).toBe(true);
		expect(await fileExists(CODY_PROMPT_PATH)).toBe(true);
	});

	it("validates the coding domain after rename", async () => {
		const { codingDomain, domains } = await loadCodingDomain();
		const diagnostics = validateDomains(domains).filter(
			(diagnostic) => diagnostic.domain === "coding",
		);

		expect(diagnostics).toEqual([]);
		expect(codingDomain.manifest.lead).toBe("cody");
		expect(codingDomain.agents.has(OLD_CODING_AGENT_ID)).toBe(false);
		expect(codingDomain.agents.has("cody")).toBe(true);
	});

	it("loads coding/cody with unqualified subagents", async () => {
		const { codingDomain } = await loadCodingDomain();
		const cody = codingDomain.agents.get("cody");

		expect(cody).toBeDefined();
		expect(cody?.id).toBe("cody");
		expect(cody?.subagents?.length).toBeGreaterThan(0);
		expect(cody?.subagents?.every((subagent) => !subagent.includes("/"))).toBe(
			true,
		);
	});

	it("renames the prompt identity and route labels", async () => {
		const content = await readFile(CODY_PROMPT_PATH, "utf-8");

		expect(content).toContain("You are Cody");
		expect(content).not.toContain("You are Cosmo");
		expect(content).toContain("`cody-facilitates-dialogue`");
		expect(content).not.toContain("cosmo-facilitates-dialogue");
	});
});
