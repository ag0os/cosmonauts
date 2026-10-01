/**
 * Tests for the lean post-edit health hook against a real git fixture. The
 * clean and regressing cases run the real changed-function resolver with the
 * pinned Fallow binary; the routing cases stub the resolver.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import healthHook from "../../bundled/lean/extensions/health-hook/index.ts";
import { buildAgentIdentityMarker } from "../../lib/agents/runtime-identity.ts";
import type {
	ChangedFunctionsReport,
	ResolveChangedFunctionsOptions,
} from "../../lib/code-health/changed-functions.ts";
import { writeRunBaseSha } from "../../lib/lean-run/base-sha.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi } from "../helpers/mocks/extension-api.ts";

const SAMPLE = "src/sample.ts";
const SIMPLE = [
	"export function simple(value: number): number {",
	"\treturn value + 1;",
	"}",
	"",
].join("\n");
const SIMPLE_RENAMED_CONSTANT = SIMPLE.replace("value + 1", "value + 2");
const SIMPLE_RAISED = [
	"export function simple(value: number): number {",
	"\tif (value > 10) {",
	"\t\treturn value;",
	"\t}",
	"\treturn value + 1;",
	"}",
	"",
].join("\n");

const tmp = useTempDir("lean-health-hook-");
const tools = useTempDir("lean-health-hook-tools-");

function git(...args: string[]): string {
	return execFileSync("git", args, { cwd: tmp.path, encoding: "utf8" }).trim();
}

async function writeSample(content: string): Promise<void> {
	await mkdir(join(tmp.path, "src"), { recursive: true });
	await writeFile(join(tmp.path, SAMPLE), content);
}

function toolResult(
	toolName: string,
	input: Record<string, unknown>,
	isError = false,
) {
	return {
		type: "tool_result",
		toolCallId: "call-1",
		toolName,
		input,
		content: [{ type: "text", text: "Successfully wrote the file." }],
		isError,
		details: undefined,
	};
}

function contextFor(role: string) {
	return {
		cwd: tmp.path,
		signal: undefined,
		getSystemPrompt: () => `Persona.\n\n${buildAgentIdentityMarker(role)}`,
	};
}

type HookDeps = NonNullable<Parameters<typeof healthHook>[1]>;

function hookLog(): string {
	return join(tmp.path, ".git/lean-run/health-hook.jsonl");
}

function installHook(deps: HookDeps = {}) {
	const pi = createMockPi({ cwd: tmp.path });
	healthHook(pi as never, { env: {}, ...deps });
	return pi;
}

function fireWrite(
	pi: ReturnType<typeof createMockPi>,
	options: {
		tool?: string;
		role?: string;
		path?: string;
		isError?: boolean;
	} = {},
) {
	return pi.fireEvent(
		"tool_result",
		toolResult(
			options.tool ?? "write",
			{ path: options.path ?? SAMPLE },
			options.isError,
		),
		contextFor(options.role ?? "lean/builder"),
	);
}

function emptyReport(base: string): ChangedFunctionsReport {
	return { base, baseCommit: "0".repeat(40), functions: [] };
}

function stubResolver() {
	return vi.fn(async (options: ResolveChangedFunctionsOptions) =>
		emptyReport(options.base),
	);
}

describe("lean health hook", { timeout: 60_000 }, () => {
	beforeEach(async () => {
		git("init", "-q", "-b", "main");
		git("config", "user.name", "Test");
		git("config", "user.email", "test@example.com");
		git("config", "commit.gpgsign", "false");
		await writeSample(SIMPLE);
		git("add", "-A");
		git("commit", "-q", "--no-verify", "-m", "base");
	});

	test("stays silent when an edit leaves complexity unchanged", async () => {
		const pi = installHook();
		await writeSample(SIMPLE_RENAMED_CONSTANT);

		const result = await fireWrite(pi, { tool: "edit" });

		expect(result).toBeUndefined();
		expect(pi.entries).toEqual([]);
	});

	test("injects one finding naming the function whose cyclomatic rose", async () => {
		const pi = installHook();
		await writeSample(SIMPLE_RAISED);

		const result = (await fireWrite(pi)) as {
			content: { type: string; text: string }[];
		};

		expect(result.content).toHaveLength(2);
		expect(result.content[0]?.text).toBe("Successfully wrote the file.");
		const finding = result.content[1]?.text ?? "";
		expect(finding).toContain(`${SAMPLE}:1-6 simple`);
		expect(finding).toContain("cyclomatic 1→2");
	});

	test("logs each injected finding to the worktree's hook log", async () => {
		const pi = installHook();
		await writeSample(SIMPLE_RAISED);

		await fireWrite(pi);

		const log = await readFile(hookLog(), "utf8");
		const lines = log.trimEnd().split("\n");
		expect(lines).toHaveLength(1);
		expect(JSON.parse(lines[0] ?? "")).toEqual({
			timestamp: expect.any(String),
			file: SAMPLE,
			function: "simple",
			startLine: 1,
			endLine: 6,
			metrics: expect.objectContaining({ cyclomatic: 2 }),
			baseMetrics: expect.objectContaining({ cyclomatic: 1 }),
			base: git("rev-parse", "HEAD"),
		});
	});

	test("logs nothing when the check stays silent", async () => {
		const pi = installHook();
		await writeSample(SIMPLE_RENAMED_CONSTANT);

		await fireWrite(pi, { tool: "edit" });

		expect(existsSync(hookLog())).toBe(false);
	});

	test("ignores writes by any role other than lean/builder", async () => {
		const resolve = stubResolver();
		const pi = installHook({ resolve });

		await expect(fireWrite(pi, { role: "coding/worker" })).resolves.toBe(
			undefined,
		);
		expect(resolve).not.toHaveBeenCalled();
	});

	test("ignores bash tool results, which carry no edited path", async () => {
		const resolve = stubResolver();
		const pi = installHook({ resolve });

		const result = await pi.fireEvent(
			"tool_result",
			toolResult("bash", { command: `echo x >> ${SAMPLE}` }),
			contextFor("lean/builder"),
		);

		expect(result).toBeUndefined();
		expect(resolve).not.toHaveBeenCalled();
	});

	test("stays silent and logs once when fallow fails", async () => {
		const failing = join(tools.path, "fallow");
		await writeFile(failing, "#!/bin/sh\necho broken >&2\nexit 7\n");
		await chmod(failing, 0o755);
		const pi = installHook({ fallowExecutable: failing });
		await writeSample(SIMPLE_RAISED);

		const first = await fireWrite(pi);
		await writeSample(`${SIMPLE_RAISED}// touched\n`);
		const second = await fireWrite(pi);

		expect(first).toBeUndefined();
		expect(second).toBeUndefined();
		expect(pi.entries).toHaveLength(1);
		expect(pi.entries[0]?.customType).toBe("lean.health-hook");
	});

	test("checks the same file content only once per session", async () => {
		const resolve = stubResolver();
		const pi = installHook({ resolve });
		await writeSample(SIMPLE_RAISED);

		await fireWrite(pi);
		await fireWrite(pi, { tool: "edit" });
		await writeSample(SIMPLE);
		await fireWrite(pi);

		expect(resolve).toHaveBeenCalledTimes(2);
	});

	test("ignores a write whose tool result is an error", async () => {
		const resolve = stubResolver();
		const pi = installHook({ resolve });

		await expect(fireWrite(pi, { isError: true })).resolves.toBe(undefined);
		expect(resolve).not.toHaveBeenCalled();
	});

	test("resolves an @-prefixed tool path the way Pi does", async () => {
		const resolve = stubResolver();
		const pi = installHook({ resolve });

		await fireWrite(pi, { path: `@${SAMPLE}` });

		expect(resolve.mock.calls[0]?.[0].file).toBe(join(tmp.path, SAMPLE));
	});

	test("logs a failure once when only a temp path in its message differs", async () => {
		let attempt = 0;
		const resolve = vi.fn(async (): Promise<ChangedFunctionsReport> => {
			attempt += 1;
			throw new Error(
				`fallow health failed in /tmp/cosmonauts-changed-functions-${attempt}/base`,
			);
		});
		const pi = installHook({ resolve });

		await fireWrite(pi);
		await writeSample(SIMPLE_RAISED);
		await fireWrite(pi);

		expect(resolve).toHaveBeenCalledTimes(2);
		expect(pi.entries).toHaveLength(1);
	});

	test("compares against the worktree's run base marker ahead of the env base", async () => {
		await writeRunBaseSha({ worktree: tmp.path, baseSha: "marker1" });
		const resolve = stubResolver();
		const pi = installHook({ resolve, env: { LEAN_RUN_BASE_SHA: "env2" } });

		await fireWrite(pi);

		expect(resolve.mock.calls[0]?.[0].base).toBe("marker1");
	});

	test("compares against the env base when no marker is set", async () => {
		const resolve = stubResolver();
		const pi = installHook({ resolve, env: { LEAN_RUN_BASE_SHA: "abc1234" } });

		await fireWrite(pi);

		expect(resolve.mock.calls[0]?.[0].base).toBe("abc1234");
	});

	test("a later session reads the run base an earlier session compared against", async () => {
		const base = git("rev-parse", "HEAD");
		await writeRunBaseSha({ worktree: tmp.path, baseSha: base });
		const resolve = stubResolver();

		await fireWrite(installHook({ resolve }));
		await writeSample(SIMPLE_RAISED);
		git("add", "-A");
		git("commit", "-q", "--no-verify", "-m", "builder-1 output");
		await writeSample(`${SIMPLE_RAISED}// builder-2\n`);
		await fireWrite(installHook({ resolve }));

		expect(resolve.mock.calls.map(([options]) => options.base)).toEqual([
			base,
			base,
		]);
	});

	test("reads the run base marker again on every check", async () => {
		await writeRunBaseSha({ worktree: tmp.path, baseSha: "first" });
		const resolve = stubResolver();
		const pi = installHook({ resolve });

		await fireWrite(pi);
		await writeRunBaseSha({ worktree: tmp.path, baseSha: "second" });
		await writeSample(SIMPLE_RAISED);
		await fireWrite(pi);

		expect(resolve.mock.calls.map(([options]) => options.base)).toEqual([
			"first",
			"second",
		]);
	});

	test("pins HEAD at the first check when no run base is provided", async () => {
		const resolve = stubResolver();
		const pi = installHook({ resolve });
		const head = git("rev-parse", "HEAD");

		await fireWrite(pi);
		git("commit", "-q", "--allow-empty", "--no-verify", "-m", "later");
		await writeSample(SIMPLE_RAISED);
		await fireWrite(pi);

		expect(resolve.mock.calls.map(([options]) => options.base)).toEqual([
			head,
			head,
		]);
	});
});
