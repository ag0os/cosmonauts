/** Repo-relative posix form: backslashes become slashes, `./` and trailing `/` are dropped. */
export function normalizeRepoPath(path: string): string {
	let normalized = path
		.trim()
		.replaceAll("\\", "/")
		.replace(/\/{2,}/g, "/");
	while (normalized.startsWith("./")) normalized = normalized.slice(2);
	while (normalized.endsWith("/") && normalized.length > 1) {
		normalized = normalized.slice(0, -1);
	}
	return normalized;
}

/** Normalized, de-duplicated, sorted; empty entries are dropped. */
export function normalizeRepoPaths(paths: Iterable<string>): string[] {
	const unique = new Set<string>();
	for (const path of paths) {
		const normalized = normalizeRepoPath(path);
		if (normalized !== "" && normalized !== ".") unique.add(normalized);
	}
	return [...unique].sort(compareStrings);
}

/** Code-unit order, independent of locale. */
export function compareStrings(a: string, b: string): number {
	if (a < b) return -1;
	return a > b ? 1 : 0;
}

export function isGlob(pattern: string): boolean {
	return /[*?]/.test(pattern);
}

/** `**` spans directories, `*` and `?` stay within one segment; nothing else is special. */
export function matchesGlob(pattern: string, path: string): boolean {
	return globToRegExp(pattern).test(path);
}

function globToRegExp(pattern: string): RegExp {
	let source = "";
	for (let index = 0; index < pattern.length; index += 1) {
		const char = pattern[index] as string;
		if (pattern.startsWith("**/", index)) {
			source += "(?:.*/)?";
			index += 2;
		} else if (pattern.startsWith("**", index)) {
			source += ".*";
			index += 1;
		} else if (char === "*") source += "[^/]*";
		else if (char === "?") source += "[^/]";
		else source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	}
	return new RegExp(`^${source}$`, "u");
}
