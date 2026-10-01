/**
 * Post-edit health hook for `lean/builder`: silent unless a changed function
 * in the file just written got more complex than it was at the run's base.
 *
 * The base is, in order: the worktree-scoped marker the lean runner writes
 * with `writeRunBaseSha` before spawning a builder (so a re-entry builder in
 * a fresh session compares against the same base), then `LEAN_RUN_BASE_SHA`,
 * then HEAD pinned at this session's first check.
 *
 * Every finding it injects is also appended to `<git dir>/lean-run/
 * health-hook.jsonl`, which the runner copies into the run record.
 *
 * Writes made through `bash` raise no edit or write `tool_result` and are not
 * checked (ruling P-2). External harnesses run the same check through
 * `cosmonauts analysis changed-functions --base <rev> --file <path>`.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import {
	type ExtensionAPI,
	type ExtensionContext,
	isEditToolResult,
	isWriteToolResult,
	type ToolResultEvent,
	type ToolResultEventResult,
} from "@earendil-works/pi-coding-agent";
import { extractAgentIdFromSystemPrompt } from "../../../../lib/agents/runtime-identity.ts";
import {
	type ChangedFunction,
	type ChangedFunctionsReport,
	type ResolveChangedFunctionsOptions,
	resolveChangedFunctions,
} from "../../../../lib/code-health/changed-functions.ts";
import { readRunBaseSha } from "../../../../lib/lean-run/base-sha.ts";
import { appendHealthHookEntries } from "../../../../lib/lean-run/health-hook-log.ts";

const execFileAsync = promisify(execFile);

const BUILDER_ROLE = "lean/builder";
const BASE_SHA_ENV = "LEAN_RUN_BASE_SHA";
const LOG_ENTRY_TYPE = "lean.health-hook";
const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;
const ABSOLUTE_PATH = /(?:[A-Za-z]:)?[\\/][^\s'"`:]*/g;

interface HealthHookDeps {
	readonly resolve?: (
		options: ResolveChangedFunctionsOptions,
	) => Promise<ChangedFunctionsReport>;
	readonly fallowExecutable?: string;
	readonly env?: NodeJS.ProcessEnv;
}

interface CheckTarget {
	readonly path: string;
	readonly key: string;
}

export default function healthHook(
	pi: ExtensionAPI,
	deps: HealthHookDeps = {},
): void {
	const resolveFunctions = deps.resolve ?? resolveChangedFunctions;
	const env = deps.env ?? process.env;
	const checked = new Set<string>();
	const logged = new Set<string>();
	let pinnedHead: Promise<string> | undefined;

	const baseFor = async (cwd: string): Promise<string> => {
		const fromRun =
			(await readRunBaseSha({ worktree: cwd })) ?? env[BASE_SHA_ENV]?.trim();
		if (fromRun) return fromRun;
		pinnedHead ??= headCommit(cwd);
		return pinnedHead;
	};

	const logOnce = (file: string, error: unknown): void => {
		const message = error instanceof Error ? error.message : String(error);
		const key = logKey(error, message);
		if (logged.has(key)) return;
		logged.add(key);
		pi.appendEntry(LOG_ENTRY_TYPE, { event: "check-failed", file, message });
	};

	pi.on("tool_result", async (event, ctx) => {
		if (!isBuilderWrite(event, ctx)) return undefined;
		try {
			const target = await checkTarget(event, ctx.cwd);
			if (checked.has(target.key)) return undefined;
			checked.add(target.key);
			const report = await resolveFunctions({
				cwd: ctx.cwd,
				base: await baseFor(ctx.cwd),
				file: target.path,
				...(deps.fallowExecutable === undefined
					? {}
					: { fallowExecutable: deps.fallowExecutable }),
				...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
			});
			const injected = injectFinding(event, report);
			if (injected)
				await persistFinding(ctx.cwd, report).catch((error: unknown) =>
					logOnce(String(event.input.path), error),
				);
			return injected;
		} catch (error) {
			logOnce(String(event.input.path), error);
			return undefined;
		}
	});
}

function isBuilderWrite(
	event: ToolResultEvent,
	ctx: ExtensionContext,
): boolean {
	if (!isEditToolResult(event) && !isWriteToolResult(event)) return false;
	if (event.isError || typeof event.input.path !== "string") return false;
	return extractAgentIdFromSystemPrompt(ctx.getSystemPrompt()) === BUILDER_ROLE;
}

/** Keyed by path and content, so rewriting identical bytes is not rechecked. */
async function checkTarget(
	event: ToolResultEvent,
	cwd: string,
): Promise<CheckTarget> {
	const path = resolveToolPath(String(event.input.path), cwd);
	const digest = createHash("sha256")
		.update(await readFile(path))
		.digest("hex");
	return { path, key: `${path}\0${digest}` };
}

/** Mirrors Pi's `resolveToCwd`, which the package does not export. */
function resolveToolPath(input: string, cwd: string): string {
	let path = input.replace(UNICODE_SPACES, " ");
	if (path.startsWith("@")) path = path.slice(1);
	if (path === "~") return homedir();
	if (path.startsWith("~/")) return join(homedir(), path.slice(2));
	return resolve(cwd, path);
}

/** Stable across retries: temp directories in a message differ on every run. */
function logKey(error: unknown, message: string): string {
	const name = error instanceof Error ? error.name : "unknown";
	const firstLine = message.split("\n")[0] ?? "";
	return `${name}\0${firstLine.replace(ABSOLUTE_PATH, "<path>")}`;
}

async function headCommit(cwd: string): Promise<string> {
	const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
		cwd,
		encoding: "utf8",
	});
	return stdout.trim();
}

function injectFinding(
	event: ToolResultEvent,
	report: ChangedFunctionsReport,
): ToolResultEventResult | undefined {
	const regressed = report.functions.filter((fn) => fn.regressed);
	if (regressed.length === 0) return undefined;
	const lines = [
		`Health check: complexity rose against base ${report.baseCommit.slice(0, 7)} in changed code.`,
		...regressed.map(describeRegression),
	];
	return {
		content: [...event.content, { type: "text", text: lines.join("\n") }],
	};
}

/** One line per regressed function in the run's hook log, which the lean runner copies into the run record. */
function persistFinding(
	worktree: string,
	report: ChangedFunctionsReport,
): Promise<void> {
	const timestamp = new Date().toISOString();
	return appendHealthHookEntries({
		worktree,
		entries: report.functions
			.filter((fn) => fn.regressed)
			.map((fn) => ({
				timestamp,
				file: fn.file,
				function: fn.name,
				startLine: fn.startLine,
				endLine: fn.endLine,
				metrics: {
					cyclomatic: fn.cyclomatic,
					cognitive: fn.cognitive,
					crap: fn.crap,
				},
				baseMetrics: fn.base,
				base: report.baseCommit,
			})),
	});
}

function describeRegression(fn: ChangedFunction): string {
	const rises = metricRises(fn).join(", ");
	return `- ${fn.file}:${fn.startLine}-${fn.endLine} ${fn.name} ${rises}`;
}

function metricRises(fn: ChangedFunction): string[] {
	const base = fn.base;
	if (base === null) return [];
	const rises: string[] = [];
	if (fn.cyclomatic > base.cyclomatic) {
		rises.push(`cyclomatic ${base.cyclomatic}→${fn.cyclomatic}`);
	}
	if (fn.cognitive > base.cognitive) {
		rises.push(`cognitive ${base.cognitive}→${fn.cognitive}`);
	}
	if (fn.crap !== null && base.crap !== null && fn.crap > base.crap) {
		rises.push(`crap ${round(base.crap)}→${round(fn.crap)}`);
	}
	return rises;
}

function round(value: number): string {
	return String(Math.round(value * 10) / 10);
}
