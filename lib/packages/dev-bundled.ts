import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Returns true when running from inside the Cosmonauts framework repo itself.
 *
 * Detection heuristic: package.json at root has name "cosmonauts", the
 * repo contains a bundled/ directory, and a repo-only marker (.git/) exists.
 * This avoids treating published package installs as framework checkouts.
 */
export async function isCosmonautsFrameworkRepo(
	root: string,
): Promise<boolean> {
	try {
		const content = await readFile(join(root, "package.json"), "utf-8");
		const pkg = JSON.parse(content) as Record<string, unknown>;
		if (pkg.name !== "cosmonauts") return false;
	} catch {
		return false;
	}

	try {
		const bundled = await stat(join(root, "bundled"));
		if (!bundled.isDirectory()) return false;

		const gitDir = await stat(join(root, ".git"));
		return gitDir.isDirectory();
	} catch {
		return false;
	}
}

/**
 * Returns the absolute path of each package directory directly under
 * `bundledDir` that contains a `cosmonauts.json` manifest.
 */
export async function discoverBundledPackageDirs(
	bundledDir: string,
): Promise<string[]> {
	const dirs: string[] = [];
	const entries = await readdir(bundledDir, { withFileTypes: true }).catch(
		() => null,
	);
	if (!entries) return dirs;

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;

		const pkgDir = join(bundledDir, entry.name);
		try {
			await stat(join(pkgDir, "cosmonauts.json"));
			dirs.push(pkgDir);
		} catch {
			// no cosmonauts.json — not a bundled package
		}
	}

	return dirs;
}

/**
 * Discover the bundled packages to auto-load when running from the framework
 * repo in dev mode.
 */
export async function discoverFrameworkBundledPackageDirs(
	frameworkRoot: string,
): Promise<string[] | undefined> {
	if (!(await isCosmonautsFrameworkRepo(frameworkRoot))) {
		return undefined;
	}

	const discovered = await discoverBundledPackageDirs(
		join(frameworkRoot, "bundled"),
	);
	return discovered.length > 0 ? discovered : undefined;
}
