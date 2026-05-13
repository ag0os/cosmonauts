/**
 * CLI subcommand: `cosmonauts session`
 *
 * Enumerates Pi sessions persisted on disk. The on-disk layout is
 *
 *   <piSessionDir(cwd)>/<agent-or-domain>/<file>.jsonl
 *
 * Pi's `SessionManager.list(cwd, sessionDir)` reads one such leaf directory.
 * `SessionManager.listAll()` scans all cwds globally. This command wraps both
 * with --json / --plain output for external orchestrators.
 */

import { readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import {
	type SessionInfo,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import { Command } from "commander";
import { piSessionDir } from "../session.ts";
import type { CliOutputMode } from "../shared/output.ts";
import { getOutputMode, printJson, printLines } from "../shared/output.ts";

// ============================================================================
// Public shapes
// ============================================================================

/** Row shape for `session list` / base shape for `session info`. */
export interface SessionListItem {
	id: string;
	/** Agent / domain subdirectory under the project's pi session dir, if any. */
	agent: string | null;
	cwd: string;
	path: string;
	name: string | null;
	created: string;
	modified: string;
	messageCount: number;
	firstMessage: string;
	parentSessionPath: string | null;
}

/** Full output shape for `session info`. */
export interface SessionInfoOutput extends SessionListItem {
	/** Concatenated message text, included only when --include-text is set. */
	allMessagesText?: string;
}

interface SessionListCliOptions {
	agent?: string;
	all?: boolean;
	limit?: string;
	sessionDir?: string;
}

interface SessionInfoCliOptions {
	includeText?: boolean;
	sessionDir?: string;
}

// ============================================================================
// Pure helpers (exported for unit tests)
// ============================================================================

export function sessionInfoToListItem(
	info: SessionInfo,
	agent: string | null,
): SessionListItem {
	return {
		id: info.id,
		agent,
		cwd: info.cwd,
		path: info.path,
		name: info.name ?? null,
		created: info.created.toISOString(),
		modified: info.modified.toISOString(),
		messageCount: info.messageCount,
		firstMessage: info.firstMessage,
		parentSessionPath: info.parentSessionPath ?? null,
	};
}

export function sortByModifiedDesc(
	rows: readonly SessionListItem[],
): SessionListItem[] {
	return [...rows].sort((a, b) => b.modified.localeCompare(a.modified));
}

/**
 * Match `query` against a session id. Accepts a full uuid or a prefix; for
 * short prefixes (< 4 chars) match is rejected to avoid grabbing the wrong
 * session. A `.jsonl` path also matches when it equals `row.path`.
 */
export function findSessionMatches(
	rows: readonly SessionListItem[],
	query: string,
): SessionListItem[] {
	if (query.endsWith(".jsonl") || query.includes("/")) {
		return rows.filter((row) => row.path === query);
	}
	if (query.length < 4) {
		return [];
	}
	return rows.filter((row) => row.id.startsWith(query));
}

export function renderSessionsList(
	rows: readonly SessionListItem[],
	mode: CliOutputMode,
): { kind: "json"; value: unknown } | { kind: "lines"; lines: string[] } {
	if (mode === "json") {
		return { kind: "json", value: rows };
	}

	if (mode === "plain") {
		return {
			kind: "lines",
			lines: rows.map(
				(row) =>
					`${row.id}\t${row.agent ?? ""}\t${row.modified}\t${row.messageCount}\t${row.firstMessage.replace(/\s+/g, " ").slice(0, 80)}`,
			),
		};
	}

	if (rows.length === 0) {
		return { kind: "lines", lines: ["No sessions found."] };
	}

	const idWidth = Math.max(8, ...rows.map((row) => row.id.slice(0, 8).length));
	const agentWidth = Math.max(
		5,
		...rows.map((row) => (row.agent ?? "—").length),
	);
	const modifiedWidth = 20; // ISO 8601 up to seconds: "2026-05-13T09:40:59Z" → 20
	const lines = [
		`${"ID".padEnd(idWidth)}  ${"AGENT".padEnd(agentWidth)}  ${"MODIFIED".padEnd(modifiedWidth)}  MSGS  FIRST MESSAGE`,
		`${"-".repeat(idWidth)}  ${"-".repeat(agentWidth)}  ${"-".repeat(modifiedWidth)}  ----  -------------`,
	];
	for (const row of rows) {
		const id = row.id.slice(0, 8).padEnd(idWidth);
		const agent = (row.agent ?? "—").padEnd(agentWidth);
		const modified = row.modified.slice(0, 19).padEnd(modifiedWidth);
		const msgs = String(row.messageCount).padStart(4);
		const preview = row.firstMessage.replace(/\s+/g, " ").slice(0, 60);
		lines.push(`${id}  ${agent}  ${modified}  ${msgs}  ${preview}`);
	}
	return { kind: "lines", lines };
}

export function renderSessionInfo(
	info: SessionInfoOutput,
	mode: CliOutputMode,
): { kind: "json"; value: unknown } | { kind: "lines"; lines: string[] } {
	if (mode === "json") {
		return { kind: "json", value: info };
	}

	if (mode === "plain") {
		const lines = [
			`id\t${info.id}`,
			`agent\t${info.agent ?? ""}`,
			`cwd\t${info.cwd}`,
			`path\t${info.path}`,
			`created\t${info.created}`,
			`modified\t${info.modified}`,
			`messages\t${info.messageCount}`,
			`name\t${info.name ?? ""}`,
			`parent\t${info.parentSessionPath ?? ""}`,
		];
		if (info.allMessagesText !== undefined) {
			lines.push(`text\t${info.allMessagesText}`);
		}
		return { kind: "lines", lines };
	}

	const lines = [
		`Session ${info.id}`,
		`  agent:    ${info.agent ?? "—"}`,
		`  cwd:      ${info.cwd}`,
		`  path:     ${info.path}`,
		`  created:  ${info.created}`,
		`  modified: ${info.modified}`,
		`  messages: ${info.messageCount}`,
	];
	if (info.name) {
		lines.push(`  name:     ${info.name}`);
	}
	if (info.parentSessionPath) {
		lines.push(`  parent:   ${info.parentSessionPath}`);
	}
	if (info.firstMessage) {
		const preview = info.firstMessage.replace(/\s+/g, " ").slice(0, 200);
		lines.push("");
		lines.push(`  first:    ${preview}`);
	}
	if (info.allMessagesText !== undefined) {
		lines.push("");
		lines.push("--- transcript ---");
		lines.push(info.allMessagesText);
	}
	return { kind: "lines", lines };
}

// ============================================================================
// Data gathering (touches Pi + the filesystem)
// ============================================================================

interface CollectOptions {
	cwd: string;
	/** Explicit override; when set we list this dir directly and skip agent enumeration. */
	explicitSessionDir?: string;
	/** Restrict to a single agent subdir under piSessionDir(cwd). */
	agentFilter?: string;
}

/**
 * Enumerate session rows for the current project by scanning each agent
 * subdirectory under `piSessionDir(cwd)`. Returns an empty array if the dir
 * does not exist yet.
 */
export async function collectProjectSessions(
	opts: CollectOptions,
): Promise<SessionListItem[]> {
	if (opts.explicitSessionDir) {
		const agentLabel = basename(opts.explicitSessionDir);
		const infos = await SessionManager.list(opts.cwd, opts.explicitSessionDir);
		return infos.map((info) => sessionInfoToListItem(info, agentLabel || null));
	}

	const base = piSessionDir(opts.cwd);
	const subdirs = await listAgentSubdirs(base);
	const filtered = opts.agentFilter
		? subdirs.filter((subdir) => subdir.name === opts.agentFilter)
		: subdirs;

	const rows: SessionListItem[] = [];
	for (const subdir of filtered) {
		const infos = await SessionManager.list(opts.cwd, subdir.path);
		for (const info of infos) {
			rows.push(sessionInfoToListItem(info, subdir.name));
		}
	}
	return rows;
}

interface AgentSubdir {
	name: string;
	path: string;
}

async function listAgentSubdirs(base: string): Promise<AgentSubdir[]> {
	let entries: import("node:fs").Dirent[];
	try {
		entries = await readdir(base, { withFileTypes: true });
	} catch (err: unknown) {
		if (isNoEntError(err)) {
			return [];
		}
		throw err;
	}
	return entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => ({ name: entry.name, path: join(base, entry.name) }));
}

function isNoEntError(err: unknown): boolean {
	return (
		typeof err === "object" &&
		err !== null &&
		"code" in err &&
		(err as { code: string }).code === "ENOENT"
	);
}

async function collectAllSessions(): Promise<SessionListItem[]> {
	const infos = await SessionManager.listAll();
	return infos.map((info) => sessionInfoToListItem(info, null));
}

function parseLimit(raw: string | undefined): number | undefined {
	if (raw === undefined) return undefined;
	const value = Number(raw);
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error(`Invalid --limit: ${raw}. Must be a positive integer.`);
	}
	return value;
}

// ============================================================================
// Action handlers
// ============================================================================

async function listAction(
	options: SessionListCliOptions,
	mode: CliOutputMode,
): Promise<void> {
	let limit: number | undefined;
	try {
		limit = parseLimit(options.limit);
	} catch (err) {
		process.stderr.write(
			`cosmonauts session list: ${err instanceof Error ? err.message : String(err)}\n`,
		);
		process.exit(1);
	}

	if (options.all && options.agent) {
		process.stderr.write(
			"cosmonauts session list: --all and --agent are mutually exclusive.\n",
		);
		process.exit(1);
	}
	if (options.all && options.sessionDir) {
		process.stderr.write(
			"cosmonauts session list: --all and --session-dir are mutually exclusive.\n",
		);
		process.exit(1);
	}

	let rows: SessionListItem[];
	try {
		if (options.all) {
			rows = await collectAllSessions();
		} else {
			rows = await collectProjectSessions({
				cwd: process.cwd(),
				explicitSessionDir: options.sessionDir,
				agentFilter: options.agent,
			});
		}
	} catch (err) {
		process.stderr.write(
			`cosmonauts session list: ${err instanceof Error ? err.message : String(err)}\n`,
		);
		process.exit(1);
	}

	const sorted = sortByModifiedDesc(rows);
	const capped = limit !== undefined ? sorted.slice(0, limit) : sorted;
	const rendered = renderSessionsList(capped, mode);
	if (rendered.kind === "json") {
		printJson(rendered.value);
	} else {
		printLines(rendered.lines);
	}
}

async function infoAction(
	query: string,
	options: SessionInfoCliOptions,
	mode: CliOutputMode,
): Promise<void> {
	let rows: SessionListItem[];
	try {
		rows = await collectProjectSessions({
			cwd: process.cwd(),
			explicitSessionDir: options.sessionDir,
		});
	} catch (err) {
		process.stderr.write(
			`cosmonauts session info: ${err instanceof Error ? err.message : String(err)}\n`,
		);
		process.exit(1);
	}

	const matches = findSessionMatches(rows, query);
	if (matches.length === 0) {
		process.stderr.write(
			`cosmonauts session info: no session matches "${query}".\n`,
		);
		process.exit(1);
	}
	if (matches.length > 1) {
		process.stderr.write(
			`cosmonauts session info: query "${query}" is ambiguous (matched ${matches.length} sessions). Candidates:\n`,
		);
		for (const row of matches) {
			process.stderr.write(`  ${row.id}  ${row.path}\n`);
		}
		process.exit(1);
	}

	const match = matches[0];
	if (match === undefined) {
		process.stderr.write(
			`cosmonauts session info: no session matches "${query}".\n`,
		);
		process.exit(1);
	}
	const output: SessionInfoOutput = { ...match };
	if (options.includeText) {
		const enriched = await loadFullSessionInfo(match);
		output.allMessagesText = enriched.allMessagesText;
	}
	const rendered = renderSessionInfo(output, mode);
	if (rendered.kind === "json") {
		printJson(rendered.value);
	} else {
		printLines(rendered.lines);
	}
}

async function loadFullSessionInfo(row: SessionListItem): Promise<SessionInfo> {
	// SessionManager.list returned us a SessionInfo with allMessagesText already
	// populated; we re-read here only for the case where the caller wants the
	// full transcript and we returned a trimmed row up the chain. List rows
	// strip allMessagesText to keep payloads small, but a single info lookup
	// can afford the full read via a fresh list call against the parent dir.
	const parentDir = row.path.replace(/\/[^/]+$/, "");
	const infos = await SessionManager.list(row.cwd, parentDir);
	const found = infos.find((info) => info.path === row.path);
	if (!found) {
		// Shouldn't happen — the row came from the same scan — but degrade
		// gracefully rather than throwing.
		return {
			path: row.path,
			id: row.id,
			cwd: row.cwd,
			created: new Date(row.created),
			modified: new Date(row.modified),
			messageCount: row.messageCount,
			firstMessage: row.firstMessage,
			allMessagesText: "",
		};
	}
	// touch stat so a missing file errors cleanly rather than later
	await stat(found.path).catch(() => undefined);
	return found;
}

// ============================================================================
// Commander program
// ============================================================================

export function createSessionsProgram(): Command {
	const program = new Command();

	program
		.name("cosmonauts session")
		.description("Enumerate and inspect persisted Pi sessions")
		.option("--plain", "Output in plain text format (for agents)")
		.option("--json", "Output in JSON format");

	program
		.command("list")
		.alias("ls")
		.description("List sessions for the current project, most recent first")
		.option(
			"-a, --agent <id>",
			"Restrict to one agent or domain subdirectory (e.g. 'cosmo', 'coding')",
		)
		.option(
			"--all",
			"List sessions across every project (calls SessionManager.listAll)",
		)
		.option("--limit <n>", "Cap the number of rows returned (default: no cap)")
		.option(
			"--session-dir <path>",
			"Override the base session dir; scans <path> directly and skips agent enumeration",
		)
		.action(async (options: SessionListCliOptions) => {
			await listAction(options, getOutputMode(program.opts()));
		});

	program
		.command("info")
		.description(
			"Show metadata for one session (resolved by id prefix or path)",
		)
		.argument(
			"<id-or-path>",
			"Session UUID prefix (≥4 chars) or full .jsonl path",
		)
		.option(
			"--include-text",
			"Include the full concatenated message text (allMessagesText)",
		)
		.option(
			"--session-dir <path>",
			"Override the base session dir; scans <path> directly and skips agent enumeration",
		)
		.action(async (query: string, options: SessionInfoCliOptions) => {
			await infoAction(query, options, getOutputMode(program.opts()));
		});

	return program;
}
