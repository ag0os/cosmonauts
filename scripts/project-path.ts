import path from "node:path";

/** Project-relative module path, always `/`-separated so it matches discovered modules on every platform. */
export function projectPath(
	root: string,
	target: string,
	pathApi: Pick<typeof path, "relative"> = path,
): string {
	return pathApi.relative(root, target).replaceAll("\\", "/");
}
