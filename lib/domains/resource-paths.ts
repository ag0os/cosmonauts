import { join } from "node:path";

interface DirectoryResourceOptions {
	readonly domainsDir?: string;
	readonly domain?: string;
	readonly fallbackDomains?: readonly string[];
}

/** Directory-only callers supply every resource identity; absence never invents a domain. */
export function directoryResourcePaths(
	options: DirectoryResourceOptions & {
		readonly kind: "capabilities" | "prompts" | "extensions";
		readonly filename: string;
	},
): string[] {
	const domainsDir = options.domainsDir;
	if (!domainsDir) return [];
	const domains = new Set([
		...(options.domain ? [options.domain] : []),
		...(options.fallbackDomains ?? []),
	]);
	return [...domains].map((domain) =>
		join(domainsDir, domain, options.kind, options.filename),
	);
}
