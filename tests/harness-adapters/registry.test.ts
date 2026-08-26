import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { resolveTargetDir } from "../../lib/skills/exporter.ts";

const PROJECT_ROOT = "/workspace/project";
const REGISTRY_PATH = join(
	process.cwd(),
	"lib",
	"harness-adapters",
	"registry.ts",
);

describe("harness adapter registry characterization", () => {
	test("pins the four legacy Claude and Codex skill destinations", () => {
		expect([
			resolveTargetDir("plan", {
				target: "claude",
				projectRoot: PROJECT_ROOT,
			}),
			resolveTargetDir("plan", {
				target: "claude",
				projectRoot: PROJECT_ROOT,
				personal: true,
			}),
			resolveTargetDir("plan", {
				target: "codex",
				projectRoot: PROJECT_ROOT,
			}),
			resolveTargetDir("plan", {
				target: "codex",
				projectRoot: PROJECT_ROOT,
				personal: true,
			}),
		]).toEqual([
			join(PROJECT_ROOT, ".claude", "skills", "plan"),
			join(homedir(), ".claude", "skills", "plan"),
			join(PROJECT_ROOT, ".agents", "skills", "plan"),
			join(homedir(), ".agents", "skills", "plan"),
		]);
	});

	test("resolves registry and compatibility skill-export targets from one contract", async () => {
		// @cosmo-behavior plan:harness-adapters#B-001
		expect(
			existsSync(REGISTRY_PATH),
			"B-001 requires the inward harness registry before target consumers can delegate to it",
		).toBe(true);
		if (!existsSync(REGISTRY_PATH)) return;

		const [registrySource, exporterSource, packageManifest] = await Promise.all(
			[
				readFile(REGISTRY_PATH, "utf-8"),
				readFile(join(process.cwd(), "lib", "skills", "exporter.ts"), "utf-8"),
				readFile(join(process.cwd(), "package.json"), "utf-8").then(
					(raw) => JSON.parse(raw) as { readonly files?: readonly string[] },
				),
			],
		);

		expect(registrySource).toMatch(/claude/);
		expect(registrySource).toMatch(/codex/);
		expect(registrySource).toMatch(/open-code/);
		expect(registrySource).not.toMatch(/gemini/);
		expect(registrySource).toMatch(/supportedModes[\s\S]*copy/);
		expect(registrySource).toMatch(/external-skill:cosmonauts[\s\S]*personal/);
		expect(registrySource).toMatch(/command:spec-to-backlog[\s\S]*personal/);
		expect(registrySource).toMatch(/command:implement-plan[\s\S]*personal/);

		expect(exporterSource).toMatch(/harness-adapters\/registry\.ts/);
		expect(exporterSource).not.toMatch(/switch\s*\(options\.target\)/);
		expect(packageManifest.files).toContain("external-commands/");
	});
});
