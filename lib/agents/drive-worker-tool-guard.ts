import { createHash } from "node:crypto";
import { readdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Shell words and unquoted command separators; quotes group arguments, not commands. */
function shellTokens(command: string): string[] {
	const tokens: string[] = [];
	let word = "";
	let quote = "";
	for (let i = 0; i < command.length; i++) {
		const char = command[i] ?? "";
		if (char === "\\" && quote !== "'" && i + 1 < command.length) {
			word += command[++i] ?? "";
			continue;
		}
		if (char === quote && quote) {
			quote = "";
			continue;
		}
		if (!quote && (char === "'" || char === '"')) {
			quote = char;
			continue;
		}
		if (
			!quote &&
			(char === ";" || char === "|" || char === "&" || char === "\n")
		) {
			if (word) tokens.push(word);
			word = "";
			tokens.push(";");
			continue;
		}
		if (!quote && /\s/.test(char)) {
			if (word) tokens.push(word);
			word = "";
			continue;
		}
		word += char;
	}
	if (word) tokens.push(word);
	return tokens;
}

function gitOperation(words: string[]): boolean {
	let index = 0;
	while (index < words.length) {
		const word = words[index] ?? "";
		if (["env", "command"].includes(word) || /^[a-zA-Z_][\w]*=/.test(word)) {
			index++;
			continue;
		}
		if (["-i", "-0", "-u", "-p"].includes(word)) {
			index += word === "-u" ? 2 : 1;
			continue;
		}
		break;
	}
	if (words[index] !== "git") {
		if (
			["sh", "bash"].includes(words[index] ?? "") &&
			words[index + 1] === "-c"
		)
			return isDestructiveGitCommand(words[index + 2] ?? "");
		if (words[index] === "eval")
			return isDestructiveGitCommand(words.slice(index + 1).join(" "));
		return false;
	}
	index++;
	while (index < words.length) {
		const option = words[index];
		if (
			[
				"-C",
				"-c",
				"--git-dir",
				"--work-tree",
				"--namespace",
				"--config-env",
			].includes(option ?? "")
		) {
			index += 2;
			continue;
		}
		if (/^--(git-dir|work-tree|namespace|config-env)=/.test(option ?? "")) {
			index++;
			continue;
		}
		break;
	}
	const verb = words[index];
	const args = words.slice(index + 1);
	if (verb === "checkout")
		return args.includes("--") || args.some((arg) => !arg.startsWith("-"));
	if (verb === "switch") return args.includes("--discard-changes");
	if (verb === "stash") return !["list", "show"].includes(args[0] ?? "");
	if (verb === "apply")
		return args.includes("-R") || args.includes("--reverse");
	return [
		"restore",
		"reset",
		"clean",
		"rm",
		"read-tree",
		"checkout-index",
		"update-index",
	].includes(verb ?? "");
}

export function isDestructiveGitCommand(command: string): boolean {
	const tokens = shellTokens(command);
	let words: string[] = [];
	for (const token of [...tokens, ";"]) {
		if (token !== ";") {
			words.push(token);
			continue;
		}
		if (gitOperation(words)) return true;
		words = [];
	}
	return false;
}

/** Journals are keyed to the canonical project root, never the caller's spelling. */
export function probeJournalDirectory(projectRoot: string): string {
	return join(
		tmpdir(),
		`cosmonauts-probe-${createHash("sha256").update(realpathSync(projectRoot)).digest("hex")}`,
	);
}

export function probeJournalBlockReason(
	projectRoot: string,
): string | undefined {
	const journal = outstandingProbeJournal(projectRoot);
	return journal
		? `recovery-required: ${journal} (execution probe journal outstanding)`
		: undefined;
}

export function outstandingProbeJournal(
	projectRoot: string,
): string | undefined {
	const directory = probeJournalDirectory(projectRoot);
	try {
		const name = readdirSync(directory).find((entry) =>
			entry.startsWith("journal-"),
		);
		return name ? join(directory, name) : undefined;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
}
