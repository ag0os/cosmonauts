import { posix } from "node:path";

export function isSafePosixRelativePath(value: unknown): value is string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.trim() !== value ||
		value.startsWith("/") ||
		value.includes("\\") ||
		value.includes("\0") ||
		/^[A-Za-z]:/u.test(value) ||
		posix.normalize(value) !== value
	) {
		return false;
	}
	return value
		.split("/")
		.every(
			(segment) => segment.length > 0 && segment !== "." && segment !== "..",
		);
}

export function consolidationEvidenceKey(value: {
	readonly scope: "project" | "user";
	readonly path: string;
	readonly digest: string;
}): string {
	return `${value.scope}\0${value.path}\0${value.digest}`;
}
