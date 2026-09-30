/**
 * Pure parsing of `git diff -U0` output and line arithmetic over its hunks.
 * No process or filesystem access.
 */

export interface DiffHunk {
	readonly oldStart: number;
	readonly oldCount: number;
	readonly newStart: number;
	readonly newCount: number;
}

/**
 * One changed file. `oldPath` is undefined for an added file, `newPath` for a
 * deleted one. Paths are repository-relative with the `a/` and `b/` prefixes
 * removed.
 */
export interface FileDiff {
	readonly oldPath: string | undefined;
	readonly newPath: string | undefined;
	readonly hunks: readonly DiffHunk[];
}

interface LineRange {
	readonly startLine: number;
	readonly endLine: number;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

interface ParseState {
	readonly files: { oldPath?: string; newPath?: string; hunks: DiffHunk[] }[];
	pendingOldPath: string | undefined;
	remainingOld: number;
	remainingNew: number;
}

/**
 * Parse unified diff text produced with `-U0 --src-prefix=a/ --dst-prefix=b/`.
 * Only files with at least one hunk are returned: pure renames and mode
 * changes touch no lines.
 */
export function parseUnifiedDiff(text: string): FileDiff[] {
	const state: ParseState = {
		files: [],
		pendingOldPath: undefined,
		remainingOld: 0,
		remainingNew: 0,
	};
	for (const line of text.split("\n")) {
		if (state.remainingOld > 0 || state.remainingNew > 0) {
			consumeHunkLine(state, line);
		} else {
			consumeHeaderLine(state, line);
		}
	}
	return state.files
		.filter((file) => file.hunks.length > 0)
		.map((file) => ({
			oldPath: file.oldPath,
			newPath: file.newPath,
			hunks: file.hunks,
		}));
}

function consumeHunkLine(state: ParseState, line: string): void {
	if (line.startsWith("-")) state.remainingOld -= 1;
	else if (line.startsWith("+")) state.remainingNew -= 1;
	else if (line.startsWith(" ")) {
		state.remainingOld -= 1;
		state.remainingNew -= 1;
	}
}

function consumeHeaderLine(state: ParseState, line: string): void {
	if (line.startsWith("--- ")) {
		state.pendingOldPath = diffHeaderPath(line.slice(4), "a/");
		return;
	}
	if (line.startsWith("+++ ")) {
		state.files.push({
			oldPath: state.pendingOldPath,
			newPath: diffHeaderPath(line.slice(4), "b/"),
			hunks: [],
		});
		state.pendingOldPath = undefined;
		return;
	}
	const hunk = parseHunkHeader(line);
	const current = state.files.at(-1);
	if (hunk === undefined || current === undefined) return;
	current.hunks.push(hunk);
	state.remainingOld = hunk.oldCount;
	state.remainingNew = hunk.newCount;
}

export function parseHunkHeader(line: string): DiffHunk | undefined {
	const match = HUNK_HEADER.exec(line);
	if (match === null) return undefined;
	return {
		oldStart: Number(match[1]),
		oldCount: match[2] === undefined ? 1 : Number(match[2]),
		newStart: Number(match[3]),
		newCount: match[4] === undefined ? 1 : Number(match[4]),
	};
}

function diffHeaderPath(raw: string, prefix: string): string | undefined {
	const trimmed = raw.replace(/\t.*$/, "");
	if (trimmed === "/dev/null") return undefined;
	const path = trimmed.startsWith('"') ? unquoteGitPath(trimmed) : trimmed;
	return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

const GIT_ESCAPES: Readonly<Record<string, number>> = {
	a: 7,
	b: 8,
	t: 9,
	n: 10,
	v: 11,
	f: 12,
	r: 13,
	'"': 34,
	"\\": 92,
};

/** Undo git's C-style path quoting (octal bytes are UTF-8). */
export function unquoteGitPath(quoted: string): string {
	const body = quoted.slice(1, -1);
	const bytes: number[] = [];
	for (let index = 0; index < body.length; index += 1) {
		const char = body[index] as string;
		if (char !== "\\") {
			bytes.push(...Buffer.from(char, "utf8"));
			continue;
		}
		const octal = /^[0-7]{3}/.exec(body.slice(index + 1));
		if (octal !== null) {
			bytes.push(Number.parseInt(octal[0], 8));
			index += 3;
			continue;
		}
		const next = body[index + 1] ?? "";
		bytes.push(GIT_ESCAPES[next] ?? next.charCodeAt(0));
		index += 1;
	}
	return Buffer.from(bytes).toString("utf8");
}

/**
 * A hunk touches a range when one of its added lines falls inside it, or, for
 * a pure deletion (`newCount` 0, removed after line `newStart`), when the
 * deletion point sits between two lines of the range.
 */
function hunkTouchesRange(hunk: DiffHunk, range: LineRange): boolean {
	if (hunk.newCount === 0) {
		return range.startLine <= hunk.newStart && hunk.newStart < range.endLine;
	}
	const lastNewLine = hunk.newStart + hunk.newCount - 1;
	return hunk.newStart <= range.endLine && lastNewLine >= range.startLine;
}

export function rangeIntersectsHunks(
	range: LineRange,
	hunks: readonly DiffHunk[],
): boolean {
	return hunks.some((hunk) => hunkTouchesRange(hunk, range));
}

/**
 * Map a line of the new file to the old file. An unchanged line maps to its
 * single old line. A line added or rewritten by a hunk maps to the lines that
 * hunk removed, or to undefined when the hunk removed nothing.
 */
export function mapNewLineToOld(
	line: number,
	hunks: readonly DiffHunk[],
): LineRange | undefined {
	let offset = 0;
	for (const hunk of hunks) {
		if (
			hunk.newCount > 0 &&
			hunkTouchesRange(hunk, { startLine: line, endLine: line })
		) {
			return removedRange(hunk);
		}
		if (hunkEndsBefore(hunk, line)) offset += hunk.oldCount - hunk.newCount;
	}
	return { startLine: line + offset, endLine: line + offset };
}

function removedRange(hunk: DiffHunk): LineRange | undefined {
	if (hunk.oldCount === 0) return undefined;
	return {
		startLine: hunk.oldStart,
		endLine: hunk.oldStart + hunk.oldCount - 1,
	};
}

function hunkEndsBefore(hunk: DiffHunk, line: number): boolean {
	return hunk.newCount === 0
		? hunk.newStart < line
		: hunk.newStart + hunk.newCount - 1 < line;
}
