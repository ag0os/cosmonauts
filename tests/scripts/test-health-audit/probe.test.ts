import { describe, expect, it } from "vitest";
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
