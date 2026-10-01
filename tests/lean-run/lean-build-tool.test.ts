/**
 * Tests for the lean_build tool registered by the lean-run extension.
 */
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	createLeanRunExtension,
	LeanBuildParameters,
} from "../../bundled/lean/extensions/lean-run/index.ts";
import type { RunBuildOptions } from "../../lib/lean-run/run-build.ts";
import type {
	BuilderBackend,
	LeanBackendKind,
	RunRecord,
} from "../../lib/lean-run/types.ts";
import { createMockPi } from "../helpers/mocks/index.ts";

const BACKEND: BuilderBackend = {
	kind: "pi",
	run: async () => ({ text: "" }),
};

function record(): RunRecord {
	return {
		dir: "/project/missions/sessions/lean/runs/r-1",
		manifest: {
			id: "r-1",
			baseSha: "abc",
			planPath: "missions/lean/x/plan.md",
			backend: "pi",
			reentries: 0,
			snapshotRefs: [],
			status: "blocked",
			reason: "re-entry signals remain",
			createdAt: "2026-10-01T00:00:00.000Z",
		},
		envelopes: {},
		facts: { passes: [] },
		stats: [],
	};
}

function setup() {
	const calls: RunBuildOptions[] = [];
	const kinds: LeanBackendKind[] = [];
	const pi = createMockPi({ cwd: "/project" });
	createLeanRunExtension({
		runBuild: async (options) => {
			calls.push(options);
			return record();
		},
		createBackends: async (kind) => {
			kinds.push(kind);
			return { builder: BACKEND, reviewer: BACKEND };
		},
	})(pi as never);
	return { pi, calls, kinds };
}

describe("lean_build tool", () => {
	test("declares an object-root parameter schema", () => {
		const { pi } = setup();
		const tool = pi.tools.get("lean_build") as unknown as {
			parameters: { type: string; required?: string[] };
		};
		expect(tool.parameters).toBe(LeanBuildParameters);
		expect(tool.parameters.type).toBe("object");
		expect(tool.parameters.required).toEqual(["planPath"]);
	});

	test("returns the run id, status, summary and run directory", async () => {
		const { pi } = setup();
		const result = (await pi.callTool("lean_build", {
			planPath: "missions/lean/x/plan.md",
		})) as { details: unknown };
		expect(result.details).toEqual({
			runId: "r-1",
			status: "blocked",
			summary: "blocked: re-entry signals remain (0 re-entries)",
			runDir: "/project/missions/sessions/lean/runs/r-1",
		});
	});

	test("runs in the session's project with the pi backend and the default providers", async () => {
		const { pi, calls, kinds } = setup();
		await pi.callTool("lean_build", {
			planPath: "missions/lean/x/plan.md",
			specPath: "missions/lean/x/spec.md",
		});
		expect(kinds).toEqual(["pi"]);
		expect(calls[0]).toMatchObject({
			projectRoot: "/project",
			planPath: "missions/lean/x/plan.md",
			specPath: "missions/lean/x/spec.md",
		});
		expect(calls[0]?.providers.map((provider) => provider.kind)).toEqual([
			"verify",
			"health",
			"dupes",
			"blast-radius",
			"plan-vs-actual",
			"mutation",
		]);
	});

	test("passes the requested backend kind through", async () => {
		const { pi, kinds } = setup();
		await pi.callTool("lean_build", {
			planPath: "p.md",
			backend: "codex-cli",
		});
		expect(kinds).toEqual(["codex-cli"]);
	});

	test("never reports done when the providers are explicitly emptied", async () => {
		const root = await mkdtemp(join(tmpdir(), "lean-build-tool-"));
		try {
			const git = (...args: string[]) =>
				execFileSync("git", args, { cwd: root, encoding: "utf8" });
			git("init", "-q", "-b", "main");
			await mkdir(join(root, "missions/lean/x"), { recursive: true });
			await writeFile(join(root, ".gitignore"), "missions/sessions/\n");
			await writeFile(join(root, "missions/lean/x/plan.md"), "# X\n");
			git("add", "-A");
			git(
				"-c",
				"user.email=t@example.com",
				"-c",
				"user.name=T",
				"-c",
				"commit.gpgsign=false",
				"commit",
				"-q",
				"-m",
				"base",
			);
			const done: BuilderBackend = {
				kind: "pi",
				run: async () => ({ text: '{"outcome":"done"}' }),
			};
			const pi = createMockPi({ cwd: root });
			createLeanRunExtension({
				createBackends: async () => ({ builder: done, reviewer: done }),
				providers: [],
			})(pi as never);
			const result = (await pi.callTool("lean_build", {
				planPath: "missions/lean/x/plan.md",
			})) as { details: { status: string; summary: string } };
			expect(result.details).toMatchObject({
				status: "blocked",
				summary: "blocked: unverified: no providers configured (0 re-entries)",
			});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
