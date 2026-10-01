/**
 * Tool permissions for lean roles that a tool set cannot express, enforced
 * instead of asked for in prompts (brief principles 1 and 4):
 *
 * - `lean/builder` cannot commit, push or open pull requests; the host owns
 *   git history. Destructive git is already blocked by the driver guard.
 * - `lean/checker` cannot call the edit or write tools; it reports.
 * - An envelope repair turn, whose prompt starts with `REPAIR_HEADING`, can
 *   call no tool at all: it only re-emits the envelope.
 *
 * The commit guard parses shell lexically, one command word per part (the
 * accepted gap P-2): file writes through `bash`, git reached through `sh -c`,
 * `eval` or a script, git aliases (`git -c alias.ci=commit ci`), plumbing such
 * as `git commit-tree`, `gh api`, and wrapper options that take a value
 * (`sudo -u user git push`) are not caught. External harnesses do not load Pi
 * extensions; the run manifest says so for those runs.
 */

import type {
	ExtensionAPI,
	ExtensionContext,
	ToolCallEvent,
	ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import { extractAgentIdFromSystemPrompt } from "../../../../lib/agents/runtime-identity.ts";
import { REPAIR_HEADING } from "../../../../lib/lean-run/prompts.ts";

const BUILDER = "lean/builder";
const CHECKER = "lean/checker";

/** Git verbs that write history or publish it. */
const HISTORY_VERBS = new Set([
	"commit",
	"push",
	"merge",
	"rebase",
	"cherry-pick",
	"revert",
	"am",
]);

/** Global git options that take a separate value: `git -C dir commit`. */
const GIT_OPTIONS_WITH_VALUE = new Set([
	"-C",
	"-c",
	"--git-dir",
	"--work-tree",
	"--namespace",
	"--config-env",
]);

export default function roleGuard(pi: ExtensionAPI): void {
	let repairTurn = false;

	pi.on("before_agent_start", (event) => {
		repairTurn = event.prompt.startsWith(REPAIR_HEADING);
		return undefined;
	});

	pi.on("tool_call", (event, ctx) => {
		const role = leanRole(ctx);
		if (role === undefined) return undefined;
		if (repairTurn)
			return block(
				"Envelope repair turn: reply with only the envelope line; no tool calls.",
			);
		if (role === CHECKER && isFileEdit(event))
			return block("lean/checker reports on claims and does not change files.");
		if (role === BUILDER && writesGitHistory(event))
			return block(
				"Commits, pushes and pull requests belong to the host and the user, not the builder. Leave your change in the worktree.",
			);
		return undefined;
	});
}

function leanRole(ctx: ExtensionContext): string | undefined {
	const role = extractAgentIdFromSystemPrompt(ctx.getSystemPrompt());
	return role?.startsWith("lean/") ? role : undefined;
}

function block(reason: string): ToolCallEventResult {
	return { block: true, reason };
}

function isFileEdit(event: ToolCallEvent): boolean {
	return event.toolName === "edit" || event.toolName === "write";
}

function writesGitHistory(event: ToolCallEvent): boolean {
	if (event.toolName !== "bash" && event.toolName !== "powershell")
		return false;
	const command = event.input.command;
	return typeof command === "string" && commandWritesHistory(command);
}

/** Shell keywords that can stand before a command word. */
const SHELL_KEYWORDS = new Set([
	"!",
	"if",
	"then",
	"elif",
	"else",
	"while",
	"until",
	"do",
]);

/** Programs that run the command after them. */
const WRAPPERS = new Set([
	"env",
	"command",
	"time",
	"nice",
	"nohup",
	"exec",
	"xargs",
	"sudo",
]);

/**
 * True when any part runs a history verb or `gh pr create|merge`. Parts are
 * split at `;`, `&`, `|`, newlines, parentheses, braces, backticks and `$(`,
 * so subshells, groups and command substitutions are parts of their own.
 */
export function commandWritesHistory(command: string): boolean {
	return command
		.split(/[;&|\n(){}`]+|\$\(/)
		.map((part) => part.trim().split(/\s+/))
		.some((words) => gitHistoryVerb(words) || ghPullRequest(words));
}

function gitHistoryVerb(words: readonly string[]): boolean {
	let index = programIndex(words);
	if (!isProgram(words[index], "git")) return false;
	index++;
	while (index < words.length) {
		const word = words[index] ?? "";
		if (GIT_OPTIONS_WITH_VALUE.has(word)) index += 2;
		else if (word.startsWith("-")) index++;
		else break;
	}
	return HISTORY_VERBS.has(words[index] ?? "");
}

function ghPullRequest(words: readonly string[]): boolean {
	const index = programIndex(words);
	return (
		isProgram(words[index], "gh") &&
		words[index + 1] === "pr" &&
		["create", "merge"].includes(words[index + 2] ?? "")
	);
}

/** By basename, so `/usr/bin/git` is git. */
function isProgram(word: string | undefined, name: string): boolean {
	return word?.split("/").at(-1) === name;
}

/**
 * The command word, past `VAR=value` assignments, shell keywords, and
 * wrappers with their flags and numeric arguments (`nice -n 10`).
 */
function programIndex(words: readonly string[]): number {
	let index = 0;
	let wrapped = false;
	while (index < words.length) {
		const word = words[index] ?? "";
		const skip =
			/^[A-Za-z_]\w*=/.test(word) ||
			SHELL_KEYWORDS.has(word) ||
			WRAPPERS.has(word) ||
			(wrapped && /^(-|\d+$)/.test(word));
		if (!skip) break;
		wrapped ||= WRAPPERS.has(word);
		index++;
	}
	return index;
}
