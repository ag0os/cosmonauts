import { describe, expect, test } from "vitest";
import { isDestructiveGitCommand } from "../../lib/agents/drive-worker-tool-guard.ts";

describe("destructive Git command classifier", () => {
	test.each([
		"git checkout -- src/a.ts",
		"git checkout src/a.ts",
		"git switch --discard-changes main",
		"git switch -f main",
		"git switch --force main",
		"git restore src/a.ts",
		"git reset --hard",
		...[
			"--no-pager",
			"-p",
			"--paginate",
			"-P",
			"--bare",
			"--no-replace-objects",
			"--no-optional-locks",
			"--literal-pathspecs",
			"--glob-pathspecs",
			"--noglob-pathspecs",
			"--icase-pathspecs",
			"--exec-path=/tmp",
			"--html-path",
			"--man-path",
			"--info-path",
			"--list-cmds=main",
			"--super-prefix=foo",
			"--attr-source=HEAD",
		].map((option) => `git ${option} reset --hard`),
		"git --exec-path /tmp reset --hard",
		"git --list-cmds main reset --hard",
		"git --super-prefix foo reset --hard",
		"git --attr-source HEAD reset --hard",
		"git stash",
		"git stash pop",
		"git clean -fd",
		"git rm file",
		"git read-tree HEAD",
		"git checkout-index -a",
		"git update-index --refresh",
		"git apply -R patch",
		"echo ok && env FOO=bar command git -C /tmp -c core.a=b --git-dir=.git --work-tree=. restore .",
		"sh -c 'git reset --hard'",
		"bash -c 'git clean -fd'",
		"eval 'git restore .'",
		"env -i git reset --hard",
		"command -p git clean -fd",
		"git --git-dir /tmp/.git --work-tree /tmp restore .",
		"git -C /tmp -c core.quotePath=false reset --hard",
		"echo ok || bash -c 'git apply -R patch'",
	])("refuses destructive invocation %s", (command) => {
		expect(isDestructiveGitCommand(command)).toBe(true);
	});
	test.each([
		"git status --short",
		"git stash list",
		"git stash show",
		"git switch main",
		"git apply patch",
		"git add file && git commit -m ok",
		"printf 'git reset --hard'",
		"echo ok; git diff | cat",
		"echo 'git clean -fd'",
	])("allows non-destructive invocation %s", (command) => {
		expect(isDestructiveGitCommand(command)).toBe(false);
	});
});
