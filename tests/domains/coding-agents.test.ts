/**
 * Tests for coding domain agent definition invariants.
 *
 * These tests verify structural consistency rules that prevent
 * misconfiguration bugs — NOT the specific values of each definition.
 * Individual field values (model, capabilities, extensions, etc.) are
 * configuration, not behavior, and should not be snapshot-tested.
 */

import { describe, expect, it } from "vitest";
import adaptationPlanner from "../../bundled/coding/coding/agents/adaptation-planner.ts";
import coordinator from "../../bundled/coding/coding/agents/coordinator.ts";
import cosmo from "../../bundled/coding/coding/agents/cosmo.ts";
import explorer from "../../bundled/coding/coding/agents/explorer.ts";
import fixer from "../../bundled/coding/coding/agents/fixer.ts";
import integrationVerifier from "../../bundled/coding/coding/agents/integration-verifier.ts";
import planReviewer from "../../bundled/coding/coding/agents/plan-reviewer.ts";
import planner from "../../bundled/coding/coding/agents/planner.ts";
import qualityManager from "../../bundled/coding/coding/agents/quality-manager.ts";
import reviewer from "../../bundled/coding/coding/agents/reviewer.ts";
import taskManager from "../../bundled/coding/coding/agents/task-manager.ts";
import verifier from "../../bundled/coding/coding/agents/verifier.ts";
import worker from "../../bundled/coding/coding/agents/worker.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";

const ALL_DEFINITIONS: AgentDefinition[] = [
	cosmo,
	planner,
	adaptationPlanner,
	taskManager,
	coordinator,
	worker,
	qualityManager,
	integrationVerifier,
	reviewer,
	fixer,
	explorer,
	verifier,
	planReviewer,
];

describe("coding domain agent invariants", () => {
	it("has unique IDs across all definitions", () => {
		const ids = ALL_DEFINITIONS.map((d) => d.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("uses valid tools values", () => {
		const valid = new Set(["coding", "readonly", "verification", "none"]);
		for (const def of ALL_DEFINITIONS) {
			expect(valid.has(def.tools)).toBe(true);
		}
	});

	it("uses valid session values", () => {
		const valid = new Set(["ephemeral", "persistent"]);
		for (const def of ALL_DEFINITIONS) {
			expect(valid.has(def.session)).toBe(true);
		}
	});

	it("uses provider/model-id format for model fields", () => {
		for (const def of ALL_DEFINITIONS) {
			expect(def.model).toMatch(/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9.-]*$/);
		}
	});

	it("has subagent references that point to existing definition IDs", () => {
		const allIds = new Set(ALL_DEFINITIONS.map((d) => d.id));
		for (const def of ALL_DEFINITIONS) {
			if (def.subagents) {
				for (const sub of def.subagents) {
					expect(allIds.has(sub)).toBe(true);
				}
			}
		}
	});

	it("allows quality-manager to spawn integration-verifier", () => {
		expect(qualityManager.subagents).toContain("integration-verifier");
	});

	it("does not give readonly agents coding-readwrite capability", () => {
		for (const def of ALL_DEFINITIONS) {
			if (def.tools === "readonly" || def.tools === "verification") {
				expect(def.capabilities).not.toContain("coding-readwrite");
			}
		}
	});

	it("does not give agents with tools 'none' any coding capability", () => {
		for (const def of ALL_DEFINITIONS) {
			if (def.tools === "none") {
				expect(def.capabilities).not.toContain("coding-readwrite");
				expect(def.capabilities).not.toContain("coding-readonly");
			}
		}
	});

	it("has at least one capability per definition", () => {
		for (const def of ALL_DEFINITIONS) {
			expect(def.capabilities.length).toBeGreaterThan(0);
		}
	});

	it("has non-empty ID and description for all definitions", () => {
		for (const def of ALL_DEFINITIONS) {
			expect(def.id.length).toBeGreaterThan(0);
			expect(def.description.length).toBeGreaterThan(0);
		}
	});
});
