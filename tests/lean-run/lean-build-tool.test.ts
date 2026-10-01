/**
 * Tests for the lean_build and lean_review tools registered by the lean-run
 * extension.
 */
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	createLeanRunExtension,
	LeanBuildParameters,
	LeanReviewParameters,
} from "../../bundled/lean/extensions/lean-run/index.ts";
import {
	MAX_RUN_TIME_MS,
	type RunBuildOptions,
	type RunReviewOptions,
} from "../../lib/lean-run/run-build.ts";
import type {
	BuilderBackend,
	LeanBackendKind,
	RunRecord,
} from "../../lib/lean-run/types.ts";
import { SIGNAL_KINDS } from "../../lib/lean-run/types.ts";
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

const REVIEWER: BuilderBackend = {
	kind: "pi",
	run: async () => ({ text: "" }),
};

function reviewRecord(): RunRecord {
	const base = record();
	return {
		...base,
		manifest: {
			...base.manifest,
			tier: "review",
			status: "done",
			reason: undefined,
		},
		envelopes: {
			reviewer: {
				outcome: "done",
				summary: "one issue",
				findings: [
					{
						id: "F-1",
						severity: "medium",
						file: "src/x.ts:3",
						summary: "unchecked input",
						fix: "validate it",
					},
				],
			},
		},
	};
}

function setup() {
	const calls: RunBuildOptions[] = [];
	const reviews: RunReviewOptions[] = [];
	const kinds: LeanBackendKind[] = [];
	const pi = createMockPi({ cwd: "/project" });
	createLeanRunExtension({
		runBuild: async (options) => {
			calls.push(options);
			return record();
		},
		runReview: async (options) => {
			reviews.push(options);
			return reviewRecord();
		},
		createBackends: async (kind) => {
			kinds.push(kind);
			return { builder: BACKEND, reviewer: REVIEWER };
		},
	})(pi as never);
	return { pi, calls, reviews, kinds };
}

interface RegisteredTool {
	description: string;
	parameters: {
		type: string;
		required?: string[];
		properties: Record<string, { maximum?: number }>;
	};
}

describe("lean_build tool", () => {
	test("declares an object-root parameter schema with a plan path or a request", () => {
		const { pi } = setup();
		const tool = pi.tools.get("lean_build") as unknown as {
			parameters: {
				type: string;
				required?: string[];
				properties: Record<string, unknown>;
			};
		};
		expect(tool.parameters).toBe(LeanBuildParameters);
		expect(tool.parameters.type).toBe("object");
		expect(tool.parameters.required ?? []).toEqual([]);
		expect(Object.keys(tool.parameters.properties)).toEqual(
			expect.arrayContaining([
				"planPath",
				"request",
				"lenses",
				"budgetTokens",
				"budgetTimeMs",
				"requiredSignals",
			]),
		);
	});

	test("runs a direct request without a plan path", async () => {
		const { pi, calls } = setup();
		await pi.callTool("lean_build", { request: "Rename greet to hello." });
		expect(calls[0]?.request).toBe("Rename greet to hello.");
		expect(calls[0]?.planPath).toBeUndefined();
	});

	test("refuses a plan path and a request together", async () => {
		const { pi, calls } = setup();
		await expect(
			pi.callTool("lean_build", { planPath: "p.md", request: "fix it" }),
		).rejects.toThrow("planPath or request, not both");
		expect(calls).toHaveLength(0);
	});

	test("refuses a call with neither a plan path nor a request", async () => {
		const { pi } = setup();
		await expect(pi.callTool("lean_build", { request: "  " })).rejects.toThrow(
			"needs planPath or a non-empty request",
		);
	});

	test("passes the requested lenses through", async () => {
		const { pi, calls } = setup();
		await pi.callTool("lean_build", {
			planPath: "p.md",
			lenses: ["security", "ux"],
		});
		expect(calls[0]?.lenses).toEqual(["security", "ux"]);
	});

	test("leaves the lenses to the runner's general default when none are given", async () => {
		const { pi, calls } = setup();
		await pi.callTool("lean_build", { planPath: "p.md" });
		expect(calls[0]?.lenses).toBeUndefined();
	});

	test("refuses a lens outside general, security, performance and ux", async () => {
		const { pi } = setup();
		await expect(
			pi.callTool("lean_build", { planPath: "p.md", lenses: ["style"] }),
		).rejects.toThrow(
			"lenses must be one or more of general, security, performance, ux; got style",
		);
	});

	test("passes only the budget fields the caller set", async () => {
		const { pi, calls } = setup();
		await pi.callTool("lean_build", {
			planPath: "p.md",
			budgetTokens: 400_000,
		});
		await pi.callTool("lean_build", { planPath: "p.md" });
		expect(calls[0]?.budget).toEqual({ tokens: 400_000 });
		expect(calls[1]?.budget).toBeUndefined();
	});

	test("refuses a budget that is not a positive integer", async () => {
		const { pi } = setup();
		await expect(
			pi.callTool("lean_build", { planPath: "p.md", budgetTimeMs: 0 }),
		).rejects.toThrow("budgetTimeMs must be a positive integer");
	});

	test("refuses a time budget longer than a timer can wait", async () => {
		const { pi, calls } = setup();
		const tool = pi.tools.get("lean_build") as unknown as RegisteredTool;

		expect(tool.parameters.properties.budgetTimeMs?.maximum).toBe(
			MAX_RUN_TIME_MS,
		);
		await expect(
			pi.callTool("lean_build", {
				planPath: "p.md",
				budgetTimeMs: MAX_RUN_TIME_MS + 1,
			}),
		).rejects.toThrow(
			`budgetTimeMs must be a positive integer up to ${MAX_RUN_TIME_MS}`,
		);
		expect(calls).toHaveLength(0);
	});

	test("passes the required signal kinds through, each once", async () => {
		const { pi, calls } = setup();
		await pi.callTool("lean_build", {
			planPath: "p.md",
			requiredSignals: ["verify", "dupes", "verify"],
		});
		expect(calls[0]?.requiredSignals).toEqual(["verify", "dupes"]);
	});

	test("passes an empty required signal list through", async () => {
		const { pi, calls } = setup();
		await pi.callTool("lean_build", { planPath: "p.md", requiredSignals: [] });
		expect(calls[0]?.requiredSignals).toEqual([]);
	});

	test("leaves the required signals to the config and default when none are given", async () => {
		const { pi, calls } = setup();
		await pi.callTool("lean_build", { planPath: "p.md" });
		expect(calls[0]).not.toHaveProperty("requiredSignals");
	});

	test("refuses a required signal kind the host has no provider kind for", async () => {
		const { pi, calls } = setup();
		await expect(
			pi.callTool("lean_build", {
				planPath: "p.md",
				requiredSignals: ["verify", "coverage"],
			}),
		).rejects.toThrow(
			`requiredSignals must be among ${SIGNAL_KINDS.join(", ")}; got coverage`,
		);
		expect(calls).toHaveLength(0);
	});

	test("states what an npm installation must provide for the host checks", () => {
		const { pi } = setup();
		const tool = pi.tools.get("lean_build") as unknown as RegisteredTool;

		expect(tool.description).toContain(
			"Stryker, its vitest runner and fallow are devDependencies of cosmonauts, so an npm installation must provide them (see bundled/lean/README.md); a required check whose tool is missing ends the run blocked as unverified, never done.",
		);
	});

	test("states the 60-minute default time budget", () => {
		const { pi } = setup();
		const tool = pi.tools.get("lean_build") as unknown as RegisteredTool;

		expect(tool.description).toContain("60 minutes");
	});

	test("states that the builder works in a private clone and only a done run applies its patch", () => {
		const { pi } = setup();
		const tool = pi.tools.get("lean_build") as unknown as RegisteredTool;

		expect(tool.description).toContain(
			"The builder works in a private clone of this repository with no remote, and only a done run applies its patch to this working tree, unstaged.",
		);
	});

	test("passes clearStaleLock through only when it is set", async () => {
		const { pi, calls } = setup();
		await pi.callTool("lean_build", { planPath: "p.md", clearStaleLock: true });
		await pi.callTool("lean_build", { planPath: "p.md" });
		expect(calls[0]?.clearStaleLock).toBe(true);
		expect(calls[1]).not.toHaveProperty("clearStaleLock");
	});

	test("states that a run whose processes outlive it holds the lock until clearStaleLock", () => {
		const { pi } = setup();
		const tool = pi.tools.get("lean_build") as unknown as RegisteredTool;

		expect(tool.description).toContain(
			"the next run ends blocked (previous run cleanup unconfirmed) until they exit or clearStaleLock is set",
		);
	});

	test("states that only the child runner's processes are waited for, not a Pi session's built-in tools", () => {
		const { pi } = setup();
		const tool = pi.tools.get("lean_build") as unknown as RegisteredTool;

		expect(tool.description).toContain(
			"waits up to 30 s for every process its child runner started to exit (external builder and reviewer sessions, host-check providers, mutation testing, code health, and what their process trees contain); processes started by the built-in tools of an in-process Pi session (the default pi backend) are not tracked",
		);
		expect(tool.description).not.toContain("every process it started");
	});

	test("names detached process candidates in the summary it returns", async () => {
		const pi = createMockPi({ cwd: "/project" });
		createLeanRunExtension({
			runBuild: async () => {
				const base = record();
				return {
					...base,
					manifest: {
						...base.manifest,
						detachedCandidates: [
							{ pid: 4242, command: "perl -e daemon /tmp/clone/marker" },
						],
					},
				};
			},
			createBackends: async () => ({ builder: BACKEND, reviewer: REVIEWER }),
		})(pi as never);

		const result = (await pi.callTool("lean_build", { planPath: "p.md" })) as {
			details: { summary: string };
		};

		expect(result.details.summary).toBe(
			"blocked: re-entry signals remain (0 re-entries); 1 detached process candidate(s) still name the builder clone, not confirmed gone: pids 4242 (perl -e daemon /tmp/clone/marker) (see run.json)",
		);
	});

	test("states what the builder still shares with this checkout", () => {
		const { pi } = setup();
		const tool = pi.tools.get("lean_build") as unknown as RegisteredTool;

		expect(tool.description).toContain(
			"node_modules is linked, so the dependency tree stays writable through the link",
		);
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
			"blast-tests",
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
			expect(result.details.status).toBe("blocked");
			expect(result.details.summary).toMatch(
				/^blocked: unverified: no providers configured; builder patch not applied: missions\/sessions\/lean\/runs\/[^/]+\/patches\/builder-1\.patch \(0 re-entries\)$/u,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

describe("lean_review tool", () => {
	test("declares an object-root parameter schema with nothing required", () => {
		const { pi } = setup();
		const tool = pi.tools.get("lean_review") as unknown as RegisteredTool;

		expect(tool.parameters).toBe(LeanReviewParameters);
		expect(tool.parameters.type).toBe("object");
		expect(tool.parameters.required ?? []).toEqual([]);
		expect(Object.keys(tool.parameters.properties)).toEqual(
			expect.arrayContaining([
				"base",
				"planPath",
				"request",
				"backend",
				"lenses",
				"clearStaleLock",
			]),
		);
	});

	test("passes clearStaleLock through only when it is set", async () => {
		const { pi, reviews } = setup();

		await pi.callTool("lean_review", { clearStaleLock: true });
		await pi.callTool("lean_review", {});

		expect(reviews[0]?.clearStaleLock).toBe(true);
		expect(reviews[1]).not.toHaveProperty("clearStaleLock");
	});

	test("states that it shares the run lock and what it waits for", () => {
		const { pi } = setup();
		const tool = pi.tools.get("lean_review") as unknown as RegisteredTool;

		expect(tool.description).toContain(
			"It takes the same run lock as lean_build.",
		);
		expect(tool.description).toContain(
			"until they exit or clearStaleLock is set",
		);
	});

	test("reviews the session's project with the reviewer backend and the runner's defaults", async () => {
		const { pi, calls, reviews, kinds } = setup();

		await pi.callTool("lean_review", {});

		expect(calls).toHaveLength(0);
		expect(kinds).toEqual(["pi"]);
		expect(reviews).toEqual([
			{ projectRoot: "/project", reviewerBackend: REVIEWER },
		]);
	});

	test("passes the base, the context and the lenses through", async () => {
		const { pi, reviews } = setup();

		await pi.callTool("lean_review", {
			base: "origin/main",
			request: "Validate the input.",
			lenses: ["security"],
			backend: "claude-cli",
		});

		expect(reviews[0]).toMatchObject({
			base: "origin/main",
			request: "Validate the input.",
			lenses: ["security"],
		});
	});

	test("refuses a plan path and a request together", async () => {
		const { pi, reviews } = setup();

		await expect(
			pi.callTool("lean_review", { planPath: "p.md", request: "fix it" }),
		).rejects.toThrow("lean_review takes planPath or request, not both");
		expect(reviews).toHaveLength(0);
	});

	test("refuses a lens outside the four", async () => {
		const { pi } = setup();

		await expect(
			pi.callTool("lean_review", { lenses: ["style"] }),
		).rejects.toThrow("lenses must be one or more of");
	});

	test("returns the run id, status, summary, findings and run directory", async () => {
		const { pi } = setup();

		const result = (await pi.callTool("lean_review", {})) as {
			details: unknown;
		};

		expect(result.details).toEqual({
			runId: "r-1",
			status: "done",
			summary: "done: one issue; 1 finding(s), 0 high (0 re-entries)",
			findings: reviewRecord().envelopes.reviewer?.findings,
			runDir: "/project/missions/sessions/lean/runs/r-1",
		});
	});
});
