import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const snapshotHook = vi.hoisted(() => ({
	terminationError: false,
	shortWrite: false,
	sidecarAtFault: undefined as Buffer | undefined,
	sourceAtFault: undefined as string | undefined,
	callback: undefined as undefined | (() => Promise<void>),
}));
vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	return {
		...actual,
		writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
			if (
				snapshotHook.shortWrite &&
				(String(args[0]).includes(".probe-") ||
					String(args[0]).endsWith("entry.js"))
			) {
				snapshotHook.shortWrite = false;
				const journalRoot = probeJournalDirectory(root);
				const names = await actual.readdir(journalRoot);
				snapshotHook.sidecarAtFault = await actual.readFile(
					join(
						journalRoot,
						names.find((name) => name.startsWith("journal-")) ?? "",
						"sidecar-0",
					),
				);
				await actual.writeFile(args[0], "short");
				snapshotHook.sourceAtFault = await actual.readFile(source, "utf8");
				throw new Error("simulated short write");
			}
			return actual.writeFile(...args);
		},
	};
});
vi.mock(
	"../../domains/shared/extensions/project-tools/process-runner.ts",
	async (importOriginal) => {
		const actual =
			await importOriginal<
				typeof import("../../domains/shared/extensions/project-tools/process-runner.ts")
			>();
		return {
			...actual,
			runProviderProcess: async (
				...args: Parameters<typeof actual.runProviderProcess>
			) => {
				const outcome = await actual.runProviderProcess(...args);
				if (
					args[0].executablePath === "git" &&
					args[0].args.join(" ") === "ls-files -z" &&
					snapshotHook.callback
				) {
					const callback = snapshotHook.callback;
					snapshotHook.callback = undefined;
					await callback();
				}
				return outcome;
			},
		};
	},
);

vi.mock(
	"../../bundled/coding/extensions/execution-probe/command-runner.ts",
	async (importOriginal) => {
		const actual =
			await importOriginal<
				typeof import("../../bundled/coding/extensions/execution-probe/command-runner.ts")
			>();
		return {
			...actual,
			runProbeCommand: async (
				...args: Parameters<typeof actual.runProbeCommand>
			) =>
				snapshotHook.terminationError
					? {
							kind: "termination-error" as const,
							error: new Error("tree not stopped"),
							stdout: "",
							stderr: "tree not stopped",
						}
					: actual.runProbeCommand(...args),
		};
	},
);

import executionProbe from "../../bundled/coding/extensions/execution-probe/index.ts";
import {
	outstandingProbeJournal,
	probeJournalDirectory,
} from "../../lib/agents/drive-worker-tool-guard.ts";
import { createMockPi } from "../helpers/mocks/extension-api.ts";

let root: string;
let source: string;
let pi: ReturnType<typeof createMockPi>;
const original =
	"import { appendFileSync } from 'node:fs';\nexport function run() {\n  const x = 42;\n  return x;\n}\nrun();\n";

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "execution-probe-test-"));
	execFileSync("git", ["init", "-q", root]);
	source = join(root, "entry.js");
	await writeFile(source, original);
	execFileSync("git", ["add", "entry.js"], { cwd: root });
	pi = createMockPi({ cwd: root });
	executionProbe(pi as never);
});
afterEach(async () => {
	snapshotHook.callback = undefined;
	snapshotHook.terminationError = false;
	snapshotHook.shortWrite = false;
	snapshotHook.sidecarAtFault = undefined;
	snapshotHook.sourceAtFault = undefined;
	await rm(probeJournalDirectory(root), { recursive: true, force: true });
	await rm(root, { recursive: true, force: true });
});

function input(overrides: Record<string, unknown> = {}) {
	return {
		locations: [
			{
				path: "entry.js",
				line: 3,
				statementTemplate: "appendFileSync('{{hitFile}}', '{{marker}}\\n');",
			},
		],
		testCommand: "node entry.js",
		confirmProjectExecution: true,
		...overrides,
	};
}
async function probe(overrides: Record<string, unknown> = {}) {
	const result = (await pi.callTool("execution_probe", input(overrides))) as {
		details: Record<string, unknown>;
	};
	return result.details;
}

test("returns hits and exit status and restores a git-dirty tracked file", async () => {
	await writeFile(source, original.replace("42", "43"));
	const before = await readFile(source);
	const result = await probe();
	expect(result, String(result.stderr)).toMatchObject({
		hits: [{ count: 1 }],
		exitCode: 0,
		restored: true,
	});
	expect(await readFile(source)).toEqual(before);
});

test.each([
	[
		"failure",
		"node entry.js && node -e 'process.exit(7)'",
		5_000,
		"code-exit",
		7,
	],
	["timeout", "node -e 'setTimeout(() => {}, 2000)'", 100, "timeout", null],
] as const)("restores after %s", async (_kind, testCommand, timeoutMs, commandStatus, exitCode) => {
	const result = await probe({ testCommand, timeoutMs });
	expect(result).toMatchObject({
		restored: true,
		usableZero: false,
		commandStatus,
		exitCode,
	});
	expect(await readFile(source, "utf8")).toBe(original);
});

test("returns the stdout tail for a failing test command", async () => {
	const result = await probe({
		testCommand:
			"node -e 'console.log(\"failure-on-stdout\"); process.exit(7)'",
	});
	expect(result).toMatchObject({
		exitCode: 7,
		stdout: expect.stringContaining("failure-on-stdout"),
	});
});

test("retains the journal when process-tree termination cannot be verified", async () => {
	snapshotHook.terminationError = true;
	const result = await probe();
	expect(result).toMatchObject({
		status: "recovery-required",
		journal: expect.stringContaining("journal-"),
	});
	expect(outstandingProbeJournal(root)).toBe(result.journal);
	expect(await readFile(source, "utf8")).toBe(original);
	snapshotHook.terminationError = false;
	const retry = await probe();
	expect(retry).toMatchObject({
		status: "recovery-required",
		journal: result.journal,
	});
	expect(outstandingProbeJournal(root)).toBe(result.journal);
});

test("stops output exceeding the probe capture limit and restores source", async () => {
	const result = await probe({
		testCommand:
			"node -e 'process.stdout.write(\"x\".repeat(1100000)); setInterval(() => {}, 1000)'",
		timeoutMs: 5000,
	});
	expect(result).toMatchObject({
		commandStatus: "output-overflow",
		restored: true,
		usableZero: false,
	});
	expect(Buffer.byteLength(result.stdout as string)).toBeLessThanOrEqual(2000);
	expect(result.stdout).toMatch(/^x+$/);
	expect(await readFile(source, "utf8")).toBe(original);
});

test("caps stdout and stderr together and stops the command tree", async () => {
	const marker = join(root, "survived");
	const command = `node -e 'const fs=require("fs");setTimeout(()=>fs.writeFileSync(${JSON.stringify(marker)},"survived"),600);process.stdout.write("a".repeat(600000));process.stderr.write("b".repeat(600000));setInterval(()=>{},1000)'`;
	const result = await probe({ testCommand: command, timeoutMs: 5_000 });
	expect(result).toMatchObject({
		commandStatus: "output-overflow",
		restored: true,
		usableZero: false,
	});
	await new Promise((resolve) => setTimeout(resolve, 750));
	expect(await readFile(marker, "utf8").catch(() => undefined)).toBeUndefined();
	expect(await readFile(source, "utf8")).toBe(original);
});

test("keeps original source and verified sidecar after a short instrumentation write", async () => {
	snapshotHook.shortWrite = true;
	await probe();
	expect(await readFile(source, "utf8")).toBe(original);
	expect(snapshotHook.sidecarAtFault).toEqual(Buffer.from(original));
	expect(snapshotHook.sourceAtFault).toBe(original);
});

test("restores after abort", async () => {
	const controller = new AbortController();
	setTimeout(() => controller.abort(), 50);
	const result = (await pi.callTool(
		"execution_probe",
		input({ testCommand: "node -e 'setTimeout(() => {}, 2000)'" }),
		controller.signal,
	)) as { details: Record<string, unknown> };
	expect(result.details).toMatchObject({
		restored: true,
		usableZero: false,
		commandStatus: "aborted",
		exitCode: null,
	});
	expect(await readFile(source, "utf8")).toBe(original);
});

test("restores instrumented source even when the command changes its bytes", async () => {
	const result = await probe({
		testCommand:
			"node -e \"require('fs').writeFileSync('entry.js', 'changed')\"",
	});
	expect(result).toMatchObject({ restored: true, exitCode: 0 });
	expect(await readFile(source, "utf8")).toBe(original);
});

test("restores an instrumented file deleted by the command", async () => {
	const result = await probe({
		testCommand: "node -e \"require('fs').unlinkSync('entry.js')\"",
	});
	expect(result).toMatchObject({ restored: true, exitCode: 0 });
	expect(await readFile(source, "utf8")).toBe(original);
});

test("reports side effects and invalidates zero", async () => {
	await writeFile(join(root, "other.js"), "before");
	execFileSync("git", ["add", "other.js"], { cwd: root });
	const result = await probe({
		testCommand: "node -e \"require('fs').writeFileSync('other.js', 'after')\"",
	});
	expect(result).toMatchObject({
		hits: [{ count: 0 }],
		exitCode: 0,
		usableZero: false,
		sideEffects: ["other.js"],
	});
});

test("reports tracked index side effects even when worktree bytes do not change", async () => {
	await writeFile(join(root, "other.js"), "before");
	execFileSync("git", ["add", "other.js"], { cwd: root });
	await writeFile(join(root, "other.js"), "after");
	const result = await probe({ testCommand: "git add other.js" });
	expect(result).toMatchObject({
		hits: [{ count: 0 }],
		sideEffects: ["other.js"],
		usableZero: false,
	});
});

test("restores the instrumented path's index entry when a command stages probe code", async () => {
	const before = execFileSync("git", ["ls-files", "-s", "--", "entry.js"], {
		cwd: root,
	});
	const result = await probe({ testCommand: "git add entry.js" });
	expect(result).toMatchObject({
		hits: [{ count: 0 }],
		sideEffects: ["entry.js"],
		usableZero: false,
		restored: true,
	});
	expect(
		execFileSync("git", ["ls-files", "-s", "--", "entry.js"], { cwd: root }),
	).toEqual(before);
	expect(await readFile(source, "utf8")).toBe(original);
});

test("invalidates zero when the command removes instrumentation by restoring original bytes", async () => {
	const result = await probe({
		testCommand: `node -e "require('fs').writeFileSync('entry.js', Buffer.from('${Buffer.from(original).toString("base64")}', 'base64'))"`,
	});
	expect(result).toMatchObject({
		hits: [{ count: 0 }],
		exitCode: 0,
		restored: true,
		sideEffects: ["entry.js"],
		usableZero: false,
	});
	expect(await readFile(source, "utf8")).toBe(original);
});

test("marks a clean zero usable", async () => {
	expect(
		await probe({ testCommand: "node -e 'process.exit(0)'" }),
	).toMatchObject({ hits: [{ count: 0 }], usableZero: true, restored: true });
});

test("batches two locations in the same file", async () => {
	const result = await probe({
		locations: [
			input().locations[0],
			{
				path: "entry.js",
				line: 4,
				statementTemplate: "appendFileSync('{{hitFile}}', '{{marker}}\\n');",
			},
		],
	});
	expect(result).toMatchObject({
		hits: [{ count: 1 }, { count: 1 }],
		restored: true,
	});
	expect(await readFile(source, "utf8")).toBe(original);
});

test("refuses duplicate locations and destructive commands without touching the file", async () => {
	expect(
		await probe({ locations: [input().locations[0], input().locations[0]] }),
	).toMatchObject({ refused: true });
	expect(
		await probe({ testCommand: "git --no-pager reset --hard" }),
	).toMatchObject({
		refused: true,
	});
	expect(await readFile(source, "utf8")).toBe(original);
});

test.each([
	"git switch -f main",
	"git switch --force main",
])("refuses destructive probe test command %s without changing the source", async (testCommand) => {
	expect(await probe({ testCommand })).toMatchObject({ refused: true });
	expect(await readFile(source, "utf8")).toBe(original);
});

test("refuses symlinks, escaped paths and nonregular paths", async () => {
	await symlink(source, join(root, "link.js"));
	for (const path of ["link.js", "../outside.js", "."]) {
		expect(
			await probe({ locations: [{ ...input().locations[0], path }] }),
		).toMatchObject({ refused: true });
	}
});

test("keeps a named journal without counts after a corrupt sidecar and refuses the next call", async () => {
	const directory = probeJournalDirectory(root);
	const script = `const fs=require('fs');const path=require('path');const j=fs.readdirSync(${JSON.stringify(directory)}).find(n=>n.startsWith('journal-'));fs.writeFileSync(path.join(${JSON.stringify(directory)},j,'sidecar-0'),'corrupt')`;
	const result = await probe({
		testCommand: `node -e ${JSON.stringify(script)}`,
	});
	expect(result).toMatchObject({
		status: "recovery-required",
		journal: expect.stringContaining("journal-"),
	});
	expect(result).not.toHaveProperty("hits");
	expect(outstandingProbeJournal(root)).toBe(result.journal);
	expect(await probe()).toMatchObject({
		status: "recovery-required",
		journal: result.journal,
	});
});

test("recovers an intact outstanding journal before the next probe", async () => {
	const journal = join(probeJournalDirectory(root), "journal-old");
	await mkdir(journal, { recursive: true, mode: 0o700 });
	await writeFile(join(journal, "sidecar-0"), original);
	const digest = createHash("sha256").update(original).digest("hex");
	await writeFile(
		join(journal, "manifest.json"),
		JSON.stringify({
			root: await realpath(root),
			files: [
				{
					path: "entry.js",
					sidecar: "sidecar-0",
					original: digest,
					instrumented: "0".repeat(64),
					mode: 0o644,
				},
			],
		}),
	);
	expect(await probe()).toMatchObject({ hits: [{ count: 1 }], restored: true });
	expect(outstandingProbeJournal(root)).toBeUndefined();
});

test("refuses source bytes changed after validation before instrumentation", async () => {
	snapshotHook.callback = async () => {
		await writeFile(source, original.replace("42", "99"));
	};
	expect(await probe()).toMatchObject({
		refused: true,
		reason: expect.stringContaining("changed since validation"),
	});
	expect(await readFile(source, "utf8")).toBe(original.replace("42", "99"));
});

test("refuses without confirmation", async () => {
	expect(await probe({ confirmProjectExecution: false })).toMatchObject({
		refused: true,
	});
	expect(outstandingProbeJournal(root)).toBeUndefined();
});
