/**
 * The npm tarball, installed into a project of its own, still carries what
 * the lean host checks load: Stryker's config, the vitest-runner patch, and
 * the providers module. Packs with npm, installs with bun (from its cache,
 * outside this checkout), and imports through the installed package path.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const REPOSITORY_ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const STEP_TIMEOUT_MS = 120_000;
const PATCH_FILE = "@stryker-mutator%2Fvitest-runner@10.0.0.patch";
const PROVIDERS_MODULE = "cosmonauts/lib/lean-run/providers/default.ts";

/** Why the test cannot run here, or undefined when npm and bun are both on PATH. */
function missingTools(): string | undefined {
	const missing = ["npm", "bun"].filter(
		(tool) => spawnSync(tool, ["--version"], { stdio: "ignore" }).status !== 0,
	);
	return missing.length > 0
		? `${missing.join(" and ")} not found on PATH`
		: undefined;
}

const skipReason = missingTools();

function run(command: string, args: readonly string[], cwd: string): string {
	return execFileSync(command, args, {
		cwd,
		encoding: "utf8",
		timeout: STEP_TIMEOUT_MS,
		stdio: ["ignore", "pipe", "pipe"],
	});
}

interface InstalledProviders {
	readonly kinds: readonly string[];
	readonly modulePath: string;
}

describe.skipIf(skipReason !== undefined)(
	`the packed cosmonauts package${skipReason ? ` (skipped: ${skipReason})` : ""}`,
	{ timeout: 3 * STEP_TIMEOUT_MS },
	() => {
		let work: string;
		let project: string;
		let installed: string;

		beforeAll(async () => {
			work = realpathSync(await mkdtemp(join(tmpdir(), "lean-packed-")));
			project = join(work, "project");
			run(
				"npm",
				["pack", "--ignore-scripts", "--silent", "--pack-destination", work],
				REPOSITORY_ROOT,
			);
			const [tarball] = (await readdir(work)).filter((name) =>
				name.endsWith(".tgz"),
			);
			await mkdir(project);
			await writeFile(
				join(project, "package.json"),
				JSON.stringify({ name: "consumer", version: "0.0.0", private: true }),
			);
			run(
				"bun",
				["add", "--ignore-scripts", join(work, tarball ?? "missing.tgz")],
				project,
			);
			installed = join(project, "node_modules", "cosmonauts");
		}, 3 * STEP_TIMEOUT_MS);

		afterAll(async () => {
			if (work) await rm(work, { recursive: true, force: true });
		});

		test("ships Stryker's config at the package root", () => {
			expect(existsSync(join(installed, "stryker.config.mjs"))).toBe(true);
		});

		test("ships the vitest-runner patch and its notes", () => {
			expect(existsSync(join(installed, "patches", PATCH_FILE))).toBe(true);
			expect(existsSync(join(installed, "patches", "README.md"))).toBe(true);
		});

		test("resolves createDefaultProviders from the installed package", () => {
			const script = [
				`const url = import.meta.resolve(${JSON.stringify(PROVIDERS_MODULE)});`,
				`const { createDefaultProviders } = await import(url);`,
				"const kinds = createDefaultProviders().map((provider) => provider.kind);",
				"console.log(JSON.stringify({ kinds, modulePath: new URL(url).pathname }));",
			].join("\n");

			const output = run("bun", ["--eval", script], project);
			const result = JSON.parse(output.trim()) as InstalledProviders;

			expect(realpathSync(result.modulePath)).toBe(
				join(installed, "lib/lean-run/providers/default.ts"),
			);
			expect(result.kinds).toEqual(
				expect.arrayContaining(["verify", "health", "dupes", "mutation"]),
			);
		});
	},
);
