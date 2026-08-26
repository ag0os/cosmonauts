import {
	lstat,
	mkdir,
	mkdtemp,
	readFile,
	readlink,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
	readHarnessManifest,
	sha256,
} from "../../lib/harness-adapters/provenance.ts";
import { resolveHarnessAssetTarget } from "../../lib/harness-adapters/registry.ts";
import {
	GENERATED_BY_MARKER,
	renderIdentityMarkdown,
} from "../../lib/harness-adapters/render.ts";
import { syncHarnessAsset } from "../../lib/harness-adapters/sync.ts";
import type {
	HarnessAsset,
	ResolvedHarnessAssetTarget,
} from "../../lib/harness-adapters/types.ts";

const tempRoots: string[] = [];

afterEach(async () => {
	await Promise.all(
		tempRoots
			.splice(0)
			.map((path) => rm(path, { recursive: true, force: true })),
	);
});

describe("harness asset rendering", () => {
	test("materializes sticky copy direct-link flat and generated-wrapper shapes safely", async () => {
		// @cosmo-behavior plan:harness-adapters#B-005
		const root = await mkdtemp(join(tmpdir(), "cosmonauts-render-"));
		tempRoots.push(root);
		const projectRoot = join(root, "project");
		const homeRoot = join(root, "home");
		const sourceRoot = join(projectRoot, "sources");
		await mkdir(sourceRoot, { recursive: true });
		const outside = outsidePath(root);
		await mkdir(outside);

		const crlf = Buffer.from(
			"---\r\nunknown: keep\r\nname: crlf\r\ndescription: exact\r\n---\r\n# CRLF\r\n",
		);
		const reordered = Buffer.from(
			"---\nzz-extra: [3, 2, 1]\ndescription: exact\nname: reordered\n---\n# Body\n",
		);
		const bare = Buffer.from("# No frontmatter\n");
		for (const [source, offset] of [
			[crlf, crlf.indexOf(Buffer.from("# CRLF"))],
			[reordered, reordered.indexOf(Buffer.from("# Body"))],
			[bare, 0],
		] as const) {
			const rendered = renderIdentityMarkdown(source);
			expect(rendered.subarray(0, offset)).toEqual(source.subarray(0, offset));
			expect(
				rendered.subarray(offset, offset + GENERATED_BY_MARKER.length),
			).toEqual(GENERATED_BY_MARKER);
			expect(rendered.subarray(offset + GENERATED_BY_MARKER.length)).toEqual(
				source.subarray(offset),
			);
			expect(countOccurrences(rendered, GENERATED_BY_MARKER)).toBe(1);
		}

		const copySource = join(sourceRoot, "copy", "SKILL.md");
		await mkdir(dirname(copySource), { recursive: true });
		await writeFile(copySource, crlf);
		const copyAsset = asset("copy", sourceRoot, "copy");
		const copyTarget = target(copyAsset, projectRoot, homeRoot);
		const firstCopy = await syncHarnessAsset({
			projectRoot,
			asset: copyAsset,
			target: copyTarget,
			now: () => new Date("2026-08-26T00:00:00.000Z"),
		});
		expect(firstCopy).toMatchObject({
			beforeStatus: "missing",
			requestedMode: "copy",
			wroteTarget: true,
			wroteManifest: true,
		});
		const copyEntry = firstCopy.manifestEntry;
		expect(copyEntry.provenance).toMatchObject({
			kind: "copy",
			sourceDigest: sha256(crlf),
			markerVersion: 1,
		});
		if (copyEntry.provenance.kind !== "copy") throw new Error("copy expected");
		const copiedBytes = await readFile(join(copyTarget.targetPath, "SKILL.md"));
		expect(copiedBytes).toEqual(renderIdentityMarkdown(crlf));
		expect(copyEntry.sourcePath).toBe("copy");
		expect(copyEntry.provenance.renderedDigest).toBe(sha256(copiedBytes));
		expect(copyEntry.provenance.targetDigest).toBe(sha256(copiedBytes));
		const copyManifestPath = join(
			copyTarget.ownerRoot,
			".cosmonauts-harness-manifest.json",
		);
		const beforeNoop = await snapshot([
			copyManifestPath,
			copyTarget.targetPath,
			join(copyTarget.targetPath, "SKILL.md"),
		]);
		const repeatedCopy = await syncHarnessAsset({
			projectRoot,
			asset: copyAsset,
			target: copyTarget,
			now: () => new Date("2030-01-01T00:00:00.000Z"),
		});
		expect(repeatedCopy).toMatchObject({
			beforeStatus: "current",
			recordedMode: "copy",
			requestedMode: "copy",
			wroteTarget: false,
			wroteManifest: false,
		});
		expect(await snapshot(Object.keys(beforeNoop))).toEqual(beforeNoop);

		const directorySource = join(sourceRoot, "directory");
		await mkdir(directorySource, { recursive: true });
		await writeFile(join(directorySource, "SKILL.md"), reordered);
		const directoryAsset = asset("directory", sourceRoot, "directory");
		const directoryTarget = target(
			directoryAsset,
			projectRoot,
			homeRoot,
			"link",
		);
		const direct = await syncHarnessAsset({
			projectRoot,
			asset: directoryAsset,
			target: directoryTarget,
			now: fixedNow,
		});
		expect((await lstat(directoryTarget.targetPath)).isSymbolicLink()).toBe(
			true,
		);
		expect(await realpath(directoryTarget.targetPath)).toBe(
			await realpath(directorySource),
		);
		expect(direct.manifestEntry.provenance).toEqual({
			kind: "direct-link",
			expectedCanonicalSource: await realpath(directorySource),
			linkShape: "directory",
		});
		expect("sourceDigest" in direct.manifestEntry.provenance).toBe(false);
		expect(await readFile(join(directorySource, "SKILL.md"))).toEqual(
			reordered,
		);
		await writeFile(
			join(directorySource, "SKILL.md"),
			Buffer.from("changed\n"),
		);
		await writeFile(join(directorySource, "new.txt"), Buffer.from("live\n"));
		const directBefore = await snapshot([
			directoryTarget.targetPath,
			join(directoryTarget.ownerRoot, ".cosmonauts-harness-manifest.json"),
		]);
		const directAgain = await syncHarnessAsset({
			projectRoot,
			asset: directoryAsset,
			target: target(directoryAsset, projectRoot, homeRoot),
			now: () => new Date("2030-01-01T00:00:00.000Z"),
		});
		expect(directAgain).toMatchObject({
			beforeStatus: "current",
			recordedMode: "link",
			requestedMode: "link",
		});
		expect(directAgain.wroteManifest).toBe(false);
		expect(
			await readFile(join(directoryTarget.targetPath, "SKILL.md")),
		).toEqual(Buffer.from("changed\n"));
		expect(await snapshot(Object.keys(directBefore))).toEqual(directBefore);
		await rm(directoryTarget.targetPath);
		await symlink(outsidePath(root), directoryTarget.targetPath, "dir");
		const wrongDirect = await syncHarnessAsset({
			projectRoot,
			asset: directoryAsset,
			target: target(directoryAsset, projectRoot, homeRoot),
			check: true,
			now: fixedNow,
		});
		expect(wrongDirect).toMatchObject({
			beforeStatus: "locally-edited",
			recordedMode: "link",
			requestedMode: "link",
			wroteTarget: false,
			wroteManifest: false,
		});
		await rm(directoryTarget.targetPath);
		await symlink(
			await realpath(directorySource),
			directoryTarget.targetPath,
			"dir",
		);
		const intactConversion = await syncHarnessAsset({
			projectRoot,
			asset: directoryAsset,
			target: target(directoryAsset, projectRoot, homeRoot, "copy"),
			now: fixedNow,
		});
		expect(intactConversion).toMatchObject({
			recordedMode: "link",
			requestedMode: "copy",
			beforeStatus: "source-ahead",
			reason: "mode-conversion",
			wroteTarget: true,
			wroteManifest: true,
		});
		expect((await lstat(directoryTarget.targetPath)).isDirectory()).toBe(true);
		expect((await lstat(directoryTarget.targetPath)).isSymbolicLink()).toBe(
			false,
		);

		const flatSource = join(sourceRoot, "flat.md");
		await writeFile(flatSource, bare);
		const flatAsset = asset("flat", sourceRoot, "flat.md");
		const flatTarget = target(flatAsset, projectRoot, homeRoot, "link");
		const flat = await syncHarnessAsset({
			projectRoot,
			asset: flatAsset,
			target: flatTarget,
			now: fixedNow,
		});
		expect((await lstat(flatTarget.targetPath)).isDirectory()).toBe(true);
		expect(
			(await lstat(join(flatTarget.targetPath, "SKILL.md"))).isSymbolicLink(),
		).toBe(true);
		expect(await realpath(join(flatTarget.targetPath, "SKILL.md"))).toBe(
			await realpath(flatSource),
		);
		expect(flat.manifestEntry.provenance).toEqual({
			kind: "direct-link",
			expectedCanonicalSource: await realpath(flatSource),
			linkShape: "flat-skill",
		});
		expect("sourceDigest" in flat.manifestEntry.provenance).toBe(false);
		await writeFile(flatSource, Buffer.from("# Flat source changed live\n"));
		const flatBefore = await snapshot([
			flatTarget.targetPath,
			join(flatTarget.targetPath, "SKILL.md"),
			join(flatTarget.ownerRoot, ".cosmonauts-harness-manifest.json"),
		]);
		const flatAgain = await syncHarnessAsset({
			projectRoot,
			asset: flatAsset,
			target: target(flatAsset, projectRoot, homeRoot),
			now: () => new Date("2030-01-01T00:00:00.000Z"),
		});
		expect(flatAgain).toMatchObject({
			beforeStatus: "current",
			recordedMode: "link",
			requestedMode: "link",
			wroteTarget: false,
			wroteManifest: false,
		});
		expect(await readFile(join(flatTarget.targetPath, "SKILL.md"))).toEqual(
			Buffer.from("# Flat source changed live\n"),
		);
		const flatBareCheck = await syncHarnessAsset({
			projectRoot,
			asset: flatAsset,
			target: target(flatAsset, projectRoot, homeRoot),
			check: true,
			now: () => new Date("2031-01-01T00:00:00.000Z"),
		});
		expect(flatBareCheck).toMatchObject({
			beforeStatus: "current",
			recordedMode: "link",
			requestedMode: "link",
			wroteTarget: false,
			wroteManifest: false,
		});
		expect(await snapshot(Object.keys(flatBefore))).toEqual(flatBefore);
		await rm(join(flatTarget.targetPath, "SKILL.md"));
		const missingFlat = await syncHarnessAsset({
			projectRoot,
			asset: flatAsset,
			target: target(flatAsset, projectRoot, homeRoot),
			check: true,
			now: fixedNow,
		});
		expect(missingFlat.beforeStatus).toBe("locally-edited");
		expect(missingFlat.wroteTarget).toBe(false);
		await symlink(outsidePath(root), join(flatTarget.targetPath, "SKILL.md"));
		const escapingFlat = await syncHarnessAsset({
			projectRoot,
			asset: flatAsset,
			target: target(flatAsset, projectRoot, homeRoot),
			check: true,
			now: fixedNow,
		});
		expect(escapingFlat.beforeStatus).toBe("locally-edited");
		expect(escapingFlat.wroteTarget).toBe(false);
		await rm(join(flatTarget.targetPath, "SKILL.md"));
		await symlink(
			await realpath(flatSource),
			join(flatTarget.targetPath, "SKILL.md"),
		);

		const wrapperSource = join(sourceRoot, "bundle");
		await mkdir(join(wrapperSource, "references"), { recursive: true });
		await writeFile(join(wrapperSource, "SKILL.md"), reordered);
		await writeFile(join(wrapperSource, "references", "authored.md"), bare);
		await writeFile(
			join(wrapperSource, "references", "generated.md"),
			Buffer.from("stale generated source\n"),
		);
		const wrapperAsset = {
			...asset("bundle", sourceRoot, "bundle"),
			generatedInputs: "cosmonauts-inventory",
		} as const satisfies HarnessAsset;
		const wrapperTarget = target(wrapperAsset, projectRoot, homeRoot, "link");
		const generatedInput = Buffer.from('{"chains":["verify"]}');
		const generatedBytes = Buffer.from("# Generated\n");
		const wrapper = await syncHarnessAsset({
			projectRoot,
			asset: wrapperAsset,
			target: wrapperTarget,
			generatedNodes: [
				{
					relativePath: "references/generated.md",
					inputBytes: generatedInput,
					renderedBytes: generatedBytes,
				},
			],
			now: fixedNow,
		});
		expect(
			(
				await lstat(join(wrapperTarget.targetPath, "SKILL.md"))
			).isSymbolicLink(),
		).toBe(true);
		expect(
			(
				await lstat(join(wrapperTarget.targetPath, "references", "authored.md"))
			).isSymbolicLink(),
		).toBe(true);
		expect(
			(
				await lstat(
					join(wrapperTarget.targetPath, "references", "generated.md"),
				)
			).isFile(),
		).toBe(true);
		expect(
			await readFile(
				join(wrapperTarget.targetPath, "references", "generated.md"),
			),
		).toEqual(generatedBytes);
		expect(wrapper.manifestEntry.provenance).toMatchObject({
			kind: "generated-wrapper",
			authoredLinks: expect.arrayContaining([
				{
					relativePath: "SKILL.md",
					expectedCanonicalSource: await realpath(
						join(wrapperSource, "SKILL.md"),
					),
				},
			]),
			generatedNodes: [
				{
					relativePath: "references/generated.md",
					inputDigest: sha256(generatedInput),
					renderedDigest: sha256(generatedBytes),
					targetDigest: sha256(generatedBytes),
				},
			],
		});
		expect(await readFile(join(wrapperSource, "SKILL.md"))).toEqual(reordered);
		expect(
			await readFile(join(wrapperSource, "references", "generated.md")),
		).toEqual(Buffer.from("stale generated source\n"));

		const wrapperNoopBefore = await snapshot([
			join(wrapperTarget.ownerRoot, ".cosmonauts-harness-manifest.json"),
			wrapperTarget.targetPath,
			join(wrapperTarget.targetPath, "SKILL.md"),
			join(wrapperTarget.targetPath, "references"),
			join(wrapperTarget.targetPath, "references", "authored.md"),
			join(wrapperTarget.targetPath, "references", "generated.md"),
		]);
		await writeFile(join(wrapperSource, "references", "authored.md"), crlf);
		const wrapperAgain = await syncHarnessAsset({
			projectRoot,
			asset: wrapperAsset,
			target: wrapperTarget,
			generatedNodes: [
				{
					relativePath: "references/generated.md",
					inputBytes: generatedInput,
					renderedBytes: generatedBytes,
				},
			],
			now: () => new Date("2030-01-01T00:00:00.000Z"),
		});
		expect(wrapperAgain.beforeStatus).toBe("current");
		expect(
			await readFile(
				join(wrapperTarget.targetPath, "references", "authored.md"),
			),
		).toEqual(crlf);
		expect(await snapshot(Object.keys(wrapperNoopBefore))).toEqual(
			wrapperNoopBefore,
		);
		await writeFile(join(wrapperSource, "references", "added.md"), bare);
		const changedLinkMap = await syncHarnessAsset({
			projectRoot,
			asset: wrapperAsset,
			target: wrapperTarget,
			check: true,
			generatedNodes: [
				{
					relativePath: "references/generated.md",
					inputBytes: generatedInput,
					renderedBytes: generatedBytes,
				},
			],
			now: fixedNow,
		});
		expect(changedLinkMap).toMatchObject({
			beforeStatus: "source-ahead",
			reason: "link-map-changed",
			wroteTarget: false,
			wroteManifest: false,
		});
		await rm(join(wrapperSource, "references", "added.md"));
		const generatedTargetPath = join(
			wrapperTarget.targetPath,
			"references",
			"generated.md",
		);
		await writeFile(
			generatedTargetPath,
			Buffer.from("edited generated target\n"),
		);
		const editedGenerated = await syncHarnessAsset({
			projectRoot,
			asset: wrapperAsset,
			target: wrapperTarget,
			check: true,
			generatedNodes: [
				{
					relativePath: "references/generated.md",
					inputBytes: generatedInput,
					renderedBytes: generatedBytes,
				},
			],
			now: fixedNow,
		});
		expect(editedGenerated).toMatchObject({
			beforeStatus: "locally-edited",
			reason: "locally-edited",
			wroteTarget: false,
			wroteManifest: false,
		});
		await writeFile(generatedTargetPath, generatedBytes);
		const changedGeneratedCheck = await syncHarnessAsset({
			projectRoot,
			asset: wrapperAsset,
			target: wrapperTarget,
			check: true,
			generatedNodes: [
				{
					relativePath: "references/generated.md",
					inputBytes: Buffer.from('{"chains":["changed"]}'),
					renderedBytes: generatedBytes,
				},
			],
			now: fixedNow,
		});
		expect(changedGeneratedCheck).toMatchObject({
			beforeStatus: "source-ahead",
			reason: "generated-input-changed",
			wroteTarget: false,
			wroteManifest: false,
		});

		const codexOwner = join(projectRoot, ".agents");
		const codexManifest = join(codexOwner, ".cosmonauts-harness-manifest.json");
		const codexFlatTarget = resolveHarnessAssetTarget({
			targetId: "codex",
			asset: flatAsset,
			roots: { projectRoot, homeRoot },
			requestedMode: "link",
		});
		await expect(
			syncHarnessAsset({
				projectRoot,
				asset: flatAsset,
				target: codexFlatTarget,
				now: fixedNow,
			}),
		).rejects.toThrow(/skill:flat.*flat-skill.*directory/i);
		expect(await pathExists(codexOwner)).toBe(false);
		expect(await pathExists(codexFlatTarget.targetPath)).toBe(false);
		expect(await pathExists(codexManifest)).toBe(false);

		const codexWrapperTarget = resolveHarnessAssetTarget({
			targetId: "codex",
			asset: wrapperAsset,
			roots: { projectRoot, homeRoot },
			requestedMode: "link",
		});
		await expect(
			syncHarnessAsset({
				projectRoot,
				asset: wrapperAsset,
				target: codexWrapperTarget,
				generatedNodes: [
					{
						relativePath: "references/generated.md",
						inputBytes: generatedInput,
						renderedBytes: generatedBytes,
					},
				],
				now: fixedNow,
			}),
		).rejects.toThrow(/skill:bundle.*generated-wrapper.*directory/i);
		expect(await pathExists(codexOwner)).toBe(false);
		expect(await pathExists(codexWrapperTarget.targetPath)).toBe(false);
		expect(await pathExists(codexManifest)).toBe(false);

		const codexDirectoryTarget = resolveHarnessAssetTarget({
			targetId: "codex",
			asset: directoryAsset,
			roots: { projectRoot, homeRoot },
			requestedMode: "link",
		});
		const codexDirectory = await syncHarnessAsset({
			projectRoot,
			asset: directoryAsset,
			target: codexDirectoryTarget,
			now: fixedNow,
		});
		expect(codexDirectory.manifestEntry.provenance).toMatchObject({
			kind: "direct-link",
			linkShape: "directory",
		});
		expect(await realpath(codexDirectoryTarget.targetPath)).toBe(
			await realpath(directorySource),
		);

		const codexFlatCopyTarget = resolveHarnessAssetTarget({
			targetId: "codex",
			asset: flatAsset,
			roots: { projectRoot, homeRoot },
			requestedMode: "copy",
		});
		const codexFlatCopy = await syncHarnessAsset({
			projectRoot,
			asset: flatAsset,
			target: codexFlatCopyTarget,
			now: fixedNow,
		});
		expect(codexFlatCopy.manifestEntry.provenance.kind).toBe("copy");
		expect(
			(await lstat(join(codexFlatCopyTarget.targetPath, "SKILL.md"))).isFile(),
		).toBe(true);

		const codexWrapperCopyTarget = resolveHarnessAssetTarget({
			targetId: "codex",
			asset: wrapperAsset,
			roots: { projectRoot, homeRoot },
			requestedMode: "copy",
		});
		const codexWrapperCopy = await syncHarnessAsset({
			projectRoot,
			asset: wrapperAsset,
			target: codexWrapperCopyTarget,
			generatedNodes: [
				{
					relativePath: "references/generated.md",
					inputBytes: generatedInput,
					renderedBytes: generatedBytes,
				},
			],
			now: fixedNow,
		});
		expect(codexWrapperCopy.manifestEntry.provenance.kind).toBe("copy");
		expect(
			(
				await lstat(join(codexWrapperCopyTarget.targetPath, "SKILL.md"))
			).isFile(),
		).toBe(true);
		expect(
			(
				await lstat(
					join(codexWrapperCopyTarget.targetPath, "references", "generated.md"),
				)
			).isFile(),
		).toBe(true);

		const bareLink = target(copyAsset, projectRoot, homeRoot, "link");
		const conversion = await syncHarnessAsset({
			projectRoot,
			asset: copyAsset,
			target: bareLink,
			check: true,
			now: fixedNow,
		});
		expect(conversion).toMatchObject({
			recordedMode: "copy",
			requestedMode: "link",
			beforeStatus: "source-ahead",
			reason: "mode-conversion",
			wroteTarget: false,
			wroteManifest: false,
		});
		const damagedCopy = join(copyTarget.targetPath, "SKILL.md");
		await writeFile(damagedCopy, Buffer.from("local edit\n"));
		const conversionBefore = await snapshot([copyManifestPath, damagedCopy]);
		await expect(
			syncHarnessAsset({
				projectRoot,
				asset: copyAsset,
				target: bareLink,
				now: fixedNow,
			}),
		).rejects.toThrow(/intact recorded baseline/i);
		expect(await snapshot(Object.keys(conversionBefore))).toEqual(
			conversionBefore,
		);

		const invalidRoot = join(root, "invalid-owner");
		const invalidManifest = join(
			invalidRoot,
			".cosmonauts-harness-manifest.json",
		);
		const invalidCases: Array<{
			name: string;
			asset: HarnessAsset;
			target: ResolvedHarnessAssetTarget;
			generatedNodes?: Array<{
				relativePath: string;
				inputBytes: Buffer;
				renderedBytes: Buffer;
			}>;
		}> = [];
		const remoteAsset = asset("remote", "https://example.com/repo", "skill");
		invalidCases.push({
			name: "remote",
			asset: remoteAsset,
			target: fakeTarget(remoteAsset, invalidRoot, "link"),
		});
		const escapeAsset = asset("escape", sourceRoot, "../outside");
		invalidCases.push({
			name: "descendant escape",
			asset: escapeAsset,
			target: fakeTarget(escapeAsset, invalidRoot, "link"),
		});
		const brokenPath = join(sourceRoot, "broken");
		await symlink("missing", brokenPath);
		const brokenAsset = asset("broken", sourceRoot, "broken");
		invalidCases.push({
			name: "broken symlink",
			asset: brokenAsset,
			target: fakeTarget(brokenAsset, invalidRoot, "link"),
		});
		const escapingPath = join(sourceRoot, "escaping");
		await symlink(outside, escapingPath);
		const escapingAsset = asset("escaping", sourceRoot, "escaping");
		invalidCases.push({
			name: "escaping symlink",
			asset: escapingAsset,
			target: fakeTarget(escapingAsset, invalidRoot, "link"),
		});
		invalidCases.push({
			name: "owner-root escape",
			asset: copyAsset,
			target: {
				...fakeTarget(copyAsset, invalidRoot, "copy"),
				targetPath: join(invalidRoot, "..", "escaped-target"),
			},
		});
		invalidCases.push({
			name: "invalid generated shape",
			asset: wrapperAsset,
			target: fakeTarget(wrapperAsset, invalidRoot, "link"),
			generatedNodes: [
				{
					relativePath: "../generated.md",
					inputBytes: Buffer.from("input"),
					renderedBytes: Buffer.from("output"),
				},
			],
		});
		for (const invalid of invalidCases) {
			await expect(
				syncHarnessAsset({
					projectRoot,
					asset: invalid.asset,
					target: invalid.target,
					generatedNodes: invalid.generatedNodes,
					now: fixedNow,
				}),
				invalid.name,
			).rejects.toThrow();
			expect(await pathExists(invalidRoot), invalid.name).toBe(false);
			expect(await pathExists(invalidManifest), invalid.name).toBe(false);
		}
		await symlink(outside, invalidRoot, "dir");
		await expect(
			syncHarnessAsset({
				projectRoot,
				asset: copyAsset,
				target: fakeTarget(copyAsset, invalidRoot, "copy"),
				now: fixedNow,
			}),
		).rejects.toThrow(/owner root.*symlink/i);
		expect(await pathExists(join(outside, "skills", "copy"))).toBe(false);
		expect(
			await pathExists(join(outside, ".cosmonauts-harness-manifest.json")),
		).toBe(false);
		await rm(invalidRoot);

		const commandAsset = {
			...asset("command", sourceRoot, "flat.md"),
			assetId: "command:test",
			kind: "command",
		} as const satisfies HarnessAsset;
		const commandOwner = join(root, "command-owner");
		expect(() =>
			resolveHarnessAssetTarget({
				targetId: "claude",
				asset: commandAsset,
				roots: { projectRoot: commandOwner, homeRoot: commandOwner },
				requestedMode: "link",
			}),
		).toThrow(/does not support requested mode "link".*supported mode: copy/i);
		expect(await pathExists(commandOwner)).toBe(false);
		expect(await pathExists(join(commandOwner, ".claude"))).toBe(false);

		const manifest = await readHarnessManifest(copyManifestPath);
		expect(Object.values(manifest.entries)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ assetId: copyAsset.assetId }),
			]),
		);
	});
});

function asset(
	name: string,
	sourceRoot: string,
	sourcePath: string,
): HarnessAsset {
	return {
		assetId: `skill:${name}`,
		kind: "skill",
		ownership: { kind: "project" },
		sourceRootId: "fixture:skills",
		sourceRoot,
		sourcePath,
		logicalPath: sourcePath,
		outputIdentity: name,
		defaultScope: "project",
	};
}

function target(
	asset: HarnessAsset,
	projectRoot: string,
	homeRoot: string,
	requestedMode?: "copy" | "link",
): ResolvedHarnessAssetTarget {
	return resolveHarnessAssetTarget({
		targetId: "claude",
		asset,
		roots: { projectRoot, homeRoot },
		requestedMode,
	});
}

function fakeTarget(
	asset: HarnessAsset,
	ownerRoot: string,
	requestedMode: "copy" | "link",
): ResolvedHarnessAssetTarget {
	return {
		targetId: "claude",
		scope: "project",
		kind: asset.kind,
		ownerRoot,
		targetDirectory: join(ownerRoot, "skills"),
		transform: "identity",
		supportedModes: ["copy", "link"],
		supportedLinkShapes: ["directory", "flat-skill", "generated-wrapper"],
		assetId: asset.assetId,
		targetPath: join(ownerRoot, "skills", asset.outputIdentity),
		requestedMode,
	};
}

function fixedNow(): Date {
	return new Date("2026-08-26T00:00:00.000Z");
}

function outsidePath(root: string): string {
	return join(root, "outside");
}

async function snapshot(
	paths: readonly string[],
): Promise<Record<string, string>> {
	const result: Record<string, string> = {};
	for (const path of paths) {
		const stats = await lstat(path);
		result[path] = JSON.stringify({
			mtimeMs: stats.mtimeMs,
			type: stats.isSymbolicLink()
				? "link"
				: stats.isDirectory()
					? "directory"
					: "file",
			...(stats.isSymbolicLink() ? { link: await readlink(path) } : {}),
			...(stats.isFile() ? { digest: sha256(await readFile(path)) } : {}),
		});
	}
	return result;
}

function countOccurrences(buffer: Buffer, needle: Buffer): number {
	let count = 0;
	let offset = 0;
	while (true) {
		const nextOffset = buffer.indexOf(needle, offset);
		if (nextOffset === -1) break;
		count += 1;
		offset = nextOffset + needle.length;
	}
	return count;
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await lstat(path);
		return true;
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return false;
		throw error;
	}
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}
