import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { strykerPlugins } from "@stryker-mutator/vitest-runner";
import { expect, test } from "vitest";
import { loadProjectConfig } from "../lib/config/index.ts";
import * as harnessRegistry from "../lib/harness-adapters/registry.ts";
import { useTempDir } from "./helpers/fs.ts";

const tmp = useTempDir("lean-strip-");
const root = new URL("../", import.meta.url);

test("the library and CLI expose no retired Lean implementation or harness asset", async () => {
	for (const path of [
		"bundled/lean",
		"lib/lean-run",
		"cli/lean",
		"external-skills/cosmonauts-lean",
	])
		expect(existsSync(join(fileURLToPath(root), path)), path).toBe(false);
	const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
	expect(pkg.exports).not.toHaveProperty("./lib/lean-run/providers/default.ts");
	const cli = await readFile(new URL("cli/main.ts", root), "utf8");
	expect(cli).not.toContain("./lean/subcommand.ts");
});

test("the harness registry ships no static assets and names no shipped content path", async () => {
	expect(Object.keys(harnessRegistry)).not.toContain("listStaticHarnessAssets");
	expect(Object.keys(harnessRegistry)).not.toContain("getStaticHarnessAsset");
	const adapters = new URL("lib/harness-adapters/", root);
	const files = await readdir(adapters);
	expect(files.length).toBeGreaterThan(0);
	for (const file of files) {
		const source = await readFile(new URL(file, adapters), "utf8");
		expect(source, file).not.toContain("external-skills");
		expect(source, file).not.toContain("external-commands");
	}
});

test("config has no Lean type dependency and ignores retired settings while preserving analysis", async () => {
	for (const path of ["lib/config/types.ts", "lib/config/loader.ts"])
		expect(await readFile(new URL(path, root), "utf8")).not.toContain(
			"../lean-run/",
		);
	await mkdir(join(tmp.path, ".cosmonauts"));
	await writeFile(
		join(tmp.path, ".cosmonauts", "config.json"),
		JSON.stringify({
			lean: { requiredSignals: ["mutation"], budget: { tokens: 10 } },
			analysis: { provider: "consumer" },
		}),
	);
	expect(await loadProjectConfig(tmp.path)).toEqual({
		analysis: { provider: "consumer" },
	});
});

test("independent quality tooling survives the Lean removal", async () => {
	expect(strykerPlugins.some((plugin) => plugin.name === "vitest")).toBe(true);
	const plugins: string[] = JSON.parse(
		execFileSync(
			process.execPath,
			[
				"--input-type=module",
				"-e",
				"const {default: config} = await import('./stryker.config.mjs'); console.log(JSON.stringify(config.plugins));",
			],
			{ cwd: fileURLToPath(root), encoding: "utf8" },
		),
	);
	expect(plugins).toHaveLength(1);
	for (const path of plugins) expect(existsSync(path)).toBe(true);
	for (const path of [
		"lib/code-health",
		"lib/extensions/project-tools/fallow-provider.ts",
		"stryker.config.mjs",
		"patches/@stryker-mutator%2Fvitest-runner@10.0.0.patch",
		".fallow-baselines/dead-code.json",
		".fallow-baselines/health.json",
		".fallow-baselines/dupes.json",
	])
		expect(existsSync(join(fileURLToPath(root), path)), path).toBe(true);
	const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
	expect(pkg.devDependencies).toHaveProperty("@stryker-mutator/core");
	expect(pkg.devDependencies).toHaveProperty("@stryker-mutator/vitest-runner");
	expect(pkg.devDependencies).toHaveProperty("fallow");
});
