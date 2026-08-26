import { execFile } from "node:child_process";
import {
	access,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test, vi } from "vitest";
import { renderIdentityMarkdown } from "../../lib/harness-adapters/render.ts";
import {
	PROJECT_EXPORT_ROWS,
	proveRepositoryExportLineage,
	type RepositorySelectedCheck,
	runRepositoryExportValidation,
} from "../../scripts/validate-harness-exports.ts";

const execFileAsync = promisify(execFile);
const tempRoots: string[] = [];

afterEach(async () => {
	await Promise.all(
		tempRoots
			.splice(0)
			.map((path) => rm(path, { recursive: true, force: true })),
	);
});

describe("repository harness export validation", () => {
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
});

interface Fixture {
	readonly root: string;
	readonly home: string;
	readonly revision: string;
	readonly evidencePath: string;
	readonly playwrightPath: string;
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
	await execFileAsync("git", ["add", ".gitignore", "domains"], { cwd: root });
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

async function expectMissing(path: string): Promise<void> {
	await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
}
