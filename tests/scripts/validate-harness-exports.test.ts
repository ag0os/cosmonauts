import { execFile } from "node:child_process";
import {
	access,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { GeneratedHarnessNode } from "../../lib/harness-adapters/render.ts";
import { renderIdentityMarkdown } from "../../lib/harness-adapters/render.ts";
import type { HarnessAsset } from "../../lib/harness-adapters/types.ts";
import {
	EXTERNAL_BUNDLE_ASSET_ID,
	PROJECT_EXPORT_ROWS,
	proveExternalBundleLineage,
	proveRepositoryExportLineage,
	type RepositorySelectedCheck,
	runPersonalBundleValidation,
	runRepositoryExportValidation,
} from "../../scripts/validate-harness-exports.ts";

const execFileAsync = promisify(execFile);
const tempRoots: string[] = [];
const PLAYWRIGHT_FOREIGN_ASSET_ID = [
	"skill:",
	"cod" + "ing",
	"/playwright-cli",
].join("");

afterEach(async () => {
	await Promise.all(
		tempRoots
			.splice(0)
			.map((path) => rm(path, { recursive: true, force: true })),
	);
});

describe("repository harness export validation", () => {
	test("validates evidence-held recovery for four repo exports before the personal bundle", async () => {
		// @cosmo-behavior plan:harness-adapters#B-012
		const fixture = await createFixture();
		const bundleOptions = {
			projectRoot: fixture.root,
			homeRoot: fixture.home,
			evidencePath: fixture.evidencePath,
			revision: fixture.revision,
			asset: fixture.externalBundleAsset,
			generatedNodes: fixture.externalBundleGeneratedNodes,
			selectedCheck: currentExternalBundleCheck,
			now: () => new Date("2026-08-26T12:30:00.000Z"),
		} as const;
		const oldBundle = await readFile(`${fixture.externalBundlePath}/SKILL.md`);
		const oldPlaywright = await readFile(fixture.playwrightPath);
		const oldCommands = await Promise.all(
			fixture.commandPaths.map((path) => readFile(path)),
		);

		await expect(runPersonalBundleValidation(bundleOptions)).rejects.toThrow(
			/project evidence.*complete/i,
		);
		expect(await readFile(`${fixture.externalBundlePath}/SKILL.md`)).toEqual(
			oldBundle,
		);

		const projectEvidence = await runRepositoryExportValidation({
			projectRoot: fixture.root,
			homeRoot: fixture.home,
			evidencePath: fixture.evidencePath,
			revisions: Object.fromEntries(
				PROJECT_EXPORT_ROWS.map((row) => [row.assetId, fixture.revision]),
			),
			selectedCheck: currentSelectedCheck,
		});
		expect(projectEvidence.phase).toBe("complete");
		expect(projectEvidence.rows.map((row) => row.assetId)).toEqual(
			PROJECT_EXPORT_ROWS.map((row) => row.assetId),
		);
		expect(projectEvidence.rows).toHaveLength(4);
		expect(
			projectEvidence.rows.every(
				(row) =>
					row.historicalDigest === row.oldDigest &&
					row.receipt?.transactionId === projectEvidence.transactionId &&
					row.checkRow?.final === "current" &&
					row.backupExit === "removed-exact",
			),
		).toBe(true);

		await writeFile(`${fixture.externalBundlePath}/SKILL.md`, "foreign\n");
		await expect(proveExternalBundleLineage(bundleOptions)).rejects.toThrow(
			/historical byte lineage/i,
		);
		await expect(runPersonalBundleValidation(bundleOptions)).rejects.toThrow(
			/historical byte lineage/i,
		);
		expect(
			JSON.parse(await readFile(fixture.evidencePath, "utf8")),
		).not.toHaveProperty("externalBundle");
		await expectMissing(
			join(fixture.home, ".claude/.cosmonauts-harness-manifest.json"),
		);
		await writeFile(`${fixture.externalBundlePath}/SKILL.md`, oldBundle);

		await expect(
			runPersonalBundleValidation({
				...bundleOptions,
				stopAfter: "rolling-back",
			}),
		).rejects.toThrow(/rolling back|rolling-back/i);
		const interruptedEvidence = JSON.parse(
			await readFile(fixture.evidencePath, "utf8"),
		) as { externalBundle: { backupPath: string } };
		expect(
			await readFile(
				`${interruptedEvidence.externalBundle.backupPath}/SKILL.md`,
			),
		).toEqual(oldBundle);
		expect(
			JSON.parse(
				await readFile(
					join(fixture.home, ".cosmonauts-harness-claude.journal.json"),
					"utf8",
				),
			),
		).toMatchObject({ phase: "rolling-back" });

		let lockRuns = 0;
		const uncertainRunner = async <T>(
			_path: string,
			action: () => Promise<T>,
			lockOptions: { onReleaseUnconfirmed?: (error: unknown) => void },
		): Promise<T> => {
			const result = await action();
			lockRuns += 1;
			if (lockRuns === 2) {
				lockOptions.onReleaseUnconfirmed?.(
					new Error("injected bundle release uncertainty"),
				);
			}
			return result;
		};
		await expect(
			runPersonalBundleValidation({
				...bundleOptions,
				lockRunner: uncertainRunner,
			}),
		).rejects.toThrow(/release is unconfirmed/i);
		await access(interruptedEvidence.externalBundle.backupPath);

		const complete = await runPersonalBundleValidation(bundleOptions);
		expect(complete.phase).toBe("complete");
		expect(complete.rows).toHaveLength(4);
		expect(complete.externalBundle).toMatchObject({
			phase: "complete",
			assetId: EXTERNAL_BUNDLE_ASSET_ID,
			manifestKey: expect.any(String),
			recoveryOutcome: "committed:evidence-required",
			checkRow: { final: "current" },
			backupExit: "removed-exact",
		});
		expect(complete.externalBundle?.receipt?.transactionId).toBe(
			complete.externalBundle?.transactionId,
		);
		await expectMissing(complete.externalBundle?.backupPath ?? "");
		await expectMissing(
			join(fixture.home, ".cosmonauts-harness-claude.journal.json"),
		);
		expect(await readFile(fixture.playwrightPath)).toEqual(oldPlaywright);
		expect(
			await Promise.all(fixture.commandPaths.map((path) => readFile(path))),
		).toEqual(oldCommands);
		expect(await readFile(join(fixture.root, ".gitignore"), "utf8")).toContain(
			".agents/",
		);
		expect(await readFile(join(fixture.root, ".gitignore"), "utf8")).toContain(
			".cosmonauts-harness-*",
		);
		expect(
			await readFile(`${fixture.externalBundlePath}/SKILL.md`, "utf8"),
		).toContain("Generated by cosmonauts");

		const provisionRoot = await mkdtemp(
			join(tmpdir(), "harness-full-default-"),
		);
		tempRoots.push(provisionRoot);
		const provisionProject = join(provisionRoot, "project");
		const provisionHome = join(provisionRoot, "home");
		await execFileAsync("git", [
			"clone",
			"-q",
			"--no-local",
			process.cwd(),
			provisionProject,
		]);
		await symlink(
			join(process.cwd(), "node_modules"),
			join(provisionProject, "node_modules"),
			"dir",
		);
		const localExclude = join(provisionProject, ".git/info/exclude");
		await writeFile(
			localExclude,
			`${await readFile(localExclude, "utf8")}node_modules\n`,
		);
		await mkdir(join(provisionProject, ".claude/skills/playwright-cli"), {
			recursive: true,
		});
		await mkdir(provisionHome, { recursive: true });
		const provisionedConflict = join(
			provisionProject,
			".claude/skills/playwright-cli/SKILL.md",
		);
		await writeFile(provisionedConflict, "ratified foreign bytes\n");
		const sync = await execJsonAllowFailure(
			["harness", "--json", "sync", "--kind", "skill"],
			provisionProject,
			provisionHome,
		);
		const check = await execJsonAllowFailure(
			["harness", "--json", "sync", "--kind", "skill", "--check"],
			provisionProject,
			provisionHome,
		);
		for (const report of [sync, check]) {
			expect(report.processExit).toBe(1);
			expect(report.body.exitCode).toBe(1);
			expect(report.body.rows.filter((row) => row.final !== "current")).toEqual(
				[
					expect.objectContaining({
						asset: PLAYWRIGHT_FOREIGN_ASSET_ID,
						target: "claude",
						scope: "project",
						reason: "foreign-or-untraceable",
						final: "locally-edited",
					}),
				],
			);
		}
		await access(join(provisionProject, ".agents/skills"));
		await expectMissing(join(provisionProject, ".codex/skills"));
		expect(await readFile(provisionedConflict, "utf8")).toBe(
			"ratified foreign bytes\n",
		);
		const { stdout: status } = await execFileAsync(
			"git",
			["status", "--porcelain", "--untracked-files=all"],
			{ cwd: provisionProject },
		);
		expect(status).toBe("");
	});

	test("authorizes exactly the four ratified rows from named git bytes and rejects a changed target before locking", async () => {
		const fixture = await createFixture();
		expect(PROJECT_EXPORT_ROWS.map((row) => row.assetId)).toEqual([
			"skill:shared/plan",
			"skill:shared/roadmap",
			"skill:shared/skills-cli",
			"skill:shared/task",
		]);
		expect(PROJECT_EXPORT_ROWS).toHaveLength(4);

		const proofs = await proveRepositoryExportLineage({
			projectRoot: fixture.root,
			revisions: Object.fromEntries(
				PROJECT_EXPORT_ROWS.map((row) => [row.assetId, fixture.revision]),
			),
		});
		expect(proofs).toHaveLength(4);
		expect(
			proofs.every((proof) => proof.authorization.consumption === "one-time"),
		).toBe(true);

		await writeFile(
			join(fixture.root, ".claude/skills/roadmap/SKILL.md"),
			"foreign edit\n",
		);
		const lockEntered = vi.fn();
		await expect(
			runRepositoryExportValidation({
				projectRoot: fixture.root,
				homeRoot: fixture.home,
				evidencePath: fixture.evidencePath,
				revisions: Object.fromEntries(
					PROJECT_EXPORT_ROWS.map((row) => [row.assetId, fixture.revision]),
				),
				onTransactionLock: lockEntered,
				selectedCheck: currentSelectedCheck,
			}),
		).rejects.toThrow(/historical byte lineage/i);
		expect(lockEntered).not.toHaveBeenCalled();
		await expectMissing(fixture.evidencePath);
		await expectMissing(
			join(fixture.root, ".claude/.cosmonauts-harness-manifest.json"),
		);
	});

	test("persists installed evidence, resumes with its receipt, checks four rows, and cleans exact backups", async () => {
		const fixture = await createFixture();
		const options = {
			projectRoot: fixture.root,
			homeRoot: fixture.home,
			evidencePath: fixture.evidencePath,
			revisions: Object.fromEntries(
				PROJECT_EXPORT_ROWS.map((row) => [row.assetId, fixture.revision]),
			),
			now: () => new Date("2026-08-26T12:00:00.000Z"),
			selectedCheck: currentSelectedCheck,
		} as const;

		await expect(
			runRepositoryExportValidation({ ...options, stopAfter: "installed" }),
		).rejects.toThrow("injected stop after installed");
		const installed = JSON.parse(
			await readFile(fixture.evidencePath, "utf8"),
		) as { phase: string; rows: Array<{ backupPath: string }> };
		expect(installed.phase).toBe("installed");
		expect(installed.rows).toHaveLength(4);
		for (const row of installed.rows) await access(row.backupPath);

		const complete = await runRepositoryExportValidation(options);
		expect(complete.phase).toBe("complete");
		expect(complete.selectedAssetIds).toEqual(
			PROJECT_EXPORT_ROWS.map((row) => row.assetId),
		);
		expect(
			complete.rows.every((row) => row.checkRow?.final === "current"),
		).toBe(true);
		expect(
			complete.rows.every((row) => row.backupExit === "removed-exact"),
		).toBe(true);
		for (const row of complete.rows) await expectMissing(row.backupPath);
		await expectMissing(
			join(fixture.root, ".cosmonauts-harness-claude.journal.json"),
		);

		for (const row of PROJECT_EXPORT_ROWS) {
			const [source, migrated] = await Promise.all([
				readFile(join(fixture.root, row.sourceRelativePath, "SKILL.md")),
				readFile(join(fixture.root, row.outputRelativePath, "SKILL.md")),
			]);
			expect(migrated).toEqual(renderIdentityMarkdown(source));
		}
		expect(await readFile(fixture.playwrightPath, "utf8")).toBe(
			"foreign playwright bytes\n",
		);
	});

	test("a prepared-phase failure is recovered on retry before the whole set is installed", async () => {
		const fixture = await createFixture();
		const before = await Promise.all(
			PROJECT_EXPORT_ROWS.map((row) =>
				readFile(join(fixture.root, row.outputRelativePath, "SKILL.md")),
			),
		);

		await expect(
			runRepositoryExportValidation({
				projectRoot: fixture.root,
				homeRoot: fixture.home,
				evidencePath: fixture.evidencePath,
				revisions: Object.fromEntries(
					PROJECT_EXPORT_ROWS.map((row) => [row.assetId, fixture.revision]),
				),
				selectedCheck: currentSelectedCheck,
				stopAfter: "prepared",
			}),
		).rejects.toThrow(/restored old|prepared/i);

		const interrupted = await Promise.all(
			PROJECT_EXPORT_ROWS.map((row) =>
				readFile(join(fixture.root, row.outputRelativePath, "SKILL.md")),
			),
		);
		expect(interrupted).toEqual(before);
		await access(join(fixture.root, ".cosmonauts-harness-claude.journal.json"));

		const complete = await runRepositoryExportValidation({
			projectRoot: fixture.root,
			homeRoot: fixture.home,
			evidencePath: fixture.evidencePath,
			revisions: Object.fromEntries(
				PROJECT_EXPORT_ROWS.map((row) => [row.assetId, fixture.revision]),
			),
			selectedCheck: currentSelectedCheck,
		});
		expect(complete.phase).toBe("complete");
		expect(
			complete.rows.every((row) =>
				row.recoveryOutcome.startsWith("restored-old:prepared"),
			),
		).toBe(true);
		await expectMissing(
			join(fixture.root, ".cosmonauts-harness-claude.journal.json"),
		);
	});

	test("release uncertainty halts with committed bytes retained and a clean retry completes", async () => {
		const fixture = await createFixture();
		let injectReleaseUncertainty = true;
		const uncertainRunner = async <T>(
			_path: string,
			action: () => Promise<T>,
			lockOptions: {
				onReleaseUnconfirmed?: (error: unknown) => void;
			},
		): Promise<T> => {
			const result = await action();
			if (injectReleaseUncertainty) {
				injectReleaseUncertainty = false;
				lockOptions.onReleaseUnconfirmed?.(
					new Error("injected release uncertainty"),
				);
			}
			return result;
		};
		const common = {
			projectRoot: fixture.root,
			homeRoot: fixture.home,
			evidencePath: fixture.evidencePath,
			revisions: Object.fromEntries(
				PROJECT_EXPORT_ROWS.map((row) => [row.assetId, fixture.revision]),
			),
			selectedCheck: currentSelectedCheck,
		} as const;

		await expect(
			runRepositoryExportValidation({
				...common,
				lockRunner: uncertainRunner,
			}),
		).rejects.toThrow(/release is unconfirmed/i);
		const held = JSON.parse(await readFile(fixture.evidencePath, "utf8")) as {
			phase: string;
		};
		expect(held.phase).toBe("authorized");
		await access(join(fixture.root, ".cosmonauts-harness-claude.journal.json"));

		const complete = await runRepositoryExportValidation(common);
		expect(complete.phase).toBe("complete");
		expect(
			complete.rows.every(
				(row) => row.recoveryOutcome === "committed:evidence-required",
			),
		).toBe(true);
	});

	test("resumes after pending clear and after exact backup cleanup", async () => {
		const fixture = await createFixture();
		const common = {
			projectRoot: fixture.root,
			homeRoot: fixture.home,
			evidencePath: fixture.evidencePath,
			revisions: Object.fromEntries(
				PROJECT_EXPORT_ROWS.map((row) => [row.assetId, fixture.revision]),
			),
			selectedCheck: currentSelectedCheck,
		} as const;

		await expect(
			runRepositoryExportValidation({ ...common, stopAfter: "checked" }),
		).rejects.toThrow("injected stop after checked");
		expect(
			JSON.parse(await readFile(fixture.evidencePath, "utf8")),
		).toMatchObject({ phase: "checked" });
		await expectMissing(
			join(fixture.root, ".cosmonauts-harness-claude.journal.json"),
		);

		await expect(
			runRepositoryExportValidation({
				...common,
				stopAfter: "backup-cleanup",
			}),
		).rejects.toThrow("injected stop after backup cleanup");
		const cleaned = JSON.parse(
			await readFile(fixture.evidencePath, "utf8"),
		) as { rows: Array<{ backupPath: string; backupExit: string }> };
		expect(
			cleaned.rows.every((row) => row.backupExit === "removed-exact"),
		).toBe(true);
		for (const row of cleaned.rows) await expectMissing(row.backupPath);

		const complete = await runRepositoryExportValidation(common);
		expect(complete.phase).toBe("complete");
	});

	// @cosmo-behavior plan:harness-adapters#B-012
	test("resumes project cleanup after a crash immediately after the first backup deletion", async () => {
		const fixture = await createFixture();
		const common = {
			projectRoot: fixture.root,
			homeRoot: fixture.home,
			evidencePath: fixture.evidencePath,
			revisions: Object.fromEntries(
				PROJECT_EXPORT_ROWS.map((row) => [row.assetId, fixture.revision]),
			),
			selectedCheck: currentSelectedCheck,
		} as const;

		await expect(
			runRepositoryExportValidation({
				...common,
				stopAfter: "first-backup-deletion",
			}),
		).rejects.toThrow("injected stop after first backup deletion");
		const interrupted = JSON.parse(
			await readFile(fixture.evidencePath, "utf8"),
		) as {
			phase: string;
			rows: Array<{
				assetId: string;
				historicalDigest: string;
				backupPath: string;
				cleanupIntent?: {
					transactionId: string;
					memberIndex: number;
					assetId: string;
					expectedBackup: { kind: string; digest: string };
				};
			}>;
		};
		expect(interrupted.phase).toBe("checked");
		const firstInterrupted = interrupted.rows[0];
		expect(interrupted.rows[0]?.cleanupIntent).toMatchObject({
			transactionId: expect.any(String),
			memberIndex: 0,
			assetId: firstInterrupted?.assetId,
			expectedBackup: {
				kind: "directory",
				digest: firstInterrupted?.historicalDigest,
			},
		});
		await expectMissing(interrupted.rows[0]?.backupPath ?? "");
		for (const row of interrupted.rows.slice(1)) await access(row.backupPath);

		const complete = await runRepositoryExportValidation(common);
		expect(complete.phase).toBe("complete");
		expect(
			complete.rows.every((row) => row.backupExit === "removed-exact"),
		).toBe(true);
		for (const row of complete.rows) await expectMissing(row.backupPath);
	});

	// @cosmo-behavior plan:harness-adapters#B-012
	test("resumes personal bundle cleanup after a crash immediately after its backup deletion", async () => {
		const fixture = await createFixture();
		const projectOptions = {
			projectRoot: fixture.root,
			homeRoot: fixture.home,
			evidencePath: fixture.evidencePath,
			revisions: Object.fromEntries(
				PROJECT_EXPORT_ROWS.map((row) => [row.assetId, fixture.revision]),
			),
			selectedCheck: currentSelectedCheck,
		} as const;
		await runRepositoryExportValidation(projectOptions);
		const bundleOptions = {
			projectRoot: fixture.root,
			homeRoot: fixture.home,
			evidencePath: fixture.evidencePath,
			revision: fixture.revision,
			asset: fixture.externalBundleAsset,
			generatedNodes: fixture.externalBundleGeneratedNodes,
			selectedCheck: currentExternalBundleCheck,
		} as const;

		await expect(
			runPersonalBundleValidation({
				...bundleOptions,
				stopAfter: "first-backup-deletion",
			}),
		).rejects.toThrow("injected stop after first backup deletion");
		const interrupted = JSON.parse(
			await readFile(fixture.evidencePath, "utf8"),
		) as {
			externalBundle: {
				assetId: string;
				historicalDigest: string;
				backupPath: string;
				cleanupIntent?: {
					transactionId: string;
					memberIndex: number;
					assetId: string;
					expectedBackup: { kind: string; digest: string };
				};
			};
		};
		expect(interrupted.externalBundle.cleanupIntent).toMatchObject({
			transactionId: expect.any(String),
			memberIndex: 0,
			assetId: interrupted.externalBundle.assetId,
			expectedBackup: {
				kind: "directory",
				digest: interrupted.externalBundle.historicalDigest,
			},
		});
		await expectMissing(interrupted.externalBundle.backupPath);

		const complete = await runPersonalBundleValidation(bundleOptions);
		expect(complete.externalBundle).toMatchObject({
			phase: "complete",
			backupExit: "removed-exact",
		});
		await expectMissing(complete.externalBundle?.backupPath ?? "");
	});

	// @cosmo-behavior plan:harness-adapters#B-012
	test("rejects an absent project backup without a matching cleanup intent", async () => {
		const fixture = await createFixture();
		const common = {
			projectRoot: fixture.root,
			homeRoot: fixture.home,
			evidencePath: fixture.evidencePath,
			revisions: Object.fromEntries(
				PROJECT_EXPORT_ROWS.map((row) => [row.assetId, fixture.revision]),
			),
			selectedCheck: currentSelectedCheck,
		} as const;

		await expect(
			runRepositoryExportValidation({ ...common, stopAfter: "checked" }),
		).rejects.toThrow("injected stop after checked");
		const checked = JSON.parse(
			await readFile(fixture.evidencePath, "utf8"),
		) as {
			rows: Array<{ backupPath: string; cleanupIntent?: unknown }>;
		};
		const first = checked.rows[0];
		expect(first?.cleanupIntent).toBeUndefined();
		await rm(first?.backupPath ?? "", { recursive: true, force: true });

		await expect(runRepositoryExportValidation(common)).rejects.toThrow(
			/absent without cleanup intent/i,
		);
		for (const row of checked.rows.slice(1)) await access(row.backupPath);
	});

	// @cosmo-behavior plan:harness-adapters#B-012
	test("preserves a changed project backup and reports it as ambiguous", async () => {
		const fixture = await createFixture();
		const common = {
			projectRoot: fixture.root,
			homeRoot: fixture.home,
			evidencePath: fixture.evidencePath,
			revisions: Object.fromEntries(
				PROJECT_EXPORT_ROWS.map((row) => [row.assetId, fixture.revision]),
			),
			selectedCheck: currentSelectedCheck,
		} as const;

		await expect(
			runRepositoryExportValidation({ ...common, stopAfter: "checked" }),
		).rejects.toThrow("injected stop after checked");
		const checked = JSON.parse(
			await readFile(fixture.evidencePath, "utf8"),
		) as { rows: Array<{ backupPath: string }> };
		const changedPath = join(checked.rows[0]?.backupPath ?? "", "changed.txt");
		await writeFile(changedPath, "ambiguous changed backup bytes\n");

		await expect(runRepositoryExportValidation(common)).rejects.toThrow(
			/retained backup is ambiguous/i,
		);
		expect(await readFile(changedPath, "utf8")).toBe(
			"ambiguous changed backup bytes\n",
		);
		for (const row of checked.rows) await access(row.backupPath);
	});

	// @cosmo-behavior plan:harness-adapters#B-012
	test("never removes an evidence-nominated same-user path", async () => {
		const fixture = await createFixture();
		const common = {
			projectRoot: fixture.root,
			homeRoot: fixture.home,
			evidencePath: fixture.evidencePath,
			revisions: Object.fromEntries(
				PROJECT_EXPORT_ROWS.map((row) => [row.assetId, fixture.revision]),
			),
			selectedCheck: currentSelectedCheck,
		} as const;

		await expect(
			runRepositoryExportValidation({ ...common, stopAfter: "checked" }),
		).rejects.toThrow("injected stop after checked");
		const checked = JSON.parse(
			await readFile(fixture.evidencePath, "utf8"),
		) as {
			rows: Array<{
				backupPath: string;
				oldState: { kind: string; digest?: string };
			}>;
		};
		const sameUserRoot = await mkdtemp(
			join(tmpdir(), "repo-export-same-user-path-"),
		);
		tempRoots.push(sameUserRoot);
		const nominatedPath = join(sameUserRoot, "nominated-backup");
		await mkdir(nominatedPath, { recursive: true });
		await writeFile(
			join(nominatedPath, "SKILL.md"),
			await readFile(join(checked.rows[0]?.backupPath ?? "", "SKILL.md")),
		);
		const firstRow = checked.rows[0];
		if (!firstRow) throw new Error("Fixture evidence has no first row.");
		checked.rows[0] = {
			...firstRow,
			backupPath: nominatedPath,
			oldState: { kind: "directory", digest: "crafted-evidence-digest" },
		};
		await writeFile(
			fixture.evidencePath,
			`${JSON.stringify(checked, null, "\t")}\n`,
		);

		await expect(runRepositoryExportValidation(common)).rejects.toThrow(
			/migration backup identity is invalid/i,
		);
		expect(await readFile(join(nominatedPath, "SKILL.md"))).not.toHaveLength(0);
		for (const row of checked.rows.slice(1)) await access(row.backupPath);
	});

	// @cosmo-behavior plan:harness-adapters#B-012
	test("never removes a personal path nominated by external-bundle evidence", async () => {
		const fixture = await createFixture();
		await runRepositoryExportValidation({
			projectRoot: fixture.root,
			homeRoot: fixture.home,
			evidencePath: fixture.evidencePath,
			revisions: Object.fromEntries(
				PROJECT_EXPORT_ROWS.map((row) => [row.assetId, fixture.revision]),
			),
			selectedCheck: currentSelectedCheck,
		});
		const bundleOptions = {
			projectRoot: fixture.root,
			homeRoot: fixture.home,
			evidencePath: fixture.evidencePath,
			revision: fixture.revision,
			asset: fixture.externalBundleAsset,
			generatedNodes: fixture.externalBundleGeneratedNodes,
			selectedCheck: currentExternalBundleCheck,
		} as const;
		await expect(
			runPersonalBundleValidation({
				...bundleOptions,
				stopAfter: "checked",
			}),
		).rejects.toThrow("injected stop after checked");
		const checked = JSON.parse(
			await readFile(fixture.evidencePath, "utf8"),
		) as {
			externalBundle: { backupPath: string; oldState: unknown };
		};
		const canonicalBackupPath = checked.externalBundle.backupPath;
		const nominatedPath = join(fixture.home, "personal-notes");
		await mkdir(nominatedPath, { recursive: true });
		await writeFile(join(nominatedPath, "keep.txt"), "keep personal bytes\n");
		checked.externalBundle = {
			...checked.externalBundle,
			backupPath: nominatedPath,
			oldState: { kind: "directory", digest: "crafted-evidence-digest" },
		};
		await writeFile(
			fixture.evidencePath,
			`${JSON.stringify(checked, null, "\t")}\n`,
		);

		await expect(runPersonalBundleValidation(bundleOptions)).rejects.toThrow(
			/migration backup identity is invalid/i,
		);
		expect(await readFile(join(nominatedPath, "keep.txt"), "utf8")).toBe(
			"keep personal bytes\n",
		);
		await access(canonicalBackupPath);
	});
});

interface Fixture {
	readonly root: string;
	readonly home: string;
	readonly revision: string;
	readonly evidencePath: string;
	readonly playwrightPath: string;
	readonly externalBundlePath: string;
	readonly externalBundleAsset: HarnessAsset;
	readonly externalBundleGeneratedNodes: readonly GeneratedHarnessNode[];
	readonly commandPaths: readonly string[];
}

async function createFixture(): Promise<Fixture> {
	const root = await mkdtemp(join(tmpdir(), "repo-export-validation-"));
	tempRoots.push(root);
	const home = join(root, "home");
	await mkdir(home, { recursive: true });
	await writeFile(
		join(root, ".gitignore"),
		".claude/\n.agents/\n.cosmonauts-harness-*\n",
	);
	await execFileAsync("git", ["init", "-q"], { cwd: root });
	await execFileAsync("git", ["config", "user.email", "test@example.com"], {
		cwd: root,
	});
	await execFileAsync("git", ["config", "user.name", "Test"], { cwd: root });

	for (const row of PROJECT_EXPORT_ROWS) {
		const sourcePath = join(root, row.sourceRelativePath, "SKILL.md");
		await mkdir(dirname(sourcePath), { recursive: true });
		await writeFile(
			sourcePath,
			`---\nname: ${row.name}\ndescription: old ${row.name}\n---\n\n# Old ${row.name}\n`,
		);
	}
	const externalBundleAsset: HarnessAsset = {
		assetId: EXTERNAL_BUNDLE_ASSET_ID,
		kind: "skill",
		ownership: { kind: "authority", authorityId: "cosmonauts/core" },
		sourceRootId: "cosmonauts:package",
		sourceRoot: root,
		sourcePath: "external-skills/cosmonauts",
		logicalPath: "external-skills/cosmonauts",
		outputIdentity: "cosmonauts",
		defaultScope: "personal",
		generatedInputs: "cosmonauts-inventory",
	};
	for (const relativePath of [
		"SKILL.md",
		"chains/SKILL.md",
		"plans/SKILL.md",
		"skills/SKILL.md",
		"tasks/SKILL.md",
	]) {
		const sourcePath = join(root, externalBundleAsset.sourcePath, relativePath);
		await mkdir(dirname(sourcePath), { recursive: true });
		await writeFile(
			sourcePath,
			`---\nname: cosmonauts-${relativePath}\ndescription: old bundle\n---\n\n# Old bundle\n`,
		);
	}
	await execFileAsync("git", ["add", ".gitignore", "domains"], { cwd: root });
	await execFileAsync("git", ["add", "external-skills"], { cwd: root });
	await execFileAsync("git", ["commit", "-qm", "legacy sources"], {
		cwd: root,
	});
	const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
		cwd: root,
	});
	const revision = stdout.trim();

	for (const row of PROJECT_EXPORT_ROWS) {
		const sourcePath = join(root, row.sourceRelativePath, "SKILL.md");
		const targetPath = join(root, row.outputRelativePath, "SKILL.md");
		const oldBytes = await readFile(sourcePath);
		await mkdir(dirname(targetPath), { recursive: true });
		await writeFile(targetPath, oldBytes);
		await writeFile(
			sourcePath,
			`---\nname: ${row.name}\ndescription: corrected ${row.name}\n---\n\n# Current ${row.name}\n`,
		);
	}
	const externalBundlePath = join(home, ".claude/skills/cosmonauts");
	for (const relativePath of [
		"SKILL.md",
		"chains/SKILL.md",
		"plans/SKILL.md",
		"skills/SKILL.md",
		"tasks/SKILL.md",
	]) {
		const sourcePath = join(root, externalBundleAsset.sourcePath, relativePath);
		const targetPath = join(externalBundlePath, relativePath);
		await mkdir(dirname(targetPath), { recursive: true });
		await writeFile(targetPath, await readFile(sourcePath));
		await writeFile(
			sourcePath,
			`---\nname: cosmonauts-${relativePath}\ndescription: current bundle\n---\n\n# Current bundle\n`,
		);
	}
	const commandPaths = [
		join(home, ".claude/commands/spec-to-backlog.md"),
		join(home, ".claude/commands/implement-plan.md"),
	] as const;
	for (const [index, path] of commandPaths.entries()) {
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, `protected command ${index}\n`);
	}
	const playwrightPath = join(root, ".claude/skills/playwright-cli/SKILL.md");
	await mkdir(dirname(playwrightPath), { recursive: true });
	await writeFile(playwrightPath, "foreign playwright bytes\n");

	return {
		root,
		home,
		revision,
		evidencePath: join(
			root,
			"missions/plans/harness-adapters/repo-export-validation-evidence.json",
		),
		playwrightPath,
		externalBundlePath,
		externalBundleAsset,
		externalBundleGeneratedNodes: [
			{
				relativePath: "references/generated-inventory.md",
				inputBytes: Buffer.from("fixture inventory inputs"),
				renderedBytes: Buffer.from(
					"<!-- Generated by cosmonauts; do not edit. -->\n# Fixture inventory\n",
				),
			},
		],
		commandPaths,
	};
}

const currentSelectedCheck: RepositorySelectedCheck = async ({ rows }) => ({
	exitCode: 0,
	rows: rows.map((row) => ({
		asset: row.assetId,
		targetPath: row.outputPath,
		before: "current",
		reason: "current",
		action: "none",
		final: "current",
	})),
});

const currentExternalBundleCheck: RepositorySelectedCheck = async ({
	rows,
}) => ({
	exitCode: 0,
	rows: rows.map((row) => ({
		asset: row.assetId,
		targetPath: row.outputPath,
		before: "current",
		reason: "current",
		action: "none",
		final: "current",
	})),
});

async function expectMissing(path: string): Promise<void> {
	await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
}

interface HarnessJsonReport {
	readonly exitCode: number;
	readonly rows: ReadonlyArray<{
		readonly asset: string;
		readonly target: string;
		readonly scope: string;
		readonly reason: string;
		readonly final: string;
	}>;
}

async function execJsonAllowFailure(
	args: readonly string[],
	cwd: string,
	home: string,
): Promise<{ readonly processExit: number; readonly body: HarnessJsonReport }> {
	try {
		const { stdout } = await execFileAsync(
			"bun",
			[join(cwd, "bin/cosmonauts"), ...args],
			{
				cwd,
				env: { ...process.env, HOME: home },
				maxBuffer: 10 * 1024 * 1024,
			},
		);
		return { processExit: 0, body: JSON.parse(stdout) as HarnessJsonReport };
	} catch (error) {
		const failed = error as {
			readonly code?: number;
			readonly stdout?: string;
		};
		if (typeof failed.stdout !== "string") throw error;
		return {
			processExit: failed.code ?? 1,
			body: JSON.parse(failed.stdout) as HarnessJsonReport,
		};
	}
}
