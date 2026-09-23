import path from "node:path";

/** Project-relative module path, always `/`-separated so it matches discovered modules on every platform. */
export function projectPath(
	root: string,
	target: string,
	pathApi: Pick<typeof path, "relative"> = path,
): string {
	return pathApi.relative(root, target).replaceAll("\\", "/");
}

interface BinEntryImportsOptions {
	root: string;
	script: string;
	source: string;
	pathApi?: Pick<typeof path, "dirname" | "join" | "relative" | "resolve">;
}

/** Project paths of the side-effect imports a package `bin` script loads. */
export function binEntryImports({
	root,
	script,
	source,
	pathApi = path,
}: BinEntryImportsOptions): string[] {
	const scriptDir = pathApi.dirname(pathApi.join(root, script));
	return [...source.matchAll(/^import\s+["']([^"']+)["']/gm)].map((match) =>
		projectPath(root, pathApi.resolve(scriptDir, match[1] ?? ""), pathApi),
	);
}
