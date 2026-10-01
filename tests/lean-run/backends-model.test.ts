/**
 * Tests for the model and reasoning effort the external lean backends ask
 * their harness for, from each role's agent definition.
 */
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, test } from "vitest";
import type { AgentPackage } from "../../lib/agent-packages/types.ts";
import {
	createExternalBuilderBackend,
	type ExternalBuilderBackendOptions,
	leanPackageResolver,
	type ProcessRequest,
} from "../../lib/lean-run/backends/external.ts";
import type { LeanRole } from "../../lib/lean-run/types.ts";
import { discoverFrameworkBundledPackageDirs } from "../../lib/packages/dev-bundled.ts";
import { CosmonautsRuntime } from "../../lib/runtime.ts";

const ENVELOPE = '{"outcome":"done"}';

const PACKAGE: AgentPackage = {
	schemaVersion: 1,
	packageId: "lean-builder-codex",
	description: "builder",
	systemPrompt: "You are the builder.",
	tools: "coding",
	skills: [],
	model: "openai-codex/gpt-5.6-sol",
	thinkingLevel: "medium",
	projectContext: "omit",
	target: "codex",
	targetOptions: {},
};

const dirs: string[] = [];

afterEach(async () => {
	await Promise.all(
		dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

/** Runs one session with a stub process runner and returns the argv it got. */
async function argvFor(
	options: Partial<ExternalBuilderBackendOptions> & {
		agentPackage?: Partial<AgentPackage>;
		role?: LeanRole;
	} = {},
): Promise<string[]> {
	const { agentPackage, role, ...rest } = options;
	const requests: ProcessRequest[] = [];
	const backend = createExternalBuilderBackend({
		kind: "codex-cli",
		resolvePackage: async () => ({ ...PACKAGE, ...agentPackage }),
		runProcess: async (request) => {
			requests.push(request);
			return { exitCode: 0, stdout: ENVELOPE, stderr: "" };
		},
		...rest,
	});
	await backend.run({
		prompt: "p",
		worktree: "/repo",
		role: role ?? "lean/builder",
	});
	return [...(requests[0]?.args ?? [])];
}

/** Each `flag value` pair in the argv, in order. */
function pairs(args: readonly string[], flag: string): string[] {
	return args.flatMap((arg, index) =>
		arg === flag ? [args[index + 1] ?? ""] : [],
	);
}

function efforts(args: readonly string[]): string[] {
	return pairs(args, "-c").filter((value) =>
		value.startsWith("model_reasoning_effort="),
	);
}

describe("codex-cli model and effort from the agent definition", () => {
	test.each([
		["off", "low"],
		["minimal", "low"],
		["low", "low"],
		["medium", "medium"],
		["high", "high"],
		["xhigh", "xhigh"],
		["max", "xhigh"],
	] as const)("asks for effort %s as %s", async (thinkingLevel, effort) => {
		const args = await argvFor({ agentPackage: { thinkingLevel } });

		expect(pairs(args, "--model")).toEqual(["gpt-5.6-sol"]);
		expect(efforts(args)).toEqual([`model_reasoning_effort=${effort}`]);
	});

	test("asks for no effort when the definition has no thinking level", async () => {
		const backend = createExternalBuilderBackend({
			kind: "codex-cli",
			resolvePackage: async () => ({ ...PACKAGE, thinkingLevel: undefined }),
		});
		const args = await argvFor({ agentPackage: { thinkingLevel: undefined } });

		expect(pairs(args, "--model")).toEqual(["gpt-5.6-sol"]);
		expect(efforts(args)).toEqual([]);
		expect(await backend.requestedModel?.("lean/builder")).toEqual({
			model: "gpt-5.6-sol",
		});
	});

	test.each([
		["another provider", "anthropic/claude-sonnet-4-5"],
		["no model", undefined],
	])("leaves the model and effort to the harness for %s", async (_name, model) => {
		const agentPackage = { model, thinkingLevel: "high" as const };
		const backend = createExternalBuilderBackend({
			kind: "codex-cli",
			resolvePackage: async () => ({ ...PACKAGE, ...agentPackage }),
		});
		const args = await argvFor({ agentPackage });

		expect(args).not.toContain("--model");
		expect(efforts(args)).toEqual([]);
		expect(await backend.requestedModel?.("lean/builder")).toEqual({
			model: "harness default",
		});
	});

	test("puts the model flags after the package policy and before the output flags", async () => {
		const args = await argvFor();

		expect(args[0]).toBe("exec");
		expect(args.indexOf("--sandbox")).toBeLessThan(args.indexOf("--model"));
		expect(args.indexOf("--model")).toBeLessThan(args.indexOf("--json"));
	});

	test.each([
		[["--model", "gpt-caller"]],
		[["--model=gpt-caller"]],
		[["-m", "gpt-caller"]],
		[["-c", 'model="gpt-caller"']],
	])("keeps the caller's model from %j and adds no second one", async (extraArgs) => {
		const backend = createExternalBuilderBackend({
			kind: "codex-cli",
			resolvePackage: async () => PACKAGE,
			extraArgs,
		});
		const args = await argvFor({ extraArgs });

		expect(args).not.toContain("gpt-5.6-sol");
		expect(args.filter((arg) => arg.includes("gpt-caller"))).toHaveLength(1);
		expect(efforts(args)).toEqual(["model_reasoning_effort=medium"]);
		expect(await backend.requestedModel?.("lean/builder")).toEqual({
			model: "gpt-caller",
			effort: "medium",
		});
	});

	test.each([
		[["-c", "model_reasoning_effort=high"]],
		[["--config", 'model_reasoning_effort="high"']],
		[["-c=model_reasoning_effort=high"]],
	])("keeps the caller's effort from %j and adds no second one", async (extraArgs) => {
		const backend = createExternalBuilderBackend({
			kind: "codex-cli",
			resolvePackage: async () => PACKAGE,
			extraArgs,
		});
		const args = await argvFor({ extraArgs });

		expect(pairs(args, "--model")).toEqual(["gpt-5.6-sol"]);
		expect(
			args.filter((arg) => arg.includes("model_reasoning_effort")),
		).toEqual([extraArgs.at(-1)]);
		expect(await backend.requestedModel?.("lean/builder")).toEqual({
			model: "gpt-5.6-sol",
			effort: "high",
		});
	});
});

describe("claude-cli model", () => {
	test("asks for no model and records the harness default", async () => {
		const requests: ProcessRequest[] = [];
		const backend = createExternalBuilderBackend({
			kind: "claude-cli",
			resolvePackage: async () => ({
				...PACKAGE,
				target: "claude-cli",
				model: "anthropic/claude-sonnet-4-5",
				thinkingLevel: "high",
			}),
			runProcess: async (request) => {
				requests.push(request);
				return { exitCode: 0, stdout: ENVELOPE, stderr: "" };
			},
		});
		await backend.run({ prompt: "p", worktree: "/repo", role: "lean/builder" });

		expect(requests[0]?.args).not.toContain("--model");
		expect(requests[0]?.args.some((arg) => arg.includes("reasoning"))).toBe(
			false,
		);
		expect(await backend.requestedModel?.("lean/builder")).toEqual({
			model: "harness default",
		});
	});

	test("records the model the caller's arguments ask for", async () => {
		const backend = createExternalBuilderBackend({
			kind: "claude-cli",
			resolvePackage: async () => PACKAGE,
			extraArgs: ["--model", "opus", "--dangerously-skip-permissions"],
		});

		expect(await backend.requestedModel?.("lean/builder")).toEqual({
			model: "opus",
		});
	});
});

describe("lean roles through codex exec", () => {
	const repositoryRoot = resolve(fileURLToPath(import.meta.url), "../../..");
	let resolvePackage: (role: LeanRole) => Promise<AgentPackage>;

	beforeAll(async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "lean-backend-model-"));
		const runtime = await CosmonautsRuntime.create({
			builtinDomainsDir: join(repositoryRoot, "domains"),
			projectRoot,
			bundledDirs: await discoverFrameworkBundledPackageDirs(repositoryRoot),
			includeUserSources: false,
		});
		await rm(projectRoot, { recursive: true, force: true });
		resolvePackage = leanPackageResolver({
			kind: "codex-cli",
			registry: runtime.agentRegistry,
			domainsDir: runtime.domainsDir,
			resolver: runtime.domainResolver,
			skillPaths: runtime.skillPaths,
		});
	});

	/** A stand-in `codex` that writes its argv, one per line, and the envelope as its last message. */
	async function fakeCodex(dir: string): Promise<string> {
		const bin = join(dir, "codex");
		await writeFile(
			bin,
			[
				"#!/bin/sh",
				`printf '%s\\n' "$@" > '${join(dir, "argv")}'`,
				'while [ $# -gt 0 ]; do [ "$1" = --output-last-message ] && out="$2"; shift; done',
				"cat >/dev/null",
				`printf '%s' '${ENVELOPE}' > "$out"`,
			].join("\n"),
		);
		await chmod(bin, 0o755);
		return bin;
	}

	test("runs the builder at medium and the reviewer at high on gpt-5.6-sol", async () => {
		const dir = await mkdtemp(join(tmpdir(), "lean-fake-codex-"));
		dirs.push(dir);
		const backend = createExternalBuilderBackend({
			kind: "codex-cli",
			resolvePackage,
			binary: await fakeCodex(dir),
		});
		const argv = async (role: LeanRole) => {
			const result = await backend.run({ prompt: "p", worktree: dir, role });
			expect(result.text).toBe(ENVELOPE);
			return (await readFile(join(dir, "argv"), "utf8")).split("\n");
		};

		const builder = await argv("lean/builder");
		const reviewer = await argv("lean/code-reviewer");

		expect(pairs(builder, "--model")).toEqual(["gpt-5.6-sol"]);
		expect(pairs(reviewer, "--model")).toEqual(["gpt-5.6-sol"]);
		expect(efforts(builder)).toEqual(["model_reasoning_effort=medium"]);
		expect(efforts(reviewer)).toEqual(["model_reasoning_effort=high"]);
		expect(await backend.requestedModel?.("lean/builder")).toEqual({
			model: "gpt-5.6-sol",
			effort: "medium",
		});
		expect(await backend.requestedModel?.("lean/code-reviewer")).toEqual({
			model: "gpt-5.6-sol",
			effort: "high",
		});
	});
});
