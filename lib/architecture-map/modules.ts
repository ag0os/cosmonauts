import type { ArchitectureMapConfig } from "./types.ts";

type ModuleConfig = Pick<ArchitectureMapConfig, "sourceRoots" | "moduleRoots">;

export function isInsideOrEqualRepoPath(root: string, path: string): boolean {
	if (root === ".") return true;
	return path === root || path.startsWith(`${root}/`);
}

/**
 * The module a path under `sourceRoot` belongs to when no `moduleRoots` are
 * configured: the source root's first directory, or the root itself for a
 * file directly inside it.
 */
export function moduleRootUnder(sourceRoot: string, path: string): string {
	const rest = sourceRoot === "." ? path : path.slice(sourceRoot.length + 1);
	const firstSegment = rest.split("/")[0];
	if (!firstSegment || !rest.includes("/")) return sourceRoot;
	return [sourceRoot, firstSegment]
		.filter((part) => part.length > 0 && part !== ".")
		.join("/");
}

/**
 * The architecture-map module a repo-relative path belongs to: the longest
 * configured `moduleRoots` entry containing it, else its module under the
 * first source root containing it. A path outside them belongs to none.
 */
export function moduleOfPath(
	config: ModuleConfig,
	path: string,
): string | undefined {
	if (config.moduleRoots && config.moduleRoots.length > 0) {
		return [...config.moduleRoots]
			.sort((left, right) => right.length - left.length)
			.find((root) => isInsideOrEqualRepoPath(root, path));
	}
	const sourceRoot = config.sourceRoots.find((root) =>
		isInsideOrEqualRepoPath(root, path),
	);
	return sourceRoot === undefined
		? undefined
		: moduleRootUnder(sourceRoot, path);
}
