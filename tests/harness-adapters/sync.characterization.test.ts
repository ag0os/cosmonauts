import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
	resolveHarnessTransactionPaths,
	sha256,
} from "../../lib/harness-adapters/provenance.ts";
import { resolveHarnessAssetTarget } from "../../lib/harness-adapters/registry.ts";
import type {
	HarnessManifestSnapshot,
	HarnessNodeSnapshot,
	OwnerRootTransactionJournal,
} from "../../lib/harness-adapters/sync.ts";
import {
	runClaudeCommandPairBootstrap,
	serializeOwnerRootJournal,
	syncHarnessAsset,
	withOwnerRootTransaction,
} from "../../lib/harness-adapters/sync.ts";
import type { HarnessAsset } from "../../lib/harness-adapters/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("harness-sync-characterization-");

describe("single-asset classification characterization", () => {
	test("reports missing, current, source drift, local edits, missing baselines, mode conversion, and pending journals without check-mode writes", async () => {
		const fixture = await createAssetFixture();
		const initialTree = await snapshotPaths(fixture);

		await expect(checkAsset(fixture)).resolves.toMatchObject({
			beforeStatus: "missing",
			reason: "missing",
			wroteTarget: false,
			wroteManifest: false,
			exitCode: 1,
		});
		expect(await snapshotPaths(fixture)).toEqual(initialTree);

		await syncHarnessAsset(fixture);
		const installedTarget = await readFile(
			join(fixture.target.targetPath, "SKILL.md"),
		);
		await expect(checkAsset(fixture)).resolves.toMatchObject({
			beforeStatus: "current",
			reason: "current",
			recordedMode: "copy",
			requestedMode: "copy",
			exitCode: 0,
		});

		await writeFile(fixture.sourcePath, "# Source changed\n");
		await expect(checkAsset(fixture)).resolves.toMatchObject({
			beforeStatus: "source-ahead",
			reason: "source-changed",
			exitCode: 1,
		});
		await writeFile(
			join(fixture.target.targetPath, "SKILL.md"),
			"local edit\n",
		);
		await expect(checkAsset(fixture)).resolves.toMatchObject({
			beforeStatus: "locally-edited",
			reason: "locally-edited",
			exitCode: 1,
		});

		await rm(fixture.target.targetPath, { recursive: true });
		await expect(checkAsset(fixture)).resolves.toMatchObject({
			beforeStatus: "missing",
			reason: "missing",
			recordedMode: "copy",
			exitCode: 1,
		});
		await mkdir(fixture.target.targetPath, { recursive: true });
		await writeFile(
			join(fixture.target.targetPath, "SKILL.md"),
			installedTarget,
		);
		await writeFile(fixture.sourcePath, "# Example\n");
		await expect(
			syncHarnessAsset({
				...fixture,
				target: { ...fixture.target, requestedMode: "link" },
				check: true,
			}),
		).resolves.toMatchObject({
			beforeStatus: "source-ahead",
			reason: "mode-conversion",
			recordedMode: "copy",
			requestedMode: "link",
			exitCode: 1,
		});

		await writeFile(fixture.journalPath, '{"phase":"prepared"}\n');
		const beforePending = await snapshotPaths(fixture);
		await expect(checkAsset(fixture)).resolves.toMatchObject({
			beforeStatus: "source-ahead",
			reason: "pending-journal",
			wroteTarget: false,
			wroteManifest: false,
			exitCode: 1,
		});
		expect(await snapshotPaths(fixture)).toEqual(beforePending);
	});

	test("distinguishes untraceable bytes from another project's manifest claim", async () => {
		const first = await createAssetFixture("first", "personal");
		await mkdir(first.target.targetPath, { recursive: true });
		await writeFile(join(first.target.targetPath, "SKILL.md"), "unmanaged\n");
		await expect(checkAsset(first)).resolves.toMatchObject({
			beforeStatus: "locally-edited",
			reason: "foreign-or-untraceable",
		});
		await rm(first.target.targetPath, { recursive: true });
		await syncHarnessAsset(first);

		const second = await createAssetFixture(
			"second",
			"personal",
			first.homeRoot,
		);
		await expect(checkAsset(second)).resolves.toMatchObject({
			beforeStatus: "locally-edited",
			reason: "foreign-owner",
			wroteTarget: false,
			wroteManifest: false,
		});
	});
});

describe("Claude command preparation and evidence identity characterization", () => {
	test("creates both native sources and completes one durable command-pair transaction", async () => {
		const fixture = await createCommandFixture("complete");
		const evidence = await runClaudeCommandPairBootstrap(fixture);

		expect(evidence).toMatchObject({
			phase: "complete",
			manifestKeys: [expect.any(String), expect.any(String)],
			commands: [
				{
					assetId: "command:spec-to-backlog",
					backupExit: "removed-exact",
				},
				{
					assetId: "command:implement-plan",
					backupExit: "removed-exact",
				},
			],
		});
		for (let index = 0; index < 2; index += 1) {
			expect(await readFile(fixture.nativePaths[index] ?? "")).toEqual(
				fixture.liveBytes[index],
			);
		}
		await expect(readFile(fixture.journalPath)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("rejects partial native sources and missing lock-held native sources without moving live commands", async () => {
		const partial = await createCommandFixture("partial");
		await mkdir(dirname(partial.nativePaths[0] ?? ""), { recursive: true });
		await writeFile(partial.nativePaths[0] ?? "", partial.liveBytes[0] ?? "");
		await expect(runClaudeCommandPairBootstrap(partial)).rejects.toThrow(
			/partial/i,
		);
		expect(
			await Promise.all(partial.livePaths.map((path) => readFile(path))),
		).toEqual(partial.liveBytes);

		const underLock = await createCommandFixture("under-lock");
		await seedNativeCommands(underLock);
		await expect(
			runClaudeCommandPairBootstrap({
				...underLock,
				onTransactionLock: async () => {
					await Promise.all(
						underLock.nativePaths.map((path) => rm(path, { force: true })),
					);
				},
			}),
		).rejects.toThrow(/native sources are missing under the transaction lock/i);
		expect(
			JSON.parse(await readFile(underLock.evidencePath, "utf8")),
		).toMatchObject({ phase: "authorized" });
		expect(
			await Promise.all(underLock.livePaths.map((path) => readFile(path))),
		).toEqual(underLock.liveBytes);
	});

	test("rejects every reachable command-evidence identity predicate before locking", async () => {
		const cases: Array<readonly [string, (value: Evidence) => void]> = [
			[
				"owner id",
				(value) => {
					value.ownerId = "project:wrong";
				},
			],
			[
				"owner root",
				(value) => {
					value.ownerRoot = "/tmp/claude";
				},
			],
			[
				"target",
				(value) => {
					value.target = "codex";
				},
			],
			[
				"scope",
				(value) => {
					value.scope = "project";
				},
			],
			[
				"cleanup policy",
				(value) => {
					value.cleanupPolicy = "after-commit";
				},
			],
			[
				"atomic set",
				(value) => {
					value.atomicSet = false;
				},
			],
			[
				"marker version",
				(value) => {
					value.markerVersion = 2;
				},
			],
			[
				"asset id",
				(value) => {
					firstEvidenceRow(value).assetId = "command:wrong";
				},
			],
			[
				"live path",
				(value) => {
					firstEvidenceRow(value).livePath = "~/.claude/commands/wrong.md";
				},
			],
			[
				"output path",
				(value) => {
					firstEvidenceRow(value).outputPath = "~/.claude/commands/wrong.md";
				},
			],
			[
				"native path",
				(value) => {
					firstEvidenceRow(value).nativePath = "external-commands/wrong.md";
				},
			],
			[
				"native digest",
				(value) => {
					firstEvidenceRow(value).nativeDigest = "wrong";
				},
			],
			[
				"render digest",
				(value) => {
					firstEvidenceRow(value).renderDigest = "wrong";
				},
			],
			[
				"native length",
				(value) => {
					firstEvidenceRow(value).nativeLength += 1;
				},
			],
			[
				"render length",
				(value) => {
					firstEvidenceRow(value).renderLength += 1;
				},
			],
			[
				"manifest key",
				(value) => {
					value.manifestKeys[0] = "wrong-key";
				},
			],
		];

		for (const [label, mutate] of cases) {
			const fixture = await createCommandFixture(`identity-${label}`);
			const evidence = makeAuthorizedEvidence(fixture);
			mutate(evidence);
			await writeFile(fixture.evidencePath, `${JSON.stringify(evidence)}\n`);
			const lock = vi.fn();
			await expect(
				runClaudeCommandPairBootstrap({ ...fixture, onTransactionLock: lock }),
				label,
			).rejects.toThrow(/evidence (identity|path identity) is invalid/i);
			expect(lock).not.toHaveBeenCalled();
		}
	});

	test("applies installed-only final-byte and backup identity predicates", async () => {
		const cases: Array<readonly [string, (value: Evidence) => void]> = [
			[
				"final digest",
				(value) => {
					firstEvidenceRow(value).finalDigest = "wrong";
				},
			],
			[
				"final length",
				(value) => {
					firstEvidenceRow(value).finalLength = 1;
				},
			],
			[
				"backup path",
				(value) => {
					firstEvidenceRow(value).backupPath = "~/.wrong.backup";
				},
			],
		];
		for (const [label, mutate] of cases) {
			const fixture = await createCommandFixture(`installed-${label}`);
			const evidence = makeAuthorizedEvidence(fixture);
			evidence.phase = "installed";
			for (let index = 0; index < evidence.commands.length; index += 1) {
				const row = evidence.commands[index];
				if (!row) continue;
				row.finalDigest = row.liveDigest;
				row.finalLength = row.liveLength;
				row.backupPath = `~/.cosmonauts-harness-claude-${evidence.transactionId}-${index}.backup`;
			}
			mutate(evidence);
			await writeFile(fixture.evidencePath, `${JSON.stringify(evidence)}\n`);
			await expect(
				runClaudeCommandPairBootstrap(fixture),
				label,
			).rejects.toThrow(/path identity is invalid/i);
		}
	});
});

describe("owner-root journal recovery characterization", () => {
	test("returns none, restored-old, committed-new, evidence-required, and ambiguous through the transaction entry point", async () => {
		const none = await createRecoveryFixture("none", "prepared", false);
		await expect(runRecovery(none)).resolves.toMatchObject({
			state: "completed",
			recovery: { state: "none" },
			result: "continued",
		});

		const prepared = await createRecoveryFixture("prepared", "prepared");
		await expect(runRecovery(prepared)).resolves.toMatchObject({
			state: "completed",
			recovery: { state: "restored-old", phase: "prepared" },
		});
		await expect(readFile(prepared.journalPath)).rejects.toMatchObject({
			code: "ENOENT",
		});

		const commitReady = await createRecoveryFixture(
			"commit-ready",
			"commit-ready",
			true,
			"after-commit",
			"new",
			"old",
		);
		await expect(runRecovery(commitReady)).resolves.toMatchObject({
			state: "completed",
			recovery: { state: "committed-new", phase: "commit-ready" },
		});
		expect(await readFile(commitReady.manifestPath, "utf8")).toBe(
			commitReady.newManifest.contents,
		);

		const evidenceHeld = await createRecoveryFixture(
			"evidence",
			"committed",
			true,
			"after-evidence",
			"new",
			"new",
		);
		await expect(runRecovery(evidenceHeld)).resolves.toMatchObject({
			state: "recovery-required",
			recovery: {
				state: "evidence-required",
				phase: "committed",
				transactionId: "tx-evidence",
			},
		});
		await expect(readFile(evidenceHeld.journalPath)).resolves.toBeDefined();

		const malformed = await createRecoveryFixture(
			"malformed",
			"prepared",
			false,
		);
		await writeFile(malformed.journalPath, "{malformed\n");
		const before = await readFile(malformed.journalPath, "utf8");
		await expect(runRecovery(malformed)).resolves.toMatchObject({
			state: "recovery-required",
			recovery: { state: "ambiguous" },
		});
		expect(await readFile(malformed.journalPath, "utf8")).toBe(before);
	});
});

type Target = ReturnType<typeof resolveHarnessAssetTarget>;

interface AssetFixture {
	readonly projectRoot: string;
	readonly homeRoot: string;
	readonly sourcePath: string;
	readonly asset: HarnessAsset;
	readonly target: Target;
	readonly manifestPath: string;
	readonly journalPath: string;
}

async function createAssetFixture(
	label = "default",
	scope: "project" | "personal" = "project",
	existingHomeRoot?: string,
): Promise<AssetFixture> {
	const projectRoot = join(tmp.path, `${label}-project`);
	const homeRoot = existingHomeRoot ?? join(tmp.path, `${label}-home`);
	const sourceRoot = join(projectRoot, "source");
	const sourcePath = join(sourceRoot, "example", "SKILL.md");
	await Promise.all([
		mkdir(dirname(sourcePath), { recursive: true }),
		mkdir(homeRoot, { recursive: true }),
	]);
	await writeFile(sourcePath, "# Example\n");
	const asset = {
		assetId: "skill:characterized-sync",
		kind: "skill",
		ownership: { kind: "project" },
		sourceRootId: `characterization:${label}`,
		sourceRoot,
		sourcePath: "example",
		logicalPath: "example",
		outputIdentity: "characterized-sync",
		defaultScope: scope,
	} as const satisfies HarnessAsset;
	const target = resolveHarnessAssetTarget({
		targetId: "claude",
		asset,
		scope,
		roots: { projectRoot, homeRoot },
	});
	return {
		projectRoot,
		homeRoot,
		sourcePath,
		asset,
		target,
		manifestPath: join(target.ownerRoot, ".cosmonauts-harness-manifest.json"),
		journalPath: resolveHarnessTransactionPaths(target.ownerRoot, "claude")
			.journalPath,
	};
}

function checkAsset(fixture: AssetFixture) {
	return syncHarnessAsset({ ...fixture, check: true });
}

async function snapshotPaths(fixture: AssetFixture) {
	return Promise.all(
		[fixture.manifestPath, fixture.journalPath, fixture.target.targetPath].map(
			async (path) => {
				try {
					return await readFile(path);
				} catch (error) {
					return (error as NodeJS.ErrnoException).code;
				}
			},
		),
	);
}

interface CommandFixture {
	readonly projectRoot: string;
	readonly homeRoot: string;
	readonly livePaths: readonly [string, string];
	readonly nativePaths: readonly [string, string];
	readonly liveBytes: readonly [Buffer, Buffer];
	readonly evidencePath: string;
	readonly journalPath: string;
}

async function createCommandFixture(label: string): Promise<CommandFixture> {
	const projectRoot = join(tmp.path, `${label}-project`);
	const homeRoot = join(tmp.path, `${label}-home`);
	const liveDirectory = join(homeRoot, ".claude", "commands");
	const evidenceDirectory = join(
		projectRoot,
		"missions/plans/harness-adapters",
	);
	await Promise.all([
		mkdir(liveDirectory, { recursive: true }),
		mkdir(evidenceDirectory, { recursive: true }),
	]);
	await writeFile(
		join(evidenceDirectory, "repo-export-validation-evidence.json"),
		`${JSON.stringify({
			schemaVersion: 1,
			phase: "complete",
			externalBundle: { phase: "complete" },
		})}\n`,
	);
	const names = ["spec-to-backlog", "implement-plan"] as const;
	const livePaths = names.map((name) =>
		join(liveDirectory, `${name}.md`),
	) as unknown as readonly [string, string];
	const nativePaths = names.map((name) =>
		join(projectRoot, "external-commands", `${name}.md`),
	) as unknown as readonly [string, string];
	const liveBytes = names.map((name) =>
		Buffer.from(
			`---\ndescription: ${name}\nargument-hint: <plan>\n---\n\n# ${name}\n`,
		),
	) as unknown as readonly [Buffer, Buffer];
	await Promise.all(
		livePaths.map((path, index) => writeFile(path, liveBytes[index] ?? "")),
	);
	return {
		projectRoot,
		homeRoot,
		livePaths,
		nativePaths,
		liveBytes,
		evidencePath: join(evidenceDirectory, "command-migration-evidence.json"),
		journalPath: resolveHarnessTransactionPaths(
			join(homeRoot, ".claude"),
			"claude",
		).journalPath,
	};
}

async function seedNativeCommands(fixture: CommandFixture): Promise<void> {
	await mkdir(dirname(fixture.nativePaths[0]), { recursive: true });
	await Promise.all(
		fixture.nativePaths.map((path, index) =>
			writeFile(path, fixture.liveBytes[index] ?? ""),
		),
	);
}

interface EvidenceRow extends Record<string, unknown> {
	assetId: string;
	livePath: string;
	nativePath: string;
	outputPath: string;
	liveLength: number;
	nativeLength: number;
	renderLength: number;
	liveDigest: string;
	nativeDigest: string;
	renderDigest: string;
	finalDigest?: string;
	finalLength?: number;
	backupPath?: string;
	manifestKey: string;
}

interface Evidence extends Record<string, unknown> {
	phase: string;
	transactionId: string;
	ownerId: string;
	ownerRoot: string;
	target: string;
	scope: string;
	cleanupPolicy: string;
	atomicSet: boolean;
	markerVersion: number;
	manifestKeys: string[];
	commands: EvidenceRow[];
}

function firstEvidenceRow(value: Evidence): EvidenceRow {
	const row = value.commands[0];
	if (!row) throw new Error("Expected command evidence row.");
	return row;
}

function makeAuthorizedEvidence(fixture: CommandFixture): Evidence {
	const names = ["spec-to-backlog", "implement-plan"] as const;
	const commands = names.map((name, index) => {
		const bytes = fixture.liveBytes[index] ?? Buffer.alloc(0);
		const digest = sha256(bytes);
		return {
			assetId: `command:${name}`,
			livePath: `~/.claude/commands/${name}.md`,
			nativePath: `external-commands/${name}.md`,
			outputPath: `~/.claude/commands/${name}.md`,
			liveLength: bytes.length,
			nativeLength: bytes.length,
			renderLength: bytes.length,
			liveDigest: digest,
			nativeDigest: digest,
			renderDigest: digest,
			materializedDigest: digest,
			manifestKey: `manifest-${index}`,
			oldState: { kind: "file", digest },
			newState: { kind: "file", digest },
		};
	});
	return {
		schemaVersion: 1,
		authorizationKind: "ratified-live-bootstrap",
		phase: "authorized",
		transactionId: "tx-evidence",
		ownerId: "authority:cosmonauts/core",
		ownerRoot: "~/.claude",
		target: "claude",
		scope: "personal",
		cleanupPolicy: "after-evidence",
		atomicSet: true,
		markerVersion: 1,
		newManifestDigest: "manifest-digest",
		manifestKeys: commands.map((row) => row.manifestKey),
		commands,
		authorizedAt: "2026-01-01T00:00:00.000Z",
	};
}

interface RecoveryFixture {
	readonly ownerRoot: string;
	readonly journalPath: string;
	readonly manifestPath: string;
	readonly oldManifest: Extract<HarnessManifestSnapshot, { kind: "file" }>;
	readonly newManifest: Extract<HarnessManifestSnapshot, { kind: "file" }>;
}

async function createRecoveryFixture(
	label: string,
	phase: OwnerRootTransactionJournal["phase"],
	persistJournal = true,
	cleanupPolicy: OwnerRootTransactionJournal["cleanupPolicy"] = "after-commit",
	targetState: "old" | "new" = "old",
	manifestState: "old" | "new" = "old",
): Promise<RecoveryFixture> {
	const ownerRoot = await realpath(
		await mkdir(join(tmp.path, `recovery-${label}`, ".claude", "skills"), {
			recursive: true,
		}).then(() => join(tmp.path, `recovery-${label}`, ".claude")),
	);
	const paths = resolveHarnessTransactionPaths(ownerRoot, "claude");
	const manifestPath = join(ownerRoot, ".cosmonauts-harness-manifest.json");
	const oldContents = '{"state":"old"}\n';
	const newContents = '{"state":"new"}\n';
	const oldManifest = manifestSnapshot(oldContents);
	const newManifest = manifestSnapshot(newContents);
	await writeFile(
		manifestPath,
		manifestState === "old" ? oldContents : newContents,
	);
	const oldBytes = Buffer.from("old target\n");
	const newBytes = Buffer.from("new target\n");
	const targetPath = join(ownerRoot, "skills", "target.md");
	await writeFile(targetPath, targetState === "old" ? oldBytes : newBytes);
	const transactionId = `tx-${label}`;
	const stem = `${basename(paths.journalPath, ".journal.json")}-${transactionId}-0`;
	const backupPath = join(dirname(paths.journalPath), `${stem}.backup`);
	const stagePath = join(dirname(paths.journalPath), `${stem}.stage`);
	if (targetState === "new") await writeFile(backupPath, oldBytes);
	if (phase === "prepared") await writeFile(stagePath, newBytes);
	const journal: OwnerRootTransactionJournal = {
		schemaVersion: 1,
		transactionId,
		canonicalOwnerRoot: ownerRoot,
		targetId: "claude",
		phase,
		cleanupPolicy,
		atomicSet: true,
		manifestPath,
		oldManifest,
		newManifest,
		members: [
			{
				targetPath,
				stagePath,
				backupPath,
				oldState: fileSnapshot(oldBytes),
				newState: fileSnapshot(newBytes),
			},
		],
	};
	if (persistJournal) {
		await writeFile(paths.journalPath, serializeOwnerRootJournal(journal));
	}
	return {
		ownerRoot,
		journalPath: paths.journalPath,
		manifestPath,
		oldManifest,
		newManifest,
	};
}

function runRecovery(fixture: RecoveryFixture) {
	return withOwnerRootTransaction(
		{ ownerRoot: fixture.ownerRoot, targetId: "claude" },
		async () => "continued",
	);
}

function fileSnapshot(
	bytes: Uint8Array,
): Exclude<HarnessNodeSnapshot, { kind: "absent" }> {
	return {
		kind: "file",
		digest: sha256(Buffer.concat([Buffer.from("file\0"), Buffer.from(bytes)])),
	};
}

function manifestSnapshot(
	contents: string,
): Extract<HarnessManifestSnapshot, { kind: "file" }> {
	return { kind: "file", digest: sha256(contents), contents };
}
