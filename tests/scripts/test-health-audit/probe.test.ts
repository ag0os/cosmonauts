import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	staleMaterialInputIssues,
	staleProbeIssues,
} from "../../../scripts/test-health-audit/cli.ts";
import { validateProbeRecord } from "../../../scripts/test-health-audit/probe.ts";

describe("targeted probe evidence", () => {
	// @cosmo-behavior plan:test-health-audit#B-008
	it("rejects probes outside the sandbox or without copied import identity isolated outcome and restored green", () => {
		const valid = {
			schemaVersion: 1,
			epochId: "epoch-test",
			probeId: "PROBE-BRI-005",
			inventoryId: "BRI-005",
			profileId: "profile-ready-filter",
			outcome: "probe-confirmed",
			basis: "probe-confirmed",
			guardrail: "completed dependencies are recognized",
			defect: "treat ready as having no dependencies",
			doubles: {
				contributing: false,
				detail: "real TaskManager and filesystem",
			},
			sandbox: {
				root: "/tmp/probe/repo",
				cwd: "/tmp/probe/repo",
				workingRepository: true,
				trackedFiles: [
					"lib/tasks/task-manager.ts",
					"tests/tasks/task-manager.test.ts",
				],
				untrackedAllowlist: [],
				nodeModules: "/tmp/probe/repo/node_modules",
				cacheDir: "/tmp/probe/repo/.probe-cache/vitest",
			},
			paths: {
				target: "/tmp/probe/repo/lib/tasks/task-manager.ts",
				importRoute: "/tmp/probe/repo/lib/tasks/task-manager.ts",
				config: "/tmp/probe/repo/.probe-cache/vitest.config.ts",
				setup: "/tmp/probe/repo/tests/setup.ts",
				test: "/tmp/probe/repo/tests/tasks/task-manager.test.ts",
			},
			testSelection: {
				file: "tests/tasks/task-manager.test.ts",
				line: 1012,
				declaration:
					"TaskManager > listTasks > includes a task once every listed dependency is Done",
			},
			runs: {
				preMutation: { state: "green", failedDeclarations: [] },
				mutated: {
					state: "red",
					failedDeclarations: [
						"TaskManager > listTasks > includes a task once every listed dependency is Done",
					],
					expectedFailureObserved: true,
				},
				restored: { state: "green", failedDeclarations: [] },
			},
			targetIdentity: {
				before: "a".repeat(64),
				afterRestore: "a".repeat(64),
			},
			sourceCheckout: {
				statusBefore: " M missions/tasks/TASK-699.md\n",
				statusAfter: " M missions/tasks/TASK-699.md\n",
				targetDigestBefore: "b".repeat(64),
				targetDigestAfter: "b".repeat(64),
			},
		};

		expect(validateProbeRecord(valid)).toEqual({ valid: true, issues: [] });
		expect(
			validateProbeRecord({
				...valid,
				paths: { ...valid.paths, target: "/source/lib/tasks/task-manager.ts" },
			}),
		).toMatchObject({ valid: false });
		expect(
			validateProbeRecord({
				...valid,
				paths: {
					...valid.paths,
					importRoute: "/tmp/probe/repo/lib/tasks/other.ts",
				},
			}),
		).toMatchObject({ valid: false });
		expect(
			validateProbeRecord({
				...valid,
				runs: {
					...valid.runs,
					mutated: {
						...valid.runs.mutated,
						failedDeclarations: ["a sibling declaration"],
					},
				},
			}),
		).toMatchObject({ valid: false });
		expect(
			validateProbeRecord({
				...valid,
				runs: {
					...valid.runs,
					restored: { state: "red", failedDeclarations: ["still red"] },
				},
			}),
		).toMatchObject({ valid: false });
		expect(
			validateProbeRecord({
				...valid,
				sourceCheckout: {
					...valid.sourceCheckout,
					statusAfter: " M lib/tasks/task-manager.ts\n",
				},
			}),
		).toMatchObject({ valid: false });
	});
});

describe("probe evidence staleness", () => {
	const roots: string[] = [];
	afterEach(async () => {
		for (const root of roots.splice(0)) await rm(root, { recursive: true });
	});

	async function fixture(targetText: string) {
		const root = await mkdtemp(join(tmpdir(), "audit-probe-stale-"));
		roots.push(root);
		const projectRoot = join(root, "project");
		const epoch = join(root, "epoch");
		await mkdir(join(projectRoot, "lib"), { recursive: true });
		await mkdir(epoch, { recursive: true });
		await writeFile(join(projectRoot, "lib", "guarded.ts"), targetText);
		await writeFile(
			join(epoch, "probes.jsonl"),
			`${JSON.stringify({
				schemaVersion: 1,
				epochId: "epoch-2",
				probeId: "PROBE-BRI-005",
				outcome: "probe-confirmed",
				paths: { target: "lib/guarded.ts" },
				sourceCheckout: {
					targetDigestBefore: createHash("sha256")
						.update(targetText)
						.digest("hex"),
				},
			})}\n`,
		);
		return { epoch, projectRoot };
	}

	it("accepts a probe record whose target still has the text it mutated", async () => {
		const { epoch, projectRoot } = await fixture("export const guard = 1;\n");
		expect(await staleProbeIssues(epoch, projectRoot)).toEqual([]);
	});

	it("reports a probe record whose target changed after it ran", async () => {
		const { epoch, projectRoot } = await fixture("export const guard = 1;\n");
		await writeFile(
			join(projectRoot, "lib", "guarded.ts"),
			"export const guard = 2;\n",
		);
		expect(await staleProbeIssues(epoch, projectRoot)).toEqual([
			"probes: PROBE-BRI-005 measured a version of lib/guarded.ts that this revision does not have",
		]);
	});

	it("ignores a limitation record, which measured no file", async () => {
		const { epoch, projectRoot } = await fixture("export const guard = 1;\n");
		await writeFile(
			join(epoch, "probes.jsonl"),
			`${JSON.stringify({
				schemaVersion: 1,
				epochId: "epoch-2",
				probeId: "PROBE-BRI-006",
				outcome: "unassessed",
				basis: "blocked",
				limitation: "probe definition is unavailable",
			})}\n`,
		);
		expect(await staleProbeIssues(epoch, projectRoot)).toEqual([]);
	});

	it("reports a probe record whose target this revision no longer has", async () => {
		const { epoch, projectRoot } = await fixture("export const guard = 1;\n");
		await rm(join(projectRoot, "lib", "guarded.ts"));
		expect(await staleProbeIssues(epoch, projectRoot)).toEqual([
			"probes: PROBE-BRI-005 measured lib/guarded.ts, which this revision does not have",
		]);
	});
});

describe("epoch manifest freshness", () => {
	const roots: string[] = [];
	afterEach(async () => {
		for (const root of roots.splice(0)) await rm(root, { recursive: true });
	});

	async function fixture() {
		const projectRoot = await mkdtemp(join(tmpdir(), "audit-manifest-"));
		roots.push(projectRoot);
		await mkdir(join(projectRoot, "docs"), { recursive: true });
		const text = "# Method v1\n";
		await writeFile(join(projectRoot, "docs", "method.md"), text);
		return {
			projectRoot,
			manifest: {
				materialInputs: [
					{
						path: "docs/method.md",
						sha256: createHash("sha256").update(text).digest("hex"),
					},
				],
			},
		};
	}

	it("accepts a manifest whose material inputs still hash as it froze them", async () => {
		const { projectRoot, manifest } = await fixture();
		expect(await staleMaterialInputIssues(manifest, projectRoot)).toEqual([]);
	});

	it("reports a material input that moved under the open epoch", async () => {
		const { projectRoot, manifest } = await fixture();
		await writeFile(join(projectRoot, "docs", "method.md"), "# Method v2\n");
		expect(await staleMaterialInputIssues(manifest, projectRoot)).toEqual([
			"material input docs/method.md has changed since this epoch froze it",
		]);
	});

	it("reports a material input this revision no longer has", async () => {
		const { projectRoot, manifest } = await fixture();
		await rm(join(projectRoot, "docs", "method.md"));
		expect(await staleMaterialInputIssues(manifest, projectRoot)).toEqual([
			"material input docs/method.md is missing from this revision",
		]);
	});
});
