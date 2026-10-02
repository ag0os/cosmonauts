import {
	loadArchitectureMapConfig,
	moduleOfPath,
} from "../architecture-map/index.ts";
import { requestPaths } from "./plan.ts";

/**
 * Why a direct request is refused, or undefined when it may run: the paths
 * named in the request and in the user's latest message fall in more than
 * one architecture-map module. Paths outside the source roots (tests, docs,
 * scripts) belong to none. An unreadable config refuses nothing.
 */
export async function directScopeRefusal(options: {
	readonly projectRoot: string;
	readonly request: string;
	readonly userMessages?: readonly string[] | undefined;
}): Promise<string | undefined> {
	const latest = options.userMessages?.at(-1) ?? "";
	const paths = [...requestPaths(options.request), ...requestPaths(latest)];
	if (paths.length < 2) return undefined;
	const config = await loadArchitectureMapConfig(options.projectRoot).catch(
		() => undefined,
	);
	if (config === undefined) return undefined;
	const modules = [
		...new Set(
			paths.flatMap(
				(path) => moduleOfPath(config, path.replace(/^\.\//u, "")) ?? [],
			),
		),
	];
	if (modules.length < 2) return undefined;
	return `direct requests cover one module; this one names ${modules.length} (${modules.join(", ")}): write missions/lean/<slug>/plan.md and pass planPath`;
}
