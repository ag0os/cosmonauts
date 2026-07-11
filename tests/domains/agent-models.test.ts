import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadDomainsFromSources } from "../../lib/domains/index.ts";
import { resolveModel } from "../../lib/orchestration/model-resolution.ts";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const DOMAINS_DIR = resolve(REPO_ROOT, "domains");
const BUNDLED_CODING_DIR = resolve(REPO_ROOT, "bundled", "coding");

describe("built-in agent model definitions", () => {
	it("resolve against Pi's built-in model catalog", async () => {
		const domains = await loadDomainsFromSources([
			{ domainsDir: DOMAINS_DIR, origin: "framework", precedence: 1 },
			{
				domainsDir: BUNDLED_CODING_DIR,
				sourceType: "domain-root",
				origin: "bundled",
				precedence: 2,
			},
		]);
		const failures: string[] = [];

		for (const domain of domains) {
			for (const definition of domain.agents.values()) {
				try {
					resolveModel(definition.model);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					failures.push(
						`${domain.manifest.id}/${definition.id}: ${definition.model} (${message})`,
					);
				}
			}
		}

		expect(failures).toEqual([]);
	});
});
