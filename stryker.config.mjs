// Scoped mutation testing (lean run, ruling D-2). The lean mutation provider
// (lib/lean-run/providers/mutation.ts) always runs this file, whatever config
// the target worktree has, and passes `--mutate` (changed-function line
// ranges) and `--testFiles` on the command line. Run with
// STRYKER_VITEST_POOL=forks (patches/README.md) so tests that call
// process.chdir() work.
import { availableParallelism } from "node:os";

export default {
	testRunner: "vitest",
	plugins: ["@stryker-mutator/vitest-runner"],
	// No configFile: vitest finds the target project's own vitest/vite config.
	vitest: { related: false },
	coverageAnalysis: "perTest",
	// Every covering test runs, so `killedBy` names every killer and a test
	// file that killed nothing really killed nothing. Costs time per mutant.
	disableBail: true,
	checkers: [],
	reporters: ["clear-text", "json", "progress-append-only"],
	jsonReporter: {
		fileName:
			process.env.STRYKER_JSON_REPORT ?? "reports/mutation/mutation.json",
	},
	tempDirName: ".stryker-tmp",
	cleanTempDir: "always",
	ignorePatterns: [
		"missions/sessions",
		"missions/archive/sessions",
		"coverage",
		"reports",
		".fallow",
	],
	// String-literal mutants are almost all message text: noise, not signal.
	mutator: { excludedMutations: ["StringLiteral"] },
	timeoutMS: 3000,
	// Each runner holds a vitest fork; half the cores keeps memory bounded.
	concurrency: Math.max(1, Math.floor(availableParallelism() / 2)),
};
