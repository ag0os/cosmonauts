/**
 * Installs the package the way a consumer gets it: `npm pack` of the working
 * tree, unpacked into `<consumer>/node_modules/cosmonauts` with the bin linked
 * into `node_modules/.bin`, as npm lays it out. Dependencies come from this
 * repository's install (a nested `node_modules` symlink), so no registry is used.
 */
import { execFile } from "node:child_process";
import { mkdir, rename, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
export const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

export interface PackedInstall {
	/** Paths inside the tarball, without the `package/` prefix, sorted. */
	readonly files: readonly string[];
	/** `<consumer>/node_modules/cosmonauts`. */
	readonly installed: string;
	/** `<consumer>/node_modules/.bin`. */
	readonly binDir: string;
}

export async function installPackedPackage(
	consumer: string,
): Promise<PackedInstall> {
	const packDir = join(consumer, ".pack");
	await mkdir(packDir, { recursive: true });
	const { stdout } = await exec(
		"npm",
		["pack", "--json", "--offline", "--pack-destination", packDir],
		{ cwd: repoRoot, env: { ...process.env, npm_config_offline: "true" } },
	);
	const [{ filename }] = JSON.parse(stdout) as [{ filename: string }];
	const tarball = join(packDir, filename);
	const listing = await exec("tar", ["-tzf", tarball]);
	const files = listing.stdout
		.split("\n")
		.filter((line) => line.length > 0)
		.map((line) => line.replace(/^package\//, ""))
		.sort();

	const modules = join(consumer, "node_modules");
	const installed = join(modules, "cosmonauts");
	const binDir = join(modules, ".bin");
	await mkdir(binDir, { recursive: true });
	await exec("tar", ["-xzf", tarball, "-C", modules]);
	await rename(join(modules, "package"), installed);
	await symlink(
		join(repoRoot, "node_modules"),
		join(installed, "node_modules"),
	);
	await symlink("../cosmonauts/bin/cosmonauts", join(binDir, "cosmonauts"));
	await writeFile(
		join(consumer, "package.json"),
		`${JSON.stringify({ name: "consumer", private: true, type: "module" })}\n`,
	);
	return { files, installed, binDir };
}
