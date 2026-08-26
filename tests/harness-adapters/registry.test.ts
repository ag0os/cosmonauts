import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	createRuntimeSkillDescriptor,
	getHarnessTarget,
	getStaticHarnessAsset,
	isHarnessPackageDefinitionKey,
	isImplementedHarnessTargetId,
	listHarnessPackageDefinitionKeys,
	listHarnessTargets,
	resolveHarnessAssetTarget,
	resolveHarnessTargetDirectory,
} from "../../lib/harness-adapters/registry.ts";
import { resolveTargetDir } from "../../lib/skills/exporter.ts";
import { useTempDir } from "../helpers/fs.ts";

const PROJECT_ROOT = "/workspace/project";
const tmp = useTempDir("registry-copy-only-");

describe("harness adapter registry", () => {
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

	test("keeps new registry targets free of agent-package provenance and journal consumer edits", async () => {
		expect(listHarnessPackageDefinitionKeys()).toEqual([
			"claude",
			"claude-cli",
			"codex",
			"gemini-cli",
			"open-code",
		]);
		for (const key of listHarnessPackageDefinitionKeys()) {
			expect(isHarnessPackageDefinitionKey(key)).toBe(true);
		}
		expect(isHarnessPackageDefinitionKey("future-harness")).toBe(false);
		expect(isImplementedHarnessTargetId("claude")).toBe(true);
		expect(isImplementedHarnessTargetId("codex")).toBe(true);
		expect(isImplementedHarnessTargetId("open-code")).toBe(false);
		expect(isImplementedHarnessTargetId("gemini-cli")).toBe(false);

		const [definitionSource, packageTypesSource, provenanceSource, syncSource] =
			await Promise.all([
				readFile("lib/agent-packages/definition.ts", "utf-8"),
				readFile("lib/agent-packages/types.ts", "utf-8"),
				readFile("lib/harness-adapters/provenance.ts", "utf-8"),
				readFile("lib/harness-adapters/sync.ts", "utf-8"),
			]);

		expect(definitionSource).toContain("isHarnessPackageDefinitionKey");
		expect(definitionSource).not.toMatch(/const TARGETS\s*=/);
		expect(packageTypesSource).toContain("HarnessPackageDefinitionKey");
		expect(packageTypesSource).toContain("HarnessPackageTargetLabel");
		expect(packageTypesSource).not.toMatch(/\|\s*"gemini-cli"/);
		expect(packageTypesSource).not.toMatch(/"claude-cli"\s*\|\s*"codex"/);
		expect(provenanceSource).toContain(
			"isImplementedHarnessTargetId(value.target)",
		);
		expect(provenanceSource).not.toMatch(/value\.target\s*!==\s*"claude"/);
		expect(syncSource).toContain(
			"isImplementedHarnessTargetId(value.targetId)",
		);
		expect(syncSource).not.toMatch(/value\.targetId\s*===\s*"claude"/);
	});

	test("resolves registry and compatibility skill-export targets from one contract", async () => {
		// @cosmo-behavior plan:harness-adapters#B-001
		expect(listHarnessTargets().map(({ id }) => id)).toEqual([
			"claude",
			"codex",
			"open-code",
		]);
		expect(getHarnessTarget("gemini")).toBeUndefined();
		expect(getHarnessTarget("open-code")).toMatchObject({
			id: "open-code",
			status: "declared",
			adapters: [],
		});

		const roots = { projectRoot: PROJECT_ROOT, homeRoot: "/users/cosmo" };
		expect(
			resolveHarnessTargetDirectory({
				targetId: "claude",
				scope: "project",
				kind: "skill",
				roots,
			}),
		).toMatchObject({
			ownerRoot: join(PROJECT_ROOT, ".claude"),
			targetDirectory: join(PROJECT_ROOT, ".claude", "skills"),
			transform: "identity",
			supportedModes: ["copy", "link"],
			supportedLinkShapes: ["directory", "flat-skill", "generated-wrapper"],
		});
		expect(
			resolveHarnessTargetDirectory({
				targetId: "claude",
				scope: "personal",
				kind: "command",
				roots,
			}),
		).toMatchObject({
			ownerRoot: join("/users/cosmo", ".claude"),
			targetDirectory: join("/users/cosmo", ".claude", "commands"),
			transform: "claude-command",
			supportedModes: ["copy"],
			supportedLinkShapes: [],
		});
		expect(
			resolveHarnessTargetDirectory({
				targetId: "codex",
				scope: "personal",
				kind: "skill",
				roots,
			}),
		).toMatchObject({
			ownerRoot: join("/users/cosmo", ".agents"),
			targetDirectory: join("/users/cosmo", ".agents", "skills"),
			transform: "identity",
			supportedModes: ["copy", "link"],
			supportedLinkShapes: ["directory"],
		});

		const runtimeSkill = createRuntimeSkillDescriptor({
			name: "plan",
			sourceRootId: "shared:base",
			sourceRoot: join(PROJECT_ROOT, "domains", "shared", "skills"),
			sourcePath: join(PROJECT_ROOT, "domains", "shared", "skills", "plan"),
			logicalPath: "plan",
		});
		const bundle = getStaticHarnessAsset("external-skill:cosmonauts");
		const specCommand = getStaticHarnessAsset("command:spec-to-backlog");
		const implementCommand = getStaticHarnessAsset("command:implement-plan");

		expect(runtimeSkill).toMatchObject({
			assetId: "skill:plan",
			defaultScope: "project",
			ownership: { kind: "project" },
		});
		expect(bundle).toMatchObject({
			assetId: "external-skill:cosmonauts",
			defaultScope: "personal",
			sourceRootId: "cosmonauts:package",
			sourcePath: "external-skills/cosmonauts",
			ownership: { kind: "authority", authorityId: "cosmonauts/core" },
		});
		expect(bundle?.sourceRoot).toBe(process.cwd());
		expect(specCommand).toMatchObject({
			assetId: "command:spec-to-backlog",
			defaultScope: "personal",
			sourcePath: "external-commands/spec-to-backlog.md",
		});
		expect(implementCommand).toMatchObject({
			assetId: "command:implement-plan",
			defaultScope: "personal",
			sourcePath: "external-commands/implement-plan.md",
		});

		if (!bundle || !specCommand) {
			throw new Error("Expected registered authority descriptors");
		}
		expect(
			resolveHarnessAssetTarget({
				targetId: "claude",
				asset: runtimeSkill,
				roots,
			}).ownerRoot,
		).toBe(join(PROJECT_ROOT, ".claude"));
		expect(
			resolveHarnessAssetTarget({ targetId: "claude", asset: bundle, roots })
				.ownerRoot,
		).toBe(join("/users/cosmo", ".claude"));
		expect(
			resolveHarnessAssetTarget({
				targetId: "claude",
				asset: specCommand,
				roots,
			}).ownerRoot,
		).toBe(join("/users/cosmo", ".claude"));
		expect(
			resolveHarnessAssetTarget({
				targetId: "claude",
				asset: bundle,
				scope: "project",
				roots,
			}).ownerRoot,
		).toBe(join(PROJECT_ROOT, ".claude"));

		const writeRoots = {
			get projectRoot(): string {
				throw new Error("owner roots must not resolve for an invalid mode");
			},
			get homeRoot(): string {
				throw new Error("owner roots must not resolve for an invalid mode");
			},
		};
		expect(() =>
			resolveHarnessAssetTarget({
				targetId: "claude",
				asset: specCommand,
				requestedMode: "link",
				roots: writeRoots,
			}),
		).toThrow(/command:spec-to-backlog.*link.*copy/i);
		expect(() =>
			resolveHarnessAssetTarget({
				targetId: "claude",
				asset: {
					...runtimeSkill,
					assetId: "skill:remote",
					sourcePath: "https://example.com/remote-skill",
				},
				requestedMode: "link",
				roots: writeRoots,
			}),
		).toThrow(/skill:remote.*link.*local filesystem source path/i);
		expect(existsSync(join(tmp.path, ".claude"))).toBe(false);
		expect(
			existsSync(join(tmp.path, ".cosmonauts-harness-manifest.json")),
		).toBe(false);

		const [exporterSource, cliSource, packageManifest] = await Promise.all([
			readFile(join(process.cwd(), "lib", "skills", "exporter.ts"), "utf-8"),
			readFile(join(process.cwd(), "cli", "skills", "subcommand.ts"), "utf-8"),
			readFile(join(process.cwd(), "package.json"), "utf-8").then(
				(raw) =>
					JSON.parse(raw) as {
						readonly files?: readonly string[];
						readonly pi?: { readonly extensions?: readonly string[] };
						readonly scripts?: Readonly<Record<string, string>>;
					},
			),
		]);

		expect(exporterSource).toMatch(/harness-adapters\/registry\.ts/);
		expect(exporterSource).not.toMatch(/switch\s*\(options\.target\)/);
		expect(cliSource).not.toMatch(/VALID_TARGETS/);
		expect(packageManifest.files).toContain("external-commands/");
		expect(packageManifest.pi?.extensions).not.toContain("external-commands/");
		expect(Object.keys(packageManifest.scripts ?? {})).not.toContain(
			"harness:check",
		);
	});
});
