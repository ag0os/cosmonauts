import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	createRuntimeSkillDescriptor,
	getHarnessTarget,
	isHarnessPackageDefinitionKey,
	isImplementedHarnessTargetId,
	listHarnessPackageDefinitionKeys,
	listHarnessTargets,
	resolveHarnessAssetTarget,
	resolveHarnessTargetDirectory,
} from "../../lib/harness-adapters/registry.ts";
import type { HarnessAsset } from "../../lib/harness-adapters/types.ts";
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
			supportedLinkShapes: ["directory", "flat-skill"],
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
		const bundle: HarnessAsset = {
			assetId: "skill:supplied-bundle",
			kind: "skill",
			ownership: { kind: "authority", authorityId: "cosmonauts/core" },
			sourceRootId: "consumer:assets",
			sourceRoot: "/consumer/assets",
			sourcePath: "supplied-bundle",
			logicalPath: "supplied-bundle",
			outputIdentity: "supplied-bundle",
			defaultScope: "personal",
		};
		const specCommand: HarnessAsset = {
			...bundle,
			assetId: "command:supplied-command",
			kind: "command",
			sourcePath: "supplied-command.md",
			logicalPath: "supplied-command.md",
			outputIdentity: "supplied-command.md",
		};

		expect(runtimeSkill).toMatchObject({
			assetId: "skill:plan",
			defaultScope: "project",
			ownership: { kind: "project" },
		});
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
		).toThrow(/command:supplied-command.*link.*copy/i);
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
						readonly pi?: {
							readonly extensions?: readonly string[];
							readonly themes?: readonly string[];
						};
						readonly scripts?: Readonly<Record<string, string>>;
					},
			),
		]);

		expect(exporterSource).toMatch(/harness-adapters\/registry\.ts/);
		expect(exporterSource).not.toMatch(/switch\s*\(options\.target\)/);
		expect(cliSource).not.toMatch(/VALID_TARGETS/);
		expect(packageManifest.files).not.toContain("external-commands/");
		expect(packageManifest.files).not.toContain("external-skills/");
		expect(packageManifest.pi?.extensions ?? []).not.toContain(
			"external-commands/",
		);
		expect(packageManifest.pi).toEqual({ themes: ["./themes"] });
		expect(Object.keys(packageManifest.scripts ?? {})).not.toContain(
			"harness:check",
		);
	});
});
