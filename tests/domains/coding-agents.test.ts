/**
 * Tests for coding domain agent definition invariants.
 *
 * These tests verify structural consistency rules that prevent
 * misconfiguration bugs — NOT the specific values of each definition.
 * Individual field values (model, capabilities, extensions, etc.) are
 * configuration, not behavior, and should not be snapshot-tested.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { loadDomainsFromSources } from "../../lib/domains/index.ts";

const DOMAINS_DIR = resolve(
	fileURLToPath(import.meta.url),
	"..",
	"..",
	"..",
	"domains",
);
const BUNDLED_CODING_DIR = resolve(
	fileURLToPath(import.meta.url),
	"..",
	"..",
	"..",
	"bundled",
	"coding",
);

let allDefinitions: AgentDefinition[] = [];

beforeAll(async () => {
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

	allDefinitions = [...codingDomain.agents.values()];
});

describe("coding domain agent invariants", () => {
	it("has unique IDs across all definitions", () => {
		const ids = allDefinitions.map((d) => d.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("uses valid tools values", () => {
		const valid = new Set(["coding", "readonly", "verification", "none"]);
		for (const def of allDefinitions) {
			expect(valid.has(def.tools)).toBe(true);
		}
	});

	it("uses valid session values", () => {
		const valid = new Set(["ephemeral", "persistent"]);
		for (const def of allDefinitions) {
			expect(valid.has(def.session)).toBe(true);
		}
	});

	it("uses provider/model-id format for model fields", () => {
		for (const def of allDefinitions) {
			expect(def.model).toMatch(/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9.-]*$/);
		}
	});

	it("has subagent references that point to existing definition IDs", () => {
		const allIds = new Set(allDefinitions.map((d) => d.id));
		for (const def of allDefinitions) {
			if (def.subagents) {
				for (const sub of def.subagents) {
					expect(allIds.has(sub)).toBe(true);
				}
			}
		}
	});

	it("allows quality-manager to spawn integration-verifier and tdd-coordinator", () => {
		const qualityManager = allDefinitions.find(
			(def) => def.id === "quality-manager",
		);

		expect(qualityManager).toBeDefined();
		expect(qualityManager?.subagents).toContain("integration-verifier");
		expect(qualityManager?.subagents).toContain("tdd-coordinator");
	});

	it("allows tdd-coordinator to spawn verifier", () => {
		const tddCoordinator = allDefinitions.find(
			(def) => def.id === "tdd-coordinator",
		);

		expect(tddCoordinator).toBeDefined();
		expect(tddCoordinator?.subagents).toContain("verifier");
	});

	it("does not give readonly agents coding-readwrite capability", () => {
		for (const def of allDefinitions) {
			if (def.tools === "readonly" || def.tools === "verification") {
				expect(def.capabilities).not.toContain("coding-readwrite");
			}
		}
	});

	it("does not give agents with tools 'none' any coding capability", () => {
		for (const def of allDefinitions) {
			if (def.tools === "none") {
				expect(def.capabilities).not.toContain("coding-readwrite");
				expect(def.capabilities).not.toContain("coding-readonly");
			}
		}
	});

	it("has at least one capability per definition", () => {
		for (const def of allDefinitions) {
			expect(def.capabilities.length).toBeGreaterThan(0);
		}
	});

	it("has non-empty ID and description for all definitions", () => {
		for (const def of allDefinitions) {
			expect(def.id.length).toBeGreaterThan(0);
			expect(def.description.length).toBeGreaterThan(0);
		}
	});
});
