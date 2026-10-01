/**
 * Git verbs that write history or publish it. The host owns git history, so
 * the lean role guard blocks them for the builder in Pi sessions, and a
 * `claude-cli` lean role is denied them (`CLAUDE_DENIED_TOOLS`).
 */
export const GIT_HISTORY_VERBS = [
	"commit",
	"push",
	"merge",
	"rebase",
	"cherry-pick",
	"revert",
	"am",
] as const;

/** Git commands that move or delete refs without writing history. */
const GIT_REF_WRITERS = [
	"update-ref",
	"branch -D",
	"branch -d",
	"tag -d",
	"stash",
] as const;

/**
 * Claude Code permission rules a `claude-cli` lean role is started with
 * (`--disallowedTools`); Claude Code enforces them under
 * `--dangerously-skip-permissions` too. They match the command's prefix, so
 * `git -C dir push` or git run through `sh -c` is not caught. They are a
 * second line behind the builder clone, which has no configured remote,
 * and neither line stops a push that names a repository by path or URL
 * (the caller's, or its remote's): the run detects one that changes the
 * caller's branches or tags, not one to a remote.
 */
export const CLAUDE_DENIED_TOOLS: readonly string[] = [
	...GIT_HISTORY_VERBS.map((verb) => `Bash(git ${verb}:*)`),
	"Bash(gh pr:*)",
	...GIT_REF_WRITERS.map((command) => `Bash(git ${command}:*)`),
];
